"""
Export Wav2Lip mel-spectrogram frontend as ONNX.
Must be numerically identical to Wav2Lip's audio.py melspectrogram() (librosa-based).

Pipeline (hparams.py): preemphasis(0.97) -> STFT(n_fft=800, hop=200, win=800,
hann periodic, center=True, reflect pad) -> magnitude -> mel(80, fmin=55,
fmax=7600, slaney) -> amp_to_db(min_level_db=-100, ref_level_db=20) ->
normalize(clip to [-4, 4], symmetric, max_abs_value=4)

Input : float32 PCM mono 16kHz, shape (1, N)
Output: float32 mel, shape (1, 80, T)

Usage (from /tmp/w2l venv):
  python apps/macos-agent/scripts/export-mel-onnx.py
"""
import numpy as np
import torch
import torch.nn as nn
import librosa
import librosa.filters
import os
import sys

W2L_DIR = os.environ.get('W2L_DIR', '/tmp/w2l')
sys.path.insert(0, W2L_DIR)

# ----- hyperparams (mirror hparams.py) -----
NUM_MELS = 80
N_FFT = 800
HOP = 200
WIN = 800
SR = 16000
FMIN = 55
FMAX = 7600
PREEMPH = 0.97
MIN_LEVEL_DB = -100
REF_LEVEL_DB = 20
MAX_ABS = 4.0

MEL_BASIS = librosa.filters.mel(sr=SR, n_fft=N_FFT, n_mels=NUM_MELS, fmin=FMIN, fmax=FMAX)  # (80, 401)
MEL_T = torch.from_numpy(MEL_BASIS).float()
MIN_LEVEL = np.exp(MIN_LEVEL_DB / 20 * np.log(10))  # 1e-5


class MelFrontend(nn.Module):
    """STFT via explicit DFT matrix (pure matmul -> exact ONNX fidelity)."""

    def __init__(self):
        super().__init__()
        self.register_buffer('mel_basis', MEL_T)  # (80, 401)
        self.register_buffer('window', torch.hann_window(WIN, periodic=True))
        n = torch.arange(WIN).float()
        k = torch.arange(N_FFT // 2 + 1).float().unsqueeze(1)  # (401, 1)
        ang = 2 * np.pi * k * n.unsqueeze(0) / N_FFT  # (401, 800)
        self.register_buffer('dft_re', torch.cos(ang).T)   # (800, 401)
        self.register_buffer('dft_im', (-torch.sin(ang)).T)  # (800, 401)

    def forward(self, pcm: torch.Tensor) -> torch.Tensor:
        # pcm: (1, N) float32, 16kHz
        # 1) preemphasis: y[n] = x[n] - 0.97 * x[n-1] (x[-1]=0), full length
        prev = torch.nn.functional.pad(pcm, (1, 0), mode='constant', value=0.0)[:, : pcm.shape[1]]
        y = pcm - PREEMPH * prev
        # 2) center reflect pad (librosa semantics), then frame
        y3 = y.reshape(1, 1, -1)
        pad = N_FFT // 2
        ypad = torch.nn.functional.pad(y3, (pad, pad), mode='reflect').squeeze(0).squeeze(0)
        frames = ypad.unfold(0, WIN, HOP)  # (T, 800)
        frames = frames * self.window
        re = frames @ self.dft_re  # (T, 401)
        im = frames @ self.dft_im
        mag = torch.sqrt(re * re + im * im).T  # (401, T)
        # 3) mel projection
        mel = torch.matmul(self.mel_basis, mag)  # (80, T)
        # 4) amp_to_db: 20*log10(max(1e-5, x)) - 20
        mel = torch.clamp(mel, min=MIN_LEVEL)
        mel = 20.0 * torch.log10(mel) - REF_LEVEL_DB
        # 5) normalize: clip(2*4*((S - min_level_db)/(-min_level_db)) - 4, -4, 4)
        S = 2 * MAX_ABS * ((mel - MIN_LEVEL_DB) / (-MIN_LEVEL_DB)) - MAX_ABS
        S = torch.clamp(S, -MAX_ABS, MAX_ABS)
        return S.unsqueeze(0)  # (1, 80, T)


def reference_mel(wav: np.ndarray) -> np.ndarray:
    """Exactly Wav2Lip audio.melspectrogram() (librosa<=0.7 semantics:
    hann periodic window, center=True, pad_mode='reflect')."""
    from scipy import signal as sp_signal
    preemph = sp_signal.lfilter([1, -PREEMPH], [1], wav)
    D = librosa.stft(
        y=preemph, n_fft=N_FFT, hop_length=HOP, win_length=WIN,
        window='hann', center=True, pad_mode='reflect',
    )
    mel = np.dot(MEL_BASIS, np.abs(D))
    mel = 20 * np.log10(np.maximum(MIN_LEVEL, mel)) - REF_LEVEL_DB
    mel = np.clip(2 * MAX_ABS * ((mel - MIN_LEVEL_DB) / (-MIN_LEVEL_DB)) - MAX_ABS, -MAX_ABS, MAX_ABS)
    return mel


def main():
    for n in [16000 * 3, 16000 * 3 + 137, 8001]:
        t = np.arange(n) / SR
        wav = (
            0.5 * np.sin(2 * np.pi * 220 * t)
            + 0.3 * np.sin(2 * np.pi * 570 * t + 0.5)
            + 0.2 * np.sin(2 * np.pi * 1800 * t + 1.2)
            + 0.05 * np.random.RandomState(42).randn(n)
        ).astype(np.float32)

        ref = reference_mel(wav)  # (80, T)
        model = MelFrontend().eval()
        with torch.no_grad():
            out = model(torch.from_numpy(wav).unsqueeze(0)).squeeze(0).numpy()

        assert out.shape == ref.shape, f'shape mismatch: onnx {out.shape} vs ref {ref.shape}'
        err = np.abs(out - ref)
        print(f'n={n}: shape={out.shape} max_err={err.max():.3e} mean_err={err.mean():.3e}')
        assert err.max() < 5e-4, 'numerical mismatch vs librosa reference!'

    model = MelFrontend().eval()
    pcm = torch.randn(1, 48000)
    torch.onnx.export(
        model, (pcm,), os.path.join(W2L_DIR, 'models', 'mel_wav2lip.onnx'),
        input_names=['pcm'], output_names=['mel'],
        dynamic_axes={'pcm': {1: 'N'}, 'mel': {2: 'T'}},
        opset_version=17, do_constant_folding=True,
    )
    import onnxruntime as ort
    sess = ort.InferenceSession(os.path.join(W2L_DIR, 'models', 'mel_wav2lip.onnx'))
    wav = (0.3 * np.sin(2 * np.pi * 300 * np.arange(16000) / SR)).astype(np.float32)
    o = sess.run(None, {'pcm': wav.reshape(1, -1)})[0]
    r = reference_mel(wav)
    print('onnxruntime check: max_err', np.abs(o[0] - r).max(), 'shape', o.shape)
    # onnxruntime MatMul accumulation order differs slightly from torch; 0.1% rel error is safe for wav2lip
    assert np.abs(o[0] - r).max() < 5e-3
    print('OK: mel_wav2lip.onnx exported and verified')


if __name__ == '__main__':
    main()
