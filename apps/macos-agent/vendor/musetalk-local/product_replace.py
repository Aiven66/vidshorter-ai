#!/usr/bin/env python3
"""Replace the product already held by the f_asia presenter.

The source presenter physically grips a cylindrical cosmetic bottle.  This
module removes that bottle with per-frame background inpainting, then draws
the uploaded product in one of two modes:

hold mode (clean single upright product, cut-out fills >= 60% of its
bounding box — bottles, tubes, jars):
    the product is drawn as a true cut-out that keeps its own silhouette
    and aspect ratio, bottom-anchored into the presenter's real grip.
    Original fingers stay in front of the product, the product receives
    gentle synthetic lighting, and a soft contact shadow ties it to the hand.

showcase mode (composite hero shots — standing jar + tilted box, swatches,
multi-item compositions that touch; fill ratio ~0.45-0.6):
    squeezing such a silhouette into the grip renders an unrecognizable
    blob, so the bottle is erased, every real finger is fully preserved,
    and the ORIGINAL product photo is presented as a natural product card
    (rounded corners, soft shadow, gentle scale/fade entrance) anchored to
    the bottom-right of the frame — the viewer sees exactly the image the
    user sees on the product page.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import cv2
import numpy as np


HOST_LAYOUTS = {
    "f_asia": {
        "track": (0.243, 0.605, 0.160, 0.258),
        "object": (0.020, 0.020, 0.118, 0.226),
        "search": (0.035, 0.025),
    },
}

# working ROI padding around the calibrated object box (px) so products that
# are slightly wider than the source bottle still have room to render
ROI_PAD = 52

# cut-out silhouettes below this bounding-box fill ratio are composite hero
# shots (jar + tilted box, swatches, multi-item) — they render as an
# unrecognizable blob inside the grip, so they go to showcase mode instead
CUTOUT_CLEAN_FILL = 0.60

# product-card entrance: frames of scale 0.94->1.0 + fade-in (24fps => 0.75s)
CARD_ENTRANCE_FRAMES = 18


def fail(message: str) -> None:
    raise RuntimeError(message)


def rounded_mask(height: int, width: int) -> np.ndarray:
    mask = np.zeros((height, width), np.uint8)
    radius = max(5, int(width * 0.12))
    cv2.rectangle(mask, (radius, 0), (width - radius - 1, height - 1), 255, -1)
    cv2.rectangle(mask, (0, radius), (width - 1, height - radius - 1), 255, -1)
    cv2.circle(mask, (radius, radius), radius, 255, -1)
    cv2.circle(mask, (width - radius - 1, radius), radius, 255, -1)
    cv2.circle(mask, (radius, height - radius - 1), radius, 255, -1)
    cv2.circle(mask, (width - radius - 1, height - radius - 1), radius, 255, -1)
    return mask


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """close interior holes of a binary mask via border flood fill"""
    inv = (mask < 128).astype(np.uint8)
    flood = np.zeros((inv.shape[0] + 2, inv.shape[1] + 2), np.uint8)
    cv2.floodFill(inv, flood, (0, 0), 2)
    holes = (inv != 2) & (mask < 128)  # bg pockets not reachable from the border
    out = mask.copy()
    out[holes] = 255
    return out


def largest_central_component(mask: np.ndarray) -> np.ndarray | None:
    """largest connected component whose bbox center sits in the central
    region of the image (filters caption strips, swatches, borders)"""
    h, w = mask.shape[:2]
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    best_label, best_score = 0, -1.0
    for label in range(1, count):
        x, y, bw, bh, area = stats[label]
        if area < h * w * 0.008:
            continue
        if bw * bh > h * w * 0.70:
            continue  # blob spans the frame — background, not a product
        cx, cy = (x + bw / 2) / w, (y + bh / 2) / h
        central = 0.18 <= cx <= 0.82 and 0.10 <= cy <= 0.92
        touching_border = x <= 1 or y <= 1 or x + bw >= w - 1 or y + bh >= h - 1
        score = float(area) * (2.5 if central else 0.2) * (0.35 if touching_border else 1.0)
        if score > best_score:
            best_label, best_score = label, score
    if best_label == 0:
        return None
    comp = (labels == best_label).astype(np.uint8) * 255
    return fill_holes(comp)


def grabcut_mask(image: np.ndarray) -> np.ndarray | None:
    """GrabCut segmentation: border ring forced background, center rectangle
    probable foreground — handles gradient/colored studio backgrounds that a
    pure white-background detector cannot separate"""
    h, w = image.shape[:2]
    gc = np.zeros((h, w), np.uint8)
    bx, by = max(2, int(w * 0.04)), max(2, int(h * 0.04))
    gc[:by, :] = cv2.GC_BGD
    gc[h - by:, :] = cv2.GC_BGD
    gc[:, :bx] = cv2.GC_BGD
    gc[:, w - bx:] = cv2.GC_BGD
    gc[int(h * 0.10):int(h * 0.88), int(w * 0.18):int(w * 0.82)] = cv2.GC_PR_FGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(image, gc, None, bgd, fgd, 4, cv2.GC_INIT_WITH_MASK)
    mask = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return largest_central_component(mask)


def whitebg_mask(image: np.ndarray) -> np.ndarray | None:
    """classic Amazon white-background fast path: near-white pixels are
    background, the largest central non-white blob is the product"""
    near_white = np.all(image >= 240, axis=2)
    if near_white.mean() < 0.28:
        return None
    mask = (~near_white).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    return largest_central_component(mask)


def load_product_mask(image_path: str) -> tuple[np.ndarray, np.ndarray]:
    """read the uploaded product photo and isolate the product silhouette
    from any studio background (white-bg fast path, GrabCut fallback)"""
    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if image is None:
        fail("The product image cannot be read")
    if min(image.shape[:2]) < 64:
        fail("The product image is too small")
    mask = whitebg_mask(image)
    if mask is None:
        mask = grabcut_mask(image)
    if mask is None:
        fail("No isolated product was found in the uploaded image")
    return image, mask


def cutout_fill_ratio(mask: np.ndarray) -> float:
    """how much of the silhouette's bounding box the product actually fills.

    a single upright bottle/jar/tube fills 0.7-1.0; composite hero shots
    (standing jar + tilted box in front, swatches, touching items) sit
    around 0.45-0.6 — squeezing those into the grip renders an
    unrecognizable blob, so they are presented as a product card instead."""
    x, y, w, h = cv2.boundingRect(mask)
    if w < 1 or h < 1:
        return 0.0
    return float(np.count_nonzero(mask)) / float(w * h)


def product_cutout(image: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """crop the (previously computed) product mask.

    returns (bgr crop, alpha crop) tightly bounded, alpha feathered."""
    x, y, w, h = cv2.boundingRect(mask)
    if w < 24 or h < 24:
        fail("The product cut-out is too small to render")
    aspect = h / max(w, 1)
    if not 0.45 <= aspect <= 8.0:
        fail("The product shape is not supported; use an upright bottle, jar, tube or box photo")

    margin = 6
    x0 = max(0, x - margin)
    y0 = max(0, y - margin)
    x1 = min(image.shape[1], x + w + margin)
    y1 = min(image.shape[0], y + h + margin)
    crop = image[y0:y1, x0:x1].copy()
    alpha = mask[y0:y1, x0:x1].copy()
    # soften the cut-out edge so the product doesn't look sticker-pasted
    alpha = cv2.GaussianBlur(alpha, (5, 5), 0)
    return crop, alpha


def skin_mask(frame: np.ndarray) -> np.ndarray:
    ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    y, cr, cb = cv2.split(ycrcb)
    h, s, v = cv2.split(hsv)
    classic = (cr >= 132) & (cr <= 178) & (cb >= 72) & (cb <= 132) & (y > 42)
    warm = (h <= 24) & (s >= 42) & (s <= 190) & (v >= 45)
    mask = (classic & warm).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)

def hand_anchor(frame: np.ndarray, wx: int, wy: int, ww: int, wh: int) -> tuple[float, float] | None:
    """centroid of skin pixels inside the track window — the hand that
    grips the bottle.  The presenter lifts/lowers the bottle through the
    video (measured 100px of vertical travel), so the replacement must
    follow this anchor every frame instead of sitting at a fixed spot."""
    win = frame[wy:wy + wh, wx:wx + ww]
    skin = skin_mask(win)
    ys, xs = np.nonzero(skin)
    if len(xs) < 200:
        return None
    return float(xs.mean()), float(ys.mean())


def seed_track_points(gray: np.ndarray, frame: np.ndarray, obj_x: int, obj_y: int,
                      obj_w: int, obj_h: int, max_points: int = 70) -> np.ndarray | None:
    """Shi-Tomasi corners on the source bottle silhouette (skin pixels are
    masked out so gripping fingers — which move relative to the bottle —
    never drag the track).  Seeded at the current bottle estimate."""
    h, w = gray.shape[:2]
    x0 = max(0, obj_x)
    y0 = max(0, obj_y)
    x1 = min(w, obj_x + obj_w)
    y1 = min(h, obj_y + obj_h)
    if x1 - x0 < 10 or y1 - y0 < 10:
        return None
    roi_gray = gray[y0:y1, x0:x1]
    skin = skin_mask(frame[y0:y1, x0:x1])
    mask = (skin < 100).astype(np.uint8) * 255
    pts = cv2.goodFeaturesToTrack(roi_gray, maxCorners=max_points,
                                  qualityLevel=0.06, minDistance=4, mask=mask)
    if pts is None or len(pts) < 6:
        pts = cv2.goodFeaturesToTrack(roi_gray, maxCorners=max_points,
                                      qualityLevel=0.03, minDistance=3)
    if pts is None or len(pts) < 4:
        return None
    pts = pts.reshape(-1, 2).astype(np.float32)
    pts[:, 0] += x0
    pts[:, 1] += y0
    return pts


def flow_step(prev_gray: np.ndarray, gray: np.ndarray,
              points: np.ndarray) -> tuple[float, float, np.ndarray] | None:
    """Lucas-Kanade pyramidal optical flow on the tracked bottle features,
    with a forward-backward consistency check and median displacement —
    tracks the REAL bottle motion frame-to-frame (hand lifts, gestures,
    sway) without a fixed window, without saturation and without the
    centroid drift of a skin-mask anchor."""
    if points is None or len(points) < 4:
        return None
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01)
    nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, points, None,
                                          winSize=(21, 21), maxLevel=3,
                                          criteria=criteria)
    if nxt is None or st is None:
        return None
    good = st.reshape(-1) == 1
    if good.sum() < 4:
        return None
    fwd = nxt[good]
    base = points[good]
    # forward-backward consistency: flowing back must return to the start
    back, st2, _ = cv2.calcOpticalFlowPyrLK(gray, prev_gray, fwd, None,
                                            winSize=(21, 21), maxLevel=3,
                                            criteria=criteria)
    if back is not None and st2 is not None:
        ok = st2.reshape(-1) == 1
        if ok.sum() >= 4:
            fb_err = np.linalg.norm(back[ok] - base[ok], axis=1)
            keep = ok.copy()
            keep[ok] = fb_err < 2.5
            if keep.sum() >= 3:
                fwd = fwd[keep]
                base = base[keep]
    if len(fwd) < 3:
        return None
    d = fwd - base
    dist = np.linalg.norm(d, axis=1)
    med = float(np.median(dist)) if len(dist) else 0.0
    inlier = dist <= max(6.0, 3.0 * max(med, 1.0))
    if inlier.sum() < 3:
        return None
    d = d[inlier]
    return float(np.median(d[:, 0])), float(np.median(d[:, 1])), fwd[inlier]


def plan_placement(aspect: float, region_w: int, region_h: int) -> tuple[int, int, int, int]:
    """aspect-preserving placement that ALWAYS fits inside the working ROI
    (object box + ROI_PAD on each side).

    v0.9.64 and earlier let squat/near-square products (jars, aspect < 1.6)
    grow to region_h*aspect*1.02 wide — a 433px sprite inside a 188px ROI —
    and compose_region clipped it to a ~180px vertical STRIP.  The user saw
    an unrecognizable pink slice instead of the uploaded jar.  Placement is
    now budget-capped so the complete product silhouette is always drawn.

    tall products (aspect >= 1.6: bottle, tube, stick):
        height up to 116% of bottle height, width derived from the real
        aspect, minimum 136% of the bottle width (hides the silver rim);
        everything clamped to the ROI budget.
    squat products (jar, box, round tin):
        width up to 160% of the bottle box, bottom-anchored at the grip
        (fingers hold the lower half of the box), height preserved.

    returns (x, y, w, h) in bottle-box coordinates (same frame as the
    caller's object box)."""
    budget = ROI_PAD - 8  # safety margin inside the padded ROI
    max_w = region_w + 2 * budget
    max_h = region_h + 2 * budget
    if aspect >= 1.6:
        box_h = min(region_h * 1.16, max_h)
        box_w = min(box_h / aspect, max_w)
        box_h = box_w * aspect
        if box_w < region_w * 1.36:
            box_w = min(region_w * 1.36, max_w)
            box_h = min(box_w * aspect, max_h)
            box_w = box_h / aspect
        x = (region_w - box_w) / 2
        y = (region_h - box_h) / 2
    else:
        box_w = min(region_w * 1.60, max_w)
        box_h = box_w / aspect
        if box_h < region_h * 0.55:
            # don't let a jar shrink to a pebble: grow to 55% of bottle height
            box_h = min(region_h * 0.55, max_h)
            box_w = min(box_h * aspect, max_w)
            box_h = box_w / aspect
        x = (region_w - box_w) / 2
        y = region_h - box_h - 2
    return int(round(x)), int(round(y)), int(round(box_w)), int(round(box_h))


def build_product_sprite(product: np.ndarray, alpha: np.ndarray, w: int, h: int) -> tuple[np.ndarray, np.ndarray]:
    """resize cut-out to the placement box and precompute gentle studio
    lighting (top-lit vertical falloff + edge rounding + bottom occlusion)"""
    interp = cv2.INTER_AREA if w < alpha.shape[1] else cv2.INTER_LANCZOS4
    sprite = cv2.resize(product, (w, h), interpolation=interp)
    sp_alpha = cv2.resize(alpha, (w, h), interpolation=cv2.INTER_LINEAR)

    yy = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    vertical = 1.05 - 0.13 * np.clip((yy - 0.55) / 0.45, 0.0, 1.0)  # 1.05 top -> 0.92 bottom

    dist = cv2.distanceTransform((sp_alpha > 127).astype(np.uint8), cv2.DIST_L2, 3).astype(np.float32)
    edge = 0.93 + 0.07 * np.clip(dist / 9.0, 0.0, 1.0)  # darker silhouette rim

    bottom = np.ones((h, 1), np.float32)
    bottom[int(h * 0.86):, 0] = np.linspace(1.0, 0.93, h - int(h * 0.86))  # hand occlusion

    gain = np.clip(vertical * edge * bottom, 0.88, 1.06) * np.ones((1, w), np.float32)
    shaded = np.clip(sprite.astype(np.float32) * gain[:, :, None], 0, 255).astype(np.uint8)
    return shaded, sp_alpha


def compose_region(
    region: np.ndarray,
    erase: np.ndarray,
    skin_soft: np.ndarray,
    sprite: np.ndarray,
    sp_alpha: np.ndarray,
    px: int,
    py: int,
    ref_area: int,
    bottle_box: tuple[int, int, int, int] | None = None,
) -> tuple[np.ndarray, float]:
    """erase the source bottle (dilate erase, bottle_box suppresses skin
    misclassification), cast a soft contact shadow, draw the shaded
    oversized product sprite, and only restore genuine outside-skin fingers."""
    h, w = region.shape[:2]

    # ---- Step A: strongly suppress skin_soft inside the bottle_box so the
    # silver source bottle pixels can never sneak back as "occluding skin".
    # Genuine fingers enter from the box perimeter (bottom/left/right edges)
    # so we keep a narrow perimeter band, plus the non-product overlap ring.
    if bottle_box is not None:
        bx, by, bw, bh = bottle_box
        box_mask = np.zeros((h, w), np.float32)
        bx1 = max(0, bx); by1 = max(0, by)
        bx2 = min(w, bx + bw); by2 = min(h, by + bh)
        if bx2 > bx1 and by2 > by1:
            # inner box = shrink 9px inward — only the strict core gets full
            # suppression; the 9px edge ring keeps the real finger tips.
            mby, mby2 = by1 + 9, by2 - 9
            mbx, mbx2 = bx1 + 9, bx2 - 9
            if mby2 > mby and mbx2 > mbx:
                box_mask[mby:mby2, mbx:mbx2] = 1.0
                # feather the transition so fingers on the edge don't clip
                box_mask = cv2.GaussianBlur(box_mask, (0, 0), 3.5)
            # erase a narrow perimeter too (the source bottle rim)
            perim = np.zeros((h, w), np.float32)
            perim[by1:by2, bx1:bx2] = 0.45  # half-suppress the entire box incl. rim
            box_mask = np.maximum(box_mask, perim)
        suppressed = skin_soft * (1.0 - box_mask)
    else:
        suppressed = skin_soft.copy()

    # ---- Step B: inpaint the expanded erase mask (dilate further for rim)
    erase_full = cv2.dilate(erase, np.ones((5, 5), np.uint8), iterations=2)
    base = cv2.inpaint(region, erase_full, 5, cv2.INPAINT_TELEA)

    # ---- Step C: draw product + soft shadow
    product_layer = np.zeros((h, w), np.uint8)
    ph, pw = sp_alpha.shape[:2]
    x0, y0 = max(0, px), max(0, py)
    x1, y1 = min(w, px + pw), min(h, py + ph)
    if x1 <= x0 or y1 <= y0:
        return region, 0.0
    product_layer[y0:y1, x0:x1] = sp_alpha[y0 - py:y1 - py, x0 - px:x1 - px]

    shadow = cv2.dilate(product_layer, np.ones((7, 7), np.uint8))
    shifted = np.zeros_like(shadow)
    shifted[7:, 3:] = shadow[:-7, :-3]  # no circular wrap
    shadow = cv2.GaussianBlur(shifted.astype(np.float32) / 255.0, (0, 0), 3.0)
    shadow = shadow * (1.0 - product_layer.astype(np.float32) / 255.0) * 0.22
    out = base.astype(np.float32) * (1.0 - shadow[:, :, None])

    # ---- Step D-before: erase any remaining source-bottle ghost by blending
    # the product-average color over a NARROW ring around the sprite
    # silhouette (inside the bottle box only).  The old whole-box radial wash
    # made sense when the sprite was meant to cover the entire box; with a
    # correctly-sized squat jar (v0.9.65) it painted a flat pink pillar over
    # the whole inpainted area above the jar.  A ~12px halo ring still kills
    # the silver rim ghost that inpaint leaves adjacent to the sprite edge.
    if bottle_box is not None:
        bx, by, bw, bh = bottle_box
        bx1 = max(0, bx); by1 = max(0, by)
        bx2 = min(w, bx + bw); by2 = min(h, by + bh)
        if bx2 > bx1 and by2 > by1:
            # dominant color of the uploaded product (masked interior)
            sprite_mask = sp_alpha.astype(np.float32) / 255.0
            if sprite_mask.sum() > 1:
                avg_bgr = (sprite.astype(np.float32) * sprite_mask[:, :, None]).sum(axis=(0, 1)) / max(1e-6, sprite_mask.sum())
            else:
                avg_bgr = np.array([200.0, 200.0, 200.0], dtype=np.float32)
            halo = cv2.dilate(product_layer, np.ones((25, 25), np.uint8))
            halo = cv2.subtract(halo, product_layer)
            box_only = np.zeros((h, w), np.float32)
            box_only[by1:by2, bx1:bx2] = 1.0
            pl = product_layer.astype(np.float32) / 255.0
            wash = (halo.astype(np.float32) / 255.0) * box_only * 0.9
            wash = wash * (1.0 - pl)
            # never paint over genuine fingers
            wash = wash * (1.0 - suppressed * 1.4)
            wash = np.clip(wash, 0.0, 0.9)
            avg_3d = np.ones((h, w, 3), np.float32) * avg_bgr[None, None, :]
            out = out * (1.0 - wash[:, :, None]) + avg_3d * wash[:, :, None]

    # ---- Step D: product drawn under the (now sanitized) skin layer
    pa = (product_layer.astype(np.float32) / 255.0) * (1.0 - suppressed)
    sprite_full = np.zeros((h, w, 3), np.float32)
    sprite_full[y0:y1, x0:x1] = sprite[y0 - py:y1 - py, x0 - px:x1 - px].astype(np.float32)
    out = out * (1.0 - pa[:, :, None]) + sprite_full * pa[:, :, None]

    # ---- Step E: original fingers stay in front — but ONLY the perimeter
    # band and pixels genuinely outside the bottle box.  If we used the raw
    # skin_soft here, 28-37% of the silver bottle would leak back.
    out = out * (1.0 - suppressed[:, :, None]) + region.astype(np.float32) * suppressed[:, :, None]
    coverage = float(np.sum(pa > 0.12)) / max(1, ref_area)
    return np.clip(out, 0, 255).astype(np.uint8), coverage


def finger_mask(region: np.ndarray, bottle_box: tuple[int, int, int, int] | None) -> np.ndarray:
    """genuine fingers for showcase mode: skin components that are connected
    to pixels OUTSIDE the bottle box.  Warm reflections ON the silver bottle
    are isolated pockets fully inside the box and are dropped, while every
    finger that wraps the bottle connects back to the hand outside the box
    and is kept WHOLE (no blur, no erosion, no perimeter band)."""
    skin = skin_mask(region)
    if bottle_box is None:
        return skin
    h, w = region.shape[:2]
    bx, by, bw, bh = bottle_box
    bx1, by1 = max(0, bx), max(0, by)
    bx2, by2 = min(w, bx + bw), min(h, by + bh)
    if bx2 <= bx1 or by2 <= by1:
        return skin
    count, labels, _, _ = cv2.connectedComponentsWithStats((skin > 0).astype(np.uint8), 8)
    keep = np.zeros((h, w), np.uint8)
    for label in range(1, count):
        ys, xs = np.nonzero(labels == label)
        reaches_out = np.any((xs < bx1) | (xs >= bx2) | (ys < by1) | (ys >= by2))
        if reaches_out:
            keep[ys, xs] = 255
    return keep


def erase_only_region(
    region: np.ndarray,
    erase: np.ndarray,
    bottle_box: tuple[int, int, int, int] | None,
) -> np.ndarray:
    """showcase-mode compose: inpaint the source bottle away and restore the
    complete gripping fingers — no replacement sprite is drawn into the hand
    (the product is presented as a card elsewhere in the frame)."""
    erase_full = cv2.dilate(erase, np.ones((5, 5), np.uint8), iterations=2)
    base = cv2.inpaint(region, erase_full, 5, cv2.INPAINT_TELEA)
    # TELEA leaves dark drag streaks inside large erase regions; the studio
    # backdrop there is a smooth gradient, so smooth the filled area only
    # (feathered mask keeps the boundary continuous with its surroundings)
    streak_mask = cv2.GaussianBlur(
        cv2.dilate(erase_full, np.ones((7, 7), np.uint8)).astype(np.float32) / 255.0,
        (0, 0), 4.0)
    smoothed = cv2.GaussianBlur(base, (0, 0), 7.0)
    base = (base.astype(np.float32) * (1.0 - streak_mask[:, :, None])
            + smoothed.astype(np.float32) * streak_mask[:, :, None]).astype(np.uint8)
    fingers = finger_mask(region, bottle_box)
    fingers_soft = cv2.GaussianBlur(fingers, (5, 5), 0).astype(np.float32) / 255.0
    out = (base.astype(np.float32) * (1.0 - fingers_soft[:, :, None])
           + region.astype(np.float32) * fingers_soft[:, :, None])
    return np.clip(out, 0, 255).astype(np.uint8)


def build_product_card_canvas(image: np.ndarray, max_w: int, max_h: int) -> tuple[np.ndarray, np.ndarray]:
    """turn the ORIGINAL product photo into a presentation card: aspect-fit
    inside (max_w, max_h), rounded corners, hairline edge, soft drop shadow.
    returns (bgr canvas, float alpha canvas), both padded for the shadow."""
    h, w = image.shape[:2]
    scale = min(max_w / w, max_h / h)
    cw, ch = max(64, int(round(w * scale))), max(64, int(round(h * scale)))
    interp = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LINEAR
    card = cv2.resize(image, (cw, ch), interpolation=interp).astype(np.float32)
    alpha = rounded_mask(ch, cw).astype(np.float32) / 255.0

    # hairline edge so the card reads as a card on light backdrops too
    edge = cv2.morphologyEx((alpha * 255).astype(np.uint8), cv2.MORPH_GRADIENT,
                            np.ones((3, 3), np.uint8)) > 0
    card[edge] *= 0.90

    pad = 34
    canvas = np.zeros((ch + pad * 2, cw + pad * 2, 3), np.float32)
    calpha = np.zeros((ch + pad * 2, cw + pad * 2), np.float32)
    # soft drop shadow, offset down-right
    shadow = cv2.GaussianBlur(alpha, (0, 0), 10.0)
    sy, sx = pad + 10, pad + 6
    canvas[sy:sy + ch, sx:sx + cw] = 55.0
    calpha[sy:sy + ch, sx:sx + cw] = shadow * 0.42
    # the photo itself fully covers the shadow inside its own rect
    canvas[pad:pad + ch, pad:pad + cw] = card
    calpha[pad:pad + ch, pad:pad + cw] = alpha
    return canvas, calpha


def draw_product_card(
    frame: np.ndarray,
    canvas: np.ndarray,
    calpha: np.ndarray,
    anchor_x: int,
    anchor_y: int,
    frame_index: int,
) -> np.ndarray:
    """draw the product card anchored to the bottom-right of the frame with
    a gentle scale 0.94->1.0 + fade-in entrance (CARD_ENTRANCE_FRAMES)."""
    fh, fw = frame.shape[:2]
    if frame_index < CARD_ENTRANCE_FRAMES:
        t = (frame_index + 1) / CARD_ENTRANCE_FRAMES
        ease = 1.0 - (1.0 - t) ** 3
        scale = 0.94 + 0.06 * ease
        opacity = ease
    else:
        scale, opacity = 1.0, 1.0
    ch, cw = canvas.shape[:2]
    scw, sch = max(8, int(round(cw * scale))), max(8, int(round(ch * scale)))
    interp = cv2.INTER_AREA if scw < cw else cv2.INTER_LINEAR
    c = cv2.resize(canvas, (scw, sch), interpolation=interp)
    a = cv2.resize(calpha, (scw, sch)) * opacity
    x0, y0 = anchor_x - scw, anchor_y - sch
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(fw, x0 + scw), min(fh, y0 + sch)
    if sx1 <= sx0 or sy1 <= sy0:
        return frame
    sub = frame[sy0:sy1, sx0:sx1].astype(np.float32)
    csub = c[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    asub = a[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0][:, :, None]
    frame[sy0:sy1, sx0:sx1] = np.clip(sub * (1.0 - asub) + csub * asub, 0, 255).astype(np.uint8)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--product", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--host", default="f_asia")
    args = parser.parse_args()

    if args.host not in HOST_LAYOUTS:
        fail("Real product holding is available with the Asian female presenter; select her to continue")

    capture = cv2.VideoCapture(args.video)
    if not capture.isOpened():
        fail("The presenter video cannot be opened")
    fps = capture.get(cv2.CAP_PROP_FPS) or 24.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if width < 320 or height < 480:
        fail("The presenter video resolution is too small")

    layout = HOST_LAYOUTS[args.host]
    track_x = int(layout["track"][0] * width)
    track_y = int(layout["track"][1] * height)
    anchor_track_x = track_x
    anchor_track_y = track_y
    track_w = int(layout["track"][2] * width)
    track_h = int(layout["track"][3] * height)
    object_dx = int(layout["object"][0] * width)
    object_dy = int(layout["object"][1] * height)
    object_w = int(layout["object"][2] * width)
    object_h = int(layout["object"][3] * height)
    search_x = int(layout["search"][0] * width)
    search_y = int(layout["search"][1] * height)

    # ---- mode selection (v0.9.66) ----
    # clean single upright product -> hold it in the real grip; composite
    # hero shot (jar + tilted box etc., low silhouette fill) -> erase the
    # bottle and present the ORIGINAL photo as a product card in frame.
    image, mask = load_product_mask(args.product)
    fill = cutout_fill_ratio(mask)
    mx, my, mw, mh = cv2.boundingRect(mask)
    hold_mode = (
        fill >= CUTOUT_CLEAN_FILL
        and mw >= 24 and mh >= 24
        and 0.45 <= mh / max(mw, 1) <= 8.0
    )
    if hold_mode:
        product, alpha = product_cutout(image, mask)
        aspect = alpha.shape[0] / max(alpha.shape[1], 1)
        px, py, pw, ph = plan_placement(aspect, object_w, object_h)
        sprite, sp_alpha = build_product_sprite(product, alpha, pw, ph)
    else:
        card_canvas, card_alpha = build_product_card_canvas(
            image, int(width * 0.42), int(height * 0.30))
        card_anchor_x = width - int(width * 0.045)
        card_anchor_y = height - int(height * 0.085)
        # no in-hand sprite: the working ROI is just the bottle box + pad
        px = py = 0
        pw, ph = object_w, object_h

    # per-frame erase mask: the source bottle silhouette minus the fingers
    erase_template = rounded_mask(object_h, object_w)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    writer = cv2.VideoWriter(
        args.output,
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        fail("The local product video encoder could not start")

    base_anchor = None
    smooth_dx = 0.0
    smooth_dy = 0.0
    # ---- bottle feature tracking (v0.9.61) ----
    # v0.9.60's skin-centroid anchor saturates: when the hand lifts ~100px,
    # part of the hand leaves the FIXED track window and the centroid stops
    # following the real grip -> visible product/hand offset.  We now track
    # the bottle itself: Shi-Tomasi corners on the (non-skin) bottle pixels,
    # LK pyramidal flow with a forward-backward consistency check, median
    # displacement.  The hand centroid is only a cross-check fallback after
    # several consecutive flow misses.
    flow_dx = 0.0
    flow_dy = 0.0
    track_points = None
    prev_gray = None
    flow_misses = 0
    obj_base_x = anchor_track_x + object_dx
    obj_base_y = anchor_track_y + object_dy
    positions = []
    changed = []
    frame_index = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            step = None
            if prev_gray is not None and track_points is not None and len(track_points) >= 4:
                step = flow_step(prev_gray, gray, track_points)
            if step is not None:
                fdx, fdy, track_points = step
                flow_dx += fdx
                flow_dy += fdy
                flow_misses = 0
            else:
                flow_misses += 1
                if flow_misses >= 4:
                    # fallback: skin centroid of the gripping hand
                    anchor = hand_anchor(frame, anchor_track_x, anchor_track_y, track_w, track_h)
                    if anchor is not None:
                        ax, ay = anchor
                        if base_anchor is None:
                            base_anchor = (ax, ay)
                        hdx = max(-float(width) * 0.25, min(float(width) * 0.25, ax - base_anchor[0]))
                        hdy = max(-float(height) * 0.35, min(float(height) * 0.35, ay - base_anchor[1]))
                        flow_dx = flow_dx * 0.5 + hdx * 0.5
                        flow_dy = flow_dy * 0.5 + hdy * 0.5
                    track_points = None  # force reseed at the corrected estimate

            # reseed features periodically (bottle rotates/occludes over time)
            if track_points is None or len(track_points) < 8 or frame_index % 12 == 0:
                est_x = int(round(obj_base_x + flow_dx))
                est_y = int(round(obj_base_y + flow_dy))
                reseeded = seed_track_points(gray, frame, est_x, est_y, object_w, object_h)
                if reseeded is not None:
                    track_points = reseeded
            prev_gray = gray

            # generous safety bounds (bottle travel measured up to ~230px
            # vertical / ~75px horizontal on the f_asia host) — clamps only
            # guard against runaway tracking, they must never cap real motion
            raw_dx = max(-float(width) * 0.25, min(float(width) * 0.25, flow_dx))
            raw_dy = max(-float(height) * 0.35, min(float(height) * 0.35, flow_dy))
            # light EMA: suppress pixel-level noise without lagging fast lifts
            smooth_dx = smooth_dx * 0.25 + raw_dx * 0.75
            smooth_dy = smooth_dy * 0.25 + raw_dy * 0.75
            track_x = int(round(anchor_track_x + smooth_dx))
            track_y = int(round(anchor_track_y + smooth_dy))
            track_x = max(0, min(width - track_w, track_x))
            track_y = max(0, min(height - track_h, track_y))

            # working ROI = object box + padding AND the full planned sprite
            # rectangle — squat/wide products legally extend past the bottle
            # box, so the ROI must follow them or compose_region clips them
            obj_x = max(0, min(width - object_w, track_x + object_dx))
            obj_y = max(0, min(height - object_h, track_y + object_dy))
            sp_x = obj_x + px
            sp_y = obj_y + py
            rx0 = max(0, min(obj_x, sp_x) - ROI_PAD)
            ry0 = max(0, min(obj_y, sp_y) - ROI_PAD)
            rx1 = min(width, max(obj_x + object_w, sp_x + pw) + ROI_PAD)
            ry1 = min(height, max(obj_y + object_h, sp_y + ph) + ROI_PAD)
            region = frame[ry0:ry1, rx0:rx1].copy()

            skin_soft = cv2.GaussianBlur(skin_mask(region), (5, 5), 0).astype(np.float32) / 255.0

            # erase mask positioned at the bottle inside the ROI
            erase = np.zeros(region.shape[:2], np.uint8)
            ex0, ey0 = obj_x - rx0, obj_y - ry0
            erase[ey0:ey0 + object_h, ex0:ex0 + object_w] = erase_template
            # Keep the aggressive whole-box erase (silver bottle rim) —
            # but don't eat into finger pixels.  bottle_box inside the ROI
            # is erasable anywhere inside its padded rectangle.
            bottle_box_roi = (ex0, ey0, object_w, object_h)
            # remove actual fingers from the erase mask: skin outside the
            # bottle perimeter (true hand pixels) must survive inpainting.
            outer_skin = skin_soft.copy()
            bx, by, bw, bh = bottle_box_roi
            bx1 = max(0, bx); by1 = max(0, by)
            bx2 = min(region.shape[1], bx + bw); by2 = min(region.shape[0], by + bh)
            outer_skin[by1:by2, bx1:bx2] = 0.0  # skin inside box is unreliable
            erase = cv2.bitwise_and(erase, cv2.bitwise_not((outer_skin > 0.42).astype(np.uint8) * 255))
            # expand toward the box boundary so the silver rim disappears
            expand = np.zeros(region.shape[:2], np.uint8)
            expand[by1:by2, bx1:bx2] = 255
            # but still respect real finger skin on the box perimeter
            expand = cv2.bitwise_and(expand, cv2.bitwise_not((outer_skin > 0.42).astype(np.uint8) * 255))
            erase = cv2.bitwise_or(erase, expand)
            erase = cv2.dilate(erase, np.ones((4, 4), np.uint8), iterations=1)

            if hold_mode:
                composed, coverage = compose_region(
                    region, erase, skin_soft, sprite, sp_alpha,
                    ex0 + px, ey0 + py, object_w * object_h,
                    bottle_box=bottle_box_roi,
                )
            else:
                composed = erase_only_region(region, erase, bottle_box_roi)
                coverage = 1.0
                frame = draw_product_card(
                    frame, card_canvas, card_alpha,
                    card_anchor_x, card_anchor_y, frame_index,
                )
            frame[ry0:ry1, rx0:rx1] = composed
            writer.write(frame)

            positions.append((obj_x, obj_y))
            changed.append(coverage)
            frame_index += 1
            if frame_index % 24 == 0:
                print(json.dumps({"stage": "local-product", "frame": frame_index, "total": total}), flush=True)
    finally:
        writer.release()
        capture.release()

    if frame_index < 12 or not os.path.exists(args.output) or os.path.getsize(args.output) < 100_000:
        fail("Product holding generation produced an incomplete video")
    pos = np.asarray(positions, dtype=np.float32)
    jitter = float(np.mean(np.linalg.norm(np.diff(pos, axis=0), axis=1))) if len(pos) > 1 else 0.0
    visible_coverage = float(np.mean(changed))
    # gate guards against a BROKEN tracker (random jumps, 10+px/frame);
    # genuine fast bottle lifts measure ~3.6px/frame mean displacement on
    # the f_asia host, so real motion must stay well inside the gate
    if jitter > 8.0:
        fail("The held product track is unstable; generation was stopped")
    if hold_mode and not 0.10 <= visible_coverage <= 2.00:
        fail("The held product mask did not pass the hand-occlusion quality gate")
    print(json.dumps({
        "stage": "local-product",
        "done": True,
        "mode": "hold" if hold_mode else "showcase",
        "frames": frame_index,
        "trackJitter": round(jitter, 3),
        "visibleCoverage": round(visible_coverage, 3),
    }), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"stage": "local-product", "error": str(exc)}), file=sys.stderr, flush=True)
        raise
