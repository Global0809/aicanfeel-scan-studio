"""Build the lightweight 60 fps survey turntable from the site's reconstructed optical points."""
import argparse
from pathlib import Path
import subprocess

import cv2
import numpy as np
import trimesh


def render(asset_dir, output):
    cloud = trimesh.load(asset_dir / "optical-cloud.ply", process=False)
    points = np.asarray(cloud.vertices, dtype=np.float32)
    rgb = np.asarray(cloud.colors[:, :3], dtype=np.float32)
    rgb = rgb * 0.62 + np.array([96, 145, 141]) * 0.38
    x, y, z = points.T
    width, height = 544, 270
    yy, xx = np.indices((height, width))
    base = np.zeros((height, width, 3), np.uint8)
    base[:] = (38, 40, 41)
    grid = ((xx % 36 == 0) | (yy % 36 == 0))
    base[grid] = (42, 44, 45)
    # Circular survey marks sit on the same horizontal plane as the bust.
    cv2.ellipse(base, (width // 2, height - 14), (152, 15), 0, 0, 360, (62, 65, 65), 1, cv2.LINE_AA)
    cv2.ellipse(base, (width // 2, height - 14), (136, 11), 0, 0, 360, (55, 58, 58), 1, cv2.LINE_AA)
    args = ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{width}x{height}", "-r", "60", "-i", "-", "-an", "-c:v", "libx264",
            "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "fast", "-movflags", "+faststart", str(output)]
    encoder = subprocess.Popen(args, stdin=subprocess.PIPE)
    frames = 228
    for i in range(frames):
        theta = i / frames * np.pi * 2 + 0.28
        c, s = np.cos(theta), np.sin(theta)
        depth = x*s + z*c
        tx = x*c - z*s
        ty = y*0.9903 - depth*0.139
        depth = depth*0.9903 + y*0.139
        u = np.rint(width*0.5 + tx*116).astype(int)
        v = np.rint(height*0.48 - ty*116).astype(int)
        valid = (u >= 0) & (v >= 0) & (u < width) & (v < height)
        order = np.flatnonzero(valid)[np.argsort(depth[valid])]
        img = base.copy()
        shade = np.clip(0.91 + 0.12*depth + 0.1*y, 0.68, 1.14)
        # A thin band of measured returns highlights the active scan slice.
        band = np.exp(-((y + 1.1 - (i/frames*2.4 % 1)*2.2) / 0.038)**2)
        colors = np.clip(rgb * shade[:, None] + band[:, None] * [32, 58, 52], 0, 255).astype(np.uint8)
        img[v[order], u[order]] = colors[order]
        encoder.stdin.write(img.tobytes())
    encoder.stdin.close()
    if encoder.wait():
        raise RuntimeError("Turntable encode failed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("asset_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    render(args.asset_dir, args.output)

