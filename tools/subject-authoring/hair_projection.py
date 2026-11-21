from base_mesh import *
from pathlib import Path
from PIL import Image
import numpy as np, cv2, os
from scipy.ndimage import distance_transform_edt, gaussian_filter
from math import pi

project = site / "public"
front = np.array(Image.open(project / "capture/front-calibration.webp").convert("RGBA"))
rear = np.array(Image.open(calibration_dir / "rear.webp").convert("RGBA"))
# Actual photographed locks bound the source projection. Inside-skin and outside-matte samples fall back to a patch of real fibers.
poly = np.array(
    [
        (520, 11),
        (630, 12),
        (703, 44),
        (730, 121),
        (740, 220),
        (756, 298),
        (773, 383),
        (786, 451),
        (812, 528),
        (812, 620),
        (836, 740),
        (827, 824),
        (675, 823),
        (670, 753),
        (658, 644),
        (657, 560),
        (645, 513),
        (669, 450),
        (688, 399),
        (688, 310),
        (689, 254),
        (667, 200),
        (647, 159),
        (615, 135),
        (571, 117),
        (526, 111),
        (490, 115),
        (454, 129),
        (429, 160),
        (405, 197),
        (399, 248),
        (384, 306),
        (389, 374),
        (394, 429),
        (404, 466),
        (420, 506),
        (445, 541),
        (455, 608),
        (462, 691),
        (451, 809),
        (315, 822),
        (319, 696),
        (322, 612),
        (346, 527),
        (346, 477),
        (356, 398),
        (353, 322),
        (334, 272),
        (322, 206),
        (322, 145),
        (357, 80),
        (405, 41),
    ]
)
face_mask = np.zeros(front.shape[:2], np.uint8)
cv2.fillPoly(face_mask, [poly.astype("int32")], 255)
valid = (face_mask > 0) & (front[:, :, 3] > 160)
a = front[:, :, :3].astype(float)
candidate = a[:, :, 0] < a[:, :, 1] * 1.29 + 4
valid &= candidate
dist, near = distance_transform_edt(~valid, return_indices=True)
fref = front[:, :, :3][near[0], near[1]].copy()
fw = np.clip(1 - dist / 35, 0, 1)
ra = rear[:, :, :3].astype(float)
maskr = (rear[:, :, 3] > 140) & (ra[:, :, 0] < (ra[:, :, 1] * 1.32 + 3))
dr, ir = distance_transform_edt(~maskr, return_indices=True)
rref = rear[:, :, :3][ir[0], ir[1]]
rw = np.clip(1 - dr / 18, 0, 1)
patch = front[44:101, 440:541, :3].astype(float)
patch = np.concatenate((patch, patch[:, ::-1]), axis=1)
patch = np.concatenate((patch, patch[::-1]), axis=0)


def sample(img, x, y):
    sh = x.shape
    result = []
    xf = x.ravel().astype("float32")
    yf = y.ravel().astype("float32")
    for i in range(0, len(xf), 16000):
        result.append(
            cv2.remap(
                img,
                xf[i : i + 16000, None],
                yf[i : i + 16000, None],
                cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REPLICATE,
            )[:, 0]
        )
    return np.concatenate(result).reshape(sh + img.shape[2:])


