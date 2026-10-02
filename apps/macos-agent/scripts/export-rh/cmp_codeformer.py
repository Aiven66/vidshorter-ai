"""Compare CodeFormer vs GFPGAN vs Wav2Lip-blur on real host frame.
Output 3 PNGs to Desktop for visual review."""
import sys, importlib.util, types, subprocess
import numpy as np
import onnxruntime as ort
import torch.nn.functional as F
import torch
import PIL.Image as Image

# === stub basicsr ===
cf_arch_dir = '/tmp/cfwork/CodeFormer/basicsr/archs'
pkg = types.ModuleType('basicsr'); pkg.__path__ = ['/tmp/cfwork/CodeFormer/basicsr']; sys.modules['basicsr'] = pkg
arch_pkg = types.ModuleType('basicsr.archs'); arch_pkg.__path__ = [cf_arch_dir]; sys.modules['basicsr.archs'] = arch_pkg
utils_pkg = types.ModuleType('basicsr.utils'); sys.modules['basicsr.utils'] = utils_pkg
stub_registry = types.ModuleType('basicsr.utils.registry')
class _Reg:
    def __init__(self): self._m = {}
    def register(self, name=None):
        if isinstance(name, str):
            return lambda cls: self._m.__setitem__(name, cls) or cls
        if name is None:
            return lambda cls: self._m.__setitem__(cls.__name__, cls) or cls
        self._m[name.__name__] = name; return name
    def get(self, n): return self._m[n]
stub_registry.ARCH_REGISTRY = _Reg(); sys.modules['basicsr.utils.registry'] = stub_registry
def get_root_logger(*a,**k):
    import logging
    return logging.getLogger('basicsr')
utils_pkg.get_root_logger = get_root_logger
def scandir(*a,**k): return []
utils_pkg.scandir = scandir
for f in ['vqgan_arch.py', 'codeformer_arch.py']:
    spec = importlib.util.spec_from_file_location(f, f'{cf_arch_dir}/{f}')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    sys.modules['basicsr.archs.'+f.replace('.py','')] = m
import torch
mod = sys.modules['basicsr.archs.codeformer_arch']
model = mod.CodeFormer(dim_embd=512, codebook_size=1024, n_head=8, n_layers=9, connect_list=['32','64','128','256'])
sd = torch.load('/tmp/cfwork/codeformer.pth', map_location='cpu', weights_only=False)['params_ema']
model.load_state_dict(sd, strict=False); model.eval()

# === load real host frame ===
HOST = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent/resources/hosts/host_m_asia.mp4'
# get a clear-mouth frame at t=0.3s
ff = subprocess.run(['/opt/homebrew/bin/ffmpeg','-ss','0.3','-i',HOST,'-frames:v','1','-vf','scale=720:1280','-pix_fmt','rgb24','-f','rawvideo','-'], capture_output=True)
W, H = 720, 1280
frame = np.frombuffer(ff.stdout, np.uint8).reshape(H, W, 3)
# crop mouth area: cx=360, cy=860, side=480
side = 480
sx, sy = (W-side)//2, H//2 - 60
mouth = frame[sy:sy+side, sx:sx+side]  # 480x480
# resize to 512x512 for models
img = Image.fromarray(mouth).resize((512, 512), Image.LANCZOS)
img_np = np.asarray(img).astype(np.float32) / 255.0  # 0-1
print('host mouth crop: shape', mouth.shape, 'range', mouth.min(), mouth.max())
print('resized 512: range', img_np.min(), img_np.max())

# === sim wav2lip blur: downscale to 96 then back to 512 (mimic pipeline) ===
img_t = torch.from_numpy(img_np).permute(2,0,1).unsqueeze(0)  # 1,3,512,512
img_tiny = F.interpolate(img_t, size=(96, 96), mode='bilinear', align_corners=False)
img_blur = F.interpolate(img_tiny, size=(512, 512), mode='bilinear', align_corners=False)
img_blur_np = img_blur[0].permute(1,2,0).numpy().clip(0,1)
print('wav2lip-blur range:', img_blur_np.min(), img_blur_np.max())
Image.fromarray((img_blur_np*255).astype(np.uint8)).save('/Users/aiven/Desktop/cmp_1_wav2lip_blur.png')

