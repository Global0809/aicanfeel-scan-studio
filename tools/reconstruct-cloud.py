"""Reconstruct the performer as a coloured optical point cloud from four registered mattes.

Run from the project directory with numpy, scipy, opencv-python and Pillow installed:
    python tools/reconstruct-cloud.py
To retrack the frontal image, additionally install MediaPipe and pass
--landmarker /path/to/face_landmarker.task. The source archive already includes
the recorded 468-landmark calibration, so a model download is normally unnecessary.

World axes are screen-right X, up Y and anterior Z. The 1210 x 864 hero matte at
source frame 72 defines XY. Frame-zero profile pixels advance rightward with Z;
overhead pixels advance downward with Z. The independent orthographic scales and
eye/nose/chin correspondences below register the crops rather than their borders.
The bundled 20 selected mattes in tools/optical-cloud-donors.zip add rotating
profile, rear and intermediate coverage. Their source was Blender screen recording.mp4.
Fourteen orthographic hull constraints, 468 facial landmarks and calibrated optical
stereo refine its outer shape. The rear locs use the recorded rear view. The opposite
side and the areas below the profile crop use mirrored detail and recorded fabric.

The output is standard little-endian PLY: float32 XYZ and sRGB8 RGB, no faces.
THREE.PLYLoader converts sRGB vertex colours to linear working colour automatically.
Use the loaded geometry with THREE.Points; head-on view is from positive Z.
The surface GLB has a wrapped, source-colour UV atlas and an unlit material preserving
the original capture illumination. Its glTF coordinates match the PLY. The smaller
inward-offset occluder GLB is intended for an invisible, depth-writing material before
drawing the points. It hides rear returns through gaps in the sparse front points.
"""

import argparse
import io
import json
import struct
import zipfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage, interpolate


ROOT = Path(__file__).resolve().parents[1]
MAIN_SCALE = 0.00256
MAIN_U = 537.0
MAIN_V = 440.0
SIDE_SCALE = 0.00595
SIDE_U = 203.5
TOP_X_SCALE = 0.00765
TOP_Z_SCALE = 0.00620
TOP_U = 207.0
TOP_V = 151.0
FRONT_SCALE = 0.00580
FRONT_U = 218.0
FRONT_EYE_V = 136.0
PROFILE_ROWS = np.array([15, 111, 180, 284, 352, 427, 524, 574, 650, 679, 862])
PROFILE_V = np.array([1.0, 43.0, 72.0, 115.5, 148.0, 177.0, 215.5, 238.0, 271.0, 285.0, 362.0])

# Weak-perspective camera rows fitted to 44 matching anatomical landmarks from
# the frontal calibration plate and each named video-frame matte. Row dot XYZ1
# gives that view's native pixel coordinates. Face-only residuals are ~2–10 px.
HERO_CAMERAS = {
    0: [[355.290, 12.640, -217.329, 585.046], [-1.754, -373.252, 0.675, 422.169]],
    48: [[379.467, 2.973, -72.822, 549.312], [-1.950, -385.991, 4.375, 432.583]],
    96: [[384.499, -5.605, 86.009, 522.781], [-3.857, -394.200, 1.956, 441.166]],
    144: [[328.837, -13.719, 230.882, 503.531], [1.903, -394.896, -19.758, 452.734]],
    192: [[236.016, -20.541, 334.946, 495.217], [9.337, -378.200, -9.267, 443.269]],
    240: [[155.205, -24.115, 377.364, 504.462], [1.750, -350.830, -15.011, 436.455]],
}
# Turntable yaw from the orthographic face fit, relative to its opening frame.
# Later profile/rear frames have no biometric face detection. Their phase is
# interpolated between the last reliable ear/cheek angle and the recorded rear.
TURN_YAW = {0: 0, 24: 7, 48: 17, 72: 25, 96: 34, 120: 43, 144: 52,
            168: 56, 192: 61, 216: 72, 240: 78, 264: 83, 288: 87}


