"""Prepare the three source cameras as a single synchronized H.264 atlas."""

import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from prepare_capture import make_session


WIDTH = 408
HEIGHT = 864
TILES = {
    "front": {"x": 0, "y": 0, "width": 408, "height": 315},
    "side": {"x": 0, "y": 316, "width": 408, "height": 287},
    "top": {"x": 0, "y": 604, "width": 408, "height": 259},
}
CROP_Y = {"front": 0, "side": 318, "top": 608}


def restore_view(view, name):
    """Erase the original labels and icons while retaining the soft viewport grid."""
    mask = np.zeros(view.shape[:2], np.uint8)
    text_area = view[:62, :100]
    # Text is lighter than the original neutral backdrop and scan texture.
    light = np.uint8(text_area.max(axis=2) > 69) * 255
    mask[:62, :100] = cv2.dilate(light, np.ones((7, 7), np.uint8))
    if name != "top":
        # Nav icons stay in place while the recorded turntable passes them.
        cv2.line(mask, (333, 46), (396, 46), 255, 8)
        cv2.line(mask, (365, 14), (365, 77), 255, 8)
        for center in [(333, 46), (365, 46), (396, 46), (365, 14), (365, 77)]:
            cv2.circle(mask, center, 11, 255, -1)
        for y in (96, 125, 153, 181):
            cv2.ellipse(mask, (391, y), (15, 15), 0, 0, 360, 255, -1)
    return cv2.inpaint(view, mask, 5, cv2.INPAINT_TELEA)


def remove_gizmo_fringe(view):
    # Subsampled source chroma can extend outside the original thin axis glyph.
    patch = view[:205, 318:].copy()
    spread = patch.max(axis=2).astype(np.int16) - patch.min(axis=2)
    mask = cv2.dilate(np.uint8(spread > 6) * 255, np.ones((5, 5), np.uint8))
    view[:205, 318:] = cv2.inpaint(patch, mask, 4, cv2.INPAINT_TELEA)


def performer_masks(session, atlas, state, first):
    batch = np.full((2, 320, 416, 3), 40, dtype=np.uint8)
    for batch_index, name in enumerate(("front", "side")):
        y, h = TILES[name]["y"], TILES[name]["height"]
        batch[batch_index, :h, :WIDTH] = atlas[y:y + h, :, ::-1]
    tensor = np.ascontiguousarray(batch.transpose(0, 3, 1, 2), dtype=np.float32) / 255
    inputs = {"src": tensor, "downsample_ratio": np.array([1.0], np.float32), **state}
    for _ in range(3 if first else 1):
        _, masks, *recurrent = session.run(None, inputs)
        state = {f"r{i}i": value for i, value in enumerate(recurrent, 1)}
        inputs.update(state)
    front = masks[0, 0, :315, :WIDTH]
    side = masks[1, 0, :287, :WIDTH]
    return front, side, state


def diagnostic(view, alpha):
    """Derive ridges, silhouette and high-curvature features from this camera."""
    gray = cv2.cvtColor(view, cv2.COLOR_BGR2GRAY)
    smooth = cv2.GaussianBlur(gray, (3, 3), 0.6)
    local = cv2.GaussianBlur(smooth, (0, 0), 1.3)
    ridges = np.maximum(smooth.astype(np.float32) - local.astype(np.float32) - 1, 0)
    edges = cv2.Canny(smooth, 19, 49, L2gradient=True).astype(np.float32) / 255
    solid = np.clip((alpha - 0.45) / 0.45, 0, 1)
    inner = cv2.erode(solid, np.ones((3, 3), np.uint8))
    rim = np.clip(solid - inner, 0, 1)
    brightness = np.clip(ridges * 9 + 62 * edges, 0, 174) * inner + 46 * rim
    # Features are selected on the actual local surface and disappear at its edge.
    corners = cv2.goodFeaturesToTrack(
        smooth, maxCorners=72, qualityLevel=0.022, minDistance=7,
        mask=np.uint8(inner > 0.95) * 255, blockSize=3,
    )
    dots = np.zeros(gray.shape, np.uint8)
    if corners is not None:
        for corner in corners.reshape(-1, 2):
            cv2.circle(dots, tuple(np.rint(corner).astype(int)), 1, 152, -1, cv2.LINE_AA)
    nodes = dots.astype(np.float32) * inner
    return np.uint8(np.clip(np.stack((
        brightness * 0.94 + nodes * 0.71,
        brightness * 1.03 + nodes * 0.88,
        brightness * 0.66 + nodes * 0.81,
    ), axis=2), 0, 255))


