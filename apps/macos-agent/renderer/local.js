const $ = (id) => document.getElementById(id);

let selectedFile = null;

function secs(v) {
  if (!Number.isFinite(v)) return '';
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function setStatus(message, progress = 0) {
  $('status').style.display = 'block';
  $('statusText').textContent = message || 'Processing...';
  $('fill').style.width = `${Math.max(0, Math.min(100, Number(progress) || 0))}%`;
}

function setError(message) {
  const el = $('error');
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = message;
}

function renderClips(items) {
  const root = $('clips');
  root.innerHTML = '';
  for (const c of items) {
    const card = document.createElement('div');
    card.className = 'card';

    if (c.thumbnailUrl) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.src = c.thumbnailUrl;
      card.appendChild(img);
    }

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = c.title || 'Highlight';
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${secs(c.startTime)} → ${secs(c.endTime)}  (${secs(c.duration)})`;
    card.appendChild(meta);

    const v = document.createElement('video');
    v.controls = true;
    v.src = c.videoUrl;
    card.appendChild(v);

    const a = document.createElement('a');
    a.href = c.videoUrl;
    a.download = '';
    a.className = 'download';
    a.textContent = 'Download MP4';
    a.style.display = 'inline-block';
    a.style.marginTop = '10px';
    card.appendChild(a);

    root.appendChild(card);
  }
}

async function readProcessStream(res) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) throw new Error('No response stream from local processor');
  const decoder = new TextDecoder();
  let buf = '';
  let clips = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const evt = JSON.parse(line.slice(6));
      setStatus(evt.message || evt.stage || 'Processing...', evt.progress || 0);
      if (evt.data && evt.data.clip) {
        clips = [...clips.filter((c) => c.id !== evt.data.clip.id), evt.data.clip];
        renderClips(clips);
      }
      if (evt.data && Array.isArray(evt.data.clips)) {
        clips = evt.data.clips;
        renderClips(clips);
      }
      if (evt.data && evt.data.error) throw new Error(evt.message || 'Local processing failed');
    }
  }

  return clips;
}

async function processFile(file) {
  if (!file) return;
  setError('');
  $('clips').innerHTML = '';
  $('analyze').disabled = true;
  $('file').disabled = true;
  try {
    const baseUrl = await window.vidshorterDesktop.getMediaBaseUrl();
    if (!baseUrl) throw new Error('Local media server is not ready. Please restart VidShorter Agent.');

    setStatus('Uploading selected video to this Mac...', 2);
    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'x-filename': encodeURIComponent(file.name || 'video.mp4'),
        'content-type': file.type || 'application/octet-stream',
      },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const uploaded = await res.json();
    const url = uploaded && uploaded.url ? uploaded.url : '';
    if (!url) throw new Error('Upload failed: local server did not return a URL');

    setStatus('Generating highlight clips locally...', 8);
    const processRes = await fetch(`${baseUrl}/api/process-video`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoUrl: url, sourceType: 'upload', userId: 'local-mac-user' }),
    });
    if (!processRes.ok) throw new Error(`Local processor failed: ${processRes.status}`);

    const clips = await readProcessStream(processRes);
    if (!clips.length) throw new Error('No highlight clips were generated.');
    renderClips(clips);
    setStatus(`Done: generated ${clips.length} highlight clip${clips.length === 1 ? '' : 's'}`, 100);
  } catch (e) {
    setError(e && e.message ? e.message : String(e));
    setStatus('Failed', 100);
  } finally {
    $('file').disabled = false;
    $('analyze').disabled = !selectedFile;
  }
}

async function main() {
  try {
    const info = await window.vidshorterDesktop.getAppVersion();
    if (info && info.version) $('version').textContent = info.version;
  } catch {}
  $('web').onclick = async () => window.vidshorterDesktop.backToWeb();
  $('copy').onclick = async () => {
    await window.vidshorterDesktop.copyLogs();
    setStatus('Copied logs', 0);
  };
  $('file').addEventListener('change', () => {
    selectedFile = $('file').files && $('file').files[0];
    $('fileLabel').textContent = selectedFile ? `Selected: ${selectedFile.name}` : 'Choose a local MP4/MOV video';
    $('analyze').disabled = !selectedFile;
    setError('');
  });
  $('analyze').onclick = async () => processFile(selectedFile);
}

main().catch((e) => setError(e && e.message ? e.message : String(e)));
