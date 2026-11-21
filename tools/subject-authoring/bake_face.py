from mesh_build import *
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import distance_transform_edt
from scipy.spatial import Delaunay
from scipy import ndimage


def render_coords(pts, phi=0):
    pts = unit(pts)
    s, c = np.sin(phi), np.cos(phi)
    x = pts[:, 0] * c + pts[:, 2] * s
    return np.stack(
        [390 + x * 780 / 2.76, 390 - (pts[:, 1] - 0.025) * 780 / 2.76], axis=1
    )


def raster_geom(pos, st, tri, ns, side):
    G = np.zeros((side, side, 3), np.float32)
    N = np.zeros_like(G)
    mask = np.zeros((side, side), np.uint8)
    for f in tri:
        pix = st[f] * side - 0.5
        lo = np.floor(pix.min(0)).astype(int).clip(0, side - 1)
        hi = np.ceil(pix.max(0)).astype(int).clip(0, side - 1)
        x0, y0 = lo
        x1, y1 = hi
        if x1 <= x0 or y1 <= y0:
            continue
        x, y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        x = x - pix[0, 0]
        y = y - pix[0, 1]
        d, e = pix[1:] - pix[0]
        det = d[0] * e[1] - d[1] * e[0]
        if abs(det) < 1.0e-6:
            continue
        b = (x * e[1] - y * e[0]) / det
        c = (y * d[0] - x * d[1]) / det
        a = 1 - b - c
        ok = (a > -0.0001) & (b > -0.0001) & (c > -0.0001)
        if not np.any(ok):
            continue
        ww = np.stack((a[ok], b[ok], c[ok]), 1)
        G[y0 : y1 + 1, x0 : x1 + 1][ok] = ww @ pos[f]
        N[y0 : y1 + 1, x0 : x1 + 1][ok] = ww @ ns[f]
        mask[y0 : y1 + 1, x0 : x1 + 1][ok] = 255
    return G, N, mask


def warp_front(front_landmarks, src_landmarks):
    # Outside the dense facial lattice stabilize the mapping against the fitted similarity.
    A = cv2.estimateAffinePartial2D(front_landmarks, src_landmarks, method=cv2.LMEDS)[0]
    points = np.array(
        [
            [0, 0],
            [779, 0],
            [779, 779],
            [0, 779],
            [220, 120],
            [300, 155],
            [390, 148],
            [470, 155],
            [560, 120],
            [235, 355],
            [555, 355],
            [295, 490],
            [383, 535],
            [487, 490],
        ],
        dtype=float,
    )
    transformed = points @ A[:, :2].T + A[:, 2]
    srcs = np.concatenate((src_landmarks, transformed))
    dsts = np.concatenate((front_landmarks, points))
    return LinearNDInterpolator(dsts, srcs)


def soft_step(a, b, t):
    h = np.clip((t - a) / (b - a), 0, 1)
    return h * h * (3 - 2 * h)


def sample_image(im, uvs):
    coords = uvs.copy()
    coords[~np.isfinite(coords)] = 0
    coords = coords.astype("float32")
    x = coords[:, 0]
    y = coords[:, 1]
    # OpenCV remap limits any dimension to 32766.
    outs = []
    for i in range(0, len(x), 16000):
        outs.append(
            cv2.remap(
                im,
                x[i : i + 16000, None],
                y[i : i + 16000, None],
                cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REPLICATE,
            )[:, 0]
        )
    return np.concatenate(outs)


def bake():
    side = 3072
    faces = [f for f in body if min(v[i, 1] for i, k in f) > 7.09]
    pos, coords, faces_hi = subdiv(v, uv, faces)
    pts, tri, st, ns = mesh_for_uv(pos, faces_hi, coords)
    geomfile = p / "uv-position.npz"
    if not geomfile.exists():
        G, N, mask = raster_geom(pts, st, tri, ns, side)
        keep = mask != 0
        np.savez_compressed(
            geomfile, px=np.flatnonzero(keep).astype("int32"), G=G[keep], N=N[keep]
        )
    z = np.load(geomfile)
    px = z["px"]
    G = z["G"]
    N = normalize(z["N"])
    yy, xx = np.unravel_index(px, (side, side))
    base = site / "public"
    src = (
        np.fromfile(base / "tracking/facial-track.bin", "<u2")
        .reshape(-1, 468, 2)
        .astype(float)
        / 65535
        * [1210, 864]
    )
    ref = src[72]
    im = cv2.cvtColor(
        cv2.imread(str(base / "capture/front-calibration.webp")), cv2.COLOR_BGR2RGB
    )
    im = im.astype(np.float32)
    # Retain pores, stubble and feature variation. Reduce the incoming broad key light before it is lit in 3D.
    diffuse = np.clip(
        (im + 3) ** 0.95 * 1.16 + 0.25 * (im - cv2.GaussianBlur(im, (0, 0), 1.9)),
        0,
        255,
    )
    mapf = warp_front(np.load(p / "front-landmarks.npy"), ref)
    target = render_coords(G)
    source = mapf(target)
    rawpix = sample_image(diffuse, source)
    # Keep photographic base material on ears and around the unobserved rear. Blend the frontal capture onto exposed skin, including the full beard.
    blend = (
        np.maximum(
            soft_step(-0.10, 0.53, N[:, 2]), 0.97 * soft_step(1.25, 1.46, G[:, 2])
        )
        * soft_step(0.91, 1.19, G[:, 2])
        * soft_step(7.50, 7.80, G[:, 1])
        * (1 - soft_step(9.42, 9.65, G[:, 1]))
    )
    im0 = (
        Image.open(p / "young_darkskinned_male_diffuse.png")
        .convert("RGB")
        .resize((side, side), Image.Resampling.LANCZOS)
    )
    original = np.array(im0)
    original_vals = original[yy, xx].astype("float32")
    w = blend[:, None]
    # Cover the original skin's sparse eyebrow texture and inject a dedicated hairline-facing photo.
    mixed = original_vals * (1 - w) + rawpix * w
    final = np.full((side, side, 3), [76, 48, 36], dtype=np.uint8)
    final[yy, xx] = np.uint8(np.clip(mixed, 0, 255))
    valid = np.zeros((side, side), np.uint8)
    valid[yy, xx] = 255
    # Fill a 10 texel border around UV islands to protect mip maps and off-by-one edge filtering.
    distance, indices = distance_transform_edt(valid == 0, return_indices=True)
    border = (distance > 0) & (distance < 13)
    final[border] = final[indices[0][border], indices[1][border]]
    Image.fromarray(final).save(p / "optical-skin.jpg", quality=95, subsampling=0)


if __name__ == "__main__":
    bake()
