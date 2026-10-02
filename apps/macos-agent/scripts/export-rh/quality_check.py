"""RealESRGAN 单独质量测试: 256 → 1024 上采样后嘴部高频细节能否增加。"""
import onnxruntime as ort
import numpy as np
import torch.nn.functional as F
import torch

sess = ort.InferenceSession('/tmp/rh-models/realesrgan_x2plus.onnx', providers=['CPUExecutionProvider'])
in_name = sess.get_inputs()[0].name
out_name = sess.get_outputs()[0].name

# 真实 host frame: 128x128 嘴部 low-res
# 模拟 v0.9.46 处理后的低清晰度嘴部
S_IN = 128
# 真实人脸嘴部纹理 (sharp ref): 从外部导入——不巧没法 host
# 退而求其次: 用一副人造嘴部 (sin pattern 模拟唇纹)
np.random.seed(42)
Y, X = np.meshgrid(np.linspace(-1, 1, S_IN), np.linspace(-1, 1, S_IN), indexing='ij')
# 唇纹
texture = (np.sin(X*15) * 0.3 + np.cos(Y*20) * 0.2 + np.random.randn(S_IN, S_IN)*0.1)
# 牙齿 (中心高亮)
teeth = np.exp(-((X*1.5)**2 + ((Y-0.3)*3)**2)) * 0.8
img = np.stack([texture, texture*0.8 + teeth, texture*0.6 + teeth*0.7], axis=0)  # 3,128,128
img = (img - img.min()) / (img.max() - img.min())  # [0,1]
print('input range:', img.min(), img.max())

# RealESRGAN normalization: model 输出范围 -1~1，要喂 -1~1 的输入
x = (img * 2 - 1).astype(np.float32)[None, ...]
y = sess.run(None, {in_name: x})[0][0]  # 3,512,512
# y range
print('output range:', y.min(), y.max(), 'mean abs:', np.abs(y).mean())
# 归一到 [0,1]
y_norm = ((y + 1) / 2).clip(0, 1).transpose(1,2,0)
img_norm = img.transpose(1,2,0)
# 同时: 简单双三次上采样 4x 作为 baseline
img_t = torch.from_numpy(img[None].astype(np.float32))
img_4x = F.interpolate(img_t, size=(512, 512), mode='bicubic', align_corners=False)[0].numpy().transpose(1,2,0)

def laplacian_var(gray):
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

g_bicubic = 0.299*img_4x[:,:,0] + 0.587*img_4x[:,:,1] + 0.114*img_4x[:,:,2]
g_realesrgan = 0.299*y_norm[:,:,0] + 0.587*y_norm[:,:,1] + 0.114*y_norm[:,:,2]
print(f'\n4x bicubic   LaplacianVar = {laplacian_var(g_bicubic):.1f}')
print(f'4x RealESRGAN LaplacianVar = {laplacian_var(g_realesrgan):.1f}')
print(f'提升: {(laplacian_var(g_realesrgan)/laplacian_var(g_bicubic) - 1) * 100:.1f}%')

# crop 中心 256x256 (嘴部) 对比
c_bic = g_bicubic[128:384, 128:384]
c_rs = g_realesrgan[128:384, 128:384]
print(f'\n嘴部中心区域:')
print(f'  bicubic  LaplacianVar = {laplacian_var(c_bic):.1f}')
print(f'  RealESRGAN LaplacianVar = {laplacian_var(c_rs):.1f}')

# 输出 PNG 到桌面供目检
import PIL.Image as Image
Image.fromarray((img_4x*255).clip(0,255).astype(np.uint8)).save('/Users/aiven/Desktop/realesrgan_vs_bicubic_4x_bicubic.png')
Image.fromarray((y_norm*255).clip(0,255).astype(np.uint8)).save('/Users/aiven/Desktop/realesrgan_vs_bicubic_4x_realesrgan.png')
print('\nSaved /Users/aiven/Desktop/realesrgan_vs_bicubic_4x_*.png')
