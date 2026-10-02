# Python cross-check: does mel affect wav2lip_256.onnx output in onnxruntime?
# Uses the SAME ref/cur faces + mel fills as the JS inspect script.
import numpy as np
import subprocess, sys, os
import onnxruntime as ort

MODELS = os.path.expanduser('~/Library/Application Support/clipop-macos-agent/realhuman-models/wav2lip_256.onnx')
FF = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent/node_modules/.pnpm/@ffmpeg-installer+ffmpeg@1.1.0/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg'
HOST = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent/resources/hosts/host_m_asia.mp4'

def grab(n):
    p = subprocess.run([FF, '-i', HOST, '-vf', 'fps=24,scale=720:1280', '-frames:v', str(n + 1),
                        '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], capture_output=True)
    buf = np.frombuffer(p.stdout, np.uint8)
    return buf[n * 720 * 1280 * 3:(n + 1) * 720 * 1280 * 3].reshape(1280, 720, 3)

f0, f60 = grab(0), grab(60)
# face box from JS run: crop 195,205 side 368
sx1, sy1, side = 195, 205, 368
def crop_resize(fr):
    ys = np.minimum(1279, sy1 + (np.arange(256) * side // 256))
    xs = np.minimum(719, sx1 + (np.arange(256) * side // 256))
    return fr[ys][:, xs].astype(np.float32)  # (256,256,3) 0..255

ref, cur = crop_resize(f0), crop_resize(f60)

so = ort.SessionOptions(); so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
sess = ort.InferenceSession(MODELS, so, providers=['CPUExecutionProvider'])
print('inputs:', [(i.name, i.shape) for i in sess.get_inputs()])
print('outputs:', [(o.name, o.shape) for o in sess.get_outputs()])

face_in = np.concatenate([ref.transpose(2, 0, 1), cur.transpose(2, 0, 1)], axis=0)[None] / 255.0  # (1,6,256,256)

def run(mel_fill):
    mel = np.full((1, 1, 80, 16), mel_fill, np.float32)
    out = sess.run(None, {'mel_spectrogram': mel, 'video_frames': face_in})[0]
    face = np.clip(out[0].transpose(1, 2, 0) * 255, 0, 255)
    # mouth region darkness
    m = face[150:200, 95:160].mean(axis=2).flatten()
    k = max(4, int(len(m) * 0.15))
    dark = np.sort(m)[:k].mean()
    l1 = np.abs(face - cur).mean()
    return dark, l1

for v in [-4.0, 0.0, 2.0]:
    d, l1 = run(v)
    print(f'mel fill {v}: mouthDark={d:.1f} L1vsCur={l1:.2f}')
