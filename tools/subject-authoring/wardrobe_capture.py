from bake_face import raster_geom, sample_image, soft_step
from mesh_build import *
from scipy.ndimage import gaussian_filter, distance_transform_edt


def captured_shirt(pos, faces, texcoord, original):
    sz = 1024
    coords, tri, st, ns = mesh_for_uv(pos, faces, texcoord)
    G, N, valid = raster_geom(coords, st, tri, ns, sz)
    good = valid > 0
    points = G[good]
    ns = N[good]
    root = site / "public"
    rgb = np.asarray(
        Image.open(root / "capture/front-calibration.webp").convert("RGB")
    ).astype("float32")
    count = len(points)
    source = np.zeros((count, 2), float)
    source[:, 0] = 532 + points[:, 0] * 192.0
    source[:, 1] = np.interp(
        points[:, 1],
        [5.70, 5.90, 6.10, 6.36, 6.72, 7.04, 7.32, 7.59, 7.80],
        [859, 837, 813, 764, 702, 637, 591, 565, 550],
    )
    shirt = np.zeros(rgb.shape[:2], np.uint8)
    for poly in [
        [
            (224, 599),
            (322, 576),
            (325, 699),
            (313, 788),
            (278, 827),
            (113, 784),
            (139, 687),
        ],
        [(457, 610), (632, 604), (651, 797), (441, 807), (454, 711)],
        [(827, 601), (890, 608), (968, 708), (936, 788), (845, 819), (840, 722)],
    ]:
        cv2.fillPoly(shirt, [np.array(poly)], 255)
    d, ix = distance_transform_edt(shirt == 0, return_indices=True)
    clean = rgb[ix[0], ix[1]]
    photo = sample_image(clean, source)
    w = sample_image(np.clip(1 - d / 30, 0, 1).astype("float32"), source) * soft_step(
        0.25, 0.84, points[:, 2]
    )
    tile = rgb[642:780, 480:621]
    h, wid = tile.shape[:2]
    scale = 0.82
    uv = np.column_stack(
        (
            (points[:, 0] * 1.27 + points[:, 2] * 0.30) * wid,
            (7.32 - points[:, 1]) * h * 0.98,
        )
    )
    uv[:, 0] %= wid
    uv[:, 1] %= h
    bg = sample_image(tile, uv)
    sample = photo * w[:, None] + bg * (1 - w[:, None])
    pix = sample * 0.84 + np.maximum(0, sample - 45) * 0.28
    image = np.uint8(np.clip(original, 0, 1) * 255)
    base = image[good].astype(float)
    mixed = np.clip(0.22 * base + 0.78 * pix, 6, 205)
    image[good] = np.uint8(mixed)
    valid2 = distance_transform_edt(~good, return_indices=True)
    dist, bnd = valid2
    grow = (dist > 0) & (dist < 6)
    image[grow] = image[bnd[0][grow], bnd[1][grow]]
    return Image.fromarray(image)
