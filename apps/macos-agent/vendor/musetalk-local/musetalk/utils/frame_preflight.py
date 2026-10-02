"""Video frame extraction and face-coordinate validation for local inference."""

from __future__ import annotations

import os
import shutil
import subprocess

import numpy as np


def extract_video_frames(video_path: str, output_dir: str) -> list[str]:
    """Extract frames without passing user paths through a shell."""
    if os.path.isdir(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir, exist_ok=True)
    pattern = os.path.join(output_dir, "%08d.png")
    completed = subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", video_path,
            "-start_number", "0", pattern,
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "unknown ffmpeg error").strip()
        raise RuntimeError(f"Could not decode the presenter video: {detail[-500:]}")
    frames = sorted(
        os.path.join(output_dir, name)
        for name in os.listdir(output_dir)
        if name.lower().endswith((".png", ".jpg", ".jpeg"))
    )
    if not frames:
        raise RuntimeError("Could not decode any frames from the presenter video")
    return frames


def repair_face_coordinates(coords, placeholder):
    """Interpolate occasional misses and reject inputs with no trackable face."""
    if not coords:
        raise RuntimeError("The presenter video contains no frames")
    valid_indices = [
        index for index, coord in enumerate(coords)
        if coord != placeholder and coord[2] > coord[0] and coord[3] > coord[1]
    ]
    if not valid_indices:
        raise RuntimeError(
            "No presenter face was detected. Use a clear, front-facing presenter video."
        )
    detection_rate = len(valid_indices) / len(coords)
    if detection_rate < 0.50:
        raise RuntimeError(
            f"Presenter face tracking was unreliable ({detection_rate:.0%} detected). "
            "Use a brighter, front-facing presenter video."
        )
    if len(valid_indices) == len(coords):
        return [tuple(map(int, coord)) for coord in coords], detection_rate

    timeline = np.arange(len(coords), dtype=np.float32)
    valid_timeline = np.asarray(valid_indices, dtype=np.float32)
    valid_coords = np.asarray([coords[index] for index in valid_indices], dtype=np.float32)
    repaired = np.column_stack([
        np.interp(timeline, valid_timeline, valid_coords[:, column])
        for column in range(4)
    ])
    return [tuple(map(int, np.rint(coord))) for coord in repaired], detection_rate
