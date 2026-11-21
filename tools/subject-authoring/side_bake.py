from bake_face import *
from identity import warp_template


def solve_view(landmark, src, side, angle):
    pts = np.load(p / (landmark + "-landmarks.npy"))
    minf, maxf = (0, 87) if side == "L" else (88, 248)
    good = np.array(
        [
            1,
            4,
            6,
            10,
            33,
            61,
            93,
            105,
            127,
            133,
            152,
            168,
            197,
            234,
            263,
            291,
            323,
            334,
            356,
            362,
            454,
        ]
    )
    scores = []
    for i in range(minf, maxf):
        ref = src[i]
        A = cv2.estimateAffinePartial2D(pts[good], ref[good], method=cv2.LMEDS)[0]
        pred = pts[good] @ A[:, :2].T + A[:, 2]
        err = np.linalg.norm(ref[good] - pred, axis=1)
        scores.append(np.quantile(err, 0.78))
    best = minf + int(np.argmin(scores))
    print(landmark, best, min(scores), flush=True)
    ref = src[best]
    im = cv2.cvtColor(
        cv2.imread(str(p / "frames" / f"{best:03}.png")), cv2.COLOR_BGR2RGB
    ).astype(np.float32)
    # Supplement the facial landmarks with the visible ear in profile at the same viewport scale.
    T = cv2.estimateAffinePartial2D(pts, ref, method=cv2.LMEDS)[0]
    c = pts.mean(0)
    span = pts.max(0) - pts.min(0)
    box = (
        c
        + np.array(
            [
                [-1.12, -0.68],
                [1.18, -0.67],
                [-1.42, 0],
                [1.35, 0],
                [-1.35, 0.65],
                [1.24, 0.62],
                [-0.4, -1.25],
                [0.4, -1.19],
                [-0.43, 1.35],
                [0.44, 1.4],
            ]
        )
        * span
    )
    guard = np.vstack((box, [[0, 0], [779, 0], [779, 779], [0, 779]]))
    warp = LinearNDInterpolator(
        np.vstack((pts, guard)), np.vstack((ref, guard @ T[:, :2].T + T[:, 2]))
    )
    return warp, im, angle


def additional():
    z = np.load(p / "uv-position.npz")
    px = z["px"]
    G = z["G"]
    N = normalize(z["N"])
    side = 3072
    yy, xx = np.unravel_index(px, (side, side))
    root = site / "public"
    src = (
        np.fromfile(root / "tracking/facial-track.bin", "<u2")
        .reshape(-1, 468, 2)
        .astype(float)
        / 65535
        * [1210, 864]
    )
    pos = G.copy()
    src_pts = (
        Image.open(p / "optical-front-only.jpg")
        if (p / "optical-front-only.jpg").exists()
        else Image.open(p / "optical-skin.jpg")
    )
    if not (p / "optical-front-only.jpg").exists():
        src_pts.save(p / "optical-front-only.jpg", quality=98)
    original = np.array(src_pts.convert("RGB"))
    accum = original[yy, xx].astype("float")
    temp = accum.copy()
    # Mesh registration is defined in the original neutral coordinates. Approximate the small identity adjustment via a 3D lookup.
    from scipy.interpolate import RegularGridInterpolator

    X, Y, Z = (
        np.linspace(-1, 1, 25),
        np.linspace(7.38, 9.76, 37),
        np.linspace(0.2, 1.84, 19),
    )
    grid = np.stack(np.meshgrid(X, Y, Z, indexing="ij"), axis=-1)
    field = warp_template(grid.reshape(-1, 3)).reshape(grid.shape)
    dis = RegularGridInterpolator(
        (X, Y, Z), field - grid, bounds_error=False, fill_value=0
    )
    Gm = G + dis(G)
    for label, sign, theta in [
        ("left-23", "L", -0.4),
        ("right-42", "R", 0.73),
        ("right-63", "R", 1.10),
    ]:
        warp, im, phi = solve_view(label, src, sign, theta)
        for mirror in [False, True] if theta > 0.9 else [False]:
            Pt = Gm.copy()
            Nt = N.copy()
            if mirror:
                Pt[:, 0] *= -1
                Nt[:, 0] *= -1
            xy = render_coords(Pt, phi)
            srcxy = warp(xy)
            photo = sample_image(im, srcxy)
            facing = Nt[:, 2] * np.cos(phi) - Nt[:, 0] * np.sin(phi)
            emphasis = soft_step(0.12, 0.78, -np.sign(phi) * Nt[:, 0])
            if abs(phi) > 0.9:
                emphasis *= soft_step(0.3, 0.93, -Nt[:, 0])
            w = (
                soft_step(0.25, 0.78, facing)
                * emphasis
                * soft_step(7.59, 7.87, Pt[:, 1])
                * (1 - soft_step(9.08, 9.55, Pt[:, 1]))
                * soft_step(0.24, 0.67, Pt[:, 2])
            )
            w *= 0.55 if theta < 0 else 0.70
            if mirror:
                w *= 0.80
            photo = np.clip((photo + 3) ** 0.95 * 1.16, 0, 255)
            accum = accum * (1 - w[:, None]) + photo * w[:, None]
    final = original.copy()
    final[yy, xx] = np.uint8(np.clip(accum, 0, 255))
    Image.fromarray(final).save(p / "optical-skin.jpg", quality=95, subsampling=0)


if __name__ == "__main__":
    additional()
