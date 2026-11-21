from mesh_build import *
from scipy.ndimage import gaussian_filter
from scipy.interpolate import CubicSpline
from math import pi

rng = np.random.default_rng(37)
C = np.array((0.0, 8.96, 0.54))
E = np.array((0.744, 1.0, 1.055))
head_v = np.unique([i for f in body if min(v[i, 1] for i, k in f) > 7.53 for i, t in f])
skin_pts = v[head_v]
surface = (skin_pts - C) / E
skull_tree = cKDTree(normalize(surface))


def skull(lon, lat):
    u = np.array((np.sin(lon), np.cos(lon) * np.sin(lat), np.cos(lon) * np.cos(lat)))
    ds, js = skull_tree.query(u, k=8)
    w = 1 / (ds + 0.012) ** 2
    r = np.average(np.linalg.norm(surface[js], axis=1), weights=w)
    return C + E * r * u, normalize(u / E)


def project(x):
    u = normalize((x - C) / E)
    ds, js = skull_tree.query(u, k=8)
    w = 1 / (ds + 0.012) ** 2
    return C + u * E * np.average(np.linalg.norm(surface[js], axis=1), weights=w)


def rope_texture(a):
    H, W = 512, 256
    y, x = np.mgrid[:H, :W]
    rngt = np.random.default_rng(113)
    fine = rngt.normal(0, 1, (H, W))
    mid = gaussian_filter(rngt.normal(0, 1, (H, W)), (1.1, 1.6), mode="wrap")
    slow = gaussian_filter(rngt.normal(0, 1, (H, W)), (4.8, 8), mode="wrap")
    weave = (
        np.sin(
            x / W * pi * 26
            + np.sin(2 * pi * y / H) * 6.0
            + np.sin(y / H * pi * 10) * 1.7
            + 2 * pi * y / H * 3.0
            + 3.8 * mid
        )
        ** 3
    )
    val = np.clip(
        0.23 + fine * 0.055 + mid * 0.16 + slow * 0.7 + weave * 0.056, 0.10, 0.40
    )
    rgb = np.stack([val * 0.66, val * 0.64, val * 0.60], axis=2)
    tex = a.texture(Image.fromarray(np.uint8(np.clip(rgb, 0, 1) * 255)), "JPEG")
    height = mid * 0.74 + weave * 0.04 + fine * 0.11
    dy = np.roll(height, -1, 0) - np.roll(height, 1, 0)
    dx = np.roll(height, -1, 1) - np.roll(height, 1, 1)
    n = normalize(np.stack((-dx * 1.7, -dy * 1.7, np.ones_like(dx)), axis=-1))
    normal = a.texture(Image.fromarray(np.uint8((n * 0.5 + 0.5) * 255)), "PNG")
    return tex, normal


def sweep(nodes, radii, phase, sections=9, dt=1.0, loop=False):
    points = np.asarray(nodes)
    cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    valid = np.r_[True, np.diff(cum) > 1.0e-8]
    points = points[valid]
    cum = cum[valid]
    radii = np.asarray(radii)[valid]
    segs = max(10, int(cum[-1] * 17 * dt))
    s = np.linspace(0, cum[-1], segs)
    pos = CubicSpline(cum, points, axis=0, bc_type="natural")(s)
    rad = PchipInterpolator(cum, radii)(s)
    tangent = normalize(np.gradient(pos, axis=0))
    right = normalize(
        np.cross(
            tangent[0],
            np.array([0.0, 0.0, 1.0])
            if abs(tangent[0, 2]) < 0.89
            else np.array([0.0, 1.0, 0.0]),
        )
    )
    co = []
    uvset = []
    colors = []
    ring = np.linspace(0, 2 * pi, sections + 1)
    jj = 0
    for i, t in enumerate(tangent):
        right = normalize(right - t * np.dot(right, t))
        up = normalize(np.cross(t, right))
        r = rad[i]
        a = ring + 0.125 * np.sin(s[i] * 9 + phase) + s[i] * 0.73
        lump = 1 + (
            0.12 * np.sin(2 * a + s[i] * 20 + phase)
            + 0.085 * np.cos(3 * a - s[i] * 17 - phase)
            + 0.067 * np.sin(s[i] * 27 + phase)
        )
        row = (
            pos[i]
            + (
                np.cos(a)[:, None] * right * np.array([1, 1, 1])
                + np.sin(a)[:, None] * up * 0.92
            )
            * r
            * lump[:, None]
        )
        co.append(row)
        uvset.extend(
            [(k / sections + phase, s[i] * 1.65 + phase) for k in range(sections + 1)]
        )
    idx = []
    h = sections + 1
    for i in range(segs - 1):
        for j in range(sections):
            a = i * h + j
            b = a + 1
            d = a + h
            c = d + 1
            idx.extend(((a, b, d), (b, c, d)))
    tri = np.array(idx)
    co = np.vstack(co)
    norm = normals(co, tri)
    for i in range(segs):
        k = i * h
        m = (norm[k] + norm[k + sections]) * 0.5
        norm[k] = norm[k + sections] = normalize(m)
    return co, tri, np.array(uvset), norm