def color_at(coords, base_uv):
    xyz = coords.reshape(-1, 3)
    gl = (xyz - np.array([0, 8.07, 0.52])) * 0.5
    screenx = 390 + gl[:, 0] * 780 / 2.76
    screeny = 390 - (gl[:, 1] - 0.025) * 780 / 2.76
    fy = np.interp(
        screeny,
        [
            76,
            97,
            123,
            154,
            174,
            196,
            230,
            270,
            289,
            350,
            420,
            451,
            506,
            550,
            605,
            654,
            705,
        ],
        [
            17,
            23,
            52,
            79,
            111,
            150,
            198,
            250,
            284,
            368,
            468,
            530,
            584,
            633,
            717,
            795,
            835,
        ],
    )
    fx = 534 + (screenx - 390) * np.interp(
        screeny,
        [80, 170, 230, 340, 460, 600, 700],
        [1.40, 1.4, 1.53, 1.51, 1.56, 1.51, 1.43],
    )
    side_x = np.clip((xyz[:, 2] - 0.10) / 0.85, 0, 1)
    near_top = np.clip((xyz[:, 1] - 9.26) / 0.55, 0, 1)
    facing = np.maximum(side_x, near_top * np.clip((xyz[:, 2] + 0.17) / 0.75, 0, 1))
    fcol = sample(fref, fx, fy).astype(float)
    wf = sample(fw.astype("float32"), fx, fy) * facing * 0.93
    # Slight side-tilted rear image supplies authentic crossing lap directions at the nape.
    sourcex = 188.0 - gl[:, 0] * 137.0 + (xyz[:, 2] + 0.35) * 14
    sourcey = np.interp(
        screeny,
        [82, 115, 171, 230, 290, 350, 420, 500, 620, 700],
        [-3, 9, 38, 70, 112, 145, 181, 230, 282, 290],
    )
    rcol = sample(rref, sourcex, sourcey).astype(float)
    wr = (
        sample(rw.astype("float32"), sourcex, sourcey)
        * np.clip((0.31 - xyz[:, 2]) / 0.74, 0, 1)
        * 0.88
        * (1 - wf)
    )
    u, vv = base_uv.reshape(-1, 2).T
    px = (u * patch.shape[1]) % patch.shape[1]
    py = (vv * patch.shape[0]) % patch.shape[0]
    pat = sample(patch, px, py)
    col = fcol * wf[:, None] + rcol * wr[:, None] + pat * (1 - wf - wr)[:, None]
    # With physical studio lighting, retain dark fiber body while allowing high-frequency specular strands.
    lum = col.mean(1)
    col = col * 0.95 + 0.35 * (col - lum[:, None]) + 2
    return np.clip(col, 4, 178).reshape(coords.shape)


def tex_for_locs(a, parts):
    # Each physical lock gets a unique padded strip and samples the same two camera calibrations.
    H, W = 1536, 2048
    cols = 40
    rows = 2
    sw = W // cols
    sh = H // rows
    canvas = np.zeros((H, W, 3), np.uint8)
    out = []
    n = len(parts)
    for j, (coords, st) in enumerate(parts):
        col = j % cols
        row = j // cols
        seg = len(np.unique(st[:, 1]))
        rad = len(st) // seg
        rings = coords.reshape(seg, rad, 3)
        xp = np.linspace(0, rad - 1, sw - 4)
        yp = np.linspace(0, seg - 1, sh - 4)
        xx, yy = np.meshgrid(xp, yp)
        mesh = cv2.remap(
            rings.astype("float32"),
            xx.astype("float32"),
            yy.astype("float32"),
            cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REPLICATE,
        )
        orig_uv = np.stack(
            (xx / (rad - 1) + j * 0.087, yy / (seg - 1) * (3 + seg / 9) + j * 0.147),
            axis=-1,
        )
        c = color_at(mesh, orig_uv)
        t = np.pad(c, ((2, 2), (2, 2), (0, 0)), mode="edge")
        canvas[row * sh : (row + 1) * sh, col * sw : (col + 1) * sw] = np.uint8(t)
        u, v = np.meshgrid(
            np.linspace(col * sw + 2.5, (col + 1) * sw - 2.5, rad),
            np.linspace(row * sh + 2.5, (row + 1) * sh - 2.5, seg),
        )
        out.append(np.stack((u / W, v / H), axis=-1).reshape(-1, 2))
    return a.texture(Image.fromarray(canvas), "JPEG"), np.vstack(out)


def tex_cap(a, pts, U, V):
    H, W = 512, 1024
    xs, ys = np.meshgrid(np.linspace(0, V, W), np.linspace(0, U - 1, H))
    xyz = cv2.remap(
        pts.reshape(U, V + 1, 3).astype("float32"),
        xs.astype("float32"),
        ys.astype("float32"),
        cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )
    uv = np.stack((xs / V * 7, ys / (U - 1) * 5), axis=-1)
    im = np.uint8(color_at(xyz, uv))
    return a.texture(Image.fromarray(im), "JPEG")
