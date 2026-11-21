"""Prepare licensed geometry and the three video frames used by the UV registration."""

import argparse
import io
import os
import shutil
import subprocess
import tempfile
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

REVISION = "a8bc2d54ff0ac92e78ff71431b1023eda42bf482"
RAW = f"https://raw.githubusercontent.com/makehumancommunity/makehuman/{REVISION}/makehuman/data/"
PACK = "https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip"
RAW_FILES = {
    "base.obj": "3dobjs/base.obj",
    "male.target": "targets/macrodetails/african-male-young.target",
    "eyes.obj": "eyes/high-poly/high-poly.obj",
    "eyes.mhclo": "eyes/high-poly/high-poly.mhclo",
    "eye.png": "eyes/materials/brown_eye.png",
}
PACK_FILES = [
    "skins/young_african_male/young_darkskinned_male_diffuse.png",
    *["eyebrows/eyebrow004/eyebrow004." + ext for ext in ("obj", "mhclo", "png")],
    *[
        "clothes/male_casualsuit06/male_casualsuit06" + ext
        for ext in (".obj", ".mhclo", "_diffuse.png", "_ao.png", "_normal.png")
    ],
]


class RemoteArchive(io.RawIOBase):
    """Seek into the official ZIP over HTTP. Only requested asset ranges are fetched."""

    def __init__(self, url):
        self.url = url
        with urlopen(Request(url, method="HEAD"), timeout=40) as response:
            self.length = int(response.headers["Content-Length"])
        self.cursor = 0

    def seek(self, offset, whence=0):
        base = [0, self.cursor, self.length][whence]
        self.cursor = max(0, min(self.length, base + offset))
        return self.cursor

    def seekable(self):
        return True

    def tell(self):
        return self.cursor

    def read(self, size=-1):
        end = self.length if size < 0 else min(self.length, self.cursor + size)
        if end <= self.cursor:
            return b""
        start = self.cursor
        self.cursor = end

        def fetch(pair):
            a, b = pair
            req = Request(self.url, headers={"Range": f"bytes={a}-{b - 1}"})
            with urlopen(req, timeout=120) as response:
                if response.status != 206:
                    raise IOError(
                        "The source server must allow range reads. Use --asset-pack with a local ZIP."
                    )
                return response.read()

        chunk = 196608
        spans = [(a, min(end, a + chunk)) for a in range(start, end, chunk)]
        if len(spans) == 1:
            return fetch(spans[0])
        with ThreadPoolExecutor(max_workers=8) as pool:
            return b"".join(pool.map(fetch, spans))


def prepare(recording, asset_pack=None):
    cache = Path(
        os.environ.get(
            "AICANFEEL_SUBJECT_CACHE",
            Path(tempfile.gettempdir()) / "acf-performer-authoring-v1",
        )
    )
    cache.mkdir(parents=True, exist_ok=True)
    for name, uri in RAW_FILES.items():
        output = cache / name
        if output.exists():
            continue
        with urlopen(RAW + uri, timeout=60) as response:
            output.write_bytes(response.read())
    missing = [item for item in PACK_FILES if not (cache / Path(item).name).exists()]
    if missing:
        source = asset_pack if asset_pack else RemoteArchive(PACK)
        with zipfile.ZipFile(source) as archive:
            for item in missing:
                (cache / Path(item).name).write_bytes(archive.read(item))
    for calibration in (Path(__file__).parent / "calibration").glob("*.npy"):
        shutil.copyfile(calibration, cache / calibration.name)
    frames = cache / "frames"
    frames.mkdir(exist_ok=True)
    # These source frames produce the lowest neutral-landmark residual at each calibrated angle.
    for frame in [36, 186, 245]:
        output = frames / f"{frame:03}.png"
        if output.exists():
            continue
        subprocess.run(
            [
                "ffmpeg",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(recording),
                "-vf",
                f"select=eq(n\\,{frame}),crop=1210:864:410:60",
                "-frames:v",
                "1",
                str(output),
            ],
            check=True,
        )
    return cache


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument("--asset-pack", type=Path)
    args = parser.parse_args()
    print(prepare(args.recording, args.asset_pack))