def locs(a):
    tex, ntex = rope_texture(a)
    mat = a.material("Tightly coiled loc fibers", (0.80, 0.85, 0.84), 0.77, tex)
    a.mats[mat]["normalTexture"] = dict(index=ntex, scale=0.72)
    poses = []
    triangles = []
    uvs = []
    colors = []
    ns = []
    idx = 0
    ropes = []
    actual = []

    def rope(path, rad, phase=0, color=None):
        nonlocal idx
        xp, ix, st, n = sweep(path, rad, phase + float(rng.uniform(-1, 1)))
        val = float(rng.uniform(0.72, 1.0))
        tint = np.array((val * 1.02, val, val * 0.97)) if color is None else color
        outward = normalize((xp - [0, 8.74, 0.47]) * np.array([1.0, 0.24, 1.0]))
        ao = 0.50 + 0.50 * np.clip(
            (n * outward).sum(axis=1) * 0.70 + n[:, 1] * 0.25 + 0.30, 0, 1
        )
        co = np.tile(tint, (len(xp), 1)) * ao[:, None]
        poses.append(xp)
        triangles.append(ix + idx)
        uvs.append(st)
        ns.append(n)
        colors.append(co)
        idx += len(xp)
        ropes.append((np.array(path), np.array(rad)))
        actual.append(xp.reshape(-1, 10, 3))

    def crown(lon):
        side = np.sign(lon)
        rate = abs(lon) / 1.2
        start = (
            0.73
            - 0.23 * rate
            + abs(np.sin(lon * 43 + 0.5)) ** 1.8 * 0.70
            + 0.09 * rng.uniform(-1, 1)
        )
        end = 3.14 + 0.07 * rng.uniform(-1, 1)
        path = []
        rad = []
        noise = rng.uniform(0, 2 * pi)
        sz = float(rng.uniform(0.043, 0.066))
        nsteps = 16
        for step, lat in enumerate(np.linspace(start, end, nsteps)):
            t = step / (nsteps - 1)
            drift = 0.13 * np.sin(pi * t) * np.cos(3 * lon) + 0.035 * np.sin(
                2 * pi * t + noise
            )
            origin, normal = skull(
                lon * (1 - 0.53 * t**2)
                + drift
                + 0.115 * np.sin(5 * t + noise) * np.sin(pi * t),
                lat,
            )
            r = sz * (0.08 + 0.92 * min(1, t / 0.15))
            alt = (
                -0.018
                + (0.11 + 0.026 * np.cos(lon * 3)) * np.sin(pi * t) ** 0.85
                + 0.022 * np.sin(2 * pi * t + noise) ** 2
            )
            path.append(origin + normal * (r * 0.65 + alt))
            rad.append(r)
        # A few forward side-locks settle along the clavicle, the center locks hang over the back.
        endpt = path[-1]
        xo = endpt[0]
        side = 1 if xo >= 0 else -1
        f = abs(lon) / 1.25
        target_z = -0.70 + 0.26 * f + 0.55 * (f**3) + rng.uniform(-0.09, 0.09)
        xout = 0.91 * np.sin(lon) * (1.25 + 0.18 * np.sin(lon * 3))
        yend = rng.uniform(6.10, 6.57) + 0.17 * np.sin(lon * 9)
        amp = 0.048 + rng.random() * 0.035
        for k in range(1, 13):
            t = k / 12
            x = (1 - t) * xo + xout * t + amp * np.sin(t * 12 + noise) * t
            z = (
                (1 - t) * endpt[2]
                + target_z * t
                - 0.115 * np.sin(pi * t)
                + 0.04 * np.sin(t * 10 + noise)
            )
            path.append([x, endpt[1] * (1 - t) + yend * t, z])
            rad.append(sz * (1 - 0.13 * t) * (1 - 0.69 * max(0, (t - 0.86) / 0.14)))
        rope(path, rad, noise)

    for longitude in np.linspace(-1.24, 1.24, 27):
        crown(longitude)

    # Locs are sectioned in staggered rows around the temple and occipital ridge.
    # Most of the bundles sweep behind the ear; only a few fall forward over the collarbone.
    def surface_at(phi, polar):
        d = np.array(
            (np.sin(polar) * np.sin(phi), np.cos(polar), np.sin(polar) * np.cos(phi))
        )
        dists, js = skull_tree.query(d, k=7)
        wt = 1 / (dists + 0.014) ** 2
        rr = np.average(np.linalg.norm(surface[js], axis=1), weights=wt)
        return C + E * d * rr, normalize(d / E)

    for side in (-1, 1):
        count = 25 if side > 0 else 21
        for j in range(count):
            stage = j / (count - 1)
            front = j % 4 == 0 or (side > 0 and j % 5 == 1)
            phase = rng.uniform(0, 2 * pi)
            phi0 = side * (0.76 + 0.28 * (j % 5) / 4 + 0.50 * stage + 0.05 * np.sin(j))
            pol0 = 1.08 + 0.43 * stage + 0.12 * np.sin(j * 1.65)
            phi1 = side * (
                (1.48 + 0.30 * rng.random())
                if front
                else (2.42 + 0.47 * stage + 0.23 * rng.random())
            )
            pol1 = (1.79 + 0.14 * rng.random()) if front else (1.94 + 0.26 * stage)
            sz = rng.uniform(0.036, 0.070) * (1 + 0.09 * front)
            path = []
            rad = []
            for k in range(11):
                t = k / 10
                phi = phi0 + (phi1 - phi0) * t
                pol = (
                    pol0
                    + (pol1 - pol0) * t
                    - 0.16 * np.sin(pi * t)
                    + 0.025 * np.sin(t * 2 * pi + phase)
                )
                root, n = surface_at(phi, pol)
                r = sz * (0.065 + 0.935 * min(1, t / 0.24))
                volume = (
                    0.018 + 0.072 * np.sin(pi * t) + 0.018 * np.cos(j) * np.sin(pi * t)
                )
                path.append(root + n * (volume + 0.60 * r - 0.090 * (1 - t) ** 3))
                rad.append(r)
            last = path[-1]
            endx = side * (
                (1.12 if side > 0 else 0.94)
                + 0.16 * np.sin(j * 2.13)
                + 0.10 * rng.random()
                if front
                else 0.40 + 0.75 * rng.random()
            )
            endz = (
                (1.17 + 0.18 * rng.random()) if front else -0.70 + 0.55 * rng.random()
            )
            endy = (
                (5.97 + 0.69 * rng.random()) if front else (6.02 + 0.71 * rng.random())
            )
            arch = (0.09 + 0.10 * rng.random()) * side
            for k in range(1, 16):
                t = k / 15
                u = t * (1.65 - 0.65 * t)
                locx = (
                    (1 - u) * last[0]
                    + endx * u
                    + arch * np.sin(pi * t)
                    + 0.054 * np.sin(t * 8 + phase) * t
                )
                z = (
                    (1 - u) * last[2]
                    + endz * u
                    + (-0.15 if not front else 0.06) * np.sin(pi * t)
                    + 0.034 * np.sin(t * 11 + phase) * t
                )
                y = (1 - t) * last[1] + t * endy
                path.append([locx, y, z])
                rad.append(
                    sz
                    * (1 + 0.07 * np.sin(t * 14 + j))
                    * (1 - 0.89 * max(0, (t - 0.82) / 0.18))
                )
            rope(path, rad, phase)
    from hair_projection import tex_for_locs

    atlas, new_uv = tex_for_locs(a, list(zip(poses, uvs)))
    a.mats[mat]["pbrMetallicRoughness"]["baseColorTexture"] = dict(index=atlas)
    a.mats[mat].pop("normalTexture", None)
    a.add(
        "Locs",
        np.vstack(poses),
        np.vstack(triangles),
        mat,
        new_uv,
        np.vstack(colors),
        np.vstack(ns),
    )
    return ropes, actual


def scalp(a):
    faces = []
    for f in body:
        pts = v[[i for i, j in f]]
        center = pts.mean(0)
        phi = np.arctan2(center[0], center[2] - 0.54)
        theta = abs(phi) / pi
        miny = np.interp(
            theta,
            [0, 0.21, 0.38, 0.50, 0.76, 1.0],
            [9.41, 9.39, 9.06, 8.70, 8.18, 8.06],
        )
        if center[1] > miny:
            faces.append(f)
    inds = triangulate([[i for i, j in f] for f in faces])
    norm = normals(v, inds)
    pts = v + norm * 0.028
    m = a.material("Groom undercoat", (0.007, 0.0075, 0.007), 0.86)
    gltf_layer(a, "Hairline", pts, faces, uv, m, sub=True)
