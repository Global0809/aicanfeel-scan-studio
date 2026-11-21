"""Prepare the supplied scan footage as aligned, seamless optical view layers.

Run with Python 3, Pillow, NumPy, OpenCV, ONNX Runtime and FFmpeg installed.
Pass the MobileNetV3 FP32 Robust Video Matting ONNX checkpoint with --model.
Temporary PNG frames preserve both the cleaned viewport RGB and performer alpha.
"""

import argparse
import math
import subprocess
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image


WIDTH = 1210
HEIGHT = 864
SOURCE_FRAMES = 289
FRAME_ORDER = [*range(SOURCE_FRAMES), *range(SOURCE_FRAMES - 2, 0, -1)]
SHOULDER_TIMES = [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120]
SHOULDER_EDGES = [1042, 1035, 1026, 1015, 1004, 990, 975, 960, 945, 930, 913]


def masked_regions():
    """Screen chrome rectangles in coordinates of the cropped main viewport."""
    result = np.zeros((HEIGHT, WIDTH), np.uint8)
    rectangles = (
        (0, 0, 48, 328),        # Left viewport toolbar
        (50, 0, 187, 40),       # Upper-left view label
        (815, 5, 916, 107),     # Orientation gizmo
        (874, 104, 913, 226),   # Zoom, pan, and camera widgets
        (921, 0, 1209, 676),    # Inspector
        (1188, 0, 1209, 863),   # Right-hand dock tabs
    )
    for x0, y0, x1, y1 in rectangles:
        cv2.rectangle(result, (x0, y0), (x1, y1), 255, -1)
    return result


def backdrop():
    """Continue the source's neutral viewport into areas hidden by editor chrome."""
    row, col = np.mgrid[:HEIGHT, :WIDTH].astype(np.float32)
    tone = 36.6 + row * 0.006 + col * 0.0008
    # Static grain avoids a block of flat fill beside the compressed source.
    tone += np.random.default_rng(2211).normal(0, 0.29, tone.shape)
    return np.stack((tone + 0.4, tone + 0.55, tone + 0.5), axis=2).astype(np.uint8)


def repair_occluded_shoulder(plate, original, index):
    """Reproject nearby shirt detail into the narrow inspector occlusion."""
    if index >= SHOULDER_TIMES[-1]:
        return
    bottom_edge = np.interp(index, SHOULDER_TIMES, SHOULDER_EDGES)
    x0, y0, y1 = 920, 518, 677
    x1 = min(WIDTH, math.ceil(bottom_edge + 3))
    if x1 <= x0:
        return
    ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    distance = (y1 - ys)
    edge = bottom_edge - 0.49 * distance - 0.0047 * distance**2
    depth = np.minimum(distance * 0.70, 75)
    lower_edge = bottom_edge + 0.40 * depth - 0.0018 * depth**2
    remap_x = (xs - edge + lower_edge).astype(np.float32)
    remap_y = (y1 + depth).astype(np.float32)
    fabric = cv2.remap(original, remap_x, remap_y, cv2.INTER_LINEAR)
    # Anchor the left edge to the uninterrupted cloth adjacent to the inspector.
    left_x = np.clip(2 * x0 - xs - 1, 0, WIDTH - 1).astype(np.float32)
    seam_fabric = cv2.remap(original, left_x, ys, cv2.INTER_LINEAR)
    left_weight = np.clip((x0 + 14 - xs) / 15, 0, 1)[:, :, None]
    fabric = seam_fabric * left_weight + fabric * (1 - left_weight)
    alpha = np.clip((edge - xs + 2) / 4, 0, 1)[:, :, None]
    destination = plate[y0:y1, x0:x1]
    destination[:] = (fabric * alpha + destination * (1 - alpha)).astype(np.uint8)


def make_session(model):
    opt = ort.SessionOptions()
    opt.enable_mem_pattern = False
    opt.intra_op_num_threads = 3
    opt.inter_op_num_threads = 1
    available = ort.get_available_providers()
    preferred = [p for p in ("CUDAExecutionProvider", "DmlExecutionProvider", "CPUExecutionProvider") if p in available]
    return ort.InferenceSession(str(model), sess_options=opt, providers=preferred)


