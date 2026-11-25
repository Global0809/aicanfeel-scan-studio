import * as THREE from "three";
import { createSubject } from "./subject/index.js";
import { createOpticalCloud } from "./cloud.js";
import { captureAtmosphere, studioEnvironment } from "./light-field.js";
import { createScanClock, makeInspectionMaterials, makeScanAnnotations, REVOLUTION_SECONDS } from "./scan-shaders.js";
import { createSurveyInstruments } from "./subject/instruments.js";

function makeRig() {
  const vertices = [];
  const add = (a,b) => vertices.push(a.x,a.y,a.z,b.x,b.y,b.z);
  const origin = new THREE.Vector3();
  const up = new THREE.Vector3(0,1,0);
  const focus = new THREE.Vector3(0,.14,0);
  const right = new THREE.Vector3(), vertical = new THREE.Vector3(), direction = new THREE.Vector3();
  for (let ring=0;ring<3;ring++) {
    for (let i=0;i<16;i++) {
      const theta=(i+.32*ring)*Math.PI/8;
      if (Math.cos(theta)>.18) continue;
      origin.set(Math.sin(theta)*(2.8+ring*.23),-.40+ring*.63,Math.cos(theta)*(2.8+ring*.23));
      direction.copy(focus).sub(origin).normalize();
      right.crossVectors(direction,up).normalize();
      vertical.crossVectors(right,direction).normalize();
      const center=origin.clone().addScaledVector(direction,.24);
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>center.clone().addScaledVector(right,x*.115).addScaledVector(vertical,y*.075));
      for (let p=0;p<4;p++) { add(corners[p],corners[(p+1)%4]);add(origin,corners[p]); }
      const hump=center.clone().addScaledVector(vertical,.113);
      add(corners[2],hump);add(corners[3],hump);
      if (i%4===0) add(center,focus.clone().addScaledVector(direction,-.50));
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  return new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x9c9e9e,transparent:true,opacity:.17,depthWrite:false}));
}

function isSoftwareRenderer(gl) {
  const extension=gl.getExtension("WEBGL_debug_renderer_info");
  const name=gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL??gl.RENDERER)||"";
  return /swiftshader|llvmpipe|softpipe|lavapipe|swrast|software (?:rasterizer|renderer|adapter)|microsoft basic (?:render|display)|gdi generic|\bwarp\b/i.test(name);
}

function groundSurvey() {
  const group=new THREE.Group(),segments=[],colors=[];
  const origin=new THREE.Vector3(),end=new THREE.Vector3();
  const quiet=new THREE.Color(0x617c7b),key=new THREE.Color(0x93a59d);
  const marker=(angle,r,target)=>target.set(Math.sin(angle)*r,-1.104,Math.cos(angle)*r);
  const add=(a,b,color)=>{segments.push(...a.toArray(),...b.toArray());colors.push(...color.toArray(),...color.toArray());};
  for(let i=0;i<180;i++){
    const angle=i*Math.PI/90,major=i%15===0,semi=i%5===0;
    marker(angle,1.55,origin);marker(angle,1.55+(major?.081:semi?.047:.019),end);
    add(origin,end,major?key:quiet);
    if(i%5!==4){marker(angle,1.531,origin);marker(angle+Math.PI/90,1.531,end);add(origin,end,quiet);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(segments,3));
  geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  const ink=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.45,depthWrite:false});
  group.add(new THREE.LineSegments(geometry,ink));
  const plate=new THREE.PlaneGeometry(3.8,3.0);
  const shadow=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    vertexShader:`varying vec2 screenUv;void main(){screenUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 screenUv;void main(){float r=length((screenUv-.5)*vec2(2.46,3.1));
      gl_FragColor=vec4(.012,.020,.024,.47*(1.-smoothstep(.10,1.,r)));}`
  });
  const footprint=new THREE.Mesh(plate,shadow);
  footprint.rotation.x=-Math.PI/2;footprint.position.y=-1.109;footprint.renderOrder=1;
  group.add(footprint);
  return {group,dispose(){geometry.dispose();ink.dispose();plate.dispose();shadow.dispose();group.removeFromParent();}};
}

