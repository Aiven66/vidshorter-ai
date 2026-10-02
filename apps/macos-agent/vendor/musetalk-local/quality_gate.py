#!/usr/bin/env python3
"""Quality gate for locally generated talking-product videos."""

from __future__ import annotations

import argparse
import json
import os
import sys

import cv2
import mediapipe as mp
import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    args = parser.parse_args()
    if not os.path.exists(args.video) or os.path.getsize(args.video) < 100_000:
        raise RuntimeError("The generated video is incomplete")

    capture = cv2.VideoCapture(args.video)
    if not capture.isOpened():
        raise RuntimeError("The generated video cannot be decoded")
    mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.55,
        min_tracking_confidence=0.55,
    )
    sharpness = []
    openness = []
    seam_ratios = []
    prior_mouth = None
    temporal = []
    frames = 0
    detected = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames += 1
        h, w = frame.shape[:2]
        result = mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if not result.multi_face_landmarks:
            continue
        detected += 1
        points = result.multi_face_landmarks[0].landmark
        px = lambda index: np.array([points[index].x * w, points[index].y * h], dtype=np.float32)
        left, right = px(61), px(291)
        top, bottom = px(13), px(14)
        mouth_width = max(8.0, float(np.linalg.norm(right - left)))
        openness.append(float(np.linalg.norm(bottom - top) / mouth_width))

        center = (left + right + top + bottom) / 4.0
        crop_w = int(mouth_width * 1.55)
        crop_h = int(mouth_width * 1.02)
        x0 = max(0, int(center[0] - crop_w / 2))
        x1 = min(w, int(center[0] + crop_w / 2))
        y0 = max(0, int(center[1] - crop_h * 0.42))
        y1 = min(h, int(center[1] + crop_h * 0.58))
        mouth = cv2.cvtColor(frame[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
        if mouth.size < 400:
            continue
        lap = cv2.Laplacian(mouth, cv2.CV_32F)
        sharpness.append(float(np.var(lap)))

        # A hard pasted mouth creates an edge-energy spike around the blend
        # boundary. Compare a narrow border ring with the crop interior.
        gradient = cv2.magnitude(
            cv2.Sobel(mouth, cv2.CV_32F, 1, 0, ksize=3),
            cv2.Sobel(mouth, cv2.CV_32F, 0, 1, ksize=3),
        )
        border = np.zeros_like(mouth, np.uint8)
        border[:4, :] = 1
        border[-4:, :] = 1
        border[:, :4] = 1
        border[:, -4:] = 1
        inner = border == 0
        seam_ratios.append(float(np.mean(gradient[border == 1]) / max(1.0, np.mean(gradient[inner]))))

        normalized = cv2.resize(mouth, (128, 80), interpolation=cv2.INTER_AREA)
        if prior_mouth is not None:
            temporal.append(float(np.mean(cv2.absdiff(normalized, prior_mouth))))
        prior_mouth = normalized

    capture.release()
    mesh.close()
    if frames < 24 or detected / max(frames, 1) < 0.96:
        raise RuntimeError("Face tracking did not remain stable throughout the generated video")
    if len(sharpness) < 20:
        raise RuntimeError("Not enough mouth frames were available for quality verification")

    metrics = {
        "frames": frames,
        "faceDetectionRate": round(detected / frames, 4),
        "mouthSharpnessMean": round(float(np.mean(sharpness)), 3),
        "mouthSharpnessP10": round(float(np.percentile(sharpness, 10)), 3),
        "mouthMotionStd": round(float(np.std(openness)), 5),
        "blendSeamP95": round(float(np.percentile(seam_ratios, 95)), 3),
        "temporalChangeP95": round(float(np.percentile(temporal, 95)), 3) if temporal else 0.0,
    }
    if metrics["mouthSharpnessP10"] < 10.0:
        raise RuntimeError("Mouth detail is too soft; generation was rejected")
    if metrics["mouthMotionStd"] < 0.004:
        raise RuntimeError("The mouth did not respond sufficiently to narration")
    if metrics["blendSeamP95"] > 3.6:
        raise RuntimeError("A visible mouth compositing boundary was detected")
    if metrics["temporalChangeP95"] > 34.0:
        raise RuntimeError("The mouth track contains a temporal jump or double-mouth frame")
    print(json.dumps({"stage": "quality-check", "done": True, "metrics": metrics}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"stage": "quality-check", "error": str(exc)}), file=sys.stderr, flush=True)
        raise
