"""Track the captured portrait locally. No camera permission or ML runtime is needed in the site."""
import argparse
import json
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision


def track(source, model_path, output):
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise ValueError(f"Cannot read {source}")
    fps = capture.get(cv2.CAP_PROP_FPS)
    options = vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.42,
        min_face_presence_confidence=0.4,
        min_tracking_confidence=0.4,
    )
    samples = []
    with vision.FaceLandmarker.create_from_options(options) as detector:
        while True:
            valid, frame = capture.read()
            if not valid:
                break
            view = cv2.cvtColor(frame[60:924, 410:1620], cv2.COLOR_BGR2RGB)
            timestamp = round(len(samples) * 1000 / fps)
            result = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=view), timestamp)
            pts = result.face_landmarks[0] if result.face_landmarks else None
            samples.append(np.array([[p.x, p.y, p.z] for p in pts[:468]], dtype=np.float32) if pts else None)
    capture.release()
    known = [index for index, sample in enumerate(samples) if sample is not None]
    if not known:
        raise ValueError("No face was tracked")
    # Missing frames borrow their nearest valid capture. The source never cuts between subjects.
    for index, sample in enumerate(samples):
        if sample is None:
            samples[index] = samples[min(known, key=lambda frame: abs(index - frame))]
    positions = np.stack(samples)
    packed = (np.clip(positions[:, :, :2], 0, 1) * 65535).round().astype("<u2")
    output.mkdir(parents=True, exist_ok=True)
    packed.tofile(output / "facial-track.bin")
    (np.clip(positions[:, :, 2] / .22, -1, 1)*127).round().astype("i1").tofile(output / "facial-depth.bin")
    connections = vision.FaceLandmarksConnections
    def edge_list(name):
        return [[c.start, c.end] for c in getattr(connections, name)]
    tessellation = edge_list("FACE_LANDMARKS_TESSELATION")
    groups = ["FACE_OVAL", "LIPS", "LEFT_EYE", "RIGHT_EYE", "LEFT_EYEBROW", "RIGHT_EYEBROW"]
    contours = [edge for group in groups for edge in edge_list("FACE_LANDMARKS_" + group)]
    metadata = {
        "frames": len(samples), "vertices": int(packed.shape[1]), "tracked": len(known),
        "width": 1210, "height": 864, "sourceFps": fps, "valid": known,
        "tessellation": tessellation,
        "contours": contours,
    }
    (output / "facial-track.json").write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")
    print(f"Tracked {len(known)}/{len(samples)} frames, {len(tessellation)} edges, {packed.nbytes:,} bytes", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    track(args.source, args.model, args.output)
