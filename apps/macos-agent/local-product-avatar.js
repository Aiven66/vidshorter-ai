'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const {
  kokoroTts,
  edgeTts,
  sayTts,
  pickKokoroSid,
  pickEdgeVoice,
  pickSayVoice,
  buildOverlayFilter,
} = require('./real-human-engine');

const MUSETALK_FILES = [
  {
    name: 'models/musetalkV15/unet.pth',
    size: 3_400_074_924,
    url: 'https://huggingface.co/TMElyralab/MuseTalk/resolve/main/musetalkV15/unet.pth',
  },
  {
    name: 'models/musetalkV15/musetalk.json',
    size: 748,
    url: 'https://huggingface.co/TMElyralab/MuseTalk/resolve/main/musetalkV15/musetalk.json',
  },
  {
    name: 'models/sd-vae/config.json',
    size: 547,
    url: 'https://huggingface.co/stabilityai/sd-vae-ft-mse/resolve/main/config.json',
  },
  {
    name: 'models/sd-vae/diffusion_pytorch_model.bin',
    size: 334_707_217,
    url: 'https://huggingface.co/stabilityai/sd-vae-ft-mse/resolve/main/diffusion_pytorch_model.bin',
  },
  {
    name: 'models/whisper/config.json',
    size: 1_983,
    url: 'https://huggingface.co/openai/whisper-tiny/resolve/main/config.json',
  },
  {
    name: 'models/whisper/preprocessor_config.json',
    size: 184_990,
    url: 'https://huggingface.co/openai/whisper-tiny/resolve/main/preprocessor_config.json',
  },
  {
    name: 'models/whisper/pytorch_model.bin',
    size: 151_095_027,
    url: 'https://huggingface.co/openai/whisper-tiny/resolve/main/pytorch_model.bin',
  },
  {
    name: 'models/face-parse-bisent/79999_iter.pth',
    size: 53_289_463,
    url: 'https://drive.usercontent.google.com/download?id=154JgKpzCPW82qINcVieuPH3fZ2e0P812&export=download&confirm=t',
  },
  {
    name: 'models/face-parse-bisent/resnet18-5c106cde.pth',
    size: 46_827_520,
    url: 'https://download.pytorch.org/models/resnet18-5c106cde.pth',
  },
];

function runProcess(command, args, options = {}, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const consume = (kind, chunk) => {
      const text = String(chunk);
      if (kind === 'stdout') stdout += text;
      else stderr += text;
      if (onLine) {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) onLine(line.trim(), child);
        }
      }
    };
    child.stdout.on('data', (chunk) => consume('stdout', chunk));
    child.stderr.on('data', (chunk) => consume('stderr', chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(signal === 'SIGTERM' ? 'cancelled by user' : (stderr || stdout || `process exited ${code}`).slice(-1200)));
    });
  });
}

function copyRuntimeSource(sourceDir, runtimeDir) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  for (const name of ['musetalk', 'scripts', 'product_replace.py', 'quality_gate.py', 'requirements-mac.txt', 'LICENSE']) {
    const source = path.join(sourceDir, name);
    const destination = path.join(runtimeDir, name);
    if (!fs.existsSync(source)) throw new Error(`local AI runtime file is missing: ${name}`);
    fs.cpSync(source, destination, { recursive: true, force: true });
  }
}

class LocalProductAvatarEngine {
  constructor({ runtimeDir, sourceDir, legacyModelsDir, ffmpegPath }) {
    this.runtimeDir = runtimeDir;
    this.sourceDir = sourceDir;
    this.legacyModelsDir = legacyModelsDir;
    this.ffmpegPath = ffmpegPath;
    this.child = null;
  }

  pythonPath() {
    return path.join(this.runtimeDir, '.venv', 'bin', 'python');
  }

  status() {
    const files = MUSETALK_FILES.map((item) => {
      const file = path.join(this.runtimeDir, item.name);
      let ready = false;
      let size = 0;
      try {
        size = fs.statSync(file).size;
        ready = size >= item.size * 0.98;
      } catch {}
      return { name: item.name, size, expected: item.size, ready };
    });
    let pythonReady = false;
    try {
      pythonReady = fs.existsSync(this.pythonPath())
        && fs.existsSync(path.join(this.runtimeDir, '.venv', 'lib'));
    } catch {}
    return {
      ready: pythonReady && files.every((file) => file.ready),
      pythonReady,
      files,
      downloaded: files.filter((file) => file.ready).length + (pythonReady ? 1 : 0),
      total: files.length + 1,
      runtimeDir: this.runtimeDir,
      sizeBytes: MUSETALK_FILES.reduce((sum, file) => sum + file.size, 0),
    };
  }

  async preparePython(onProgress) {
    copyRuntimeSource(this.sourceDir, this.runtimeDir);
    if (this.status().pythonReady) return;
    const candidates = [
      '/opt/homebrew/bin/python3.11',
      '/usr/local/bin/python3.11',
      'python3.11',
      'python3',
    ];
    let python = '';
    for (const candidate of candidates) {
      try {
        await runProcess(candidate, ['--version']);
        python = candidate;
        break;
      } catch {}
    }
    if (!python) throw new Error('Python 3.11 is required for the local MuseTalk engine');
    onProgress?.({ stage: 'runtime', pct: 0.05, file: 'Python environment' });
    await runProcess(python, ['-m', 'venv', path.join(this.runtimeDir, '.venv')]);
    onProgress?.({ stage: 'runtime', pct: 0.12, file: 'Local AI packages' });
    await runProcess(this.pythonPath(), [
      '-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir',
      '-r', path.join(this.runtimeDir, 'requirements-mac.txt'),
    ], {}, (line) => onProgress?.({ stage: 'runtime', pct: 0.15, file: line.slice(0, 100) }));
  }

