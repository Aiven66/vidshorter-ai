from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest

from musetalk.utils.frame_preflight import extract_video_frames, repair_face_coordinates


PLACEHOLDER = (0.0, 0.0, 0.0, 0.0)


class FramePreflightTest(unittest.TestCase):
    def setUp(self):
        self.work_dir = tempfile.mkdtemp(prefix="clipop path with spaces ")

    def tearDown(self):
        shutil.rmtree(self.work_dir, ignore_errors=True)

    def test_extracts_video_when_all_paths_contain_spaces(self):
        video_path = os.path.join(self.work_dir, "presenter video with spaces.mp4")
        frames_dir = os.path.join(self.work_dir, "decoded frames with spaces")
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error", "-f", "lavfi",
                "-i", "color=c=white:s=64x64:r=3:d=1",
                "-pix_fmt", "yuv420p", video_path,
            ],
            check=True,
        )
        frames = extract_video_frames(video_path, frames_dir)
        self.assertEqual(3, len(frames))

    def test_interpolates_occasional_face_misses(self):
        repaired, rate = repair_face_coordinates(
            [(10, 20, 110, 150), PLACEHOLDER, (12, 22, 112, 152)],
            PLACEHOLDER,
        )
        self.assertEqual((11, 21, 111, 151), repaired[1])
        self.assertAlmostEqual(2 / 3, rate)

    def test_rejects_an_entirely_missing_face_track(self):
        with self.assertRaisesRegex(RuntimeError, "No presenter face"):
            repair_face_coordinates([PLACEHOLDER, PLACEHOLDER], PLACEHOLDER)


if __name__ == "__main__":
    unittest.main()