def match_backdrop(image, alpha, chrome):
    """Fit a low-frequency surface to the visible, unoccluded viewport background."""
    stride = 12
    pixels = cv2.GaussianBlur(image, (11, 11), 3)[::stride, ::stride].astype(np.float64)
    valid = (
        (chrome[::stride, ::stride] == 0) & (alpha[::stride, ::stride] < 15)
        & (pixels.min(axis=2) > 25) & (pixels.max(axis=2) < 58)
    )
    row, col = np.mgrid[:HEIGHT:stride, :WIDTH:stride].astype(np.float64)
    x = (col - WIDTH / 2) / (WIDTH / 2)
    y = (row - HEIGHT / 2) / (HEIGHT / 2)
    terms = np.stack((np.ones_like(x), x, y, x * y, x**2, y**2), axis=2)
    sample, colors = terms[valid], pixels[valid]
    weights = np.ones(len(sample))
    # Robust regression rejects the residual grid lines and particle speckles.
    for _ in range(4):
        coefficients = np.linalg.lstsq(sample * weights[:, None], colors * weights[:, None], rcond=None)[0]
        residual = np.mean(np.abs(sample @ coefficients - colors), axis=1)
        weights = np.sqrt(np.minimum(1, 1.8 / np.maximum(residual, 0.01)))
    fitted = np.clip(terms @ coefficients, 0, 255).astype(np.float32)
    return cv2.resize(fitted, (WIDTH, HEIGHT), interpolation=cv2.INTER_CUBIC)


def polish_plate(image, alpha, index, chrome, feather):
    background = match_backdrop(image, alpha, chrome)
    background_weight = feather * (1 - alpha[:, :, None].astype(np.float32) / 255)
    finished = np.uint8(image * (1 - background_weight) + background * background_weight)
    if index >= SHOULDER_TIMES[-1]:
        return finished

    x0, y0, y1 = 920, 518, 677
    bottom_edge = np.interp(index, SHOULDER_TIMES, SHOULDER_EDGES)
    x1 = math.ceil(bottom_edge + 3)
    if x1 <= x0:
        return finished
    ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    distance = y1 - ys
    outer_edge = bottom_edge - 0.49 * distance - 0.0047 * distance**2
    # Copy undistorted shirt detail from the visible opposite shoulder, keeping
    # the real scan texture underneath the editor window's former silhouette.
    visible = alpha[y0:y1, :600] > 184
    left_edge = np.argmax(visible, axis=1).astype(np.float32)[:, None]
    left_edge = cv2.GaussianBlur(left_edge, (1, 11), 0).reshape(-1, 1)
    donor_x = (left_edge + (outer_edge - xs) * 0.76 + 4).astype(np.float32)
    cloth = cv2.remap(image, donor_x, ys, cv2.INTER_LINEAR)
    # The source has a single bright marker on the left shoulder.
    marker = cv2.GaussianBlur(np.uint8(cloth.mean(axis=2) > 98), (5, 5), 1)
    alternate = cv2.remap(image, donor_x + 23, ys, cv2.INTER_LINEAR)
    cloth[marker > 0] = alternate[marker > 0]
    seam_x = np.clip(2 * x0 - xs - 1, 0, WIDTH - 1).astype(np.float32)
    seam = cv2.remap(image, seam_x, ys, cv2.INTER_LINEAR)
    seam_weight = np.clip((x0 + 10 - xs) / 11, 0, 1)[:, :, None]
    cloth = cloth * (1 - seam_weight) + seam * seam_weight
    coverage = np.clip((outer_edge - xs + 2) / 4, 0, 1)[:, :, None]
    transition = np.clip(distance / 12, 0, 1)[:, :, None]
    portion = finished[y0:y1, x0:x1]
    portion[:] = ((cloth * coverage + portion * (1 - coverage)) * transition
                  + image[y0:y1, x0:x1] * (1 - transition))
    return finished


def write_frame(plate, alpha, cache, destination, index):
    bgra = np.dstack((plate, alpha))
    cv2.imwrite(str(cache / f"{index:03}.png"), bgra, [cv2.IMWRITE_PNG_COMPRESSION, 1])
    if index not in (0, 72):
        return
    rgb = cv2.cvtColor(plate, cv2.COLOR_BGR2RGB)
    rgba = Image.fromarray(np.dstack((rgb, alpha)))
    if index == 0:
        rgba.save(destination / "optical-cutout.webp", quality=97, method=4, exact=True)
        Image.fromarray(rgb).save(destination / "optical-poster.webp", quality=97, method=4)
    else:
        rgba.save(destination / "front-calibration.webp", quality=98, method=4, exact=True)


