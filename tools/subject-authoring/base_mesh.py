from pathlib import Path
import os
import numpy as np
from collections import defaultdict
import tempfile

site = Path(__file__).resolve().parents[2]
calibration_dir = Path(__file__).parent / "calibration"
p = Path(
    os.environ.get(
        "AICANFEEL_SUBJECT_CACHE",
        Path(tempfile.gettempdir()) / "acf-performer-authoring-v1",
    )
)
output_dir = Path(os.environ.get("AICANFEEL_SUBJECT_OUTPUT", site / "public/subject"))


def obj(name):
    v = []
    uv = []
    groups = defaultdict(list)
    g = "default"
    for line in open(p / name):
        w = line.strip().split()
        if not w:
            continue
        if w[0] == "v":
            v.append(list(map(float, w[1:4])))
        elif w[0] == "vt":
            uv.append(list(map(float, w[1:3])))
        elif w[0] == "g":
            g = w[1]
        elif w[0] == "f":
            groups[g].append(
                [tuple(int(a) - 1 for a in b.split("/")[:2]) for b in w[1:]]
            )
    return np.asarray(v), np.asarray(uv), dict(groups)


def morph(v, name, amount=1):
    a = np.loadtxt(p / name)
    v[a[:, 0].astype(int)] += a[:, 1:4] * amount


def proxy(v, name):
    result = []
    inside = False
    scales = np.ones(3)
    for line in open(p / name):
        w = line.strip().split()
        if not w or w[0].startswith("#"):
            continue
        if w[0] in ("x_scale", "y_scale", "z_scale"):
            axis = "xyz".index(w[0][0])
            scales[axis] = abs(v[int(w[1]), axis] - v[int(w[2]), axis]) / float(w[3])
        if inside:
            if not w[0][0].isdigit():
                break
            if len(w) == 1:
                result.append(v[int(w[0])])
                continue
            ids = list(map(int, w[:3]))
            weights = list(map(float, w[3:6]))
            off = list(map(float, w[6:9]))
            result.append(np.average(v[ids], axis=0, weights=weights) + scales * off)
        if w[0] == "verts":
            inside = True
    return np.asarray(result)


v, uv, g = obj("base.obj")
morph(v, "male.target")
eyes = proxy(v, "eyes.mhclo")
body = g["body"]
verts = np.unique([i for f in body for i, _ in f])
top = v[verts, 1].max()
