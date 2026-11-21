from base_mesh import *
import numpy as np, struct, json, io, cv2
from PIL import Image
from scipy.spatial import cKDTree
from scipy.interpolate import PchipInterpolator
from collections import defaultdict


class Asset:
    def __init__(self):
        self.offset = bytearray()
        self.views = []
        self.accessors = []
        self.mats = []
        self.tex = []
        self.images = []
        self.mesh = []
        self.nodes = []

    def buffer(self, data, target=None):
        self.offset.extend(bytes((-len(self.offset)) % 4))
        d = dict(buffer=0, byteOffset=len(self.offset), byteLength=len(data))
        self.offset.extend(data)
        if target is not None:
            d["target"] = target
        self.views.append(d)
        return len(self.views) - 1

    def acc(self, data, kind, ctype, indices=False):
        dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2", 5121: "u1"}[ctype]
        a = np.array(data, dtype=dtype)
        b = self.buffer(a.tobytes(), 34963 if indices else 34962)
        d = dict(bufferView=b, componentType=ctype, count=len(a), type=kind)
        if kind == "VEC3" and ctype == 5126:
            d.update(min=a.min(0).tolist(), max=a.max(0).tolist())
        if ctype == 5121 and not indices:
            d["normalized"] = True
        self.accessors.append(d)
        return len(self.accessors) - 1

    def texture(self, image, fmt):
        buf = io.BytesIO()
        image.save(
            buf,
            format=fmt,
            **(
                {"quality": 94, "optimize": True, "subsampling": 0}
                if fmt == "JPEG"
                else {"optimize": True}
            ),
        )
        i = len(self.images)
        self.images.append(
            dict(
                bufferView=self.buffer(buf.getvalue()),
                mimeType="image/jpeg" if fmt == "JPEG" else "image/png",
            )
        )
        self.tex.append(dict(source=i, sampler=0))
        return i

    def material(
        self, name, color, rough, tex=None, metal=0, alpha=False, double=False
    ):
        pbr = dict(
            baseColorFactor=[*color, 1.0], metallicFactor=metal, roughnessFactor=rough
        )
        if tex is not None:
            pbr["baseColorTexture"] = dict(index=tex)
        m = dict(name=name, pbrMetallicRoughness=pbr)
        if alpha:
            m.update(alphaMode="MASK", alphaCutoff=0.30)
        if double:
            m["doubleSided"] = True
        self.mats.append(m)
        return len(self.mats) - 1

    def add(self, name, coords, tri, mat, uvs=None, colors=None, norm=None):
        pts = np.asarray(coords)
        tri = np.asarray(tri)
        norm = normals(pts, tri) if norm is None else norm
        a = {
            "POSITION": self.acc(unit(pts), "VEC3", 5126),
            "NORMAL": self.acc(norm, "VEC3", 5126),
        }
        if uvs is not None:
            a["TEXCOORD_0"] = self.acc(uvs, "VEC2", 5126)
        if colors is not None:
            a["COLOR_0"] = self.acc(
                np.clip(np.asarray(colors) * 255 + 0.5, 0, 255), "VEC3", 5121
            )
        idx = self.acc(tri.ravel(), "SCALAR", 5123 if len(pts) < 65536 else 5125, True)
        self.mesh.append(
            {
                "name": name,
                "primitives": [{"attributes": a, "indices": idx, "material": mat}],
            }
        )
        self.nodes.append({"mesh": len(self.mesh) - 1, "name": name})

    def finish(self, path):
        self.offset.extend(bytes((-len(self.offset)) % 4))
        j = {
            "asset": {
                "version": "2.0",
                "generator": "AICANFEEL / digital double studio",
            },
            "scene": 0,
            "scenes": [{"nodes": list(range(len(self.nodes)))}],
            "nodes": self.nodes,
            "meshes": self.mesh,
            "materials": self.mats,
            "textures": self.tex,
            "images": self.images,
            "samplers": [
                dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)
            ],
            "accessors": self.accessors,
            "bufferViews": self.views,
            "buffers": [dict(byteLength=len(self.offset))],
        }
        j = json.dumps(j, separators=(",", ":")).encode()
        j += b" " * ((-len(j)) % 4)
        path.write_bytes(
            struct.pack("<4sII", b"glTF", 2, 28 + len(j) + len(self.offset))
            + struct.pack("<I4s", len(j), b"JSON")
            + j
            + struct.pack("<I4s", len(self.offset), b"BIN\x00")
            + self.offset
        )


def normalize(a):
    return a / np.maximum(np.linalg.norm(a, axis=-1, keepdims=True), 1.0e-10)


def unit(pts):
    return (np.asarray(pts) - [0, 8.07, 0.52]) * 0.50


def normals(pos, tri):
    normal = np.zeros_like(pos, dtype=np.float64)
    area = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]])
    for j in range(3):
        np.add.at(normal, tri[:, j], area)
    return normalize(normal)


def triangulate(faces):
    tri = []
    for f in faces:
        for j in range(1, len(f) - 1):
            tri.append((f[0], f[j], f[j + 1]))
    return np.array(tri)


def mesh_for_uv(pos, faces, uvs):
    ids = []
    uv = []
    tris = []
    lookup = {}
    for f in faces:
        face = []
        for vertex, texcoord in f:
            key = (int(vertex), int(texcoord))
            if key not in lookup:
                lookup[key] = len(ids)
                ids.append(vertex)
                u, t = uvs[texcoord]
                uv.append((u, 1 - t))
            face.append(lookup[key])
        tris.extend((face[0], face[k], face[k + 1]) for k in range(1, len(face) - 1))
    fi = triangulate([[i for i, k in f] for f in faces])
    normal = normals(pos, fi)
    return pos[ids], np.array(tris), np.array(uv), normal[ids]


