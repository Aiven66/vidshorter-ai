"""Sanity test: torch output vs onnx output (same input) — must match within 1e-3."""
import torch, onnx, onnxruntime as ort
import numpy as np
from export_realesrgan import RRDBNet

ckpt = torch.load('/tmp/rh-models/RealESRGAN_x2plus.pth', map_location='cpu', weights_only=False)['params_ema']
# apply same collapse as export
w12 = ckpt.get('conv_first.weight', None)
if w12 is not None and w12.shape[1] == 12:
    ckpt['conv_first.weight'] = w12[:, 0:3] + w12[:, 3:6] + w12[:, 6:9] + w12[:, 9:12]
model = RRDBNet(num_in_ch=3, num_out_ch=3, scale=2, num_feat=64, num_block=23, num_grow_ch=32)
model.load_state_dict(ckpt, strict=False)
model.eval()
# 256 input
x_t = torch.randn(1, 3, 256, 256)
with torch.no_grad():
    y_t = model(x_t)
print('torch output shape:', y_t.shape)

# load onnx
sess = ort.InferenceSession('/tmp/rh-models/realesrgan_x2plus.onnx', providers=['CPUExecutionProvider'])
in_meta = sess.get_inputs()[0]
out_meta = sess.get_outputs()[0]
print('onnx input:', in_meta.name, in_meta.shape, in_meta.type)
print('onnx output:', out_meta.name, out_meta.shape, out_meta.type)
# 256x256 test
np.random.seed(42)
x = np.random.randn(1, 3, 256, 256).astype(np.float32)
y_onnx = sess.run(None, {in_meta.name: x})[0]
print('onnx output shape:', y_onnx.shape, 'range:', y_onnx.min(), y_onnx.max())
print('onnx mean abs:', np.abs(y_onnx).mean())
# diff
diff = np.abs(y_t.numpy() - y_onnx).mean()
print(f'torch vs onnx mean abs diff: {diff:.6f}  (expect < 1e-3)')

