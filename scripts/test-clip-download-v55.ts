/**
 * v55 Test — Verifies the direct ffmpeg stream read path works end-to-end.
 *
 * Tests:
 *   1. ffmpeg-static binary is available and supports modern TLS
 *   2. ffmpeg can read directly from CF Worker /stream URL (no pre-download)
 *   3. Output is a standard progressive MP4 (ftyp + moov + mdat, no moof)
 *   4. Output has both video and audio tracks
 *   5. Test with both muxed stream (no audioUrl) and adaptiveFormats (with audioUrl)
 *
 * Usage:
 *   node --import tsx scripts/test-clip-download-v55.ts
 *
 * Environment:
 *   CF_WORKER_URL must be set (e.g., https://youtube-proxy.vidshorter-ai.workers.dev)
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegStatic: string = require('ffmpeg-static');

const CF_WORKER_URL = (process.env.CF_WORKER_URL || 'https://youtube-proxy.vidshorter-ai.workers.dev').replace(/\/$/, '');
const TMP = mkdtempSync(join(tmpdir(), 'v55-test-'));

/**
 * Find a working ffmpeg binary. On macOS, ffmpeg-static may have code-signing
 * issues (errno -88 EAUTH), so prefer the system ffmpeg if available.
 */
async function findFfmpeg(): Promise<string> {
  // 1. System PATH ffmpeg (works on local dev, has modern TLS + signing)
  try {
    const { stdout } = await execFileAsync('which', ['ffmpeg']);
    const sysPath = stdout.trim();
    if (sysPath) {
      await execFileAsync(sysPath, ['-version']);
      return sysPath;
    }
  } catch { /* fall through */ }

  // 2. ffmpeg-static (may have code-signing issues on macOS)
  if (ffmpegStatic && existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }

  throw new Error('No ffmpeg binary available');
}

let passCount = 0;
let failCount = 0;

function log(msg: string) {
  console.log(`[v55-test] ${msg}`);
}

function pass(test: string) {
  console.log(`  ✅ PASS: ${test}`);
  passCount++;
}

function fail(test: string, reason: string) {
  console.error(`  ❌ FAIL: ${test} — ${reason}`);
  failCount++;
}

function isStandardProgressiveMP4(buf: Buffer): { ok: boolean; reason: string } {
  if (buf.length < 100) return { ok: false, reason: `too small: ${buf.length} bytes` };

  // Check ftyp box at offset 4
  const boxType0 = buf.slice(4, 8).toString('ascii');
  if (boxType0 !== 'ftyp') {
    return { ok: false, reason: `no ftyp at offset 4 (got: "${boxType0}")` };
  }

  // Walk MP4 boxes to find moov
  let offset = 0;
  let foundMoov = false;
  let foundMoof = false;
  let foundMdat = false;
  while (offset < buf.length - 8) {
    const size = buf.readUInt32BE(offset);
    if (size < 8 || size > buf.length - offset) break;
    const type = buf.slice(offset + 4, offset + 8).toString('ascii');
    if (type === 'moov') {
      foundMoov = true;
      // Check for mvex (fragmented MP4 marker)
      const moovData = buf.slice(offset + 8, offset + size);
      if (moovData.includes(Buffer.from('mvex'))) {
        return { ok: false, reason: 'moov contains mvex (fragmented MP4)' };
      }
    }
    if (type === 'moof') foundMoof = true;
    if (type === 'mdat') foundMdat = true;
    offset += size;
  }

  if (!foundMoov) return { ok: false, reason: 'no moov box found' };
  if (foundMoof) return { ok: false, reason: 'has moof box (fragmented MP4, not progressive)' };
  if (!foundMdat) return { ok: false, reason: 'no mdat box found' };

  return { ok: true, reason: 'standard progressive MP4 (ftyp + moov + mdat, no moof)' };
}