def smoothstep(low, high, x):
    t = np.clip((x - low) / (high - low), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def sample(image, x, y):
    x, y = np.broadcast_arrays(np.clip(x, 0, image.shape[1] - 1.001), np.clip(y, 0, image.shape[0] - 1.001))
    ix, iy = x.astype(np.int32), y.astype(np.int32)
    fx, fy = (x - ix), (y - iy)
    if image.ndim == 3:
        fx, fy = fx[..., None], fy[..., None]
    return (image[iy, ix] * (1 - fx) + image[iy, ix + 1] * fx) * (1 - fy) + (image[iy + 1, ix] * (1 - fx) + image[iy + 1, ix + 1] * fx) * fy


class Matte:
    def __init__(self, path):
        rgba = np.array(Image.open(path).convert('RGBA'))
        self.mask = rgba[..., 3] >= 130
        # Extend only the nearest actual foreground colour into antialiased trim pixels.
        indices = ndimage.distance_transform_edt(~self.mask, return_distances=False, return_indices=True)
        self.rgb = rgba[indices[0], indices[1], :3]
        self.alpha = rgba[..., 3]
        self.original = np.ascontiguousarray(rgba[..., :3])
        rows = np.flatnonzero(self.mask.any(axis=1))
        limits = np.array([[np.flatnonzero(self.mask[y])[0], np.flatnonzero(self.mask[y])[-1]] for y in rows])
        axis = np.arange(self.mask.shape[0])
        self.left = ndimage.gaussian_filter1d(np.interp(axis, rows, limits[:, 0]), 1.2)
        self.right = ndimage.gaussian_filter1d(np.interp(axis, rows, limits[:, 1]), 1.2)

    def span(self, y):
        rows = np.arange(len(self.left))
        return np.interp(y, rows, self.left), np.interp(y, rows, self.right)


class PhotoView:
    def __init__(self, matte, theta, matrix=None, strength=1.0, mirrored=False, side_rows=False):
        self.matte, self.theta = matte, np.deg2rad(theta)
        self.matrix = np.array(matrix) if matrix is not None else None
        self.strength, self.mirrored, self.side_rows = strength, mirrored, side_rows
        self.scale, self.centre = 1 / SIDE_SCALE, SIDE_U

    def project(self, x, y, z):
        xx = -x if self.mirrored else x
        if self.matrix is not None:
            a, b = self.matrix
            return a[0]*xx+a[1]*y+a[2]*z+a[3], b[0]*xx+b[1]*y+b[2]*z+b[3]
        v = MAIN_V - y / MAIN_SCALE
        vv = np.interp(v, PROFILE_ROWS, PROFILE_V) if self.side_rows else (v - 284) * MAIN_SCALE / FRONT_SCALE + FRONT_EYE_V
        return (xx*np.cos(self.theta) + z*np.sin(self.theta))*self.scale + self.centre, vv

    def mirror(self):
        view = PhotoView(self.matte, np.rad2deg(self.theta), self.matrix, self.strength * 0.72, True, self.side_rows)
        view.scale, view.centre = self.scale, self.centre
        return view


def capture_views(ortho_path, hero_path, archive_path):
    shape_views, material_views = [], []
    archive = zipfile.ZipFile(archive_path) if archive_path and archive_path.is_file() else None
    if ortho_path or archive:
        for family in ['front', 'side']:
            for frame in [0, 48, 96, 144, 192, 240, 288]:
                filename = f'{family}-{frame:03}.webp'
                source = ortho_path / filename if ortho_path else io.BytesIO(archive.read(filename))
                matte = Matte(source)
                del matte.original
                angle = (90 if family == 'side' else 0) + TURN_YAW[frame]
                view = PhotoView(matte, angle, side_rows=family == 'side')
                shape_views.append(view)
                if family == 'side' and frame in [0, 96, 192, 288]:
                    material_views.append(view)
    if hero_path or archive:
        for frame, matrix in HERO_CAMERAS.items():
            angle = np.rad2deg(np.arctan2(matrix[0][2], matrix[0][0]))
            source = hero_path/f'{frame:03}.png' if hero_path else io.BytesIO(archive.read(f'hero-{frame:03}.webp'))
            matte = Matte(source)
            del matte.original
            view = PhotoView(matte, angle, matrix, 1.20)
            material_views.append(view)
    if archive:
        archive.close()
    return shape_views, material_views


def multiview_constraints(x, z, y, cx, cz, shape_views):
    """Bound each radial cross section by support lines from recorded camera angles."""
    extent = np.full_like(x, 1.23)
    row_world = y[:, 0]
    for view in shape_views:
        angle = view.theta
        projected = x * np.cos(angle) + z * np.sin(angle)
        lo, hi = projected.min(axis=1), projected.max(axis=1)
        _, v = view.project(np.zeros_like(row_world), row_world, np.zeros_like(row_world))
        observed_lo, observed_hi = view.matte.span(v)
        fit = (row_world > -0.1) & (row_world < 0.84)
        opt_scale = np.median((observed_hi[fit] - observed_lo[fit]) / np.maximum(hi[fit] - lo[fit], 0.01))
        expected = 1 / (SIDE_SCALE if view.side_rows else FRONT_SCALE)
        view.scale = np.clip(opt_scale, expected * 0.95, expected * 1.05)
        view.centre = np.median(((observed_lo + observed_hi) / 2 - (lo + hi)*view.scale/2)[fit])
        direction = np.cos(angle) * (x - cx[:, None]) + np.sin(angle) * (z - cz[:, None])
        origin = (np.cos(angle) * cx + np.sin(angle) * cz)[:, None]
        lower = (observed_lo[:, None] - view.centre - 2.0) / view.scale - origin
        upper = (observed_hi[:, None] - view.centre + 2.0) / view.scale - origin
        denom = np.where(abs(direction) < 1e-6, 1e-6, direction)
        bound = np.where(direction > 0, upper / denom, lower / denom)
        reliable = (v > 2) & (v < view.matte.mask.shape[0] - 3)
        extent = np.minimum(extent, np.where(reliable[:, None], bound, 1.23))
    front = np.maximum(0, (z - cz[:, None]) / np.maximum(0.01, (z - cz[:, None]).max(axis=1)[:, None]))
    weight = (1 - 0.65 * front) * smoothstep(-0.56, -0.2, y) * (1 - smoothstep(0.88, 1.06, y))
    fraction = 1 + np.clip(ndimage.gaussian_filter(extent, (1.5, 2.6), mode=('nearest', 'wrap')) - 1, -0.2, 0.15) * weight
    return cx[:, None] + (x - cx[:, None]) * fraction, cz[:, None] + (z - cz[:, None]) * fraction


def measured_landmarks(main, model, archive_path):
    if model is None:
        with zipfile.ZipFile(archive_path) as bundle:
            return np.load(io.BytesIO(bundle.read('front-calibration-landmarks.npy')), allow_pickle=False)
    import mediapipe as mp
    from mediapipe.tasks.python import vision

    options = vision.FaceLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
                                           min_face_detection_confidence=0.35, min_face_presence_confidence=0.35)
    with vision.FaceLandmarker.create_from_options(options) as detector:
        result = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=main.original))
    if not result.face_landmarks:
        raise RuntimeError('No face on the frontal calibration plate')
    height, width = main.mask.shape
    return np.array([[p.x * width, p.y * height, p.z * width] for p in result.face_landmarks[0][:468]])