def subdiv(pos, uvs, faces):
    # Catmull-Clark on the connected positional mesh, linear face-varying coordinates across UV seams.
    edges = {}
    adj = defaultdict(list)
    face_pts = []
    uv_pts = []
    cpos = []
    cuv = []
    newfaces = []
    uv_edges = {}
    for fid, f in enumerate(faces):
        vs = [q[0] for q in f]
        face_pts.append(np.mean(pos[vs], axis=0))
        uv_pts.append(np.mean(uvs[[q[1] for q in f]], axis=0))
        for j, v0 in enumerate(vs):
            v1 = vs[(j + 1) % len(vs)]
            t = tuple(sorted((v0, v1)))
            edges.setdefault(t, []).append(fid)
            adj[v0].append((fid, t))
    fp = np.array(face_pts)
    newp = pos.copy()
    center_offset = len(pos)
    edge_offset = len(pos) + len(fp)
    edge_ids = {}
    boundary_nbr = defaultdict(list)
    sums = defaultdict(lambda: np.zeros(3))
    for key, fids in edges.items():
        a, b = key
        mid = (pos[a] + pos[b]) * 0.5
        edge_ids[key] = edge_offset + len(cpos)
        if len(fids) == 2:
            cpos.append((pos[a] + pos[b] + fp[fids].sum(0)) * 0.25)
        else:
            cpos.append(mid)
            boundary_nbr[a].append(b)
            boundary_nbr[b].append(a)
        sums[a] += mid
        sums[b] += mid
    for a, neighbors in adj.items():
        n = len(neighbors)
        if a in boundary_nbr:
            newp[a] = pos[a] * 0.75 + np.mean(pos[boundary_nbr[a]], axis=0) * 0.25
        else:
            newp[a] = (
                fp[[i for i, j in neighbors]].mean(0)
                + 2 * sums[a] / n
                + (n - 3) * pos[a]
            ) / n
    for fid, f in enumerate(faces):
        ep = []
        for j, (a, u) in enumerate(f):
            b, w = f[(j + 1) % len(f)]
            k = tuple(sorted((u, w)))
            if k not in uv_edges:
                uv_edges[k] = len(uvs) + len(fp) + len(cuv)
                cuv.append((uvs[u] + uvs[w]) * 0.5)
            ep.append((edge_ids[tuple(sorted((a, b)))], uv_edges[k]))
        for j in range(len(f)):
            newfaces.append(
                [
                    f[j],
                    ep[j],
                    (center_offset + fid, len(uvs) + fid),
                    ep[(j - 1) % len(f)],
                ]
            )
    return np.vstack((newp, fp, cpos)), np.vstack((uvs, uv_pts, cuv)), newfaces


def face_material(artist, body_faces):
    im = np.asarray(
        Image.open(p / "young_darkskinned_male_diffuse.png").convert("RGB")
    ).copy()
    H, W = im.shape[:2]
    face_mask = np.zeros((H, W), np.uint8)
    for face in body_faces:
        coordinates = np.array(
            [[uv[j, 0] * W, (1 - uv[j, 1]) * H] for i, j in face]
        ).astype("int32")
        cv2.fillConvexPoly(face_mask, coordinates, 255)
    face_mask = cv2.dilate(face_mask, np.ones((27, 27), "uint8"))
    im[face_mask == 0] = [75, 47, 36]
    color = (
        Image.open(p / "optical-skin.jpg").convert("RGB")
        if (p / "optical-skin.jpg").exists()
        else Image.fromarray(im)
    )
    return artist.material(
        "Photographic skin", (0.94, 0.87, 0.84), 0.60, artist.texture(color, "JPEG")
    )


def gltf_layer(asset, name, pts, fac, uvs, mat, sub=False):
    if sub:
        pts, uvs, fac = subdiv(pts, uvs, fac)
    coords, tri, st, ns = mesh_for_uv(pts, fac, uvs)
    asset.add(name, coords, tri, mat, st, norm=ns)
    return (coords, tri)


def skin_eyes_brows(asset):
    faces = [
        f
        for f in body
        if min(v[i, 1] for i, k in f) > 6.38
        and (
            min(v[i, 1] for i, k in f) > 7.26 or max(abs(v[i, 0]) for i, k in f) < 1.25
        )
    ]
    skin = face_material(asset, faces)
    face = gltf_layer(asset, "Face", v, faces, uv, skin, sub=True)
    _, eyuv, eygroups = obj("eyes.obj")
    eye_faces = [f for fs in eygroups.values() for f in fs]
    eyetex = (
        Image.open(p / "eye.png")
        .convert("RGBA")
        .resize((512, 512), Image.Resampling.LANCZOS)
    )
    eyesmat = asset.material(
        "Brown irises",
        (0.53, 0.48, 0.43),
        0.34,
        asset.texture(eyetex, "PNG"),
        alpha=True,
    )
    from eyebake import capture_eyes

    capture_eyes(asset, eyes, eye_faces, eyuv)
    _, buv, bgroups = obj("eyebrow004.obj")
    bfaces = [f for fs in bgroups.values() for f in fs]
    bv = proxy(v, "eyebrow004.mhclo")
    btex = Image.open(p / "eyebrow004.png").convert("RGBA")
    bmat = asset.material(
        "Brow fibers",
        (0.63, 0.52, 0.43),
        0.85,
        asset.texture(btex, "PNG"),
        alpha=True,
        double=True,
    )
    if not (p / "optical-skin.jpg").exists():
        gltf_layer(asset, "Brows", bv, bfaces, buv, bmat)
    return faces, face


def build():
    from tailoring import fit_shirt

    asset = Asset()
    faces, face = skin_eyes_brows(asset)
    garment = fit_shirt(asset)
    return asset, faces, face, garment
