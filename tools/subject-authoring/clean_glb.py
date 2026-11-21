"""Strip superseded look-dev resources and keep an interoperable JPG/PNG glTF."""

import argparse, io, json, struct
from pathlib import Path
from PIL import Image


def clean(source, destination):
    raw = source.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20 : 20 + size])
    old = raw[28 + size :]
    mats = sorted(
        {pr["material"] for mesh in doc["meshes"] for pr in mesh["primitives"]}
    )

    def textures(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.endswith("Texture") and isinstance(v, dict) and "index" in v:
                    yield v
                else:
                    yield from textures(v)
        elif isinstance(o, list):
            for v in o:
                yield from textures(v)

    mlist = [doc["materials"][i] for i in mats]
    tids = sorted({t["index"] for m in mlist for t in textures(m)})
    tlist = [doc["textures"][i] for i in tids]
    iids = sorted({t["source"] for t in tlist})
    ilist = [doc["images"][i] for i in iids]
    for mesh in doc["meshes"]:
        for pr in mesh["primitives"]:
            pr["material"] = mats.index(pr["material"])
    for m in mlist:
        for t in textures(m):
            t["index"] = tids.index(t["index"])
    for t in tlist:
        t["source"] = iids.index(t["source"])
    img_views = {i["bufferView"]: i for i in ilist}
    vids = sorted(set(img_views) | {a["bufferView"] for a in doc["accessors"]})
    views = []
    binary = bytearray()
    for ix in vids:
        view = doc["bufferViews"][ix].copy()
        b = view.get("byteOffset", 0)
        payload = old[b : b + view["byteLength"]]
        if ix in img_views:
            image = img_views[ix]
            if image["mimeType"] == "image/jpeg":
                im = Image.open(io.BytesIO(payload))
                out = io.BytesIO()
                im.save(out, format="JPEG", quality=91, optimize=True, subsampling=0)
                payload = out.getvalue()
        binary.extend(b"\x00" * (-len(binary) % 4))
        view["byteOffset"] = len(binary)
        view["byteLength"] = len(payload)
        binary.extend(payload)
        views.append(view)
    for img in ilist:
        img["bufferView"] = vids.index(img["bufferView"])
    for acc in doc["accessors"]:
        acc["bufferView"] = vids.index(acc["bufferView"])
    doc.update(materials=mlist, textures=tlist, images=ilist, bufferViews=views)
    binary.extend(b"\x00" * (-len(binary) % 4))
    doc["buffers"][0]["byteLength"] = len(binary)
    j = json.dumps(doc, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    size = 28 + len(j) + len(binary)
    destination.write_bytes(
        struct.pack("<4sII", b"glTF", 2, size)
        + struct.pack("<I4s", len(j), b"JSON")
        + j
        + struct.pack("<I4s", len(binary), b"BIN\x00")
        + binary
    )


if __name__ == "__main__":
    arg = argparse.ArgumentParser()
    arg.add_argument("input", type=Path)
    arg.add_argument("output", type=Path)
    args = arg.parse_args()
    clean(args.input, args.output)
