from groom import *
from strand_detail import natural_scalp, natural_texture, wisps
import groom

groom.rope_texture = natural_texture


def topology(artist, base_faces, gar, actual):
    segments = []
    # Preserve the sculpt's original facial edge flow. These are the quad cage lines.
    # The original quad boundaries are traced on the subdivided render surface.
    subpts, suv, subfaces = subdiv(v, uv, base_faces)
    tris = triangulate([[i for i, j in f] for f in subfaces])
    sn = normals(subpts, tris)
    elevated = subpts + sn * 0.010
    visited = set()
    n = 0
    for f in base_faces:
        k = len(f)
        patch = subfaces[n : n + k]
        n += k
        for j, q in enumerate(patch):
            source = f[j][0]
            target = f[(j + 1) % k][0]
            key = tuple(sorted((source, target)))
            if key in visited:
                continue
            visited.add(key)
            middle = q[1][0]
            segments.extend(
                (elevated[source], elevated[middle], elevated[middle], elevated[target])
            )
    segments.extend(gar[2].reshape(-1, 3))
    # Follow the same irregular ring vertices used by the visible groom rather than regenerating a lower-resolution guide.
    for j, rows in enumerate(actual):
        if j % 3 == 2:
            continue
        axis = rows.mean(axis=1, keepdims=True)
        rows = axis + (rows - axis) * 1.035
        for i in range(len(rows) - 1):
            for k in (0, 3, 6):
                segments.extend((rows[i, k], rows[i + 1, k]))
            if i % 7 == 0:
                for k in range(9):
                    segments.extend((rows[i, k], rows[i, k + 1]))
    from strand_detail import cap_position

    # The scalp cage follows the exposed knitted-undercoat surface between gathered locks.
    scalp_rows = np.array(
        [
            [cap_position(phi, t, 0.010)[0] for phi in np.linspace(-np.pi, np.pi, 57)]
            for t in np.linspace(0.025, 1.0, 15)
        ]
    )
    for z in range(len(scalp_rows)):
        for k in range(56):
            if z % 2 == 0:
                segments.extend((scalp_rows[z, k], scalp_rows[z, k + 1]))
            if k % 2 == 0 and z < 14:
                segments.extend((scalp_rows[z, k], scalp_rows[z + 1, k]))
    # Compact fixed-point line payload. Decodes identically on every browser.
    vals = np.asarray(unit(segments))
    packed = np.round(vals * 16000).astype("<i2")
    (output_dir / "cage.bin").write_bytes(packed.tobytes())


def makeall():
    from identity import warp_template
    from finish_detail import tuft_layer, collar

    v[:] = warp_template(v)
    eyes[:] = proxy(v, "eyes.mhclo")
    a, faces, face, gar = build()
    natural_scalp(a)
    ropes, actual = locs(a)
    wisps(a, ropes)
    tuft_layer(a)
    collar(a)
    a.finish(output_dir / "performer.glb")
    topology(a, faces, gar, actual)


if __name__ == "__main__":
    makeall()