# === CodeFormer: input range [-1, 1] ===
cf_x = (img_blur_np * 2 - 1).astype(np.float32)[None].transpose(0,3,1,2)  # 1,3,512,512
cf_w = np.array(0.5, dtype=np.float64)
sess = ort.InferenceSession('/tmp/cfwork/codeformer.onnx', providers=['CPUExecutionProvider'])
print('CodeFormer running...')
import time
t0 = time.time()
y = sess.run(None, {'input': cf_x, 'w': cf_w})[0]
print(f'CodeFormer {time.time()-t0:.1f}s')
# range [-1,1] -> 0-1
y_np = ((y[0].transpose(1,2,0) + 1) / 2).clip(0,1)
Image.fromarray((y_np*255).astype(np.uint8)).save('/Users/aiven/Desktop/cmp_2_codeformer_w0.5.png')

# === GFPGAN: same input but norm is (x/127.5 - 1) ===
import onnxruntime as ort2
gfpgan_path = '/Users/aiven/Library/Application Support/clipop-macos-agent/realhuman-models/gfpgan_1.4.onnx'
import os
if os.path.exists(gfpgan_path):
    gf_sess = ort2.InferenceSession(gfpgan_path, providers=['CPUExecutionProvider'])
    gf_x = (img_blur_np * 255.0 / 127.5 - 1).astype(np.float32)[None].transpose(0,3,1,2)
    print('GFPGAN running...')
    t0 = time.time()
    yg = gf_sess.run(None, {gf_sess.get_inputs()[0].name: gf_x})[0]
    print(f'GFPGAN {time.time()-t0:.1f}s')
    yg_np = ((yg[0].transpose(1,2,0) + 1) * 127.5).clip(0,255).astype(np.uint8) / 255.0
    Image.fromarray((yg_np*255).astype(np.uint8)).save('/Users/aiven/Desktop/cmp_3_gfpgan.png')
else:
    print('GFPGAN not at', gfpgan_path, '-- skipping')

# === sharp reference: original mouth ===
Image.fromarray(mouth).save('/Users/aiven/Desktop/cmp_0_host_sharp.png')
print('\nSaved to Desktop:')
print('  cmp_0_host_sharp.png     — original host (reference, no modification)')
print('  cmp_1_wav2lip_blur.png   — what Wav2Lip gives us (96x96 upscaled)')
print('  cmp_2_codeformer_w0.5.png — after CodeFormer restoration')
print('  cmp_3_gfpgan.png          — after GFPGAN restoration')

# metrics
def lapvar(gray):
    e = 0; n = 0
    for y in range(1, gray.shape[0]-1):
        for x in range(1, gray.shape[1]-1):
            lap = 4*gray[y,x] - gray[y,x-1] - gray[y,x+1] - gray[y-1,x] - gray[y+1,x]
            e += lap; n += 1
    mean = e/n
    e2 = 0
    for y in range(1, gray.shape[0]-1):
        for x in range(1, gray.shape[1]-1):
            lap = 4*gray[y,x] - gray[y,x-1] - gray[y,x+1] - gray[y-1,x] - gray[y+1,x]
            e2 += (lap-mean)**2
    return e2/n

def to_gray(arr):
    return 0.299*arr[:,:,0] + 0.587*arr[:,:,1] + 0.114*arr[:,:,2]

# crop to mouth center 256x256
for name, arr in [('host_sharp', mouth.astype(np.float32)/255.0),
                  ('wav2lip_blur', img_blur_np),
                  ('codeformer', y_np),
                  ('gfpgan', yg_np if os.path.exists(gfpgan_path) else img_blur_np)]:
    # resize to 512 for fair comparison
    img = Image.fromarray((arr*255).clip(0,255).astype(np.uint8)).resize((512,512), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)/255.0
    crop = a[128:384, 128:384]
    g = to_gray(crop)
    print(f'  {name:20s} LaplacianVar (mouth) = {lapvar(g):.1f}')
