from mesh_build import *


def capture_eyes(asset, pts, faces, tex):
    from bake_face import warp_front, render_coords

    root = site / "public"
    ref = (
        np.fromfile(root / "tracking/facial-track.bin", "<u2")
        .reshape(-1, 468, 2)[72]
        .astype(float)
        / 65535
        * [1210, 864]
    )
    lmk = p / "face-warped-landmarks.npy"
    landmark = np.load(lmk if lmk.exists() else p / "front-landmarks.npy")
    coords, tri, st, ns = mesh_for_uv(pts, faces, tex)
    xy = warp_front(landmark, ref)(render_coords(coords))
    bounds = (379, 229, 687, 328)
    im = Image.open(root / "capture/front-calibration.webp").convert("RGB").crop(bounds)
    tc = (xy - np.array(bounds[:2])) / np.array(
        (bounds[2] - bounds[0], bounds[3] - bounds[1])
    )
    tc = np.nan_to_num(tc, 0.5).clip(0.002, 0.998)
    t = asset.texture(im, "JPEG")
    m = asset.material("Optically registered eyes", (0.90, 0.91, 0.93), 0.42, t)
    asset.mats[m]["emissiveFactor"] = [0.18, 0.18, 0.18]
    asset.mats[m]["emissiveTexture"] = dict(index=t)
    asset.add("Eyes", coords, tri, m, tc, norm=ns)
