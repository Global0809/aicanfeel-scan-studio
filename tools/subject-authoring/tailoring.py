from mesh_build import *
from scipy.ndimage import gaussian_filter


def fit_shirt(asset):
    source = "male_casualsuit06"
    _, texcoord, groups = obj(source + ".obj")
    pts = proxy(v, source + ".mhclo")
    faces = [
        f for fs in groups.values() for f in fs if min(pts[i, 1] for i, j in f) > 5.14
    ]

    # A sampled lower chest is bounded by a gently rising crop through the shoulders.
    def height(pt):
        x, y, z = pt
        return y - (5.94 + 0.32 * (abs(x) / 2.55) ** 4 + 0.045 * ((z - 0.2) / 1.2) ** 2)

    cut = abs(np.zeros(len(pts)))
    cut = np.array([height(pt) for pt in pts])
    ps = list(pts)
    us = list(texcoord)
    ci = {}
    ui = {}
    fl = []
    boundary = []
    for f in faces:
        result = []
        xs = []
        for (i, t), (j, u) in zip(f, f[1:] + f[:1]):
            if cut[i] >= 0:
                result.append((i, t))
            if (cut[i] >= 0) != (cut[j] >= 0):
                key = tuple(sorted((i, j)))
                uvkey = tuple(sorted((t, u)))
                a = cut[i] / (cut[i] - cut[j])
                if key not in ci:
                    ci[key] = len(ps)
                    ps.append(pts[i] + (pts[j] - pts[i]) * a)
                if uvkey not in ui:
                    ui[uvkey] = len(us)
                    us.append(texcoord[t] + (texcoord[u] - texcoord[t]) * a)
                result.append((ci[key], ui[uvkey]))
                xs.append(ci[key])
        if len(result) >= 3:
            fl.append(result)
        if len(xs) == 2:
            boundary.append(xs)
    ps, us = np.asarray(ps), np.asarray(us)
    image = (
        np.asarray(
            Image.open(p / (source + "_diffuse.png"))
            .convert("RGB")
            .resize((1024, 1024), Image.Resampling.LANCZOS)
        ).astype(float)
        / 255
    )
    ao = (
        np.asarray(
            Image.open(p / (source + "_ao.png"))
            .convert("L")
            .resize((1024, 1024), Image.Resampling.LANCZOS)
        ).astype(float)
        / 255
    )
    y, x = np.mgrid[:1024, :1024]
    rng = np.random.default_rng(312)
    grain = rng.normal(0, 1, (1024, 1024))
    micro = 0.0025 * np.sin(2 * pi * x / 3.5 + np.sin(2 * pi * y / 8)) + 0.005 * grain
    s = image.mean(-1)
    tonal = np.clip((0.077 + 0.078 * s) * (0.7 + 0.3 * ao) + micro, 0.035, 0.21)
    rgb = np.stack([tonal * 0.99, tonal, tonal * 1.02], axis=-1)
    from wardrobe_capture import captured_shirt

    t = asset.texture(captured_shirt(ps, fl, us, rgb), "JPEG")
    mat = asset.material("Washed graphite cotton", (1, 1, 1), 0.86, t, double=True)
    normal = (
        Image.open(p / (source + "_normal.png"))
        .convert("RGB")
        .resize((768, 768), Image.Resampling.LANCZOS)
    )
    nm = asset.texture(normal, "JPEG")
    asset.mats[mat]["normalTexture"] = {"index": nm, "scale": 0.47}
    skin_data = gltf_layer(asset, "Crewneck", ps, fl, us, mat, sub=True)
    # An underside prevents a hollow garment when inspected from overhead.
    hull_points = ps[np.unique(boundary)]
    capids = sorted(
        range(len(hull_points)),
        key=lambda i: np.arctan2(hull_points[i, 2] - 0.15, hull_points[i, 0]),
    )
    pp = hull_points[capids]
    center = pp.mean(0)
    center[1] += 0.025
    cap = np.vstack((center, pp))
    facescap = [[0, 1 + (j + 1) % len(pp), j + 1] for j in range(len(pp))]
    cm = asset.material("Bust underside", (0.024, 0.025, 0.025), 0.91, double=True)
    asset.add("Underside", cap, np.array(facescap), cm)
    edge = set()
    for f in fl:
        ids = [i for i, j in f]
        for a, b in zip(ids, ids[1:] + ids[:1]):
            edge.add(tuple(sorted([a, b])))
    segs = np.asarray([[ps[i], ps[j]] for i, j in edge])
    return (*skin_data, segs)


from math import pi
