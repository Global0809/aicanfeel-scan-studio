# Performer reconstruction

The shipped model is a fitted reconstruction of the performer shown in the supplied recording. The face shape and eyes are registered to the frontal capture. Three additional video angles contribute cheek, ear and jaw color. The MakeHuman hm08 anatomy, eyes and garment originate from the CC0 source library. The sculpted scalp, loc guides, fine hair, fitted collar, capture returns and quad cage belong to this build. Source credits are available in `public/subject/CREDITS.txt`.

The website already contains the finished GLB and binary cage. The authoring pipeline runs separately from Vite. Place the original Blender recording outside the repository and keep the existing `public/capture/front-calibration.webp` and `public/tracking/facial-track.bin` beside the site.

## Rebuilding

Install Python 3.11+, NumPy, SciPy, OpenCV and Pillow. Make `ffmpeg` available on PATH. Run the following command from the site directory.

```text
python tools/subject-authoring/build_subject.py "C:/path/to/Blender screen recording.mp4" --meshopt-cli "C:/path/to/gltf-transform.cmd"
```

The published render uses glTF Transform 4.4.2 meshopt compression. Omitting `--meshopt-cli` writes a conventional, full-precision glTF binary that can be opened directly in a 3D editor. `--output DIRECTORY` selects a different destination. The default destination is `public/subject`.

The preparation step uses official MakeHuman sources and retrieves only the required ZIP entries. Supply `--asset-pack PATH` to use a locally downloaded MakeHuman CC0 system assets ZIP. `AICANFEEL_SUBJECT_CACHE` optionally selects a reusable authoring cache. The source recording stays local.

The files in `calibration/` contain 2D registration points measured on the neutral turntable render and a small rear orthographic sample from the supplied video. They preserve the camera-to-model correspondence used in the delivered surface.
