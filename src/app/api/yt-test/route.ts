import { NextRequest, NextResponse } from 'next/server';

/**
 * Diagnostic endpoint — tests multiple YouTube stream access methods from Vercel.
 * GET /api/yt-test?videoId=dQw4w9WgXcQ
 */

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  streamUrlPrefix?: string;
  title?: string;
  quality?: string;
}

const CLIENTS = [
  {
    name: 'IOS_v20',
    headers: {
      'User-Agent': 'com.google.ios.youtube/20.03.03 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
      'X-Youtube-Client-Name': '5',
      'X-Youtube-Client-Version': '20.03.03',
    },
    context: {
      client: {
        clientName: 'IOS', clientVersion: '20.03.03',
        deviceMake: 'Apple', deviceModel: 'iPhone16,2',
        osName: 'iPhone', osVersion: '18.3.2.22D82',
        hl: 'en', gl: 'US', clientFormFactor: 'SMALL_FORM_FACTOR',
      },
    },
  },
  {
    name: 'ANDROID_v20',
    headers: {
      'User-Agent': 'com.google.android.youtube/20.03.03 (Linux; U; Android 14) gzip',
      'X-Youtube-Client-Name': '3',
      'X-Youtube-Client-Version': '20.03.03',
    },
    context: {
      client: {
        clientName: 'ANDROID', clientVersion: '20.03.03',
        androidSdkVersion: 34, hl: 'en', gl: 'US',
      },
    },
  },
  {
    name: 'ANDROID_TESTSUITE',
    headers: {
      'User-Agent': 'com.google.android.youtube/1.9 (Linux; U; Android 11) gzip',
      'X-Youtube-Client-Name': '30',
      'X-Youtube-Client-Version': '1.9',
    },
    context: {
      client: {
        clientName: 'ANDROID_TESTSUITE', clientVersion: '1.9',
        androidSdkVersion: 30, hl: 'en', gl: 'US',
      },
    },
  },
  {
    name: 'TV_EMBEDDED',
    headers: {
      'User-Agent': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0)',
      'X-Youtube-Client-Name': '85',
      'X-Youtube-Client-Version': '2.0',
    },
    context: {
      client: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'en', gl: 'US' },
      thirdParty: { embedUrl: 'https://www.youtube.com/' },
    },
  },
];

async function testInnerTubeClients(videoId: string): Promise<TestResult[]> {
  return Promise.allSettled(CLIENTS.map(async client => {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        ...client.headers,
      },
      body: JSON.stringify({
        videoId,
        context: client.context,
        playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) return { name: client.name, success: false, error: `HTTP ${res.status}` } as TestResult;

    const data = await res.json() as {
      videoDetails?: { title?: string };
      playabilityStatus?: { status?: string; reason?: string };
      streamingData?: {
        formats?: Array<{ url?: string; signatureCipher?: string; mimeType?: string; qualityLabel?: string; audioQuality?: string }>;
        adaptiveFormats?: Array<{ url?: string; signatureCipher?: string; mimeType?: string }>;
      };
    };

    const ps = data.playabilityStatus?.status;
    if (ps && ps !== 'OK') {
      return { name: client.name, success: false, error: `${ps}: ${data.playabilityStatus?.reason ?? ''}` } as TestResult;
    }

    const allFormats = [...(data.streamingData?.formats ?? []), ...(data.streamingData?.adaptiveFormats ?? [])];
    const directFormat = allFormats.find(f => f.url && f.mimeType?.startsWith('video/mp4') && (f as { audioQuality?: string }).audioQuality) ?? allFormats.find(f => f.url);

    if (!directFormat?.url) {
      const hasCipher = allFormats.some(f => f.signatureCipher);
      return { name: client.name, success: false, error: `No direct URL (${hasCipher ? 'cipher' : 'no url'})` } as TestResult;
    }

    return {
      name: client.name,
      success: true,
      title: data.videoDetails?.title,
      quality: (directFormat as { qualityLabel?: string }).qualityLabel,
      streamUrlPrefix: directFormat.url.slice(0, 100),
    } as TestResult;
  })).then(results => results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { name: CLIENTS[i].name, success: false, error: String(r.reason) } as TestResult
  ));
}