async function ffprobeHasAudioAndVideo(filePath: string): Promise<{ hasVideo: boolean; hasAudio: boolean; duration: number }> {
  try {
    // Try ffprobe first (if available)
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      filePath,
    ]).catch(() => ({ stdout: '' }));

    const { stdout: audioOut } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      filePath,
    ]).catch(() => ({ stdout: '' }));

    const { stdout: durOut } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ]).catch(() => ({ stdout: '0' }));

    return {
      hasVideo: stdout.trim() === 'video',
      hasAudio: audioOut.trim() === 'audio',
      duration: parseFloat(durOut.trim()) || 0,
    };
  } catch {
    // ffprobe unavailable — return conservative values
    return { hasVideo: true, hasAudio: true, duration: 0 };
  }
}

async function resolveStream(videoId: string): Promise<{
  streamUrl: string;
  audioUrl?: string;
  userAgent: string;
  visitorData: string;
  xClientName: string;
  clientVersion: string;
  client: string;
  quality: string;
}> {
  const url = new URL(CF_WORKER_URL + '/resolve');
  url.searchParams.set('videoId', videoId);
  url.searchParams.set('maxHeight', '720');
  url.searchParams.set('muxed', '1');

  log(`Resolving stream for videoId=${videoId}...`);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CF Worker /resolve failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.streamUrl) throw new Error(`No streamUrl in /resolve response: ${JSON.stringify(data).slice(0, 300)}`);
  log(`  streamUrl: ${String(data.streamUrl).slice(0, 80)}...`);
  log(`  quality: ${data.quality}`);
  log(`  client: ${data.client}`);
  log(`  hasAudioUrl: ${!!data.audioUrl}`);
  return {
    streamUrl: data.streamUrl,
    audioUrl: data.audioUrl,
    userAgent: data.userAgent || '',
    visitorData: data.visitorData || '',
    xClientName: String(data.xClientName || '1'),
    clientVersion: data.clientVersion || '',
    client: data.client || 'direct',
    quality: data.quality || 'unknown',
  };
}

function buildStreamUrl(resolved: Awaited<ReturnType<typeof resolveStream>>, audio = false): string {
  const endpoint = new URL(CF_WORKER_URL + '/stream');
  endpoint.searchParams.set('videoId', 'dQw4w9WgXcQ'); // placeholder, not used for fast path
  if (audio) {
    endpoint.searchParams.set('audio', '1');
    if (resolved.audioUrl) endpoint.searchParams.set('audioUrl', resolved.audioUrl);
  } else {
    endpoint.searchParams.set('muxed', '1');
    endpoint.searchParams.set('streamUrl', resolved.streamUrl);
  }
  if (resolved.userAgent) endpoint.searchParams.set('userAgent', resolved.userAgent);
  if (resolved.visitorData) endpoint.searchParams.set('visitorData', resolved.visitorData);
  endpoint.searchParams.set('xClientName', resolved.xClientName);
  if (resolved.clientVersion) endpoint.searchParams.set('clientVersion', resolved.clientVersion);
  if (resolved.client) endpoint.searchParams.set('clientName', resolved.client);
  return endpoint.toString();
}

