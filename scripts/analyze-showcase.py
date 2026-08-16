#!/usr/bin/env python3
"""Analyze exported showcase-video frames (raw rgb24) for scene-element rendering.
Usage: python3 scripts/analyze-showcase.py [t1 t2 ...]   (default key timestamps)
Requires /tmp/dh-showcase-export.mp4 (produced by scripts/test-dh-showcase.cjs).
"""
import subprocess, sys, os

MP4 = '/tmp/dh-showcase-export.mp4'
W, H = 1080, 1920

def grab(t):
    raw = f'/tmp/showcase-frames/raw{t}.rgb'
    subprocess.run(['ffmpeg', '-y', '-ss', str(t), '-i', MP4, '-frames:v', '1',
                    '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw],
                   capture_output=True)
    with open(raw, 'rb') as f:
        return f.read()

def region(data, x0, y0, x1, y1):
    """normalized coords -> list of (R,G,B)"""
    px = []
    xa, xb = int(x0*W), int(x1*W)
    ya, yb = int(y0*H), int(y1*H)
    step = 4  # sample every 4th pixel
    for y in range(ya, yb, step):
        base = y*W*3
        for x in range(xa, xb, step):
            i = base + x*3
            px.append((data[i], data[i+1], data[i+2]))
    return px

def stats(px):
    n = len(px)
    L = [0.299*r+0.587*g+0.114*b for r,g,b in px]
    mL = sum(L)/n
    sd = (sum((v-mL)**2 for v in L)/n) ** 0.5
    white = sum(1 for v in L if v > 205)/n
    dark = sum(1 for v in L if v < 70)/n
    yellow = sum(1 for r,g,b in px if r>190 and g>140 and b<110)/n
    indigo = sum(1 for r,g,b in px if b>170 and r<170 and g<170 and b-r>40)/n
    red = sum(1 for r,g,b in px if r>170 and g<90 and b<90)/n
    return dict(meanL=round(mL,1), grayStd=round(sd,1), white=round(white,4), dark=round(dark,4), yellow=round(yellow,4), indigo=round(indigo,4), red=round(red,4))

checks = []
def check(name, cond, detail):
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")
    checks.append(cond)

ts = sys.argv[1:] or ['1','4','15','25','47','52','58','62']
frames = {t: grab(t) for t in ts}

for t in ts:
    d = frames[t]
    s = stats(region(d, 0.05, 0.05, 0.95, 0.95))
    print(f"--- t={t}s full-frame: {s}")

g1 = frames['1']; g4 = frames['4']
# greeting: fullscreen product image
s = stats(region(g1, 0.20, 0.18, 0.80, 0.45))
check('greeting product image (grayStd>20)', s['grayStd'] > 20, str(s))
# greeting: brand pill at y~0.115
s = stats(region(g1, 0.30, 0.09, 0.70, 0.14))
check('greeting brand pill', s['white'] > 0.01 or s['indigo'] > 0.05, str(s))
# greeting: MUST HAVE white pill y~0.705
s = stats(region(g4, 0.25, 0.680, 0.75, 0.730))
check('greeting must-have badge (white)', s['white'] > 0.05, str(s))
# greeting: stars gold y~0.775
s = stats(region(g4, 0.20, 0.755, 0.80, 0.795))
check('greeting star rating (gold)', s['yellow'] > 0.005, str(s))

h15 = frames['15']; h25 = frames['25']
# highlight: product card image
s = stats(region(h15, 0.14, 0.10, 0.86, 0.38))
check('highlight card image (grayStd>25)', s['grayStd'] > 25, str(s))
# highlight: numbered indigo badge top-left of card
s = stats(region(h15, 0.075, 0.077, 0.245, 0.173))
check('highlight number badge (indigo)', s['indigo'] > 0.25, str(s))
# highlight: title text
s = stats(region(h25, 0.07, 0.56, 0.93, 0.72))
check('highlight title text (white)', s['white'] > 0.02, str(s))

# price scene: scan a range of timestamps, take max (red bar flashes via alpha)
price_best = None
for pt in ['53','54','55','56','57']:
    if pt not in frames: continue
    s = stats(region(frames[pt], 0.20, 0.525, 0.80, 0.575))
    if price_best is None or s['red'] > price_best['red']:
        price_best = s; price_t = pt
pf = frames[price_t]
print(f"     price scene best frame t={price_t}s")
# price: red limited-time bar y~0.535
check('price limited-time bar (red)', price_best['red'] > 0.05, str(price_best))
# price: big price text y~0.665 (multi-frame max — pop-in anim)
price_txt_best = 0; price_txt_detail = None
for pt in ['54','55','56','57']:
    if pt not in frames: continue
    s = stats(region(frames[pt], 0.10, 0.62, 0.90, 0.71))
    if s['white'] > price_txt_best:
        price_txt_best = s['white']; price_txt_detail = s
check('price big text (white)', price_txt_best > 0.03, str(price_txt_detail))
# price: white product card center y~0.325
s = stats(region(pf, 0.30, 0.20, 0.70, 0.45))
check('price product card (white)', s['white'] > 0.1, str(s))
# price: stars y~0.775
s = stats(region(pf, 0.20, 0.755, 0.80, 0.795))
check('price star rating (gold)', s['yellow'] > 0.005, str(s))

c62 = frames['62']
# cta: indigo button y~0.485 center
s = stats(region(c62, 0.15, 0.44, 0.85, 0.56))
check('cta button (indigo)', s['indigo'] > 0.15, str(s))
# cta: stock urgency red-ish text y~0.635
s = stats(region(c62, 0.20, 0.61, 0.80, 0.66))
print(f"     cta urgency zone: {s}")
# cta: stars y~0.69
s = stats(region(c62, 0.20, 0.665, 0.80, 0.715))
check('cta star rating (gold)', s['yellow'] > 0.005, str(s))
# cta: price recap y~0.755
s = stats(region(c62, 0.25, 0.72, 0.75, 0.79))
check('cta price recap (white)', s['white'] > 0.01, str(s))

print(f"\nFRAME RESULT: {sum(checks)}/{len(checks)} pass")
sys.exit(0 if all(checks) else 1)
