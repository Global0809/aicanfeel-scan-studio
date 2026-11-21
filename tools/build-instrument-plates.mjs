// Extract the analytical scope's section profiles and UV map from the delivered performer.
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const read = name => fs.readFileSync(path.join(root, "subject", name));
const save = (name, bytes) => fs.writeFileSync(path.join(root, "ui", name), bytes);
const ply = read("optical-cloud.ply");
const headerEnd = ply.indexOf(10, ply.indexOf("end_header")) + 1;
const count = (ply.length - headerEnd) / 15;
const positions = Array.from({length:count}, (_,i) => {
  const offset = headerEnd + i * 15;
  return [ply.readFloatLE(offset),ply.readFloatLE(offset+4),ply.readFloatLE(offset+8)];
});
const extrema = [0,1,2].map(axis => positions.reduce(([lo,hi], p) => [Math.min(lo,p[axis]),Math.max(hi,p[axis])],[Infinity,-Infinity]));
const middle = extrema.map(([lo,hi]) => (hi+lo)/2);
const scale = Math.max(...extrema.map(([lo,hi]) => hi-lo)) / 2;
const normalized = positions.map(p => p.map((v,axis) => (v-middle[axis])/scale));
const levels = 32, spokes = 64, samples = 2560;
const rings = Array.from({length:levels},()=>Array.from({length:spokes},()=>[]));
const yRange = extrema[1].map(v=>(v-middle[1])/scale);
const tau = Math.PI * 2;
for(const [x,y,z] of normalized) {
  const band = Math.min(levels-1,Math.floor((y-yRange[0])/(yRange[1]-yRange[0])*levels));
  const turn = (Math.atan2(z,x)/tau+1)%1;
  rings[band][Math.min(spokes-1,Math.floor(turn*spokes))].push(Math.hypot(x,z));
}
const bytes = Buffer.alloc(4 + samples * 6 + levels * spokes * 3);
bytes.writeUInt16LE(samples);bytes[2]=levels;bytes[3]=spokes;
let cursor=4;
const pack = n => Math.max(0,Math.min(255,Math.round(127.5+n*127.5)));
for(let i=0;i<samples;i++) {
  const index=Math.floor((i+.5)*count/samples), at=headerEnd+index*15;
  for(const n of normalized[index])bytes[cursor++]=pack(n);
  for(let ch=0;ch<3;ch++)bytes[cursor++]=ply[at+12+ch];
}
for(let band=0;band<levels;band++) {
  const r=rings[band].map(bin=>bin.length?bin.sort((a,b)=>a-b)[Math.floor(bin.length*.76)]:null);
  for(let s=0;s<spokes;s++){
    let radius=r[s];
    if(radius===null){
      let a=1,b=1;
      while(a<spokes&&r[(s-a+spokes)%spokes]===null)a++;
      while(b<spokes&&r[(s+b)%spokes]===null)b++;
      radius=((r[(s-a+spokes)%spokes]??0)*b+(r[(s+b)%spokes]??0)*a)/(a+b);
    }
    const ang=(s+.5)*tau/spokes;
    bytes[cursor++]=pack(radius*Math.cos(ang));
    bytes[cursor++]=pack(yRange[0]+(band+.5)/levels*(yRange[1]-yRange[0]));
    bytes[cursor++]=pack(radius*Math.sin(ang));
  }
}
save("section-samples.bin",bytes);

// Rasterise the authored face's complete UV wire and boundary edges.
const glb=read("performer.glb"), jsonLength=glb.readUInt32LE(12);
const gltf=JSON.parse(glb.subarray(20,20+jsonLength));
const binary=glb.subarray(20+jsonLength+8);
await MeshoptDecoder.ready;
function accessor(i) {
  const a=gltf.accessors[i], v=gltf.bufferViews[a.bufferView];
  const c=v.extensions.EXT_meshopt_compression, out=new Uint8Array(c.count*c.byteStride);
  MeshoptDecoder.decodeGltfBuffer(out,c.count,c.byteStride,binary.subarray(c.byteOffset,c.byteOffset+c.byteLength),c.mode,c.filter);
  return new Uint16Array(out.buffer,a.byteOffset??0,a.count*(a.type==="VEC2"?2:1));
}
const face=gltf.meshes.find(m=>m.name==="Face").primitives[0], uv=accessor(face.attributes.TEXCOORD_0), idx=accessor(face.indices);
const side=512, pixels=Buffer.alloc((side+1)*side);
const edges=new Map();
for(let i=0;i<idx.length;i+=3)for(let e=0;e<3;e++){
  const a=idx[i+e],b=idx[i+(e+1)%3],key=Math.min(a,b)*65536+Math.max(a,b);
  edges.set(key,(edges.get(key)??0)+1);
}
for(const [key,count] of edges){
  const a=Math.floor(key/65536)*2,b=(key%65536)*2;
  const x0=uv[a]/65535*(side-1),y0=(1-uv[a+1]/65535)*(side-1);
  const dx=(uv[b]-uv[a])/65535*(side-1),dy=(uv[a+1]-uv[b+1])/65535*(side-1);
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
  for(let i=0;i<=steps;i++){
    const at=Math.round(y0+dy*i/steps)*(side+1)+1+Math.round(x0+dx*i/steps);
    pixels[at]=Math.max(pixels[at],count===1?255:100);
  }
}
function chunk(type,data){
  const key=Buffer.from(type),part=Buffer.concat([key,data]);let crc=0xffffffff;
  for(const b of part){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const out=Buffer.alloc(part.length+8);out.writeUInt32BE(data.length);part.copy(out,4);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;
}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(side);ihdr.writeUInt32BE(side,4);ihdr[8]=8;ihdr[9]=0;
save("face-uv.png",Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",deflateSync(pixels)),chunk("IEND",Buffer.alloc(0))]));