def facial_depth(main, profile, xyz):
    height, width = main.mask.shape
    # Calibrate absolute depth to the captured nose tip, preserving relative cheek,
    # eye-socket and lip depth from the estimator's native weak-perspective coordinates.
    nose = xyz[4]
    nose_v = np.interp(nose[1], PROFILE_ROWS, PROFILE_V)
    nose_z = (profile.span(nose_v)[1] - SIDE_U) * SIDE_SCALE
    depth = nose_z - (xyz[:, 2] - nose[2]) * 0.00243
    uv_y, uv_x = np.mgrid[0:height, 0:width]
    interpolated = interpolate.LinearNDInterpolator(xyz[:, :2], depth)(uv_x, uv_y)
    valid = np.isfinite(interpolated)
    rows = np.flatnonzero(valid.any(axis=1))
    row_high = np.array([np.max(interpolated[y][valid[y]]) for y in rows])
    side_front = (profile.span(np.interp(rows, PROFILE_ROWS, PROFILE_V))[1] - SIDE_U) * SIDE_SCALE
    correction = ndimage.gaussian_filter1d(np.clip(side_front - row_high, -0.12, 0.12), 2.0)
    interpolated[rows] += correction[:, None] * 0.78
    distance, index = ndimage.distance_transform_edt(~valid, return_indices=True)
    filled = ndimage.gaussian_filter(interpolated[index[0], index[1]], 1.5)
    rgb = main.rgb.astype(np.float32)
    skin = smoothstep(10, 40, rgb[..., 0] - rgb[..., 2]) * smoothstep(43, 83, rgb[..., 0])
    weight = (1 - smoothstep(1, 32 + 55 * skin, distance)) * main.mask
    return filled, ndimage.gaussian_filter(weight, 1.8)