  cancel() {
    if (this.child && !this.child.killed) this.child.kill('SIGTERM');
  }

  async createNarration({ script, locale, gender, outPath }) {
    const sid = pickKokoroSid(locale, gender);
    if (sid !== null) {
      await kokoroTts(script, sid, this.legacyModelsDir, outPath, this.ffmpegPath);
      return;
    }
    try {
      await edgeTts(script, pickEdgeVoice(locale, gender), locale, outPath, {});
    } catch {
      await sayTts(pickSayVoice(locale, gender), script, outPath, this.ffmpegPath);
    }
  }

  async synthesize({ hostVideo, hostId, productImage, script, locale, gender, outPath, workDir, overlays = [], onProgress, cancelled }) {
    const status = this.status();
    if (!status.ready) throw new Error('Local MuseTalk models are not ready');
    copyRuntimeSource(this.sourceDir, this.runtimeDir);
    fs.mkdirSync(workDir, { recursive: true });
    const audioPath = path.join(workDir, 'narration.mp3');
    const heldVideo = path.join(workDir, 'physical-holding.mp4');
    const resultDir = path.join(workDir, 'musetalk-results');
    const configPath = path.join(workDir, 'inference.yaml');

    onProgress?.({ stage: 'tts', pct: 0.02 });
    await this.createNarration({ script, locale, gender, outPath: audioPath });
    if (cancelled?.()) throw new Error('cancelled by user');

    if (productImage) {
      onProgress?.({ stage: 'local-product', pct: 0.10 });
      await runProcess(this.pythonPath(), [
        path.join(this.runtimeDir, 'product_replace.py'),
        '--video', hostVideo,
        '--product', productImage,
        '--output', heldVideo,
        '--host', hostId,
      ], {}, (line, child) => {
        this.child = child;
        try {
          const event = JSON.parse(line);
          onProgress?.({ ...event, pct: event.total ? 0.10 + 0.10 * event.frame / event.total : 0.20 });
        } catch {}
      });
    } else {
      fs.copyFileSync(hostVideo, heldVideo);
    }
    if (cancelled?.()) throw new Error('cancelled by user');

    fs.writeFileSync(configPath, [
      'task_0:',
      `  video_path: ${JSON.stringify(heldVideo)}`,
      `  audio_path: ${JSON.stringify(audioPath)}`,
      '  result_name: "local-avatar.mp4"',
      '',
    ].join('\n'));

    onProgress?.({ stage: 'local-lipsync', pct: 0.22 });
    const env = {
      ...process.env,
      PYTHONPATH: this.runtimeDir,
      PYTORCH_ENABLE_MPS_FALLBACK: '1',
      GLOG_minloglevel: '2',
      PATH: `${path.dirname(this.ffmpegPath)}:${process.env.PATH || ''}`,
    };
    await runProcess(this.pythonPath(), [
      '-m', 'scripts.inference',
      '--inference_config', configPath,
      '--result_dir', resultDir,
      '--unet_model_path', path.join(this.runtimeDir, 'models/musetalkV15/unet.pth'),
      '--unet_config', path.join(this.runtimeDir, 'models/musetalkV15/musetalk.json'),
      '--vae_model_path', path.join(this.runtimeDir, 'models/sd-vae'),
      '--whisper_dir', path.join(this.runtimeDir, 'models/whisper'),
      '--face_parser_dir', path.join(this.runtimeDir, 'models/face-parse-bisent'),
      '--version', 'v15',
      '--batch_size', '4',
      '--use_float16',
    ], { cwd: this.runtimeDir, env }, (line, child) => {
      this.child = child;
      try {
        const event = JSON.parse(line);
        onProgress?.({ ...event, pct: event.total ? 0.22 + 0.70 * event.frame / event.total : 0.22 });
      } catch {}
    });
    this.child = null;
    const generated = path.join(resultDir, 'v15', 'local-avatar.mp4');
    if (!fs.existsSync(generated) || fs.statSync(generated).size < 100_000) {
      throw new Error('MuseTalk did not produce a playable local video');
    }

    onProgress?.({ stage: 'quality-check', pct: 0.94 });
    await runProcess(this.pythonPath(), [
      path.join(this.runtimeDir, 'quality_gate.py'), '--video', generated,
    ], {}, (line, child) => {
      this.child = child;
      try {
        const event = JSON.parse(line);
        onProgress?.({ ...event, pct: 0.97 });
      } catch {}
    });
    this.child = null;

    const textOverlays = overlays.filter((overlay) => overlay?.type === 'text');
    if (textOverlays.length) {
      const filters = textOverlays.map(buildOverlayFilter).join(',');
      await new Promise((resolve, reject) => {
        execFile(this.ffmpegPath, [
          '-y', '-i', generated, '-vf', filters,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
          '-c:a', 'copy', '-movflags', '+faststart', outPath,
        ], { timeout: 30 * 60_000 }, (error) => error ? reject(error) : resolve());
      });
    } else {
      fs.copyFileSync(generated, outPath);
    }
    return { outPath };
  }
}

module.exports = { LocalProductAvatarEngine, MUSETALK_FILES, copyRuntimeSource };
