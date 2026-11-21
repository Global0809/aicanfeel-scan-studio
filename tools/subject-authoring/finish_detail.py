from strand_detail import *
from PIL import ImageDraw, ImageFilter


def tuft_atlas():
    rng = np.random.default_rng(7001)
    w, h = 256, 256
    s = 3
    im = Image.new("RGBA", (w * s, h * s), (12, 12, 12, 0))
    draw = ImageDraw.Draw(im, "RGBA")
    # A card contains an irregular tapered tuft of many genuinely coiled matte and reflective fibers.
    for j in range(365):
        base = rng.normal(0.47, 0.14)
        end = rng.uniform(0.55, 1.06)
        begin = rng.uniform(-0.15, 0.39)
        curl = rng.uniform(0.8, 3.4)
        phase = rng.uniform(0, 6.28)
        radius = rng.uniform(0.012, 0.053)
        drift = rng.uniform(-0.21, 0.21)
        t = np.linspace(0, 1, 37)
        x = (
            base
            + drift * t
            + radius * np.sin(t * 6.28 * curl + phase)
            + 0.025 * np.sin(t * 9 + phase * 0.4)
        )
        y = begin + (end - begin) * t + radius * 0.7 * np.cos(t * 6.28 * curl + phase)
        pts = [(float(xx * w * s), float((1 - yy) * h * s)) for xx, yy in zip(x, y)]
        val = int(np.clip(rng.normal(36, 13), 12, 84))
        draw.line(
            pts,
            fill=(val, int(val * 0.97), int(val * 0.92), int(rng.uniform(140, 255))),
            width=int(rng.choice([2, 2, 3, 3, 4, 5])),
        )
    return im.resize((w, h), Image.Resampling.LANCZOS)


def tuft_layer(a):
    rnd = np.random.default_rng(690)
    vertices = []
    indices = []
    uvs = []
    norms = []
    colors = []
    for k in range(560):
        # Polar distribution weighted toward the perimeter and frontal hairline.
        phi = rnd.uniform(-pi, pi)
        u = np.sqrt(rnd.uniform(0.0001, 1.0))
        u = min(0.995, u + 0.014 * rnd.random())
        pt, n = cap_position(phi, u, 0.010)
        side = np.cross(n, [0, 1.0, 0])
        side = normalize(side if np.linalg.norm(side) > 0.04 else [1.0, 0, 0])
        away = normalize(np.cross(side, n))
        alpha = rnd.uniform(-0.86, 0.86) + np.sign(phi) * 0.43
        forward = normalize(np.cos(alpha) * away + np.sin(alpha) * side)
        right = normalize(np.cross(forward, n))
        length = rnd.uniform(0.060, 0.132)
        width = rnd.uniform(0.040, 0.094)
        lift = rnd.uniform(0.005, 0.028)
        co = np.float32(rnd.uniform(0.58, 1.0))
        rows = []
        ids = []
        for t in (0, 0.5, 1):
            path = (
                pt
                + forward * ((t - 0.27) * length)
                + n * (0.006 + lift * np.sin(pi * t + 0.2))
            )
            rad = width * (0.73 + 0.27 * np.sin(pi * t))
            rows.extend((path - right * rad * 0.5, path + right * rad * 0.5))
            uvs.extend([(0, 1 - t), (1, 1 - t)])
            norms.extend([n, n])
            colors.extend([[co, co, co], [co, co, co]])
        i = len(vertices)
        vertices.extend(rows)
        indices.extend(
            [
                (i, i + 1, i + 2),
                (i + 1, i + 3, i + 2),
                (i + 2, i + 3, i + 4),
                (i + 3, i + 5, i + 4),
            ]
        )
    tex = a.texture(tuft_atlas(), "PNG")
    m = a.material(
        "Coil clusters", (0.85, 0.91, 0.93), 0.99, tex, alpha=True, double=True
    )
    a.mats[m]["alphaCutoff"] = 0.43
    a.add(
        "Hair curl veil",
        np.array(vertices),
        np.array(indices),
        m,
        np.array(uvs),
        np.array(colors),
        np.array(norms),
    )


