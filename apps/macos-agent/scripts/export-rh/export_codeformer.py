"""Export CodeFormer to onnx, fp32, 512x512 fixed (transformer requires static shape)."""
# Use only the local codeformer_arch.py — avoid the system basicsr (which clashes
# with GFPGAN-bundled basicsr) by importing the arch class directly.
import sys, importlib.util, types, os

cf_arch_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cfmodels', 'CodeFormer', 'basicsr', 'archs')
PKG_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cfmodels')
pkg = types.ModuleType('basicsr'); pkg.__path__ = [os.path.join(PKG_ROOT, 'CodeFormer', 'basicsr')]; sys.modules['basicsr'] = pkg
arch_pkg = types.ModuleType('basicsr.archs'); arch_pkg.__path__ = [cf_arch_dir]; sys.modules['basicsr.archs'] = arch_pkg
# stub utils used by archs/__init__.py
utils_pkg = types.ModuleType('basicsr.utils')
sys.modules['basicsr.utils'] = utils_pkg
stub_registry = types.ModuleType('basicsr.utils.registry')
class _Reg:
    def __init__(self): self._m = {}
    def register(self, name=None):
        if isinstance(name, str):
            def deco(cls): self._m[name] = cls; return cls
            return deco
        if name is None:
            # bare @ARCH_REGISTRY.register() — return a decorator
            def deco(cls): self._m[cls.__name__] = cls; return cls
            return deco
        # @ARCH_REGISTRY.register(MyClass) form
        self._m[name.__name__] = name
        return name
    def get(self, name): return self._m[name]
stub_registry.ARCH_REGISTRY = _Reg()
sys.modules['basicsr.utils.registry'] = stub_registry
# stub get_root_logger etc used by vqgan_arch / codeformer_arch
def get_root_logger(*a, **k):
    import logging
    return logging.getLogger('basicsr')
utils_pkg.get_root_logger = get_root_logger
def scandir(path, suffix=None, recursive=False, full_path=False):
    import os
    for f in sorted(os.listdir(path)):
        if suffix is None or f.endswith(suffix):
            yield os.path.join(path, f) if full_path else f
utils_pkg.scandir = scandir
# load vqgan_arch.py and register
spec = importlib.util.spec_from_file_location('basicsr.archs.vqgan_arch', f'{cf_arch_dir}/vqgan_arch.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
sys.modules['basicsr.archs.vqgan_arch'] = mod
stub_registry.ARCH_REGISTRY.register('VQAutoEncoder')(mod.VQAutoEncoder)
stub_registry.ARCH_REGISTRY.register('VQGANDiscriminator')(mod.VQGANDiscriminator)
spec = importlib.util.spec_from_file_location('basicsr.archs.codeformer_arch', f'{cf_arch_dir}/codeformer_arch.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
sys.modules['basicsr.archs.codeformer_arch'] = mod
# manually register
stub_registry.ARCH_REGISTRY.register('CodeFormer')(mod.CodeFormer)

import torch
model = stub_registry.ARCH_REGISTRY.get('CodeFormer')(
    dim_embd=512, codebook_size=1024, n_head=8, n_layers=9,
    connect_list=['32', '64', '128', '256'],
)
sd = torch.load(os.path.join(PKG_ROOT, 'codeformer.pth'), map_location='cpu', weights_only=False)['params_ema']
missing, unexpected = model.load_state_dict(sd, strict=False)
print(f'load: missing={len(missing)}, unexpected={len(unexpected)}')
if missing: print('first missing:', missing[:3])
if unexpected: print('first unexpected:', unexpected[:3])

# Wrap to return only the restored image (forward returns tuple of 3)
class CodeFormerRestorer(torch.nn.Module):
    def __init__(self, cf):
        super().__init__()
        self.cf = cf
    def forward(self, x, w, adain):
        out = self.cf(x, w=w, adain=adain)
        return out[0]

model = CodeFormerRestorer(model).eval()
print(f'total params: {sum(p.numel() for p in model.parameters())/1e6:.1f}M')

import inspect
print('forward signature:', inspect.signature(model.forward))

x = torch.randn(1, 3, 512, 512)
with torch.no_grad():
    y = model(x, 0.5, False)
print('dry run out:', y.shape, 'range:', y.min().item(), y.max().item(), 'mean:', y.mean().item())

out_path = os.path.join(PKG_ROOT, 'codeformer.onnx')
# Use legacy torch.onnx.export (avoids torch.export dynamism). With torch 2.3.1
# we monkey-patch the new exporter to fall back to the legacy TorchScript-based
# one (dynamo=False is the explicit switch in torch 2.5+).
import warnings
warnings.filterwarnings('ignore')
try:
    torch.onnx.export(
        model, (x, 0.5, False), out_path,
        input_names=['input', 'w', 'adain'],
        output_names=['output'],
        dynamic_axes={'input': {2: 'H', 3: 'W'}, 'output': {2: 'H_out', 3: 'W_out'}},
        opset_version=17, do_constant_folding=True,
        dynamo=False,
    )
except TypeError:
    torch.onnx.export(
        model, (x, 0.5, False), out_path,
        input_names=['input', 'w', 'adain'],
        output_names=['output'],
        dynamic_axes={'input': {2: 'H', 3: 'W'}, 'output': {2: 'H_out', 3: 'W_out'}},
        opset_version=17, do_constant_folding=True,
    )
import os
print(f'exported {out_path} ({os.path.getsize(out_path)/1024/1024:.1f}MB)')

import onnx
m = onnx.load(out_path)
onnx.checker.check_model(m)
print('onnx check OK')

import onnxruntime as ort
import numpy as np
sess = ort.InferenceSession(out_path, providers=['CPUExecutionProvider'])
inp_meta = sess.get_inputs()
print('inputs:', [(i.name, i.shape, i.type) for i in inp_meta])
np_inp = x.numpy().astype(np.float32)
np_w = np.array(0.5, dtype=np.float64)
y_onnx = sess.run(None, {inp_meta[0].name: np_inp, inp_meta[1].name: np_w})[0]
print('onnx out:', y_onnx.shape, 'range:', y_onnx.min(), y_onnx.max())
print('torch vs onnx mean abs diff:', float((torch.from_numpy(y_onnx) - y).abs().mean()))
print('PASS')
