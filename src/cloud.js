import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { asset } from "./ui.js";
import { createScanClock, installScanLook, REVOLUTION_SECONDS, scanFields } from "./scan-shaders.js";

// The capture is already colored in camera space. Decode its source sRGB attributes once.
export async function createOpticalCloud(clock=createScanClock()) {
  const loader=new GLTFLoader();
  const [geometry,depthModel,surfaceModel]=await Promise.all([
    new PLYLoader().loadAsync(asset("subject/optical-cloud.ply")),
    loader.loadAsync(asset("subject/optical-cloud.occluder.glb")),
    loader.loadAsync(asset("subject/optical-cloud.surface.glb"))
  ]);
  const uniforms={...clock,
    focalPixels:{value:1600},radius:{value:.015},fraction:{value:1},solid:{value:0}
  };
  const material=new THREE.ShaderMaterial({
    vertexColors:true, uniforms, alphaToCoverage:true, depthWrite:true, transparent:false,
    vertexShader:[
      "uniform float focalPixels, radius, fraction;",
      scanFields,
      "varying vec3 vColor, vFields; varying vec2 vCrossing; varying float vId, vEntry, vWindow;",
      "void main(){",
      "vec4 v = modelViewMatrix * vec4(position, 1.0);",
      "vColor = color; vFields = sectionFields(position); vCrossing=crossingProjectors(position); vEntry = entryFront(position);",
      "vWindow=pow(0.5+0.5*cos(scanTau*(position.y*.8 + position.x*.27 - uScanCycle*2.0)),2.0);",
      "vId = fract(sin(dot(position,vec3(29.17,71.13,53.74)))*34567.81);",
      "gl_Position=projectionMatrix*v;",
      "float returnSize=0.83 + vId*0.38 + uScanPower*(0.15*vFields.x+0.34*step(0.965,vId)*vWindow + 0.22*vCrossing.x);",
      "gl_PointSize=clamp(radius * focalPixels / max(0.1,-v.z) * returnSize,1.1,27.0);",
      "if(vId>fraction)gl_Position=vec4(2.0,2.0,2.0,1.0);",
      "}"
    ].join("\n"),
    fragmentShader:[
      "uniform float uScanPower, solid; varying vec3 vColor, vFields; varying vec2 vCrossing; varying float vId, vEntry, vWindow;",
      "void main(){",
      "vec2 p=gl_PointCoord*2.0-1.0; float d=dot(p,p); if(d>1.0) discard;",
      "vec3 base=vColor*(0.73+0.18*(1.0-d));",
      "float selected=step(0.975,vId)*vWindow;",
      "vec3 projection=vec3(.15,.82,.67)*vFields.x*(.47+.53*vWindow)",
      "  +vec3(.80,.36,.105)*vFields.y*.69 + vec3(.21,.44,.76)*vFields.z*.49",
      "  +vec3(.44,1.0,.79)*vCrossing.x*.92 + vec3(.96,.53,.17)*vCrossing.y*.64;",
      "vec3 rgb=base + uScanPower*(projection*.77 + vec3(.51,.77,.68)*selected + vec3(.37,.70,.64)*vEntry);",
      "rgb=mix(rgb,base+projection*uScanPower*.68,solid*.48);",
      "gl_FragColor=vec4(rgb,1.0-smoothstep(0.69,1.0,d));",
      "#include <tonemapping_fragment>",
      "#include <colorspace_fragment>",
      "}"
    ].join("\n")
  });
  const points=new THREE.Points(geometry,material);
  points.name="Optical point returns";points.frustumCulled=false;
  const group=new THREE.Group();group.add(points,depthModel.scene,surfaceModel.scene);group.visible=false;
  const occlusion=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  depthModel.scene.traverse(obj=>{if(obj.isMesh){obj.material.dispose();obj.material=occlusion;obj.renderOrder=-2;}});
  const surfaceMaterials=[];
  surfaceModel.scene.traverse(obj=>{
    if(!obj.isMesh)return;
    const original=obj.material;
    const mat=installScanLook(new THREE.MeshBasicMaterial({map:original.map,color:0xf8faf8}),"capture",clock);
    const plate=installScanLook(new THREE.MeshBasicMaterial({
      map:original.map,color:0xf6f6f3,polygonOffset:true,polygonOffsetFactor:4,polygonOffsetUnits:6,
    }),"returns",clock);
    obj.material=mat;surfaceMaterials.push({obj,mat,plate});original.dispose();
  });
  return {
    group, points:geometry.attributes.position.count,
    update(time, camera, pixelHeight, state, solid=false) {
      uniforms.focalPixels.value=pixelHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5));
      uniforms.fraction.value=.18+.82*state.density/100;
      uniforms.radius.value=(solid?.0029:.0060)/Math.sqrt(uniforms.fraction.value);
      uniforms.uScanCycle.value=time/REVOLUTION_SECONDS;
      uniforms.uScanPower.value=state.landmarks?state.intensity/100:0;
      uniforms.solid.value=solid?1:0;
      points.visible=state.points;
      depthModel.scene.visible=!solid&&!state.surface;
      surfaceModel.scene.visible=state.surface;
      for(const {obj,mat,plate} of surfaceMaterials){
        obj.renderOrder=-1;
        obj.material=solid?mat:plate;
      }
    },
    dispose(){
      geometry.dispose();material.dispose();occlusion.dispose();
      for(const root of [depthModel.scene,surfaceModel.scene])root.traverse(o=>o.geometry?.dispose());
      for(const {mat,plate} of surfaceMaterials){mat.map?.dispose();mat.dispose();plate.dispose();}
      group.removeFromParent();
    }
  };
}

