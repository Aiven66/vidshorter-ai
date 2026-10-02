import os
import cv2
import math
import copy
import torch
import glob
import shutil
import pickle
import argparse
import numpy as np
import subprocess
from tqdm import tqdm
from omegaconf import OmegaConf
from transformers import WhisperModel
import sys

from musetalk.utils.blending import get_image
from musetalk.utils.face_parsing import FaceParsing
from musetalk.utils.audio_processor import AudioProcessor
from musetalk.utils.utils import get_file_type, get_video_fps, datagen, load_all_model
from musetalk.utils.preprocessing import get_landmark_and_bbox, read_imgs, coord_placeholder
from musetalk.utils.frame_preflight import extract_video_frames, repair_face_coordinates

def fast_check_ffmpeg():
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except:
        return False

@torch.no_grad()
def main(args):
    # Configure ffmpeg path
    if not fast_check_ffmpeg():
        print("Adding ffmpeg to PATH")
        # Choose path separator based on operating system
        path_separator = ';' if sys.platform == 'win32' else ':'
        os.environ["PATH"] = f"{args.ffmpeg_path}{path_separator}{os.environ['PATH']}"
        if not fast_check_ffmpeg():
            print("Warning: Unable to find ffmpeg, please ensure ffmpeg is properly installed")
    
    # Set computing device (CUDA → MPS on Apple Silicon → CPU)
    if torch.cuda.is_available():
        device = torch.device(f"cuda:{args.gpu_id}")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
    print(f"Using device: {device}")
    # Load model weights
    vae, unet, pe = load_all_model(
        unet_model_path=args.unet_model_path, 
        vae_type=args.vae_type,
        vae_model_path=args.vae_model_path,
        unet_config=args.unet_config,
        device=device
    )
    timesteps = torch.tensor([0], device=device)

    # Convert models to half precision if float16 is enabled
    if args.use_float16:
        pe = pe.half()
        vae.vae = vae.vae.half()
        unet.model = unet.model.half()
    
    # Move models to specified device
    pe = pe.to(device)
    vae.vae = vae.vae.to(device)
    unet.model = unet.model.to(device)
        
    # Initialize audio processor and Whisper model
    audio_processor = AudioProcessor(feature_extractor_path=args.whisper_dir)
    weight_dtype = unet.model.dtype
    whisper = WhisperModel.from_pretrained(args.whisper_dir)
    whisper = whisper.to(device=device, dtype=weight_dtype).eval()
    whisper.requires_grad_(False)
    
    # Initialize face parser with configurable parameters based on version
    if args.version == "v15":
        fp = FaceParsing(
            left_cheek_width=args.left_cheek_width,
            right_cheek_width=args.right_cheek_width,
            model_dir=args.face_parser_dir,
        )
    else:  # v1
        fp = FaceParsing(model_dir=args.face_parser_dir)
    
    # Load inference configuration
    inference_config = OmegaConf.load(args.inference_config)
    print("Loaded inference config:", inference_config)
    
    # Process each task
    for task_id in inference_config:
        try:
            # Get task configuration
            video_path = inference_config[task_id]["video_path"]
            audio_path = inference_config[task_id]["audio_path"]
            if "result_name" in inference_config[task_id]:
                args.output_vid_name = inference_config[task_id]["result_name"]
            
            # Set bbox_shift based on version
            if args.version == "v15":
                bbox_shift = 0  # v15 uses fixed bbox_shift
            else:
                bbox_shift = inference_config[task_id].get("bbox_shift", args.bbox_shift)  # v1 uses config or default
            
            # Set output paths
            input_basename = os.path.basename(video_path).split('.')[0]
            audio_basename = os.path.basename(audio_path).split('.')[0]
            output_basename = f"{input_basename}_{audio_basename}"
            
            # Create temporary directories
            temp_dir = os.path.join(args.result_dir, f"{args.version}")
            os.makedirs(temp_dir, exist_ok=True)
            
            # Set result save paths
            crop_coord_save_path = os.path.join(args.result_dir, "../", input_basename+".pkl")
            
            # Set output video paths
            if args.output_vid_name is None:
                output_vid_name = os.path.join(temp_dir, output_basename + ".mp4")
            else:
                output_vid_name = os.path.join(temp_dir, args.output_vid_name)
            output_vid_name_concat = os.path.join(temp_dir, output_basename + "_concat.mp4")
            
            # Extract frames from source video
            if get_file_type(video_path) == "video":
                save_dir_full = os.path.join(temp_dir, input_basename)
                input_img_list = extract_video_frames(video_path, save_dir_full)
                fps = get_video_fps(video_path)
            elif get_file_type(video_path) == "image":
                input_img_list = [video_path]
                fps = args.fps
            elif os.path.isdir(video_path):
                input_img_list = glob.glob(os.path.join(video_path, '*.[jpJP][pnPN]*[gG]'))
                input_img_list = sorted(input_img_list, key=lambda x: int(os.path.splitext(os.path.basename(x))[0]))
                fps = args.fps
            else:
                raise ValueError(f"{video_path} should be a video file, an image file or a directory of images")

            if not input_img_list:
                raise RuntimeError("The presenter video did not contain any readable frames")
            if not fps or not np.isfinite(fps) or fps <= 0:
                raise RuntimeError("The presenter video has an invalid frame rate")

            # Extract audio features
            whisper_input_features, librosa_length = audio_processor.get_audio_feature(audio_path)
            whisper_chunks = audio_processor.get_whisper_chunk(
                whisper_input_features, 
                device, 
                weight_dtype, 
                whisper, 
                librosa_length,
                fps=fps,
                audio_padding_length_left=args.audio_padding_length_left,
                audio_padding_length_right=args.audio_padding_length_right,
            )
            
            # Preprocess input images
            if os.path.exists(crop_coord_save_path) and args.use_saved_coord:
                print("Using saved coordinates")
                with open(crop_coord_save_path, 'rb') as f:
                    coord_list = pickle.load(f)
                frame_list = read_imgs(input_img_list)
            else:
                print("Extracting landmarks... time-consuming operation")
                coord_list, frame_list = get_landmark_and_bbox(input_img_list, bbox_shift)
                with open(crop_coord_save_path, 'wb') as f:
                    pickle.dump(coord_list, f)

            if not frame_list or any(frame is None for frame in frame_list):
                raise RuntimeError("The presenter video contains unreadable frames")
            if len(coord_list) != len(frame_list):
                raise RuntimeError("Presenter frames and face coordinates are inconsistent")
            coord_list, face_detection_rate = repair_face_coordinates(coord_list, coord_placeholder)
            print(
                '{"stage":"face-preflight","frames":%d,"detectionRate":%.4f}'
                % (len(frame_list), face_detection_rate),
                flush=True,
            )
            
            print(f"Number of frames: {len(frame_list)}")         

            # A short narration does not need every frame from a longer host
            # loop. Limit face encoding to the frames the audio can consume;
            # long narrations still use the complete presenter loop.
            active_frame_count = min(len(frame_list), max(1, len(whisper_chunks)))
            active_frame_list = frame_list[:active_frame_count]
            active_coord_list = coord_list[:active_frame_count]
            print(
                '{"stage":"face-encoding","frames":%d,"sourceFrames":%d}'
                % (active_frame_count, len(frame_list)),
                flush=True,
            )
            
            # Process each frame
            input_latent_list = []
            for bbox, frame in zip(active_coord_list, active_frame_list):
                x1, y1, x2, y2 = bbox
                if args.version == "v15":
                    y2 = y2 + args.extra_margin
                    y2 = min(y2, frame.shape[0])
                crop_frame = frame[y1:y2, x1:x2]
                crop_frame = cv2.resize(crop_frame, (256,256), interpolation=cv2.INTER_LANCZOS4)
                latents = vae.get_latents_for_unet(crop_frame)
                input_latent_list.append(latents)

            if not input_latent_list:
                raise RuntimeError("No valid presenter face crops were produced")
        
            # Smooth first and last frames
            frame_list_cycle = active_frame_list + active_frame_list[::-1]
            coord_list_cycle = active_coord_list + active_coord_list[::-1]
            input_latent_list_cycle = input_latent_list + input_latent_list[::-1]
            
            # Batch inference
            print("Starting inference")
            video_num = len(whisper_chunks)
            batch_size = args.batch_size
            gen = datagen(
                whisper_chunks=whisper_chunks,
                vae_encode_latents=input_latent_list_cycle,
                batch_size=batch_size,
                delay_frame=0,
                device=device,
            )
            
            res_frame_list = []
            total = int(np.ceil(float(video_num) / batch_size))
            
            # Execute inference
            for i, (whisper_batch, latent_batch) in enumerate(tqdm(gen, total=total)):
                audio_feature_batch = pe(whisper_batch)
                latent_batch = latent_batch.to(dtype=unet.model.dtype)
                
                pred_latents = unet.model(latent_batch, timesteps, encoder_hidden_states=audio_feature_batch).sample
                recon = vae.decode_latents(pred_latents)
                for res_frame in recon:
                    res_frame_list.append(res_frame)
            
            # Blend generated faces and stream frames directly into ffmpeg.
            # The upstream PNG-per-frame path can consume several gigabytes
            # for a one-minute vertical video, which is not acceptable on a
            # laptop. Streaming keeps temporary disk use bounded.
            print("Padding generated images to original video size")
            output_height, output_width = frame_list[0].shape[:2]
            temp_vid_path = f"{temp_dir}/temp_{input_basename}_{audio_basename}.mp4"
            encoder = subprocess.Popen([
                "ffmpeg", "-y", "-v", "warning", "-f", "rawvideo",
                "-pix_fmt", "bgr24", "-s", f"{output_width}x{output_height}",
                "-r", str(fps), "-i", "-", "-an", "-vcodec", "libx264",
                "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "18",
                temp_vid_path,
            ], stdin=subprocess.PIPE)
            for i, res_frame in enumerate(tqdm(res_frame_list)):
                bbox = coord_list_cycle[i%(len(coord_list_cycle))]
                ori_frame = copy.deepcopy(frame_list_cycle[i%(len(frame_list_cycle))])
                x1, y1, x2, y2 = bbox
                if args.version == "v15":
                    y2 = y2 + args.extra_margin
                    y2 = min(y2, ori_frame.shape[0])
                try:
                    res_frame = cv2.resize(res_frame.astype(np.uint8), (x2-x1, y2-y1))
                except:
                    continue
                
                # Merge results with version-specific parameters
                if args.version == "v15":
                    combine_frame = get_image(ori_frame, res_frame, [x1, y1, x2, y2], mode=args.parsing_mode, fp=fp)
                else:
                    combine_frame = get_image(ori_frame, res_frame, [x1, y1, x2, y2], fp=fp)

                # MuseTalk's default face parser blends most of the lower
                # face. On 720p portrait footage that can soften cheeks and
                # create a visible generated-face boundary. Keep the original
                # HD face everywhere except a generously feathered mouth/jaw
                # ellipse, then sharpen only the generated region. The source
                # mouth is fully covered at the ellipse center, preventing the
                # double-mouth artifact seen in older releases.
                face_w = max(1, x2 - x1)
                face_h = max(1, y2 - y1)
                mouth_mask = np.zeros(ori_frame.shape[:2], dtype=np.uint8)
                mouth_center = (int(x1 + face_w * 0.50), int(y1 + face_h * 0.73))
                mouth_axes = (max(18, int(face_w * 0.34)), max(16, int(face_h * 0.25)))
                cv2.ellipse(mouth_mask, mouth_center, mouth_axes, 0, 0, 360, 255, -1)
                mouth_mask = cv2.GaussianBlur(mouth_mask, (25, 25), 0).astype(np.float32) / 255.0
                soft = cv2.GaussianBlur(combine_frame, (0, 0), 1.15)
                sharp = cv2.addWeighted(combine_frame, 1.20, soft, -0.20, 0)
                combine_frame = (
                    ori_frame.astype(np.float32) * (1.0 - mouth_mask[:, :, None])
                    + sharp.astype(np.float32) * mouth_mask[:, :, None]
                ).astype(np.uint8)
                encoder.stdin.write(combine_frame.tobytes())
                if (i + 1) % 24 == 0:
                    print('{"stage":"local-lipsync","frame":%d,"total":%d}' % (i + 1, len(res_frame_list)), flush=True)

            encoder.stdin.close()
            if encoder.wait() != 0:
                raise RuntimeError("ffmpeg failed while encoding lip-sync frames")

            # Save prediction results
            subprocess.run([
                "ffmpeg", "-y", "-v", "warning", "-i", temp_vid_path,
                "-i", audio_path, "-map", "0:v:0", "-map", "1:a:0",
                "-c:v", "copy", "-c:a", "aac", "-shortest", output_vid_name,
            ], check=True)
            
            # Clean up temporary files
            os.remove(temp_vid_path)
            
            shutil.rmtree(save_dir_full)
            if not args.saved_coord:
                os.remove(crop_coord_save_path)
                    
            print(f"Results saved to {output_vid_name}")
        except Exception as e:
            print("Error occurred during processing:", e)
            raise

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg_path", type=str, default="./ffmpeg-4.4-amd64-static/", help="Path to ffmpeg executable")
    parser.add_argument("--gpu_id", type=int, default=0, help="GPU ID to use")
    parser.add_argument("--vae_type", type=str, default="sd-vae", help="Type of VAE model")
    parser.add_argument("--vae_model_path", type=str, default="./models/sd-vae", help="Local VAE model directory")
    parser.add_argument("--unet_config", type=str, default="./models/musetalk/config.json", help="Path to UNet configuration file")
    parser.add_argument("--unet_model_path", type=str, default="./models/musetalkV15/unet.pth", help="Path to UNet model weights")
    parser.add_argument("--whisper_dir", type=str, default="./models/whisper", help="Directory containing Whisper model")
    parser.add_argument("--face_parser_dir", type=str, default="./models/face-parse-bisent", help="Local face parser model directory")
    parser.add_argument("--inference_config", type=str, default="configs/inference/test_img.yaml", help="Path to inference configuration file")
    parser.add_argument("--bbox_shift", type=int, default=0, help="Bounding box shift value")
    parser.add_argument("--result_dir", default='./results', help="Directory for output results")
    parser.add_argument("--extra_margin", type=int, default=10, help="Extra margin for face cropping")
    parser.add_argument("--fps", type=int, default=25, help="Video frames per second")
    parser.add_argument("--audio_padding_length_left", type=int, default=2, help="Left padding length for audio")
    parser.add_argument("--audio_padding_length_right", type=int, default=2, help="Right padding length for audio")
    parser.add_argument("--batch_size", type=int, default=8, help="Batch size for inference")
    parser.add_argument("--output_vid_name", type=str, default=None, help="Name of output video file")
    parser.add_argument("--use_saved_coord", action="store_true", help='Use saved coordinates to save time')
    parser.add_argument("--saved_coord", action="store_true", help='Save coordinates for future use')
    parser.add_argument("--use_float16", action="store_true", help="Use float16 for faster inference")
    parser.add_argument("--parsing_mode", default='jaw', help="Face blending parsing mode")
    parser.add_argument("--left_cheek_width", type=int, default=90, help="Width of left cheek region")
    parser.add_argument("--right_cheek_width", type=int, default=90, help="Width of right cheek region")
    parser.add_argument("--version", type=str, default="v15", choices=["v1", "v15"], help="Model version to use")
    args = parser.parse_args()
    main(args)
