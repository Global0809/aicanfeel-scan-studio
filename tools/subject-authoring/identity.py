from base_mesh import *
import cv2, os
from scipy.interpolate import RBFInterpolator
from scipy.spatial import Delaunay


def warp_template(points):
    # Neutral-pose identity shape, fitted from the recorded front face. Keep the same registered UVs.
    p0 = np.load(p / "front-landmarks.npy")
    source = site / "public/tracking/facial-track.bin"
    s0 = (
        np.fromfile(source, dtype="<u2").reshape(-1, 468, 2)[72].astype(float)
        / 65535
        * [1210, 864]
    )
    T = cv2.estimateAffinePartial2D(s0, p0, method=cv2.LMEDS)[0]
    aligned = s0 @ T[:, :2].T + T[:, 2]
    delta = aligned - p0
    # Stabilize the near-front source solve by imposing symmetry on the neutral expression.
    center = p0[[1, 6, 152], 0].mean()
    r2 = p0.copy()
    r2[:, 0] = 2 * center - r2[:, 0]
    d2 = delta.copy()
    d2[:, 0] *= -1
    train = np.concatenate((p0, r2))
    ds = np.concatenate((delta, d2))
    gridx, gridy = np.meshgrid(np.linspace(215, 565, 45), np.linspace(155, 500, 43))
    rg = np.stack((gridx, gridy), axis=-1)
    fit = RBFInterpolator(
        train, ds, smoothing=8.0, kernel="thin_plate_spline", neighbors=72
    )
    field = fit(rg.reshape(-1, 2)).reshape(rg.shape).astype("float32")
    from scipy.interpolate import RegularGridInterpolator

    project = RegularGridInterpolator(
        (gridy[:, 0], gridx[0]), field, bounds_error=False, fill_value=0
    )

    def smooth(a, b, x):
        h = np.clip((x - a) / (b - a), 0, 1)
        return h * h * (3 - 2 * h)

    xy = np.stack(
        [
            390 + points[:, 0] * 0.5 * 780 / 2.76,
            390 - ((points[:, 1] - 8.07) * 0.5 - 0.025) * 780 / 2.76,
        ],
        axis=1,
    )
    d = project(xy[:, ::-1])
    w = (
        smooth(0.63, 1.22, points[:, 2])
        * smooth(7.53, 7.78, points[:, 1])
        * (1 - smooth(9.36, 9.65, points[:, 1]))
    )
    out = points.copy()
    out[:, 0] += 0.80 * w * d[:, 0] / (390 / 2.76)
    out[:, 1] -= 0.80 * w * d[:, 1] / (390 / 2.76)
    return out