def build_shell(main, front, profile, top, depth, influence, views):
    rows = np.linspace(15, 861, 430)
    theta = np.linspace(-np.pi, np.pi, 600, endpoint=False)
    c, s = np.cos(theta)[None, :], np.sin(theta)[None, :]
    y = np.broadcast_to(((MAIN_V - rows) * MAIN_SCALE)[:, None], (len(rows), len(theta)))
    left, right = main.span(rows)
    front_v = (rows - 284.0) * MAIN_SCALE / FRONT_SCALE + FRONT_EYE_V
    left_o, right_o = front.span(front_v)
    # The high-resolution plate's local tool drawer obscures the far right shoulder.
    # The registered orthographic side of this same shoulder supplies that contour.
    ortho_right = MAIN_U + (right_o - FRONT_U) * FRONT_SCALE / MAIN_SCALE
    shoulder = smoothstep(565, 610, rows) * (1 - smoothstep(640, 678, rows))
    right += shoulder * np.clip(ortho_right - right, 0, 32)
    cx = ((left + right) / 2 - MAIN_U) * MAIN_SCALE
    rx = (right - left) * MAIN_SCALE / 2
    vp = np.interp(rows, PROFILE_ROWS, PROFILE_V)
    back, anterior = profile.span(vp)
    back = (back - SIDE_U) * SIDE_SCALE
    anterior = (anterior - SIDE_U) * SIDE_SCALE
    # The orthographic profile ends at the clavicle. Complete the lower shirt section
    # with the curvature measured on the last visible shoulder rows.
    lower = smoothstep(671, 755, rows)
    back = back * (1 - lower) + (-0.75 + 0.16 * smoothstep(748, 858, rows)) * lower
    anterior = anterior * (1 - lower) + (0.47 + 0.055 * smoothstep(741, 854, rows)) * lower
    cz, rz = (back + anterior) / 2, (anterior - back) / 2
    x, z = cx[:, None] + rx[:, None] * s, cz[:, None] + rz[:, None] * c
    if views:
        x, z = multiview_constraints(x, z, y, cx, cz, views)

    # Intersect the rounded row hull with the third, overhead silhouette. A medial
    # ray restores outside samples to its last valid location. A one-pixel tolerance
    # allows for independently antialiased source masks.
    top_mask = cv2.dilate(top.mask.astype('uint8'), np.ones((5, 5), np.uint8))
    lo, hi = np.zeros_like(x), np.ones_like(x)
    for _ in range(9):
        fraction = (lo + hi) / 2
        xx = cx[:, None] + (x - cx[:, None]) * fraction
        zz = cz[:, None] + (z - cz[:, None]) * fraction
        hit = sample(top_mask, xx / TOP_X_SCALE + TOP_U, zz / TOP_Z_SCALE + TOP_V) > 0.45
        lo, hi = np.where(hit, fraction, lo), np.where(hit, hi, fraction)
    x = cx[:, None] + (x - cx[:, None]) * np.minimum(1, lo + 0.002)
    z = cz[:, None] + (z - cz[:, None]) * np.minimum(1, lo + 0.002)
    u = x / MAIN_SCALE + MAIN_U
    v = np.broadcast_to(rows[:, None], x.shape)
    face = sample(influence, u, v) * smoothstep(0.02, 0.36, c)
    z += (sample(depth, u, v) - z) * face

    # Small scan-conditioned ridges preserve the loc pattern and stop the rear
    # completion from reading as a smooth generic shell. Skin stays untouched.
    luma = cv2.cvtColor(main.rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    relief = cv2.GaussianBlur(luma, (0, 0), 2.1) - cv2.GaussianBlur(luma, (0, 0), 12)
    braid = np.cos(29 * theta[None, :] + 3.1 * y + 0.65 * np.sin(5 * y + 3 * theta))
    garment = smoothstep(-1.0, -0.45, y) + (1 - smoothstep(0.22, 0.78, np.abs(x))) * 0.35
    offset = (np.clip(sample(relief, u, v), -25, 25) * 0.00063 * smoothstep(-0.15, 0.7, c)
              + braid * 0.011 * (1 - smoothstep(0.3, 0.8, c))) * np.minimum(1, garment) * (1 - face)
    x, z = x + offset * s, z + offset * c
    ear_u, ear_v = z / SIDE_SCALE + SIDE_U, np.interp(v, PROFILE_ROWS, PROFILE_V)
    ear_r = np.hypot((ear_u - 201) / 17.0, (ear_v - 130) / 23.5)
    helix = 0.024 * np.exp(-((ear_r - 0.77) / 0.17) ** 2) - 0.011 * np.exp(-(ear_r / 0.42) ** 2)
    x += np.sign(s) * helix * smoothstep(0.61, 0.92, np.abs(s))
    positions = np.stack([x, y, z], axis=-1)
    param = np.stack([np.broadcast_to(c, x.shape), np.broadcast_to(s, x.shape), face], axis=-1)
    return positions, param


def stereo_front(shell, tags, main, photos):
    """Plane-sweep photometric depth for the loc curtains, neck and visible shirt.

    The silhouette hull alone couples the jaw's depth to both long side curtains.
    Registered earlier/later hero photos separate those surfaces. Tracked facial
    depth remains the anchor where the forward mesh is already constrained.
    """
    views = [p for p in photos if p.matrix is not None and -0.65 < p.theta < 0.67 and not p.mirrored]
    if len(views) < 2:
        return shell
    factor = 0.50
    height, width = main.mask.shape
    h, w = round(height * factor), round(width * factor)
    yy, xx = np.mgrid[0:h, 0:w].astype('float32')
    px, py = xx/factor, yy/factor
    wx, wy = (px - MAIN_U)*MAIN_SCALE, (MAIN_V - py)*MAIN_SCALE
    mask = cv2.resize(main.mask.astype('uint8'), (w, h), interpolation=cv2.INTER_NEAREST)

    def features(mat):
        image = cv2.resize(mat.rgb, None, fx=factor, fy=factor, interpolation=cv2.INTER_AREA).astype('float32')
        lum = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        detail = lum - cv2.GaussianBlur(lum, (0, 0), 3.0)
        return np.stack([lum * 0.65, detail * 1.65, (image[..., 0]-image[..., 2])*0.52], axis=2)

    reference = features(main)
    projected = []
    for view in views:
        a, b = view.matrix
        projected.append((features(view.matte), cv2.resize(view.matte.alpha, (w, h)),
                          (factor*(a[0]*wx+a[1]*wy+a[3])).astype('float32'),
                          (factor*(b[0]*wx+b[1]*wy+b[3])).astype('float32'),
                          float(a[2]*factor), float(b[2]*factor)))
    prior = np.empty((h, w), dtype='float32')
    front_indices = np.flatnonzero(tags[0, :, 0] > 0)
    for j in range(h):
        row = np.clip(round((j / factor - 15) / (861 - 15) * (len(shell)-1)), 0, len(shell)-1)
        contour = shell[row, front_indices]
        sort = np.argsort(contour[:, 0])
        prior[j] = np.interp(wx[j], contour[sort, 0], contour[sort, 2])

    best = np.full((h, w), 1e6, dtype='float32')
    match = prior.copy()
    for depth in np.linspace(-0.20, 0.69, 66):
        costs = []
        for image, alpha, u0, v0, du, dv in projected:
            u = np.asarray(u0 + du * depth, dtype='float32')
            v = np.asarray(v0 + dv * depth, dtype='float32')
            warped = cv2.remap(image, u, v, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            coverage = cv2.remap(alpha, u, v, cv2.INTER_LINEAR)
            error = np.minimum(np.abs(warped - reference), 36.0).mean(axis=2)
            error += (coverage < 100) * 30
            costs.append(cv2.GaussianBlur(error, (0, 0), 1.5))
        ordered = np.sort(np.stack(costs), axis=0)
        matching = ordered[0] * 0.33 + ordered[1] * 0.43 + ordered[-2] * 0.24
        matching += 4.2 * np.abs(depth-prior) + 5.0*np.maximum(0, np.abs(depth-prior) - 0.24)
        improve = matching < best
        match[improve] = depth
        best = np.minimum(best, matching)
    match = cv2.medianBlur(match, 5)
    match = cv2.bilateralFilter(match, 11, 0.065, 5)
    # In areas with little texture, favour a smooth neighbourhood estimate. The cap
    # on relative displacement keeps thin silhouette samples inside the angular hull.
    confidence = (1 - smoothstep(6.0, 17.0, best)) * mask
    # Apply the broad optical correction rather than individual plane winners.
    # Repeating black locs can match multiple disparities. Smoothing residuals
    # relative to the prior prevents those ambiguities from cutting spikes in 3D.
    denom = cv2.GaussianBlur(confidence.astype('float32'), (0, 0), 7.2)
    residual = cv2.GaussianBlur(((match - prior) * confidence).astype('float32'), (0, 0), 7.2) / np.maximum(denom, 1e-4)
    cap = 0.075 - 0.045 * smoothstep(610, 770, py)
    residual = np.clip(residual, -cap, cap)
    x = (shell[..., 0] / MAIN_SCALE + MAIN_U) * factor
    y = (MAIN_V - shell[..., 1] / MAIN_SCALE) * factor
    c, face = tags[..., 0], tags[..., 2]
    w = sample(denom, x, y) * smoothstep(0.12, 0.58, c) * (1 - 0.90*face)
    shell[..., 2] += sample(residual, x, y) * w * 0.72
    source_v = y / factor
    neck_transition = smoothstep(450, 512, source_v) * (1 - smoothstep(613, 680, source_v))
    lateral = smoothstep(0.16, 0.5, np.abs(tags[..., 1])) * smoothstep(-0.06, 0.4, c) * (1 - face)
    softened = ndimage.gaussian_filter1d(shell[..., 2], 12.0, axis=0)
    shell[..., 2] += (softened - shell[..., 2]) * neck_transition * lateral
    # Captured longitudinal centre-lines add shallow, rounded optical relief to
    # the curtain of individual locs between the temples and the shirt trim.
    locks = [(382, 377, 307, 8), (383, 394, 346, 9), (388, 409, 371, 8),
             (389, 425, 401, 9), (394, 438, 437, 7), (699, 695, 682, 9),
             (712, 717, 710, 10), (717, 738, 742, 9), (731, 758, 780, 10),
             (740, 781, 809, 8), (751, 801, 849, 8)]
    source_u = x / factor
    raised = np.zeros_like(source_u)
    for root, middle, end, radius in locks:
        centre = np.interp(source_v, [250, 510, 828], [root, middle, end])
        cross = (source_u - centre) / radius
        raised = np.maximum(raised, np.square(np.maximum(1 - cross*cross, 0)) * radius * MAIN_SCALE * 0.63)
    shell[..., 2] += raised * smoothstep(270, 407, source_v) * (1 - smoothstep(800, 859, source_v)) * smoothstep(0.03, 0.48, c) * (1 - face)
    return shell


def scatter(shell, param, count, rng):
    # Sample the actual surface area. Density is highest around captured eyes, nose,
    # mouth and beard. A small population of noisy peripheral returns softens the trim.
    a = shell[:-1]
    b = np.roll(a, -1, axis=1)
    d = shell[1:]
    c = np.roll(d, -1, axis=1)
    area = (np.linalg.norm(np.cross(b - a, d - a), axis=-1)
            + np.linalg.norm(np.cross(c - b, d - b), axis=-1)) / 2
    frontness, facial = param[:-1, :, 0], param[:-1, :, 2]
    weight = area * (1 + 0.57 * smoothstep(-0.15, 0.8, frontness) + facial * 4.8)
    samples = rng.choice(weight.size, size=count, p=weight.ravel() / weight.sum())
    row, col = np.unravel_index(samples, weight.shape)
    u, v = rng.random((2, count, 1))

    def mix(data):
        right = (col + 1) % data.shape[1]
        return ((1 - u) * data[row, col] + u * data[row, right]) * (1 - v) + ((1 - u) * data[row + 1, col] + u * data[row + 1, right]) * v

    pos, tags = mix(shell), mix(param)
    normals = np.cross((d - a)[row, col], (b - a)[row, col])
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-8)
    pos += normals * rng.normal(0, 0.0018, (count, 1))
    peripheral = (rng.random(count) < 0.023) & (tags[:, 2] < 0.3)
    pos[peripheral] += normals[peripheral] * rng.uniform(0.009, 0.035, (int(peripheral.sum()), 1))
    return pos, tags, normals


def colour_points(pos, tags, normals, main, front, side, top, photos):
    x, y, z = pos.T
    c, s, face = tags.T
    u, v = x / MAIN_SCALE + MAIN_U, MAIN_V - y / MAIN_SCALE
    vp = np.interp(v, PROFILE_ROWS, PROFILE_V)
    # Preserve the higher resolution hero colour across the forward hemisphere.
    # The true frontal ortho contributes to borders obscured by the tool drawer.
    main_color = sample(main.rgb, u, v)
    fo_u, fo_v = x / FRONT_SCALE + FRONT_U, (v - 284) * MAIN_SCALE / FRONT_SCALE + FRONT_EYE_V
    ortho = sample(front.rgb, fo_u, fo_v)
    ortho_ok = smoothstep(25, 170, sample(front.alpha, fo_u, fo_v)) * (1 - smoothstep(304, 315, fo_v))
    missing = (1 - smoothstep(40, 155, sample(main.alpha, u, v))) * ortho_ok
    fwd = main_color * (1 - missing[:, None]) + ortho * missing[:, None]
    side_color = sample(side.rgb, z / SIDE_SCALE + SIDE_U, vp)
    # Below the profile crop, continue recorded loc and cloth texture. Avoid a
    # stretched last line and avoid projecting facial skin onto the unseen back.
    cloth = sample(main.rgb, 128 + 110 * (0.5 + 0.5 * np.sin(2.8 * x + 1.2 * z)), 690 + 76 * np.sin(4.9 * y + 4.0 * x))
    loc = sample(side.rgb, 108 + 37 * np.sin(4.2 * x + 0.4 * y), 153 + 92 * np.sin(2.1 * y + 0.48 * x))
    locks = (1 - smoothstep(0.34, 0.61, np.abs(x))) * (1 - smoothstep(-0.68, 0.1, c))
    rear = cloth * (1 - locks[:, None]) + loc * locks[:, None]
    below = smoothstep(269, 295, vp)
    side_color = side_color * (1 - below[:, None]) + rear * below[:, None]
    front_weight = np.maximum(smoothstep(-0.08, 0.34 if photos else 0.80, c), 0.95 * face)
    mixture = fwd * front_weight[:, None] + side_color * (1 - front_weight[:, None])
    top_color = sample(top.rgb, x / TOP_X_SCALE + TOP_U, z / TOP_Z_SCALE + TOP_V)
    crown = smoothstep(0.43, 0.9, y) * smoothstep(0.14, 0.76, normals[:, 1])
    rear_crown = smoothstep(0.16, 0.7, y) * (1 - smoothstep(-0.82, -0.14, c)) * 0.48
    # Only the upward-facing cap sees the overhead photograph. The top camera's
    # visible forehead must never fall on top of hair facing the frontal camera.
    top_skin = smoothstep(10, 38, top_color[:, 0] - top_color[:, 2])
    top_weight = np.maximum(crown, rear_crown) * (1 - face) * (1 - top_skin)
    mixture = mixture * (1 - top_weight[:, None]) + top_color * top_weight[:, None]
    if photos:
        # Native frontal coordinates give the cleanest face in the recording. Other
        # cameras increasingly dominate towards temples, ears, sides and rear.
        base_weight = 0.03 + 10.0 * np.maximum(0, c) ** 1.8 + 6.5 * face * np.maximum(0, c)
        accum = mixture * base_weight[:, None]
        weights = base_weight.copy()
        for view in photos:
            direction_x = np.sin(view.theta) * (1 if view.mirrored else -1)
            direction_z = np.cos(view.theta)
            facing = s * direction_x + c * direction_z
            weight = np.maximum(0, facing) ** 12 * view.strength
            weight *= smoothstep(-0.22, 0.4, normals[:, 0]*direction_x + normals[:, 2]*direction_z)
            candidate = weight > 0.0008
            if not np.any(candidate):
                continue
            uu, vv = view.project(x[candidate], y[candidate], z[candidate])
            height, width = view.matte.mask.shape
            tail = np.maximum(0, vv - (height - 18)) if view.side_rows else np.zeros_like(vv)
            vv = vv - 1.32 * tail
            visible = (smoothstep(1, 7, uu) * (1 - smoothstep(width - 9, width - 2, uu))
                       * smoothstep(-1, 5, vv) * (1 - smoothstep(height - 14, height - 2, vv))
                       * smoothstep(0, 180, sample(view.matte.alpha, uu, vv)))
            col = sample(view.matte.rgb, uu, vv)
            active = weight[candidate] * visible * (1 - 0.5 * smoothstep(0, 28, tail))
            # At a forward-facing occlusion boundary the frontal plate explicitly
            # identifies a loc; a disoccluded ear in a side photograph cannot replace it.
            dark_loc = (1 - smoothstep(9, 27, fwd[candidate, 0] - fwd[candidate, 2])) * (1 - smoothstep(47, 76, fwd[candidate, 0]))
            projected_skin = smoothstep(16, 47, col[:, 0] - col[:, 2])
            active *= 1 - 0.97 * dark_loc * projected_skin * smoothstep(-0.05, 0.40, c[candidate])
            # Preserve high-resolution frontal features on the tracked face. Profile
            # ears and the entire recorded rear remain free to take their native views.
            if view.matrix is None:
                active *= 1 - 0.8 * face[candidate] * smoothstep(0.2, 0.8, c[candidate])
            accum[candidate] += active[:, None] * col
            weights[candidate] += active
        mixture = accum / weights[:, None]
        mixture = mixture * (1 - top_weight[:, None] * 0.79) + top_color * (top_weight[:, None] * 0.79)
        frontal_lock = smoothstep(0.26, 0.80, c) * (1 - 0.45 * smoothstep(0.82, 1.07, y))
        mixture = mixture * (1 - frontal_lock[:, None]) + fwd * frontal_lock[:, None]
        # The rear capture ends at the clavicle. Its loc texture continues through
        # the middle of the back, while the outer sleeves borrow recorded black fabric.
        sleeve = smoothstep(0.4, 0.85, np.abs(x)) * smoothstep(0.42, 0.82, -y) * (1 - smoothstep(-0.45, 0.18, c))
        sleeve_u = np.where(x < 0, 260 - 80 * smoothstep(0.40, 1.12, -x), 854 + 69*smoothstep(0.4, 1.12, x))
        sleeve_rgb = sample(main.rgb, sleeve_u, 670 + 104 * smoothstep(600, 855, v))
        mixture = mixture * (1 - sleeve[:, None]) + sleeve_rgb * sleeve[:, None]
    return np.uint8(np.clip(np.rint(mixture), 0, 255))


def write_ply(path, pos, rgb):
    record = np.empty(len(pos), dtype=[('position', '<f4', 3), ('rgb', 'u1', 3)])
    record['position'], record['rgb'] = pos, rgb
    header = '\n'.join(['ply', 'format binary_little_endian 1.0', 'comment AICANFEEL recorded optical hull',
                        'comment X right Y up Z anterior; positions in scene units; vertex colours sRGB',
                        'comment Registered foreground/profile/rear optical views and estimated occluded surfaces',
                        f'element vertex {len(pos)}', 'property float x', 'property float y', 'property float z',
                        'property uchar red', 'property uchar green', 'property uchar blue', 'end_header', ''])
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('wb') as output:
        output.write(header.encode('ascii'))
        record.tofile(output)


def grid_normals(shell):
    vertical = np.gradient(shell, axis=0)
    around = np.roll(shell, -1, axis=1) - np.roll(shell, 1, axis=1)
    norm = np.cross(vertical, around)
    return norm / np.maximum(np.linalg.norm(norm, axis=-1, keepdims=True), 1e-9)


def lattice(grid, v, u):
    """Bilinear lookup in a cylindrical UV grid; the seam wraps at the back."""
    y0 = np.minimum(np.int32(v), grid.shape[0] - 2)
    x0 = np.int32(np.floor(u)) % grid.shape[1]
    x1 = (x0 + 1) % grid.shape[1]
    fv, fu = (v - y0)[..., None], (u - np.floor(u))[..., None]
    return ((1 - fv) * ((1 - fu) * grid[y0, x0] + fu * grid[y0, x1])
            + fv * ((1 - fu) * grid[y0 + 1, x0] + fu * grid[y0 + 1, x1]))


def surface_buffers(shell, scale=1, inward=0):
    nr, nc = (max(20, round(185 * scale)), max(36, round(256 * scale)))
    row, col = np.meshgrid(np.linspace(0, 1, nr), np.linspace(0, 1, nc + 1), indexing='ij')
    p = lattice(shell, row * (shell.shape[0] - 1), col * shell.shape[1])
    n = lattice(grid_normals(shell), row * (shell.shape[0] - 1), col * shell.shape[1])
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-9)
    p -= n * inward
    uv = np.stack([col, row], axis=-1)
    base = np.arange(nr * (nc + 1), dtype=np.uint32).reshape(nr, nc + 1)
    faces = np.stack([np.stack([base[:-1, :-1], base[1:, :-1], base[:-1, 1:]], axis=-1),
                      np.stack([base[:-1, 1:], base[1:, :-1], base[1:, 1:]], axis=-1)], axis=-2).reshape(-1, 3)
    # Seal the subtly irregular scan trim. Capture cameras never observed the
    # underside, so cap UVs remain in the last row of the captured garment.
    poles = np.stack([p[0, :-1].mean(axis=0), p[-1, :-1].mean(axis=0)])
    top_idx, bottom_idx = p.shape[0] * p.shape[1], p.shape[0] * p.shape[1] + 1
    top_faces = np.stack([np.full(nc, top_idx), base[0, :-1], base[0, 1:]], axis=-1)
    bottom_faces = np.stack([np.full(nc, bottom_idx), base[-1, 1:], base[-1, :-1]], axis=-1)
    return (np.vstack([p.reshape(-1, 3), poles]).astype('<f4'),
            np.vstack([n.reshape(-1, 3), [[0, 1, 0], [0, -1, 0]]]).astype('<f4'),
            np.vstack([uv.reshape(-1, 2), [[0.5, 0], [0.5, 1]]]).astype('<f4'),
            np.vstack([faces, top_faces, bottom_faces]).astype('<u2'))


