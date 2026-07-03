'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading = false;
let ffmpegLoaded = false;

async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) {
    while (ffmpegLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;
  }

  ffmpegLoading = true;
  try {
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    ffmpegLoaded = true;
    return ffmpeg;
  } finally {
    ffmpegLoading = false;
  }
}

export async function clipVideoInBrowser(params: {
  videoBlob: Blob;
  startTime: number;
  endTime: number;
  fastCopy?: boolean;
}): Promise<{ videoBlob: Blob; thumbnailBlob: Blob | null }> {
  const { videoBlob, startTime, endTime, fastCopy = true } = params;
  const duration = Math.max(1, endTime - startTime);

  const ffmpeg = await loadFFmpeg();

  const inputName = 'input.mp4';
  const outputName = 'output.mp4';
  const thumbName = 'thumb.jpg';

  await ffmpeg.writeFile(inputName, await fetchFile(videoBlob));

  const args = [
    '-y',
    '-i', inputName,
    '-ss', String(startTime),
    '-t', String(duration),
  ];

  if (fastCopy) {
    args.push('-c', 'copy', '-movflags', '+faststart');
  } else {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
    );
  }
  args.push(outputName);

  try {
    await ffmpeg.exec(args);
  } catch (err) {
    if (fastCopy) {
      const reencodeArgs = [
        '-y',
        '-i', inputName,
        '-ss', String(startTime),
        '-t', String(duration),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        outputName,
      ];
      await ffmpeg.exec(reencodeArgs);
    } else {
      throw err;
    }
  }

  const outputData = await ffmpeg.readFile(outputName);
  const videoOutBlob = new Blob([outputData], { type: 'video/mp4' });

  let thumbBlob: Blob | null = null;
  try {
    await ffmpeg.exec([
      '-y',
      '-i', outputName,
      '-ss', '0.5',
      '-vframes', '1',
      '-q:v', '2',
      thumbName,
    ]);
    const thumbData = await ffmpeg.readFile(thumbName);
    thumbBlob = new Blob([thumbData], { type: 'image/jpeg' });
  } catch {
    // ignore thumbnail errors
  }

  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    await ffmpeg.deleteFile(thumbName);
  } catch {
    // ignore cleanup errors
  }

  return { videoBlob: videoOutBlob, thumbnailBlob: thumbBlob };
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