def add_diagnostics(cache, model, top_matte):
    target = cache / "diagnostic"
    target.mkdir(exist_ok=True)
    session = make_session(model)
    state = {f"r{i}i": np.zeros((2, 1, 1, 1), np.float32) for i in range(1, 5)}
    overhead = np.asarray(Image.open(top_matte).getchannel("A"), dtype=np.float32) / 255
    for index in range(145):
        atlas = cv2.imread(str(cache / f"{index:03}.png"))
        for name in ("front", "side"):
            y, h = TILES[name]["y"], TILES[name]["height"]
            remove_gizmo_fringe(atlas[y:y + h])
        front, side, state = performer_masks(session, atlas, state, index == 0)
        layers = np.zeros_like(atlas)
        for name, mask in (("front", front), ("side", side), ("top", overhead)):
            y, h = TILES[name]["y"], TILES[name]["height"]
            layers[y:y + h] = diagnostic(atlas[y:y + h], mask)
        combined = np.concatenate((atlas, layers), axis=1)
        cv2.imwrite(str(target / f"{index:03}.png"), combined, [cv2.IMWRITE_PNG_COMPRESSION, 1])
        if index % 36 == 0:
            print(f"Prepared diagnostic frame {index + 1}/145", flush=True)
    return target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--top-matte", required=True, type=Path)
    parser.add_argument("--reuse-rgb", action="store_true")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    cv2.setNumThreads(2)
    decode = [
        "ffmpeg", "-nostdin", "-loglevel", "error", "-threads", "3", "-i", str(args.source),
        "-an", "-filter_threads", "2", "-vf", "crop=408:868:0:58,select='not(mod(n,2))'",
        "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1",
    ]
    if not args.reuse_rgb:
        with subprocess.Popen(decode, stdout=subprocess.PIPE) as process:
            for index in range(145):
                buffer = process.stdout.read(WIDTH * 868 * 3)
                if len(buffer) != WIDTH * 868 * 3:
                    raise RuntimeError(f"Unexpected end of source at atlas frame {index}")
                source = np.frombuffer(buffer, np.uint8).reshape((868, WIDTH, 3))
                atlas = np.full((HEIGHT, WIDTH, 3), 39, np.uint8)
                for name, tile in TILES.items():
                    source_y, y, h = CROP_Y[name], tile["y"], tile["height"]
                    view = restore_view(source[source_y:source_y + h], name)
                    atlas[y:y + h] = view
                    # Duplicate the border row into the one-pixel chroma gutter.
                    atlas[y + h] = view[-1]
                cv2.imwrite(str(args.cache / f"{index:03}.png"), atlas, [cv2.IMWRITE_PNG_COMPRESSION, 1])
            if process.wait():
                raise RuntimeError("Source decoding failed")
    final_frames = add_diagnostics(args.cache, args.model, args.top_matte)
    order = [*range(145), *range(143, 0, -1)]
    encode = [
        "ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-threads", "2", "-f", "image2pipe",
        "-framerate", "30", "-c:v", "png", "-i", "pipe:0", "-an", "-filter_complex_threads", "2",
        "-filter_complex", "[0:v]scale=out_color_matrix=bt709,format=yuv420p,split[r][d];"
        "[r]crop=408:864:0:0[real];[d]crop=408:864:408:0,gblur=sigma=0.42:steps=1[diag];"
        "[real][diag]hstack=2,addroi=x=408:y=0:w=408:h=864:qoffset=0.08[atlas]",
        "-map", "[atlas]", "-c:v", "libx264", "-threads", "3", "-preset", "slow", "-crf", "22",
        "-maxrate", "1550k", "-bufsize", "2000k", "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-color_primaries", "bt709", "-colorspace", "bt709", "-color_trc", "bt709",
        "-movflags", "+faststart", str(args.output / "ortho-atlas.mp4"),
    ]
    with subprocess.Popen(encode, stdin=subprocess.PIPE) as process:
        for index in order:
            process.stdin.write((final_frames / f"{index:03}.png").read_bytes())
        process.stdin.close()
        if process.wait():
            raise RuntimeError("Atlas encoding failed")
    diagnostics = {name: {**tile, "x": WIDTH} for name, tile in TILES.items()}
    metadata = {
        "width": WIDTH * 2, "height": HEIGHT, "fps": 30, "frames": len(order), "duration": 9.6,
        "views": TILES, "diagnostics": diagnostics,
    }
    (args.output / "ortho-atlas.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