def make_atlas(shell, param, mattes, photos, width):
    height = width // 2
    output = np.empty((height, width, 3), dtype='uint8')
    normals = grid_normals(shell)
    uu = ((np.arange(width) + 0.5) * shell.shape[1] / width)[None, :]
    for start in range(0, height, 32):
        stop = min(height, start + 32)
        vv = ((np.arange(start, stop) + 0.5) * (shell.shape[0] - 1) / height)[:, None]
        pos = lattice(shell, vv, uu).reshape(-1, 3)
        attributes = lattice(param, vv, uu).reshape(-1, 3)
        normal = lattice(normals, vv, uu).reshape(-1, 3)
        output[start:stop] = colour_points(pos, attributes, normal, *mattes, photos).reshape(stop - start, width, 3)
    return Image.fromarray(output)


def write_surface(path, shell, texture=None):
    positions, normals, uv, faces = surface_buffers(shell, scale=1 if texture else 0.43, inward=0 if texture else 0.016)
    blob = bytearray()
    views, accessors = [], []

    def append(data, target=None):
        blob.extend(b'\0' * (-len(blob) % 4))
        offset = len(blob)
        blob.extend(data)
        desc = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        if target:
            desc['target'] = target
        views.append(desc)
        return len(views) - 1

    def accessor(data, kind, component, target, bounds=False):
        entry = {'bufferView': append(data.tobytes(), target), 'count': len(data), 'type': kind, 'componentType': component}
        if bounds:
            entry.update(min=data.min(axis=0).tolist(), max=data.max(axis=0).tolist())
        accessors.append(entry)
        return len(accessors) - 1

    attrs = {'POSITION': accessor(positions, 'VEC3', 5126, 34962, True)}
    if texture:
        attrs['NORMAL'] = accessor(normals, 'VEC3', 5126, 34962)
        attrs['TEXCOORD_0'] = accessor(uv, 'VEC2', 5126, 34962)
    prim = {'attributes': attrs, 'indices': accessor(faces.flatten(), 'SCALAR', 5123, 34963)}
    gltf = {'asset': {'version': '2.0', 'generator': 'AICANFEEL registered optical surface'}, 'scene': 0,
            'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}], 'meshes': [{'name': 'Optical surface' if texture else 'Occlusion hull', 'primitives': [prim]}],
            'bufferViews': views, 'accessors': accessors}
    if texture:
        image = io.BytesIO()
        texture.save(image, format='JPEG', quality=94, subsampling=0, optimize=True)
        image_id = append(image.getvalue())
        prim['material'] = 0
        gltf.update(extensionsUsed=['KHR_materials_unlit'], images=[{'bufferView': image_id, 'mimeType': 'image/jpeg'}],
                    samplers=[{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 33071}],
                    textures=[{'sampler': 0, 'source': 0}], materials=[{
                        'name': 'Captured radiance', 'extensions': {'KHR_materials_unlit': {}},
                        'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1}}])
    blob.extend(b'\0' * (-len(blob) % 4))
    gltf['buffers'] = [{'byteLength': len(blob)}]
    encoded = json.dumps(gltf, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    with path.open('wb') as stream:
        stream.write(struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(blob)))
        stream.write(struct.pack('<I4s', len(encoded), b'JSON') + encoded)
        stream.write(struct.pack('<I4s', len(blob), b'BIN\0') + blob)


def preview(path, pos, rgb, normals=None):
    frames = []
    for yaw in [0, -35, -75, -110, 180, 55]:
        angle = np.deg2rad(yaw)
        xp = pos[:, 0] * np.cos(angle) + pos[:, 2] * np.sin(angle)
        zp = -pos[:, 0] * np.sin(angle) + pos[:, 2] * np.cos(angle)
        pitch = np.deg2rad(4)
        yp = pos[:, 1] * np.cos(pitch) - zp * np.sin(pitch)
        zz = pos[:, 1] * np.sin(pitch) + zp * np.cos(pitch)
        img = np.full((425, 400, 3), [27, 28, 30], dtype=np.uint8)
        coords = np.int32(np.round(np.stack([(200 + xp * 165) * 4, (206 - yp * 165) * 4], axis=1)))
        visible = np.ones(len(pos), dtype=bool) if normals is None else (normals[:, 0] * -np.sin(angle) + normals[:, 2] * np.cos(angle)) * np.cos(pitch) + normals[:, 1] * np.sin(pitch) > -0.08
        for i in np.flatnonzero(visible)[np.argsort(zz[visible])]:
            cv2.circle(img, tuple(coords[i]), 5, tuple(map(int, rgb[i])), -1, cv2.LINE_AA, 2)
        cv2.putText(img, f'{yaw:+d} deg', (12, 408), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (183, 192, 199), 1, cv2.LINE_AA)
        frames.append(img)
    Image.fromarray(np.vstack([np.hstack(frames[:3]), np.hstack(frames[3:])])).save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--landmarker', type=Path, help='Optional MediaPipe recalibration model')
    parser.add_argument('--capture', type=Path, default=ROOT / 'public' / 'capture')
    parser.add_argument('--output', type=Path, default=ROOT / 'public' / 'subject' / 'optical-cloud.ply')
    parser.add_argument('--preview', type=Path)
    parser.add_argument('--ortho-views', type=Path, help='Prepared view-samples directory containing front-NNN.webp and side-NNN.webp')
    parser.add_argument('--hero-views', type=Path, help='Prepared finalframes directory containing original RGBA hero NNN.png')
    parser.add_argument('--donor-archive', type=Path, default=ROOT / 'tools' / 'optical-cloud-donors.zip',
                        help='Source-only selected optical mattes (used when a frame-cache path is omitted)')
    parser.add_argument('--atlas-width', type=int, default=3072, help='Cylindrical albedo texture width; 0 skips textured surface')
    parser.add_argument('--count', type=int, default=98304)
    args = parser.parse_args()
    cv2.setNumThreads(2)
    main_matte, front, side, top = [Matte(args.capture / (name + '.webp')) for name in ['front-calibration', 'front', 'side', 'top']]
    if args.landmarker is None and not args.donor_archive.is_file():
        parser.error('A donor archive containing frontal landmarks or an explicit --landmarker model is required')
    xyz = measured_landmarks(main_matte, args.landmarker, args.donor_archive)
    depth, influence = facial_depth(main_matte, side, xyz)
    shape_views, views = capture_views(args.ortho_views, args.hero_views, args.donor_archive)
    shell, surface_tags = build_shell(main_matte, front, side, top, depth, influence, shape_views)
    shell = stereo_front(shell, surface_tags, main_matte, views)
    photos = views + [view.mirror() for view in views if 0.4 < view.theta < np.deg2rad(172)]
    pos, tags, normals = scatter(shell, surface_tags, args.count, np.random.default_rng(21803))
    mattes = [main_matte, front, side, top]
    rgb = colour_points(pos, tags, normals, *mattes, photos)
    write_ply(args.output, pos, rgb)
    write_surface(args.output.with_suffix('.occluder.glb'), shell)
    if args.preview:
        preview(args.preview, pos, rgb, normals)
    if args.atlas_width:
        texture = make_atlas(shell, surface_tags, mattes, photos, args.atlas_width)
        write_surface(args.output.with_suffix('.surface.glb'), shell, texture)
    print(f'{len(pos):,} optical returns; bounds {pos.min(axis=0).round(3)} to {pos.max(axis=0).round(3)}; {args.output}')


if __name__ == '__main__':
    main()
