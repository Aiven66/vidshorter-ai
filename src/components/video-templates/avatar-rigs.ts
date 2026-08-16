/**
 * 真人形象照面部骨架（离线烘焙）。
 * 由 scripts/calibrate-mouth.swift 通过 macOS Vision 关键点检测生成：
 * 坐标均为图像比例（左上原点，y 向下）。新增形象时重新运行脚本并粘贴输出。
 */
export interface AvatarRig {
  imgW: number;
  imgH: number;
  face: { x: number; y: number; w: number; h: number };
  mouth: { x: number; y: number; w: number; h: number };
  leftEye: { x: number; y: number; w: number; h: number };
  rightEye: { x: number; y: number; w: number; h: number };
  chin: number;
}

export const AVATAR_RIGS: Record<string, AvatarRig> = {
  'us-f': { imgW: 1680, imgH: 2240, face: { x: 0.2083, y: 0.2822, w: 0.5732, h: 0.4299 }, mouth: { x: 0.4987, y: 0.5724, w: 0.2115, h: 0.0463 }, leftEye: { x: 0.3876, y: 0.4032, w: 0.1005, h: 0.0229 }, rightEye: { x: 0.6053, y: 0.4023, w: 0.1021, h: 0.0230 }, chin: 0.6863 },
  'us-m': { imgW: 1680, imgH: 2240, face: { x: 0.2871, y: 0.2915, w: 0.4269, h: 0.3202 }, mouth: { x: 0.5005, y: 0.5059, w: 0.1647, h: 0.0282 }, leftEye: { x: 0.4192, y: 0.3802, w: 0.0711, h: 0.0138 }, rightEye: { x: 0.5766, y: 0.3805, w: 0.0733, h: 0.0135 }, chin: 0.6095 },
  'gb-f': { imgW: 1680, imgH: 2240, face: { x: 0.1689, y: 0.2760, w: 0.6718, h: 0.5038 }, mouth: { x: 0.5027, y: 0.6141, w: 0.2454, h: 0.0527 }, leftEye: { x: 0.3780, y: 0.4200, w: 0.1146, h: 0.0241 }, rightEye: { x: 0.6330, y: 0.4193, w: 0.1155, h: 0.0237 }, chin: 0.7576 },
  'gb-m': { imgW: 1680, imgH: 2240, face: { x: 0.1979, y: 0.2970, w: 0.5631, h: 0.4224 }, mouth: { x: 0.4882, y: 0.5818, w: 0.2149, h: 0.0357 }, leftEye: { x: 0.3768, y: 0.4160, w: 0.0932, h: 0.0171 }, rightEye: { x: 0.5899, y: 0.4189, w: 0.0948, h: 0.0170 }, chin: 0.7096 },
  'fr-f': { imgW: 1680, imgH: 2240, face: { x: 0.2525, y: 0.4384, w: 0.4852, h: 0.3639 }, mouth: { x: 0.4996, y: 0.6846, w: 0.1837, h: 0.0373 }, leftEye: { x: 0.3987, y: 0.5411, w: 0.0848, h: 0.0178 }, rightEye: { x: 0.5869, y: 0.5429, w: 0.0864, h: 0.0166 }, chin: 0.7861 },
  'fr-m': { imgW: 1680, imgH: 2240, face: { x: 0.2305, y: 0.3450, w: 0.5436, h: 0.4077 }, mouth: { x: 0.5078, y: 0.6262, w: 0.1960, h: 0.0328 }, leftEye: { x: 0.4021, y: 0.4568, w: 0.0892, h: 0.0184 }, rightEye: { x: 0.6025, y: 0.4553, w: 0.0918, h: 0.0182 }, chin: 0.7442 },
  'jp-f': { imgW: 1680, imgH: 2240, face: { x: 0.2279, y: 0.3041, w: 0.5517, h: 0.4138 }, mouth: { x: 0.5066, y: 0.5854, w: 0.2012, h: 0.0382 }, leftEye: { x: 0.3999, y: 0.4230, w: 0.0934, h: 0.0203 }, rightEye: { x: 0.6091, y: 0.4225, w: 0.0934, h: 0.0205 }, chin: 0.6926 },
  'jp-m': { imgW: 1680, imgH: 2240, face: { x: 0.2309, y: 0.2801, w: 0.5393, h: 0.4044 }, mouth: { x: 0.5041, y: 0.5538, w: 0.1835, h: 0.0391 }, leftEye: { x: 0.3986, y: 0.3931, w: 0.0905, h: 0.0176 }, rightEye: { x: 0.6020, y: 0.3914, w: 0.0908, h: 0.0177 }, chin: 0.6685 },
  'kr-f': { imgW: 1680, imgH: 2240, face: { x: 0.1824, y: 0.2986, w: 0.6666, h: 0.4999 }, mouth: { x: 0.5147, y: 0.6388, w: 0.2340, h: 0.0508 }, leftEye: { x: 0.3928, y: 0.4375, w: 0.1114, h: 0.0283 }, rightEye: { x: 0.6426, y: 0.4406, w: 0.1116, h: 0.0270 }, chin: 0.7710 },
  'kr-m': { imgW: 1680, imgH: 2240, face: { x: 0.2596, y: 0.2295, w: 0.4934, h: 0.3700 }, mouth: { x: 0.5104, y: 0.4827, w: 0.1661, h: 0.0346 }, leftEye: { x: 0.4127, y: 0.3335, w: 0.0825, h: 0.0174 }, rightEye: { x: 0.5953, y: 0.3331, w: 0.0818, h: 0.0171 }, chin: 0.5862 },
  'cn-f': { imgW: 1680, imgH: 2240, face: { x: 0.2687, y: 0.4604, w: 0.4973, h: 0.3730 }, mouth: { x: 0.5219, y: 0.7106, w: 0.1817, h: 0.0407 }, leftEye: { x: 0.4242, y: 0.5646, w: 0.0877, h: 0.0201 }, rightEye: { x: 0.6155, y: 0.5649, w: 0.0886, h: 0.0199 }, chin: 0.8094 },
  'cn-m': { imgW: 1680, imgH: 2240, face: { x: 0.2364, y: 0.3074, w: 0.5355, h: 0.4016 }, mouth: { x: 0.5108, y: 0.5813, w: 0.1815, h: 0.0351 }, leftEye: { x: 0.4051, y: 0.4171, w: 0.0879, h: 0.0197 }, rightEye: { x: 0.6020, y: 0.4156, w: 0.0889, h: 0.0194 }, chin: 0.6921 },
};

