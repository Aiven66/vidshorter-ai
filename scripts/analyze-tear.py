#!/usr/bin/env python3
"""Confirm/deny the full-width horizontal tear at mouth height in avatar-mode export.
Canvas export is 1080x1920 (2x the 540x960 design coords).
For us-f: mouth gap band y 786..904; cavity covers x 418..670;
tear zones = x 60..400 (left cheek) and x 690..1020 (right cheek).
If background shows through the tear, darkFrac in cheek bands spikes at mouth-open moments.
"""
import subprocess, sys

MP4 = '/tmp/dh-export.mp4'
W, H = 1080, 1920

def grab(t):
    raw = f'/tmp/tear-{t}.rgb'
    subprocess.run(['ffmpeg', '-y', '-ss', str(t), '-i', MP4, '-frames:v', '1',
                    '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], capture_output=True)
    with open(raw, 'rb') as f:
        return f.read()

def band_stats(d, x0, y0, x1, y1):
    xa, xb, ya, yb = int(x0*W), int(x1*W), int(y0*H), int(y1*H)
    n = dark = 0; sL = 0
    for y in range(ya, yb, 3):
        base = y*W*3
        for x in range(xa, xb, 3):
            i = base + x*3
            L = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]
            sL += L; n += 1
            if L < 70: dark += 1
    return dict(meanL=round(sL/n,1), darkFrac=round(dark/n,3))

# sample many moments across an 11s window of speech
print("t(s)  mouth-band   L-cheek(60..400)  R-cheek(690..1020)   [y 786..904]")
for t in [float(x) for x in sys.argv[1:]] or [3.0,3.4,3.8,4.2,4.6,5.0,5.4,5.8,6.2,6.6,7.0,7.4,7.8,8.2,8.6,9.0,9.4,9.8]:
    d = grab(t)
    m = band_stats(d, 0.387, 0.409, 0.622, 0.471)   # mouth center
    l = band_stats(d, 0.055, 0.409, 0.370, 0.471)   # left cheek at mouth height
    r = band_stats(d, 0.639, 0.409, 0.944, 0.471)   # right cheek at mouth height
    print(f"{t:5.1f}  {m}  {l}  {r}")