def prepare_frames(source, model, cache, destination):
    cv2.setNumThreads(2)
    session = make_session(model)
    state = {f"r{i}i": np.zeros((1, 1, 1, 1), np.float32) for i in range(1, 5)}
    ratio = np.array([0.5], np.float32)
    chrome = masked_regions()
    feather = cv2.GaussianBlur(cv2.dilate(chrome, np.ones((13, 13), np.uint8)), (19, 19), 5)
    feather = feather.astype(np.float32)[:, :, None] / 255
    clean_area = cv2.GaussianBlur(cv2.dilate(chrome, np.ones((5, 5), np.uint8)), (5, 5), 1)
    neutral = backdrop()
    opacity = clean_area.astype(np.float32)[:, :, None] / 255
    backdrop_premul = neutral * opacity
    source_weight = 1 - opacity
    decode = [
        "ffmpeg", "-nostdin", "-loglevel", "error", "-threads", "3",
        "-i", str(source), "-an", "-vf", f"crop={WIDTH}:{HEIGHT}:410:60",
        "-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1",
    ]
    cache.mkdir(parents=True, exist_ok=True)
    with subprocess.Popen(decode, stdout=subprocess.PIPE) as process:
        for index in range(SOURCE_FRAMES):
            buffer = process.stdout.read(WIDTH * HEIGHT * 3)
            if len(buffer) != WIDTH * HEIGHT * 3:
                raise RuntimeError(f"Source ended at frame {index}")
            source_frame = np.frombuffer(buffer, np.uint8).reshape((HEIGHT, WIDTH, 3))
            plate = (source_frame * source_weight + backdrop_premul).astype(np.uint8)
            repair_occluded_shoulder(plate, source_frame, index)
            rgb = cv2.cvtColor(plate, cv2.COLOR_BGR2RGB)
            tensor = np.ascontiguousarray(rgb.transpose(2, 0, 1)[None], dtype=np.float32) / 255
            inputs = {"src": tensor, "downsample_ratio": ratio, **state}
            # Warm up the recurrent estimate on the stationary opening frame.
            for _ in range(4 if index == 0 else 1):
                _, mask, *recurrent = session.run(None, inputs)
                state = {f"r{i}i": item for i, item in enumerate(recurrent, 1)}
                inputs.update(state)
            alpha = np.uint8(np.clip(mask[0, 0], 0, 1) * 255)
            plate = polish_plate(plate, alpha, index, chrome, feather)
            write_frame(plate, alpha, cache, destination, index)
            if index % 24 == 0:
                print(f"Prepared {index + 1}/{SOURCE_FRAMES} frames", flush=True)
        if process.wait():
            raise RuntimeError("Source decoding failed")


def encode(cache, output, alpha):
    flags = (
        ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "6", "-row-mt", "1",
         "-tile-columns", "1", "-threads", "4", "-crf", "28", "-b:v", "0",
         "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-metadata:s:v:0", "alpha_mode=1"]
        if alpha else
        ["-c:v", "libx264", "-preset", "fast", "-threads", "3", "-crf", "17", "-pix_fmt", "yuv420p",
         "-profile:v", "high", "-level", "4.2", "-movflags", "+faststart"]
    )
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-threads", "2",
           "-f", "image2pipe", "-framerate", "60", "-c:v", "png", "-i", "pipe:0", "-an",
           "-filter_threads", "2", "-vf", "scale=out_color_matrix=bt709", *flags,
           "-color_primaries", "bt709", "-colorspace", "bt709", "-color_trc", "bt709", str(output)]
    with subprocess.Popen(cmd, stdin=subprocess.PIPE) as process:
        for index in FRAME_ORDER:
            process.stdin.write((cache / f"{index:03}.png").read_bytes())
        process.stdin.close()
        if process.wait():
            raise RuntimeError(f"Encoding failed for {output.name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stage", choices=("all", "frames", "mp4", "alpha"), default="all")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.stage in ("all", "frames"):
        prepare_frames(args.source, args.model, args.cache, args.output)
    if args.stage in ("all", "mp4"):
        encode(args.cache, args.output / "optical-loop.mp4", False)
    if args.stage in ("all", "alpha"):
        encode(args.cache, args.output / "optical-alpha.webm", True)


if __name__ == "__main__":
    main()
