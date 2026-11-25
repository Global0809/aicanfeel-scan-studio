import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

async function readGLB(file) {
  const bytes=await file.arrayBuffer();
  const header=new DataView(bytes);
  if(bytes.byteLength<24 || header.getUint32(0,true)!==0x46546c67 ||
      header.getUint32(4,true)!==2 || header.getUint32(12,true)>bytes.byteLength-20 ||
      header.getUint32(16,true)!==0x4e4f534a) throw new Error("Choose a glTF 2.0 binary model (.glb).");
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,header.getUint32(12,true))).trim());
  for(const resource of [...(json.buffers??[]),...(json.images??[])]) {
    if(resource.uri && !/^data:/i.test(resource.uri)) throw new Error("Export the GLB with textures and buffers embedded.");
  }
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{
    if(!/^(blob:|data:)/i.test(url)) throw new Error("External model resources are unavailable.");
    return url;
  });
  const loader=new GLTFLoader(manager);
  const extensions=Array.isArray(json.extensionsUsed)?json.extensionsUsed:[];
  let draco;
  try {
    if(extensions.includes("KHR_draco_mesh_compression")) {
      const { DRACOLoader, DRACO_GLTF_CONFIG }=await import("three/addons/loaders/DRACOLoader.js");
      draco=new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG).setWorkerLimit(2);
      loader.setDRACOLoader(draco);
    }
    if(extensions.includes("EXT_meshopt_compression")) {
      const { MeshoptDecoder }=await import("three/addons/libs/meshopt_decoder.module.js");
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    return await loader.parseAsync(bytes,"");
  } finally {
    draco?.dispose();
  }
}
function calibrationTexture() {
  const canvas=document.createElement("canvas");canvas.width=canvas.height=512;
  const ctx=canvas.getContext("2d");
  const palette=["#187b85","#22314c","#366c8b","#ab5e50","#827dcc","#276163","#214d65","#ba8977"];
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) {
    ctx.fillStyle=palette[(x+3*y)%palette.length];ctx.fillRect(x*64,y*64,64,64);
    ctx.strokeStyle="rgba(219,255,246,.62)";ctx.strokeRect(x*64+.5,y*64+.5,63,63);
    ctx.fillStyle="#ebfff6";ctx.font="12px monospace";ctx.fillText(String(y*8+x+1).padStart(2,"0"),x*64+7,y*64+16);
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export async function makeImportedModel(file) {
  const result=await readGLB(file);
  const root=result.scene;
  const meshes=new Map(),resources=new Set();
  const group=new THREE.Group();
  let mode="", triangles=0, vertices=0, scans=0;
  const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  const extent=Math.max(size.x,size.y,size.z);
  const mixer=result.animations.length ? new THREE.AnimationMixer(root) : null;
  if(mixer) mixer.clipAction(result.animations[0]).play();

  function discard() {
    group.removeFromParent();
    mixer?.stopAllAction();mixer?.uncacheRoot(root);
    for(const resource of resources) resource.dispose();
  }
  root.traverse(object=>{
    if(!object.isMesh && !object.isPoints && !object.isLine) return;
    const position=object.geometry.attributes.position;
    if(!position) return;
    if(object.isMesh) {
      const copies=object.isInstancedMesh?object.count:1;
      triangles+=(object.geometry.index?.count??position.count)/3*copies;
    }
    vertices+=position.count;
    meshes.set(object,object.material);
    resources.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]) {
      resources.add(material);
      for(const value of Object.values(material)) if(value?.isTexture) resources.add(value);
    }
  });
  if(!meshes.size || !Number.isFinite(extent) || extent<=0 ||  triangles>2500000 || vertices>2500000) {
    discard();
    throw new Error("The model needs visible geometry and at most 2.5 million triangles.");
  }
  const holder=new THREE.Group(), scale=2.09/extent;
  holder.scale.setScalar(scale);
  holder.position.set(-center.x*scale,-1.095-box.min.y*scale,-center.z*scale);
  holder.add(root);group.add(holder);
  root.updateWorldMatrix(true,true);
  const uv=calibrationTexture();
  const variants={
    uv: new THREE.MeshBasicMaterial({map:uv,side:THREE.DoubleSide}),
    alloy: new THREE.MeshPhysicalMaterial({color:0xaec8d8,metalness:.96,roughness:.22,clearcoat:1,side:THREE.DoubleSide}),
    clay: new THREE.MeshStandardMaterial({color:0xbc7e61,roughness:.78,side:THREE.DoubleSide}),
    topology: new THREE.MeshBasicMaterial({wireframe:true,color:0x75f7dc,side:THREE.DoubleSide}),
    capture: new THREE.MeshNormalMaterial({side:THREE.DoubleSide}),
  };
  for(const material of Object.values(variants)) resources.add(material);
  resources.add(uv);
  const pointMaterial=new THREE.PointsMaterial({size:.010,color:0x8bf5df,sizeAttenuation:true});
  resources.add(pointMaterial);
  const skip=Math.max(1,Math.ceil(vertices/150000));
  const buffer=[], position=new THREE.Vector3();
  for(const [object] of meshes){
    const attribute=object.geometry.attributes.position;
    // Sample transformed vertices in the normalized stage coordinates.
    for(let i=0;i<attribute.count;i+=skip) {
      position.fromBufferAttribute(attribute,i).applyMatrix4(object.matrixWorld);
      buffer.push(position.x,position.y,position.z);
    }
  }
  const pointGeometry=new THREE.BufferGeometry();
  pointGeometry.setAttribute("position",new THREE.Float32BufferAttribute(buffer,3));
  resources.add(pointGeometry);
  const points=new THREE.Points(pointGeometry,pointMaterial);
  group.add(points);points.visible=false;scans=pointGeometry.attributes.position.count;

  return {
    group,stats:{vertices,triangles:Math.round(triangles),points:scans,animations:result.animations.length},
    draw(look,time,power) {
      if(mode!==look) {
        const raw=look==="points";
        holder.visible=!raw;points.visible=raw;
        for(const [object,material] of meshes) {
          if(object.isMesh) object.material=variants[look]??material;
        }
        mode=look;
      }
      if(mixer) mixer.setTime(time);
      pointMaterial.size=.007+.009*power;
    },
    dispose:discard,
  };
}