/** 从形象照采样肤色（用于眨眼眼皮覆盖），失败返回 null */
export function sampleSkinTone(img: HTMLImageElement, rig: AvatarRig): string | null {
  try {
    const SW = 84;
    const SH = Math.round((SW * rig.imgH) / rig.imgW);
    const c = document.createElement('canvas');
    c.width = SW;
    c.height = SH;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(img, 0, 0, SW, SH);
    // 左右脸颊采样点（眼睛下方、脸框内侧）
    const pts = [
      { x: rig.face.x + rig.face.w * 0.2, y: rig.leftEye.y + rig.face.h * 0.16 },
      { x: rig.face.x + rig.face.w * 0.8, y: rig.rightEye.y + rig.face.h * 0.16 },
      { x: rig.face.x + rig.face.w * 0.5, y: (rig.chin + rig.leftEye.y) / 2 - rig.face.h * 0.02 },
    ];
    let r = 0, g = 0, b = 0, n = 0;
    for (const p of pts) {
      const px = Math.min(SW - 1, Math.max(0, Math.round(p.x * SW)));
      const py = Math.min(SH - 1, Math.max(0, Math.round(p.y * SH)));
      const d = cx.getImageData(px, py, 1, 1).data;
      r += d[0]; g += d[1]; b += d[2]; n++;
    }
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  } catch {
    return null;
  }
}
