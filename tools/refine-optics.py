"""Prepare full-resolution optical source frames with OpenCV's FSRCNN x2 model."""
import argparse
from pathlib import Path

import cv2
import numpy as np


def refine(image, engine):
    height, width = image.shape[:2]
    result = np.empty((height * 2, width * 2, 3), dtype=np.uint8)
    # Overlapping tiles retain the model's edge context at each seam.
    for y in range(0, height, 192):
        for x in range(0, width, 384):
            y0, x0 = max(0, y - 12), max(0, x - 12)
            y1, x1 = min(height, y + 192), min(width, x + 384)
            tile = engine.upsample(image[y0:y1 + 12, x0:x1 + 12])
            result[2*y:2*y1, 2*x:2*x1] = tile[2*(y-y0):2*(y1-y0), 2*(x-x0):2*(x1-x0)]
    reference = cv2.resize(image, None, fx=2, fy=2, interpolation=cv2.INTER_LANCZOS4)
    return cv2.addWeighted(result, .76, reference, .24, 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path, help="Numbered optical capture PNG frames")
    parser.add_argument("output", type=Path, help="Destination for enhanced JPEG frames")
    parser.add_argument("model", type=Path, help="Path to FSRCNN_x2.pb")
    options = parser.parse_args()
    options.output.mkdir(parents=True, exist_ok=True)
    cv2.setNumThreads(3)
    engine = cv2.dnn_superres.DnnSuperResImpl_create()
    engine.readModel(str(options.model))
    engine.setModel("fsrcnn", 2)
    for source in sorted(options.frames.glob("[0-9][0-9][0-9].png")):
        destination = options.output / (source.stem + ".jpg")
        if destination.is_file():
            continue
        image = cv2.imread(str(source), cv2.IMREAD_COLOR)
        if image is None:
            raise OSError(f"Could not read {source}")
        temporary = destination.with_suffix(".pending.jpg")
        if not cv2.imwrite(str(temporary), refine(image, engine), [cv2.IMWRITE_JPEG_QUALITY, 97]):
            raise OSError(f"Could not write {temporary}")
        temporary.replace(destination)


if __name__ == "__main__":
    main()