def collar(a):
    from collections import Counter

    _, tx, groups = obj("male_casualsuit06.obj")
    pv = proxy(v, "male_casualsuit06.mhclo")
    counts = Counter()
    for fs in groups.values():
        for f in fs:
            pids = [i for i, j in f]
            for i, j in zip(pids, pids[1:] + pids[:1]):
                counts[tuple(sorted([i, j]))] += 1
    edge = np.unique(
        [
            q
            for (i, j), n in counts.items()
            if n == 1 and min(pv[i, 1], pv[j, 1]) > 6.9
            for q in [i, j]
        ]
    )
    raw = pv[edge]
    cx, cz = -0.045, 0.24
    theta = np.remainder(np.arctan2(raw[:, 0] - cx, raw[:, 2] - cz), 2 * pi)
    order = np.argsort(theta)
    xx = raw[order]
    th = theta[order]
    interp = CubicSpline(
        np.r_[th[-1] - 2 * pi, th, th[0] + 2 * pi],
        np.vstack((xx[-1], xx, xx[0])),
        axis=0,
    )
    triangles = triangulate(
        [
            [i for i, j in f]
            for f in body
            if min(v[i, 1] for i, t in f) > 6.5 and max(v[i, 1] for i, t in f) < 7.78
        ]
    )
    A = v[triangles[:, 0]]
    B = v[triangles[:, 1]] - A
    D = v[triangles[:, 2]] - A

    def radius_at(ang, y):
        direction = np.array([np.sin(ang), 0, np.cos(ang)])
        org = np.array([cx, y, cz])
        pvec = np.cross(np.tile(direction, (len(A), 1)), D)
        det = (B * pvec).sum(1)
        det[np.abs(det) < 1e-8] = np.nan
        inv = 1 / det
        q = org - A
        u = (q * pvec).sum(1) * inv
        qv = np.cross(q, B)
        w = (qv * direction).sum(1) * inv
        t = (qv * D).sum(1) * inv
        good = (u >= 0) & (w >= 0) & (u + w <= 1) & (t > 0)
        return np.min(t[good]) if good.any() else 0.55

    phi = np.linspace(0, 2 * pi, 161)
    bottom = interp(phi)
    bg = np.linalg.norm(bottom[:, [0, 2]] - [cx, cz], axis=1)
    y0 = bottom[:, 1] - 0.045
    y1 = bottom[:, 1] + 0.13 + 0.06 * np.maximum(0, np.cos(phi))
    rim = np.array([radius_at(d, y) for d, y in zip(phi, y1)]) + 0.029
    verts = []
    uvs = []
    colors = []
    ns = []
    idx = []
    profile = [
        (0, 0.030),
        (0.12, 0.040),
        (0.76, 0.031),
        (0.82, 0.029),
        (0.96, 0.022),
        (1, 0.008),
    ]
    for k, (a0, dz) in enumerate(profile):
        for j, ph in enumerate(phi):
            y = y0[j] * (1 - a0) + y1[j] * a0
            rad = bg[j] * (1 - a0) + rim[j] * a0 + dz
            rad = max(rad, radius_at(ph, y) + 0.018)
            vtx = np.array([cx + np.sin(ph) * rad, y, cz + np.cos(ph) * rad])
            verts.append(vtx)
            uvs.append((j / (len(phi) - 1) * 13.0, a0))
            ns.append(normalize([np.sin(ph), 0.22, np.cos(ph)]))
            shade = 0.74 if a0 > 0.76 else 1.0
            colors.append([shade, shade, shade])
            if k < len(profile) - 1 and j < len(phi) - 1:
                i = k * len(phi) + j
                t = i + len(phi)
                idx.extend(((i, i + 1, t), (i + 1, t + 1, t)))
    tex = np.zeros((128, 128, 3), np.uint8)
    yy, xx = np.mgrid[:128, :128]
    c = (
        0.121
        + 0.020 * np.sin(xx * 2 * pi / 8 + 0.14 * np.sin(yy / 9))
        + 0.010 * np.sin(2 * pi * yy / 5 + xx * 0.22)
    )
    tex[:] = np.uint8(c[:, :, None] * np.array([240, 244, 245]))
    m = a.material(
        "Ribbed collar",
        (0.71, 0.76, 0.77),
        0.94,
        a.texture(Image.fromarray(tex), "JPEG"),
        double=True,
    )
    a.add("Collar", np.array(verts), np.array(idx), m, np.array(uvs), norm=np.array(ns))