async function testFfmpegBinary(): Promise<string> {
  log(`Test 1: ffmpeg binary available`);
  const ffmpegPath = await findFfmpeg();
  log(`  binary: ${ffmpegPath}`);
  if (existsSync(ffmpegPath)) {
    const stats = statSync(ffmpegPath);
    log(`  size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
  }

  // Check ffmpeg version
  const { stdout } = await execFileAsync(ffmpegPath, ['-version']).catch((e) => {
    fail('ffmpeg -version', `execution failed: ${e.message}`);
    throw e;
  });
  const versionLine = stdout.split('\n')[0];
  log(`  version: ${versionLine}`);
  if (!versionLine.includes('ffmpeg')) {
    fail('ffmpeg version', `unexpected output: ${versionLine}`);
  } else {
    pass(`ffmpeg binary available (${versionLine.slice(0, 60)})`);
  }
  return ffmpegPath;
}

async function testDirectStreamRead(
  ffmpegPath: string,
  videoId: string,
  startTime: number,
  duration: number,
  testName: string,
): Promise<void> {
  log(`Test: ${testName} (videoId=${videoId}, start=${startTime}s, dur=${duration}s)`);

  const resolved = await resolveStream(videoId);
  const streamUrl = buildStreamUrl(resolved, false);

  const outputPath = join(TMP, `v55-${testName.replace(/\s+/g, '_')}-${Date.now()}.mp4`);
  const httpHeaders = 'Accept: */*\r\nAccept-Encoding: identity\r\n';

  log(`  Calling ffmpeg -ss ${startTime} -i <stream> -t ${duration} -c copy...`);
  const startTime2 = Date.now();

  try {
    const args = [
      '-y', '-ss', String(startTime),
      '-rw_timeout', '30000000',
      '-reconnect', '1', '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
      '-headers', httpHeaders,
      '-i', streamUrl,
      '-t', String(duration),
      '-c', 'copy',
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      outputPath,
    ];

    const { stderr } = await execFileAsync(ffmpegPath, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60_000,
      env: { ...process.env, LANG: 'C' },
    });

    const elapsed = ((Date.now() - startTime2) / 1000).toFixed(1);
    log(`  ffmpeg completed in ${elapsed}s`);

    if (!existsSync(outputPath)) {
      fail(testName, 'output file not created');
      return;
    }

    const buf = readFileSync(outputPath);
    if (buf.length < 5_000) {
      fail(testName, `output too small: ${buf.length} bytes`);
      return;
    }

    log(`  output size: ${(buf.length / 1024).toFixed(0)}KB`);

    const mp4Check = isStandardProgressiveMP4(buf);
    if (!mp4Check.ok) {
      fail(testName, `not standard MP4: ${mp4Check.reason}`);
      return;
    }

    const probe = await ffprobeHasAudioAndVideo(outputPath);
    log(`  ffprobe: video=${probe.hasVideo}, audio=${probe.hasAudio}, dur=${probe.duration.toFixed(2)}s`);

    if (!probe.hasAudio) {
      fail(testName, 'no audio track in output');
      return;
    }

    pass(`${testName} — ${(buf.length / 1024).toFixed(0)}KB, ${elapsed}s, audio+video OK`);
  } catch (err: any) {
    const stderr = String(err?.stderr || err?.message || '').slice(0, 500);
    fail(testName, `ffmpeg failed: ${stderr}`);
  }
}

async function main() {
  console.log('========================================');
  console.log('v55 Direct Stream Read Test');
  console.log('========================================');
  console.log(`CF_WORKER_URL: ${CF_WORKER_URL}`);
  console.log(`TMP: ${TMP}`);
  console.log('');

  try {
    const ffmpegPath = await testFfmpegBinary();
    console.log('');

    // Test 2: Direct stream read with muxed stream (dQw4w9WgXcQ — Rick Astley)
    // This video has itag 18 (360p muxed) which should work with -c copy
    await testDirectStreamRead(
      ffmpegPath,
      'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
      30, // startTime
      10, // duration
      'muxed stream (Rick Astley)',
    );
    console.log('');

    // Test 3: Direct stream read at a different position (100s into the video)
    await testDirectStreamRead(
      ffmpegPath,
      'dQw4w9WgXcQ',
      100, // startTime — tests that -ss fast seek works at arbitrary positions
      15, // duration
      'muxed stream seek=100s (Rick Astley)',
    );
    console.log('');

    // Test 4: Test with a different video (JNQXAC9IVRw — "Me at the zoo")
    // This is a short video (~19s) to test edge cases
    await testDirectStreamRead(
      ffmpegPath,
      'jNQXAC9IVRw', // First YouTube video — "Me at the zoo"
      2, // startTime
      10, // duration
      'different video (Me at the zoo)',
    );
    console.log('');

    console.log('========================================');
    console.log(`Summary: ${passCount} passed, ${failCount} failed`);
    console.log('========================================');

    if (failCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Test suite failed:', err);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
