from groom import *


def natural_texture(a):
    # Small real fiber sample from the supplied portrait. Mirror padding keeps the sampling loop continuous.
    ref = (
        np.array(
            Image.open(site / "public/capture/front-calibration.webp").convert("RGB")
        ).astype(np.float32)
        / 255
    )
    patch = ref[48:105, 452:550]
    patch = np.concatenate((patch, patch[:, ::-1]), axis=1)
    patch = np.concatenate((patch, patch[::-1]), axis=0)
    patch = cv2.resize(patch, (256, 256), interpolation=cv2.INTER_CUBIC)
    rngt = np.random.default_rng(97)
    y, x = np.mgrid[:256, :256]
    hi = rngt.normal(0, 1, (256, 256))
    xw = (x + 4 * np.sin(2 * pi * y / 256) + 2 * np.sin(8 * pi * y / 256)).astype(
        np.float32
    )
    yw = (y + 16 * np.sin(x / 256 * 2 * pi)).astype(np.float32)
    patch = cv2.remap(patch, xw, yw, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
    lum = patch.mean(-1)
    diff = lum - gaussian_filter(lum, 3, mode="wrap")
    val = np.clip(0.056 + 0.31 * lum + 0.73 * diff + hi * 0.009, 0.037, 0.32)
    rgb = np.stack([val * 0.97, val * 0.98, val], axis=2)
    tex = a.texture(Image.fromarray(np.uint8(rgb * 255)), "JPEG")
    dy = np.roll(diff, -1, 0) - np.roll(diff, 1, 0)
    dx = np.roll(diff, -1, 1) - np.roll(diff, 1, 1)
    normal = normalize(np.stack((-dx * 7, -dy * 7, np.ones_like(dx)), axis=-1))
    ntex = a.texture(Image.fromarray(np.uint8((normal * 0.5 + 0.5) * 255)), "PNG")
    return tex, ntex


def cap_position(phi, u, thick):
    ang = np.interp(
        abs(phi),
        [0, 0.5, 0.93, 1.20, 1.50, 1.75, 2.20, pi],
        [0.87, 0.91, 1.11, 1.36, 1.68, 1.86, 2.20, 2.37],
    )
    ang += (0.013 * np.sin(18 * phi) + 0.016 * np.sin(13 * phi + 0.5)) * (u**3)
    polar = u * ang
    d = np.array(
        (np.sin(polar) * np.sin(phi), np.cos(polar), np.sin(polar) * np.cos(phi))
    )
    dists, idx = skull_tree.query(d, k=6)
    w = 1 / (dists + 0.012) ** 2
    radius = np.average(np.linalg.norm(surface[idx], axis=1), weights=w)
    n = normalize(d / E)
    thickness = (0.13 + 0.036 * (1 - u)) * min(1, max(0.015, (1 - u) / 0.11))
    bumps = (
        0.025 * np.sin(phi * 25 + polar * 4) * np.sin(polar * 8)
        + 0.017 * np.cos(phi * 19 - polar * 10)
        + 0.008 * np.cos(phi * 41 - polar * 8)
    ) * (np.sin(polar) ** 1.5)
    return C + E * d * radius + n * (thickness + bumps + thick), n


def natural_scalp(a):
    U, V = 22, 100
    pos = []
    st = []
    color = []
    for i in range(U):
        u = max(0.001, i / (U - 1))
        for j in range(V + 1):
            phi = (j / V) * 2 * pi - pi
            pt, n = cap_position(phi, u, 0)
            pos.append(pt)
            st.append((j / V * 12, u * 4.8))
            noise = 0.78 + 0.2 * np.sin(17 * phi + 7 * u) ** 2
            color.append([noise, noise, noise])
    idx = []
    h = V + 1
    for i in range(U - 1):
        for j in range(V):
            aa = i * h + j
            bb = aa + 1
            cc = aa + h
            dd = cc + 1
            idx.extend(((aa, cc, bb), (bb, cc, dd)))
    pos = np.array(pos)
    idx = np.array(idx)
    ns = normals(pos, idx)
    if np.mean((pos - C) * ns) < 0:
        idx = idx[:, [0, 2, 1]]
    tex, nm = natural_texture(a)
    m = a.material("Coiled undercut", (0.72, 0.76, 0.75), 0.85, tex, double=True)
    a.mats[m]["normalTexture"] = dict(index=nm, scale=0.7)
    from hair_projection import tex_cap

    tex = tex_cap(a, pos, U, V)
    a.mats[m]["pbrMetallicRoughness"]["baseColorTexture"] = dict(index=tex)
    a.mats[m].pop("normalTexture", None)
    st = [(j / V, i / (U - 1)) for i in range(U) for j in range(V + 1)]
    a.add("Hairline", pos, idx, m, st, color)


def wisps(a, ropes):
    # Tiny lifted coils break the otherwise hard silhouette of swept guide hairs.
    rnd = np.random.default_rng(41)
    positions = []
    indices = []
    colors = []
    norms = []
    index = 0

    def ribbon(ptset, tip, width, color):
        nonlocal index
        pts = np.array(ptset)
        t = normalize(np.gradient(pts, axis=0))
        axis = normalize(np.cross(t, tip))
        w = np.sin(np.linspace(0.03, pi - 0.03, len(pts))) ** 0.35 * width
        P = np.empty((len(pts) * 2, 3))
        P[::2] = pts - axis * w[:, None]
        P[1::2] = pts + axis * w[:, None]
        positions.extend(P)
        colors.extend([color] * len(P))
        norms.extend(np.repeat(tip, 2, axis=0))
        for i in range(len(pts) - 1):
            at = index + i * 2
            indices.extend(((at, at + 1, at + 2), (at + 1, at + 3, at + 2)))
        index += len(P)

    for rr, (guide, rad) in enumerate(ropes):
        cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(guide, axis=0), axis=1))]
        valid = np.r_[True, np.diff(cum) > 1.0e-7]
        guide = guide[valid]
        rad = rad[valid]
        cum = cum[valid]
        curve = CubicSpline(cum, guide, axis=0)
        radii = PchipInterpolator(cum, rad)
        lengths = np.linspace(0, cum[-1], 120)
        da = normalize(curve(lengths, 1))
        ref = np.where(
            abs(da[:, 1, None]) < 0.89, np.array([[0, 1.0, 0]]), np.array([[0, 0, 1.0]])
        )
        side = normalize(np.cross(da, ref))
        up = normalize(np.cross(da, side))
        for j in range(30):
            s0 = rnd.uniform(0.01, cum[-1] - 0.14)
            sz = rnd.uniform(0.05, 0.18)
            x = np.array([0, 0.19, 0.38, 0.57, 0.76, 1.0])
            ss = s0 + x * sz
            nearest = np.minimum((ss / cum[-1] * 119).astype(int), 119)
            tt = da[nearest]
            yaw = rnd.uniform(0, 2 * pi)
            a0 = yaw + x * rnd.uniform(0.9, 3.4) * (-1 if j % 3 else 1)
            radial = normalize(
                np.cos(a0[:, None]) * side[nearest] + np.sin(a0[:, None]) * up[nearest]
            )
            radii2 = (
                radii(ss) * (1.01 + 0.13 * np.sin(pi * x))
                + 0.003
                + 0.022 * np.sin(pi * x) ** 2
            )
            center = curve(ss) + radial * radii2[:, None]
            shade = float(rnd.uniform(0.0035, 0.012))
            ribbon(
                center,
                radial,
                rnd.uniform(0.0021, 0.0048),
                [shade * 0.88, shade * 0.98, shade],
            )
    # Fine baby hairs sweep away from the temples to soften the boundary of the groom.
    for i in range(560):
        phi = rnd.uniform(-2.3, 2.3)
        u0 = rnd.uniform(0.910, 0.987)
        x = np.linspace(0, 1, 6)
        hook = rnd.uniform(0.013, 0.049)
        p0 = []
        n0 = []
        for t in x:
            pt, n = cap_position(
                phi + hook * t * np.sign(phi),
                u0 + t * (1.018 - u0),
                0.003 + 0.018 * np.sin(t * pi),
            )
            p0.append(pt)
            n0.append(n)
        shade = rnd.uniform(0.003, 0.014)
        ribbon(
            p0,
            np.array(n0),
            rnd.uniform(0.002, 0.0048),
            [shade * 0.9, shade, shade * 0.92],
        )
    m = a.material("Loose coils", (0.65, 0.68, 0.69), 0.82, double=True)
    a.add(
        "Hair fibers",
        np.array(positions),
        np.array(indices),
        m,
        colors=colors,
        norm=norms,
    )