export async function createWorld(host, onContextLost, {allowSoftware=false, clearColor=0x101719}={}) {
  const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance",preserveDrawingBuffer:false});
  if(!allowSoftware&&isSoftwareRenderer(renderer.getContext())){
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
  renderer.setClearColor(clearColor,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.NoToneMapping;
  host.append(renderer.domElement);
  let dead=false;
  const scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x101719,.065);
  const atmosphere=captureAtmosphere(scene);
  const camera=new THREE.PerspectiveCamera(29.2,1,.05,80);
  const floor=new THREE.GridHelper(28,84,0x476569,0x2c4546);
  const calibrationFloor=groundSurvey();scene.add(calibrationFloor.group);
  floor.position.y=-1.115;
  floor.material.transparent=true;floor.material.opacity=.60;floor.material.depthWrite=false;
  scene.add(floor);
  const axesGeometry=new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-14,-1.11,0),new THREE.Vector3(14,-1.11,0),
    new THREE.Vector3(0,-1.11,-14),new THREE.Vector3(0,-1.11,14)
  ]);
  axesGeometry.setAttribute("color",new THREE.Float32BufferAttribute([.34,.10,.10,.34,.10,.10,.12,.29,.12,.12,.29,.12],3));
  const axes=new THREE.LineSegments(axesGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.41}));
  scene.add(axes);
  const rig=makeRig();scene.add(rig);
  scene.add(new THREE.HemisphereLight(0xedf2f4,0x66584e,1.12));
  const key=new THREE.DirectionalLight(0xffe6cc,2.08);key.position.set(-3.4,3.6,4.0);scene.add(key);
  const fill=new THREE.DirectionalLight(0xd7eef4,.69);fill.position.set(2.9,.8,2.6);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xb5c7e9,2.18);rim.position.set(1.8,2.6,-2.7);scene.add(rim);
  const edgeLight=new THREE.DirectionalLight(0x9de6d3,1.10);edgeLight.position.set(-2,.7,-1);scene.add(edgeLight);

  const scanClock=createScanClock();
  let subject,cloud;
  try { [subject,cloud]=await Promise.all([createSubject({generateSamples:false}),createOpticalCloud(scanClock).catch(()=>null)]); }
  catch(error) { renderer.dispose();renderer.domElement.remove();throw error; }
  scene.add(subject.group);
  if (cloud) scene.add(cloud.group);
  const environment=studioEnvironment(renderer);
  const inspection=makeInspectionMaterials(subject,environment.texture,scanClock);
  const annotations=makeScanAnnotations(subject,scanClock);
  const instruments=createSurveyInstruments(subject,scanClock);
  scene.add(annotations.group,instruments.group);
  let width=0,height=0,quality=1,lastMode="",lastLayers="",captureSize=null,activeAsset=null;
  const resize=()=>{
    const w=captureSize?.width??host.clientWidth,h=captureSize?.height??host.clientHeight;
    if (!w||!h) return;
    width=w;height=h;
    const nativeRatio=Math.min(window.devicePixelRatio||1,2,3000/w);
    renderer.setPixelRatio(captureSize?1:nativeRatio*quality);renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.updateProjectionMatrix();
  };
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  function cameraPose(yaw,pitch,zoom) {
    const distance=4.47/zoom;
    camera.position.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance+.045,Math.cos(yaw)*Math.cos(pitch)*distance);
    camera.lookAt(.12,.005,0);
  }
  cameraPose(0,.045,1);
  await renderer.compileAsync(scene,camera).catch(()=>{});
  function lose(event) {event.preventDefault();onContextLost?.();}
  renderer.domElement.addEventListener("webglcontextlost",lose);
  return {
    canvas:renderer.domElement,
    stats:{...subject.stats,points:cloud?.points??subject.stats.points},
    render({mode,angle,pitch,zoom,state,time=0,transitionProgress=1,imported=null}) {
      if (dead||!width) return;
      scanClock.uScanCycle.value=time/REVOLUTION_SECONDS;
      scanClock.uScanPower.value=state.landmarks?state.intensity/100:0;
      scanClock.uScanEntry.value=THREE.MathUtils.clamp(transitionProgress,0,1);
      const look=mode;
      cameraPose(angle,pitch,zoom);
      rig.rotation.y=angle;
      floor.visible=axes.visible=calibrationFloor.group.visible=state.grid;
      rig.visible=state.cameras;
      if(activeAsset!==imported) {
        activeAsset?.group.removeFromParent();
        activeAsset=imported;
        if(imported) scene.add(imported.group);
        scene.environment=imported?environment.texture:null;
      }
      annotations.group.visible=instruments.group.visible=!imported && state.annotations!==false;
      if(imported) {
        subject.group.visible=false;
        if(cloud) cloud.group.visible=false;
        imported.draw(mode,time,scanClock.uScanPower.value);
        atmosphere.update(0,renderer.domElement.height,state.points && state.atmosphere!==false);
        lastMode="";
        renderer.render(scene,camera);
        return;
      }
      if (lastMode!==mode) {
        const base=(look==="topology"||look==="clay")?"topology":look==="points"?"points":"surface";
        subject.setMode(base,true);
        for(const mesh of subject.originalMaterials.keys()){
          const alternate=inspection.for(mesh,look);
          if(alternate)mesh.material=alternate;
        }
        lastMode=mode;lastLayers="";
      }
      const raw=(mode==="points"||mode==="capture") && !!cloud;
      subject.group.visible=!raw;
      if(cloud) {cloud.group.visible=raw;if(raw)cloud.update(time,camera,renderer.domElement.height,state,mode==="capture");}
      annotations.update(look,state);
      camera.updateMatrixWorld();
      instruments.update(look,scanClock.uScanCycle.value,state,camera);
      const orbitalPhase=scanClock.uScanCycle.value*Math.PI*2;
      atmosphere.update(3.9*Math.sin(orbitalPhase)+.7*Math.sin(orbitalPhase*3),renderer.domElement.height,state.points && state.atmosphere!==false);
      const layers=[mode,state.surface,state.points,state.topology,state.hidden.has("locs"),state.hidden.has("eyes"),state.hidden.has("head"),state.density,state.intensity].join("/");
      if (layers!==lastLayers) {
        for(const o of subject.originalMaterials.keys()){
          const isEye=/eye|iris|cornea|sclera/i.test(o.name);
          const isHair=/hair|loc|groom/i.test(o.name);
          const isSkin=/face|skin|head/i.test(o.name) && !isHair;
          o.visible=state.surface && (!isEye||!state.hidden.has("eyes")) && (!isHair||!state.hidden.has("locs")) && (!isSkin||!state.hidden.has("head")) && (mode==="surface"||o.name!=="Brows");
          if(["alloy","uv","motion","topology","clay"].includes(mode)&&/hairline|fibers|veil|stubble/i.test(o.name))o.visible=false;
        }
        const cage=subject.group.getObjectByName("Retopology cage");
        if (cage) {
          cage.visible=mode==="topology"||state.topology;
          cage.material.color.set(mode==="topology"?0xabcebb:0xa7b0a8);
          cage.material.opacity=(mode==="topology"?.58:.28)+.40*state.intensity/100;
        }
        const returns=subject.group.getObjectByName("Scanner returns");
        if(returns)returns.visible=["surface","alloy","motion","uv"].includes(mode)&&state.points;
        const samples=subject.group.getObjectByName("Surface samples");
        if (samples) {
          samples.visible=state.points && mode==="points";
          samples.geometry.setDrawRange(0,Math.floor(subject.stats.points*(.2+.8*state.density/100)));
        }
        lastLayers=layers;
      }
      renderer.render(scene,camera);
    },
    setOutputSize(width,height) {
      captureSize=width&&height?{width,height}:null;
      resize();
    },
    setQuality(value) {value=Math.max(.5,Math.min(1,value));if (value!==quality) {quality=value;resize();}},
    diagnostics() {return {width:renderer.domElement.width,height:renderer.domElement.height,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,points:renderer.info.render.points,mode:lastMode,scanPower:scanClock.uScanPower.value,uvSeamEdges:annotations.seamEdges};},
    dispose() {
      dead=true;observer.disconnect();renderer.domElement.removeEventListener("webglcontextlost",lose);
      activeAsset?.group.removeFromParent();
      floor.geometry.dispose();floor.material.dispose();axes.geometry.dispose();axes.material.dispose();rig.geometry.dispose();rig.material.dispose();
      calibrationFloor.dispose();instruments.dispose();annotations.dispose();inspection.dispose();subject.dispose();cloud?.dispose();atmosphere.dispose();environment.dispose();renderer.dispose();renderer.domElement.remove();
    }
  };
}


