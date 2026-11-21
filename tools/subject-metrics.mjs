import fs from "node:fs";
const assetDir=new URL("../public/subject/",import.meta.url);
const glb=fs.readFileSync(new URL("performer.glb",assetDir));
const data=JSON.parse(glb.toString("utf8",20,20+glb.readUInt32LE(12)));
let vertices=0,triangles=0;
for(const mesh of data.meshes)for(const p of mesh.primitives) {
  vertices+=data.accessors[p.attributes.POSITION].count;
  triangles+=(data.accessors[p.indices??p.attributes.POSITION].count)/3;
}
const ply=fs.readFileSync(new URL("optical-cloud.ply",assetDir));
const points=Number(ply.toString("ascii",0,512).match(/element vertex (\d+)/)[1]);
fs.writeFileSync(new URL("../src/subject-metrics.json",import.meta.url),JSON.stringify({vertices,triangles,points},null,2)+"\n");

