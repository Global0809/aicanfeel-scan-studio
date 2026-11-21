"""Measure tracked landmark displacement against independent pyramidal Lucas–Kanade flow.

Input coordinates belong to the unscaled 1210x864 viewport cropped at (410,60)
in the 1920x1080 recording. A Euclidean residual of one is one source pixel.
This measures 2D frame-to-frame agreement, not multicamera 3D reprojection.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def measure(recording, tracking, output):
    meta = json.loads((tracking / "facial-track.json").read_text())
    n, count = meta["frames"], meta["vertices"]
    w, h = meta["width"], meta["height"]
    points = np.fromfile(tracking / "facial-track.bin", dtype="<u2").reshape(n, count, 2)
    points = np.ascontiguousarray(points.astype(np.float32) / 65535 * np.array([w, h], np.float32))
    valid_frames = set(meta["valid"])
    capture = cv2.VideoCapture(str(recording))
    if not capture.isOpened():
        raise RuntimeError("Cannot open the original recording")
    if int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)) != 1920:
        raise ValueError("Expected original 1920×1080 recording")
    cv2.setNumThreads(2)
    lk = dict(winSize=(25, 25), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, .01), minEigThreshold=1e-4)
    residuals, local_bins, trace, source_frames, accepted = [], [], [], [], []
    previous = None
    bin_limit, n_bins, reject_fb = 3, 48, 1.0
    for frame in range(n):
        ok, image = capture.read()
        if not ok:
            raise RuntimeError(f"Missing source frame {frame}")
        view = cv2.cvtColor(image[60:60+h, 410:410+w], cv2.COLOR_BGR2GRAY)
        if frame-1 in valid_frames and frame in valid_frames:
            start = points[frame-1].reshape(-1, 1, 2)
            forward, ok_f, _ = cv2.calcOpticalFlowPyrLK(previous, view, start, None, **lk)
            back, ok_b, _ = cv2.calcOpticalFlowPyrLK(view, previous, forward, None, **lk)
            dest = forward[:, 0]
            back_err = np.linalg.norm(back[:,0] - start[:,0], axis=1)
            keep = (ok_f[:,0] == 1) & (ok_b[:,0] == 1) & np.isfinite(dest).all(1) & np.isfinite(back_err) & (back_err <= reject_fb)
            for positions in (start[:,0], dest, points[frame]):
                keep &= (positions[:,0] >= 12) & (positions[:,0] < w-12) & (positions[:,1] >= 12) & (positions[:,1] < h-12)
            errors = np.linalg.norm(dest[keep] - points[frame][keep], axis=1).astype(float)
            if len(errors):
                bins = np.minimum((errors * n_bins / bin_limit).astype(int), n_bins-1)
                local_bins.append(np.bincount(bins,minlength=n_bins).tolist())
                trace.append(round(float(np.sqrt(np.mean(errors**2))), 5))
                source_frames.append(frame-1)
                accepted.append(len(errors))
                residuals.append(errors)
        previous = view
    capture.release()
    all_errors = np.concatenate(residuals)
    classes = [int(np.sum(all_errors < .6)), int(np.sum((all_errors >= .6) & (all_errors < 1.3))), int(np.sum(all_errors >= 1.3))]
    payload = dict(sourceFrames=source_frames, accepted=accepted, trace=trace, bins=np.sum(local_bins,axis=0).tolist(), localBins=local_bins,
                   classes=classes, meanPx=round(float(all_errors.mean()),6), peakPx=max(trace), p95Px=round(float(np.percentile(all_errors,95)),6),
                   inlierPct=round(100*classes[0]/len(all_errors),6), measuredPoints=len(all_errors), maxResidualPx=round(float(all_errors.max()),6),
                   binWidthPx=bin_limit/n_bins, overflowFromPx=(n_bins-1)*bin_limit/n_bins, sourceFramesTotal=n)
    assert sum(accepted)==sum(payload["bins"])==sum(classes)==len(all_errors)
    assert all(sum(row)==ct for row,ct in zip(local_bins,accepted))
    output.write_text(json.dumps(payload,separators=(",", ":")))
    print({k:v for k,v in payload.items() if k not in {"sourceFrames","accepted","trace","bins","localBins"}})
    print("transitions",len(trace),"accepted range",min(accepted),max(accepted),"source starts",min(source_frames),max(source_frames),"bytes",output.stat().st_size)

if __name__ == "__main__":
    args = argparse.ArgumentParser()
    args.add_argument("recording", type=Path)
    args.add_argument("tracking", type=Path)
    args.add_argument("output", type=Path)
    opts = args.parse_args()
    measure(opts.recording, opts.tracking, opts.output)
