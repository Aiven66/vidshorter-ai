const path = require('path');
const { runYtDlp } = require('./ytdlp');

function isYouTubeUrl(url) {
  return url && (url.includes('youtube.com') || url.includes('youtu.be'));
}

function isBilibiliUrl(url) {
  return url && (url.includes('bilibili.com') || url.includes('b23.tv'));
}

async function downloadSourceVideo(videoUrl, options = {}) {
  console.log(`[downloadSourceVideo] Starting download for: ${videoUrl}`);
  
  try {
    // First, get video info to check if it works
    console.log(`[downloadSourceVideo] Getting video info...`);
    const infoResult = await runYtDlp(['--no-playlist', '-j', videoUrl]);
    const info = JSON.parse(infoResult.stdout);
    console.log(`[downloadSourceVideo] Video info obtained: ${info.title}`);
    
    // Now download the video
    const tmpDir = process.env.TMPDIR || '/tmp';
    const outputPath = path.join(tmpDir, `video-${Date.now()}.mp4`);
    
    console.log(`[downloadSourceVideo] Downloading to: ${outputPath}`);
    await runYtDlp([
      '--no-playlist',
      '-f', 'best[height<=720]',
      '-o', outputPath,
      videoUrl
    ]);
    
    console.log(`[downloadSourceVideo] Download complete: ${outputPath}`);
    return { inputPath: outputPath };
  } catch (e) {
    console.error(`[downloadSourceVideo] Error: ${e.message}`);
    if (e.stderr) console.error(`[downloadSourceVideo] Stderr: ${e.stderr}`);
    throw e;
  }
}

async function analyzeVideo(videoUrl) {
  throw new Error('analyzeVideo not implemented in wrapper');
}

async function createLocalClip(params) {
  throw new Error('createLocalClip not implemented in wrapper');
}

async function downloadYouTubeClip(videoUrl, startTime, endTime) {
  throw new Error('downloadYouTubeClip not implemented in wrapper');
}

const videoClipper = {
  analyzeVideo,
  createLocalClip,
  downloadSourceVideo,
  downloadYouTubeClip,
  isYouTubeUrl,
  isBilibiliUrl
};

module.exports = {
  videoClipper,
  default: videoClipper
};
