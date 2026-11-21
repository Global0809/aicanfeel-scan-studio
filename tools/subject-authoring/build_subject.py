"""Rebuild the calibrated performer and retopology payload from prepared inputs."""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from prepare import prepare


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument(
        "--asset-pack",
        type=Path,
        help="Optional local MakeHuman CC0 system assets ZIP.",
    )
    parser.add_argument(
        "--output", type=Path, help="Defaults to the website public/subject folder."
    )
    parser.add_argument(
        "--meshopt-cli",
        help="Path to the gltf-transform 4.x executable. Without it, a full-precision GLB is produced.",
    )
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    project = here.parents[1]
    output = (args.output or project / "public/subject").resolve()
    output.mkdir(parents=True, exist_ok=True)
    cache = prepare(args.recording, args.asset_pack)
    env = {
        **os.environ,
        "AICANFEEL_SUBJECT_CACHE": str(cache),
        "AICANFEEL_SUBJECT_OUTPUT": str(output),
    }

    def python(file, *arguments):
        subprocess.run(
            [sys.executable, str(here / file), *map(str, arguments)],
            env=env,
            check=True,
        )

    python("bake_face.py")
    shutil.copyfile(cache / "optical-skin.jpg", cache / "optical-front-only.jpg")
    python("side_bake.py")
    python("package_subject.py")
    raw = output / "performer.glb"
    with tempfile.TemporaryDirectory(dir=cache) as work:
        clean = Path(work) / "clean.glb"
        python("clean_glb.py", raw, clean)
        if args.meshopt_cli:
            packed = Path(work) / "packed.glb"
            subprocess.run(
                [
                    args.meshopt_cli,
                    "meshopt",
                    str(clean),
                    str(packed),
                    "--level",
                    "high",
                ],
                check=True,
            )
            shutil.copyfile(packed, raw)
        else:
            shutil.copyfile(clean, raw)
    print(f"{raw} ({raw.stat().st_size:,} bytes)")
    print(output / "cage.bin")


if __name__ == "__main__":
    main()