async function testYtDlpGetUrl(videoId: string): Promise<TestResult> {
  try {
    const { access } = await import('node:fs/promises');
    const { constants } = await import('node:fs');
    const { execFile: ef } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(ef);

    const ytdlpPath = '/tmp/yt-dlp';
    try { await access(ytdlpPath, constants.X_OK); } catch {
      const r = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux');
      if (!r.ok) return { name: 'yt-dlp (mweb)', success: false, error: `Download failed: ${r.status}` };
      const { writeFile, chmod } = await import('node:fs/promises');
      await writeFile(ytdlpPath, Buffer.from(await r.arrayBuffer()));
      await chmod(ytdlpPath, 0o755);
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const { stdout, stderr } = await exec(
      ytdlpPath,
      ['--no-playlist', '-f', 'best[height<=480]/best', '--get-url',
        '--extractor-args', 'youtube:player_client=mweb', url],
      { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 },
    ).catch(e => ({ stdout: (e as { stdout?: string }).stdout ?? '', stderr: (e as { stderr?: string }).stderr ?? String(e) }));

    const streamUrl = stdout.trim().split('\n').filter(Boolean)[0];
    if (!streamUrl) return { name: 'yt-dlp (mweb)', success: false, error: stderr.slice(0, 200) };
    return { name: 'yt-dlp (mweb)', success: true, streamUrlPrefix: streamUrl.slice(0, 100) };
  } catch (e) {
    return { name: 'yt-dlp (mweb)', success: false, error: String(e).slice(0, 200) };
  }
}

export async function GET(request: NextRequest) {
  const videoId = new URL(request.url).searchParams.get('videoId') || 'dQw4w9WgXcQ';
  const cfWorkerUrl = String(process.env['CF_WORKER_URL'] || process.env.CF_WORKER_URL || '').trim();

  const [innerTubeResults, ytdlpResult, cfWorkerResults] = await Promise.allSettled([
    testInnerTubeClients(videoId),
    testYtDlpGetUrl(videoId),
    (async () => {
      if (!cfWorkerUrl) return [{ name: 'CF Worker', success: false, error: 'CF_WORKER_URL not set' } as TestResult];
      try {
        const resolveUrl = new URL(cfWorkerUrl);
        resolveUrl.pathname = `${resolveUrl.pathname.replace(/\/$/, '')}/resolve`;
        resolveUrl.searchParams.set('videoId', videoId);
        resolveUrl.searchParams.set('maxHeight', '720');

        const streamUrl = new URL(cfWorkerUrl);
        streamUrl.pathname = `${streamUrl.pathname.replace(/\/$/, '')}/stream`;
        streamUrl.searchParams.set('videoId', videoId);
        streamUrl.searchParams.set('maxHeight', '720');

        const [resolved, streamPreflight] = await Promise.allSettled([
          fetch(resolveUrl.toString(), { signal: AbortSignal.timeout(15_000) })
            .then(r => r.json())
            .then((d: { streamUrl?: string; title?: string; error?: string; quality?: string }) => ({
              name: 'CF Worker (resolve)',
              success: !!d.streamUrl,
              title: d.title,
              quality: d.quality,
              streamUrlPrefix: d.streamUrl?.slice(0, 80),
              error: d.error,
            } as TestResult)),
          fetch(streamUrl.toString(), {
            headers: { Range: 'bytes=0-1' },
            signal: AbortSignal.timeout(15_000),
          }).then(async (r) => {
            if (r.status === 200 || r.status === 206) {
              r.body?.cancel();
              return {
                name: 'CF Worker (stream)',
                success: true,
                streamUrlPrefix: streamUrl.toString().slice(0, 80),
              } as TestResult;
            }
            const contentType = (r.headers.get('content-type') || '').toLowerCase();
            let details = '';
            try {
              if (contentType.includes('application/json')) {
                const d = await r.json() as { error?: string; details?: string };
                details = [d.error, d.details].filter(Boolean).join(' ').slice(0, 200);
              } else {
                details = (await r.text()).slice(0, 200);
              }
            } catch {}
            return {
              name: 'CF Worker (stream)',
              success: false,
              error: `HTTP ${r.status}${details ? `: ${details}` : ''}`,
              streamUrlPrefix: streamUrl.toString().slice(0, 80),
            } as TestResult;
          }),
        ]);

        return [
          resolved.status === 'fulfilled' ? resolved.value : { name: 'CF Worker (resolve)', success: false, error: String(resolved.reason).slice(0, 120) } as TestResult,
          streamPreflight.status === 'fulfilled' ? streamPreflight.value : { name: 'CF Worker (stream)', success: false, error: String(streamPreflight.reason).slice(0, 120) } as TestResult,
        ];
      } catch (e) {
        return [{ name: 'CF Worker', success: false, error: String(e).slice(0, 200) } as TestResult];
      }
    })(),
  ]);

  const allResults: TestResult[] = [
    ...(innerTubeResults.status === 'fulfilled' ? innerTubeResults.value : [{ name: 'InnerTube', success: false, error: String(innerTubeResults.reason) } as TestResult]),
    ytdlpResult.status === 'fulfilled' ? ytdlpResult.value : { name: 'yt-dlp', success: false, error: String(ytdlpResult.reason) } as TestResult,
    ...(cfWorkerResults.status === 'fulfilled' ? cfWorkerResults.value : [{ name: 'CF Worker', success: false, error: String(cfWorkerResults.reason) } as TestResult]),
  ];

  return NextResponse.json({
    videoId,
    region: process.env.VERCEL_REGION ?? 'unknown',
    cfWorkerConfigured: !!cfWorkerUrl,
    results: allResults,
    working: allResults.filter(r => r.success).map(r => r.name),
    recommendation: allResults.some(r => r.success)
      ? 'Some methods work! Use the working ones.'
      : 'All methods failed. Deploy CF Worker (see /cf-worker/README.md) and set CF_WORKER_URL in Vercel env vars.',
  });
}
