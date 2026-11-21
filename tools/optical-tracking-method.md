# Optical tracking error

The chart compares the next detected facial landmark with an image-based prediction. The prediction comes from pyramidal Lucas–Kanade flow initialized at the preceding frame's detected landmark. The distance between the prediction and the new detection is measured in original video pixels. Both use the 1210 × 864 portrait viewport at (410, 60) in the supplied 1920 × 1080 clip.

The measurement runs on the original source frames before grading, retiming or web encoding. OpenCV tracks each point forward and then back with a 25 × 25 window and four pyramid levels. Both status flags must succeed, all positions must lie at least 12 pixels inside the viewport, and the reverse prediction must return within 1.0 pixel of its starting position. Only adjacent pairs with independent detections in the tracking metadata enter the dataset. MediaPipe's repeated fallback coordinates are excluded. Checks do not reject a comparison merely because the detector and forward optical flow disagree.

Each trace value is the root mean square of accepted distances for a pair, located at the pair's destination source frame. The histogram contains actual counts from a centered 19-frame window bounded by the capture. The final of 48 histogram buckets includes distances at or above 2.9375 px. The three point classes retain the original interface thresholds of below 0.6 px, 0.6 to below 1.3 px, and 1.3 px or above. Summary mean and 95th percentile use all accepted individual samples.

The source has 289 frames and 259 independently detected frames. Its 257 adjacent valid pairs provided 120,276 candidate comparisons. Of these, 120,272 passed the independent flow quality checks. The mean distance is 0.351225 px and the 95th percentile is 0.866503 px. Capture-wide maximum individual distance is 8.590736 px. Peak frame RMS is 1.55018 px. Frames 0 and 258–288 have no validated preceding pair. Their selected readout is unavailable and the chart leaves a gap.

This is a two-dimensional tracking-agreement diagnostic. There is no calibrated multi-camera ground truth or mesh reprojection measurement in the source recording.

## Reproduction

Run the measurement script with Python, NumPy and OpenCV from the site directory.

```text
python tools/measure-flow.py "C:/path/to/Blender screen recording.mp4" public/tracking src/flow-residuals.json
```
