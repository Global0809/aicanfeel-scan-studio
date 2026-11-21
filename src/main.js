import "./studio.css";
import "./direction.css";
import "./workbench.css";
import { gsap } from "gsap";
import { asset, button, cameraNames, icon, makeLayout, option, properties, rows, selectedName, setTreeVisibility, treeHidden } from "./ui.js";
import { createFaceOverlay, createOrthos, sourceFrame, drawCameraGuides } from "./optical.js";
import { createTelemetry } from "./telemetry.js";
import { createPassStudy } from "./pass-study.js";
import inventory from "./subject-metrics.json";
import { TAU, PASS_SECONDS, ORBIT_SECONDS, LOOP_SECONDS, WIPE_SECONDS, ATLAS_PASSES, LOOKS, PASSES, wrap as wrapping, orbitAngle, orbitPitch, phaseIndex, phaseAt } from "./sequence.js";

const $ = id => document.getElementById(id);
const prefersCalm = matchMedia("(prefers-reduced-motion: reduce)");
const params = new URLSearchParams(location.search);
const captureMode = params.has("render");
const settings = () => ({
  grid:true,cameras:true,landmarks:true,surface:true,points:true,topology:false,reprojection:true,depth:false,
  intensity:62,density:83,selected:"head",hidden:new Set(["retopo"]),collapsed:new Set(["cameras"]),
  workspace:"Layout", tab:"render", tool:"select", sidebar:true, playing:!prefersCalm.matches && !captureMode,
  choice:"auto", speed:1, pinned:null, distribution:"auto", zoom:1, pitch:.045, yaw:0, panX:0, panY:0
});
let state = settings();
makeLayout(state);
const study=createPassStudy();
const clipNames={points:"Points",uv:"UV",alloy:"Alloy",motion:"Motion",topology:"Mesh",capture:"Capture",surface:"Surface"};
const clipStrip=$("sequence-clips");
clipStrip.innerHTML=PASSES.map((pass,i)=>'<button type="button" data-action="cue:'+i+'" style="--clip:'+LOOKS[pass].color+'" title="'+(i*PASS_SECONDS)+' s · '+LOOKS[pass].title+'" aria-label="Seek to '+LOOKS[pass].title+' at '+(i*PASS_SECONDS)+' seconds">'+clipNames[pass]+'</button>').join("");
$("sequence-ruler").innerHTML=PASSES.map((_,i)=>'<span>'+(i%2===0?String(i*PASS_SECONDS).padStart(2,"0"):"")+'</span>').join("");
const sequenceNeedle=$("sequence-needle");
let selectedClip=-1;
const app=$("workstation"), stage=$("stage"), video=$("optical-video"), optical=$("optical-stage"), mesh=$("mesh-stage");
const reduced=()=>prefersCalm.matches&&!state.playing;
const face=createFaceOverlay($("landmarks"));
const guideCanvas=document.createElement("canvas");$("world-background").append(guideCanvas);
let guideFrame=-1;
const orthos=createOrthos();
const telemetry=createTelemetry({traceCanvas:$("trace-graph"),distributionCanvas:$("distribution-graph")});
telemetry.attachClassification($("classification"));
const survey=$("survey-video");
survey.defaultMuted=true;survey.muted=true;
const mediaClips=[video,orthos.video,survey];
let cameraLoadTimer;
function openCameraFeeds(){
  clearTimeout(cameraLoadTimer);
  if(disposed)return;
  for(const clip of [orthos.video,survey])if(!clip.hasAttribute("src"))clip.src=clip.dataset.src;
  playMedia();
}
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let elapsed=0, previous=performance.now(), world=null, failedWorld=false, disposed=false;
let lastDom=-1,lastOrtho=-1,activePass="",activeChart="",lastBlend=-1,noticeTimer,liveFps=0,dprQuality=1;
let fpsFrames=0, fpsStart=previous, nextFrame=previous, running=null, meshLoading=null, wasHidden=false;
let lastMetrics, sceneStats=inventory, currentPopover="", popoverSource=null, modalSource=null, activePointer=null;
let useAlpha=false, videoKind="native", mediaError=false;
let lastMediaSync=-1;
let effective={mode:"surface", title:"Optical capture", mesh:false, blend:0};
const replay=$("viewport-replay"),replayWindow=$("replay-window");
const replayTile=$("replay-tile"),replayContext=replayTile.getContext("2d",{alpha:false});
let decodedFrame=null,lastTileTime=-1;
const phaseCanvas=$("phase-wipe"),phaseContext=phaseCanvas.getContext("2d");
const phaseExposure=$("phase-exposure");
const clockBar=$("pass-clock").firstElementChild;
let sequenceOffset=0,lastWipe="",atlasLoaded=false,replayFailed=false,replayReason="";
let modelStarted=false,timelineTouched=false,compactReplay=false;
const opening=$("opening-preview");
let openingReady=false,openingTimer;
function releaseOpening() {
  clearTimeout(openingTimer);
  openingReady=false;opening.hidden=true;
  if(opening.hasAttribute("src")){opening.pause();opening.removeAttribute("src");opening.load();}
}
function prepareOpening() {
  if(captureMode||prefersCalm.matches||params.has("lite"))return;
  openingTimer=setTimeout(()=>{
    if(disposed||modelStarted||failedWorld||timelineTouched||document.hidden||!state.playing)return;
    opening.defaultMuted=true;opening.muted=true;
    opening.src=asset("replay/opening-reel.mp4");
    opening.play().catch(()=>{});
  },180);
}
opening.addEventListener("loadeddata",()=>{
  if(disposed||modelStarted||timelineTouched||!opening.hasAttribute("src"))return;
  openingReady=true;elapsed=opening.currentTime;sequenceOffset=0;lastMediaSync=elapsed;activePass="";
  render(elapsed,true);openCameraFeeds();
});
opening.addEventListener("error",releaseOpening);
replay.defaultMuted=true;replay.muted=true;
const replayTime=t=>wrapping(t+state.yaw*ORBIT_SECONDS/TAU,ORBIT_SECONDS);
let nextReplayCheck=0,lastReplayTime=-1,lastReplayProgress=0;
function recoverBufferedReplay(now) {
  if(now<nextReplayCheck)return;
  nextReplayCheck=now+250;
  const time=replay.currentTime;
  if(!effective.replay||replay.paused||replay.seeking||Math.abs(time-lastReplayTime)>.008){
    lastReplayTime=time;lastReplayProgress=now;return;
  }
  // Some hardware decoders report underflow even with the entire turn buffered.
  if(now-lastReplayProgress<1600||replay.readyState<2||!Number.isFinite(replay.duration))return;
  const position=replayTime(elapsed);
  for(let i=0;i<replay.buffered.length;i++){
    if(replay.buffered.start(i)<=position&&position+.08<replay.buffered.end(i)){
      replay.currentTime=position;lastReplayProgress=now;return;
    }
  }
}
replay.addEventListener("loadeddata",()=>{
  if(disposed||!failedWorld)return;
  atlasLoaded=true;
  replayTile.width=replay.videoWidth/4;replayTile.height=replay.videoHeight/2;
  startModelSequence();
  activePass="";render(elapsed,true);playMedia();
  if(decodedFrame===null&&replay.requestVideoFrameCallback)decodedFrame=replay.requestVideoFrameCallback(onDecodedFrame);
});
replay.addEventListener("seeked",paintReplayTile);
replay.addEventListener("error",()=>{
  if(!replay.src)return;
  atlasLoaded=false;replayWindow.classList.remove("ready");activePass="";
  if(!compactReplay){compactReplay=true;replay.src=asset("replay/scan-atlas-compact.mp4");}
  else {replayFailed=true;openOpticalMedia();}
  render(elapsed,true);
});
let uhdUnavailable=false, projectedSource="", projectedPoster="";
video.defaultMuted=true;video.muted=true;video.playsInline=true;
function chooseOpticalResolution() {
  const width=stage.getBoundingClientRect().width*(window.devicePixelRatio||1);
  const useUhd=!uhdUnavailable&&!navigator.connection?.saveData&&width>=1650;
  const stem=useUhd?"optics/survey-uhd":"optics/survey";
  const url=asset(stem+".mp4");
  if(url===projectedSource)return;
  projectedSource=url;projectedPoster=asset(stem+".webp");
  if(captureMode||state.choice==="optical"&&!state.pinned||failedWorld&&replayFailed)openOpticalMedia();
}
function openOpticalMedia() {
  if(videoKind!=="native"||!projectedSource)return;
  video.poster=projectedPoster;
  if(video.getAttribute("src")!==projectedSource)video.src=projectedSource;
}
chooseOpticalResolution();
function playMedia() {
  if(opening.hasAttribute("src")){
    if(state.playing&&!document.hidden)opening.play().catch(()=>{});else opening.pause();
  }
  for (const clip of mediaClips) {
    if(!clip.hasAttribute("src"))continue;
    if (state.playing&&!document.hidden&&!captureMode&&!(clip===video&&(state.pinned||effective.mesh||effective.replay))) clip.play().catch(()=>{});
    else clip.pause();
  }
  if(effective.replay&&state.playing&&!document.hidden&&!captureMode)replay.play().catch(()=>{});
  else replay.pause();
}
// Four original camera sequences and six inspector turns close on the same movie frame.
const cameraRate=9.6/(LOOP_SECONDS/4);
function sourceAt(t) {return wrapping(t*cameraRate,9.6);}
const clipRate=clip=>clip===survey?3.8/ORBIT_SECONDS:cameraRate;
const clipTime=(clip,time)=>wrapping(time*clipRate(clip),clip.duration);
function pointVideoAt(t) {
  if(effective.replay && atlasLoaded && Math.abs(replay.currentTime-replayTime(t))>.025)replay.currentTime=replayTime(t);
  for(const clip of mediaClips) {
    if(!Number.isFinite(clip.duration)||clip.duration<=0)continue;
    const position=clipTime(clip,t);
    if(Math.abs(clip.currentTime-position)>.025)clip.currentTime=Math.min(position,clip.duration-.002);
  }
}
function startModelSequence() {
  if(!modelStarted&&!captureMode&&!timelineTouched&&state.choice==="auto"){
    elapsed=openingReady?opening.currentTime:0;sequenceOffset=0;lastMediaSync=elapsed;previous=nextFrame=performance.now();pointVideoAt(elapsed);
  }
  releaseOpening();
  modelStarted=true;openCameraFeeds();
}
for(const clip of mediaClips)clip.addEventListener("loadedmetadata",()=>{if(clip===video)mediaError=false;pointVideoAt(elapsed);clip.playbackRate=state.speed*clipRate(clip);playMedia();});
video.addEventListener("error",()=>{
  mediaError=true;
  if (videoKind==="alpha") { useAlpha=false; videoKind="native"; app.classList.remove("alpha-plate");video.poster=projectedPoster;video.src=projectedSource; }
  else if(projectedSource.endsWith("/survey-uhd.mp4")){uhdUnavailable=true;chooseOpticalResolution();}
});
video.addEventListener("playing",()=>{mediaError=false;});
playMedia();

function label(id,text) {const e=$(id);if(e&&e.textContent!==String(text)) e.textContent=text;}
function notice(message) {
  const n=$("viewport-callout");n.textContent=message;n.hidden=false;
  clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{n.hidden=true;},2100);
}
function updateStats() {
  if (!sceneStats) return;
  const short=n=>Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(n);
  label("v-vertices",short(sceneStats.vertices));label("v-triangles",short(sceneStats.triangles));
  label("prop-vertices",sceneStats.vertices.toLocaleString("en-US"));label("prop-triangles",sceneStats.triangles.toLocaleString("en-US"));
}
async function ensureWorld() {
  if(disposed||failedWorld)return;
  if(params.has("lite")){enableReplay("requested");return;}
  if (meshLoading) return meshLoading;
  meshLoading=import("./world.js").then(({createWorld})=>createWorld(mesh,()=>{
    const lost=world;
    world=null;
    enableReplay("lost-context");
    queueMicrotask(()=>lost?.dispose());
  },{allowSoftware:captureMode})).then(w=>{
    if (disposed||failedWorld) {w?.dispose();return;}
    if(!w){enableReplay("software-renderer");return;}
    world=w;failedWorld=false;sceneStats=w.stats;startModelSequence();updateStats();render(elapsed,true);
  }).catch(err=>{if(!disposed){enableReplay("unavailable");console.warn("3D preview unavailable. Using recorded turntables.",err);}});
  return meshLoading;
}
function enableReplay(reason) {
  if(disposed)return;
  failedWorld=true;replayReason=reason;activePass="";
  if(!replay.src && !replayFailed) {
    const physicalWidth=stage.clientWidth*(window.devicePixelRatio||1);
    const connection=navigator.connection;
    compactReplay=physicalWidth<1300||connection?.saveData||Boolean(connection?.downlink&&connection.downlink<6);
    replay.preload="auto";
    replay.src=asset(compactReplay?"replay/scan-atlas-compact.mp4":"replay/scan-atlas.mp4");
  }
  render(elapsed,true);
}
function choose(t) {
  let pass=state.pinned?"camera":state.choice==="auto"?phaseAt(t+sequenceOffset):state.choice;
  const needsModel=Boolean(LOOKS[pass]);
  const isMesh=!!world&&!failedWorld&&needsModel;
  const useReplay=failedWorld&&needsModel&&!replayFailed&&atlasLoaded;
  const useOpening=needsModel&&!isMesh&&!useReplay&&openingReady&&!timelineTouched&&state.choice==="auto";
  if(needsModel&&!isMesh&&!useReplay&&!useOpening)pass=failedWorld&&replayFailed?"optical":"preview";
  const mode=LOOKS[pass]?.mode??"surface";
  const title=pass==="camera"?cameraNames[state.pinned]:pass==="preview"?"Point cloud":LOOKS[pass]?.title??"Optical capture";
  return {pass,mode,title,mesh:isMesh,blend:isMesh?1:0,replay:useReplay,opening:useOpening};
}
function selectDistribution() { return state.distribution==="auto"?"histogram":state.distribution; }
function timecode(t) {
  const frame=Math.floor(wrapping(t,24*60*60)*60+1e-5);
  return [Math.floor(frame/216000),Math.floor(frame/3600)%60,Math.floor(frame/60)%60,frame%60].map(n=>String(n).padStart(2,"0")).join(":");
}
function showWorkspace(name) {
  for(const tab of document.querySelectorAll("#workspaces button")){
    const selected=tab.dataset.action==="workspace:"+name;
    tab.classList.toggle("active",selected);tab.setAttribute("aria-pressed",String(selected));
  }
}
function redrawControls() {
  const presentationPlaying=state.playing||captureMode;
  app.classList.toggle("paused",!presentationPlaying);
  app.classList.toggle("sidebar-hidden",!state.sidebar);
  app.classList.toggle("grid-off",!state.grid);
  app.classList.toggle("no-cameras",!state.cameras);
  app.classList.toggle("no-landmarks",!state.landmarks);
  app.classList.toggle("no-surface",!state.surface);
  stage.classList.toggle("grid-off",!state.grid);
  const play=$("play-button");
  play.innerHTML=icon(presentationPlaying?"player-pause":"player-play");
  const text=state.playing?"Pause playback":"Play sequence";
  play.setAttribute("aria-label",text);play.title=text+" (Space)";
  label("play-state",presentationPlaying?"Auto playback":"Paused");
  label("live-label",presentationPlaying?"Live":"Play");
  document.querySelectorAll("[data-layer]").forEach(e=>{e.checked=Boolean(state[e.dataset.layer]);});
  document.querySelectorAll("[data-param]").forEach(e=>{e.value=state[e.dataset.param];e.style.setProperty("--value",e.value+"%");e.nextElementSibling.value=e.value+"%";});
  showWorkspace(state.choice==="auto"&&LOOKS[effective.pass]?LOOKS[effective.pass].workspace:state.workspace);
  document.querySelectorAll("#tool-rail button").forEach(e=>e.classList.toggle("active",e.dataset.action==="tool:"+state.tool));
  const stageTransform="translate("+state.panX+"%, "+state.panY+"%)";
  optical.style.transform=stageTransform+" scale("+state.zoom+")";
  mesh.style.transform=stageTransform;
  replayWindow.style.transform=optical.style.transform;
}
function drawReplayTile(ctx,pass,width,height) {
  const tile=ATLAS_PASSES.indexOf(pass),w=replay.videoWidth/4,h=replay.videoHeight/2;
  if(tile>=0 && w && h)ctx.drawImage(replay,(tile%4)*w,Math.floor(tile/4)*h,w,h,0,0,width,height);
}
function paintReplayTile() {
  if(disposed||!effective.replay||replay.readyState<2)return;
  drawReplayTile(replayContext,effective.pass,replayTile.width,replayTile.height);
  lastTileTime=replay.currentTime;
}
function onDecodedFrame() {
  if(disposed)return;
  paintReplayTile();
  decodedFrame=replay.requestVideoFrameCallback(onDecodedFrame);
}
function phaseWipe(t,view,progress) {
  if(progress>=1 || (!view.mesh&&!view.replay) || prefersCalm.matches || (view.replay&&replay.readyState<2)){
    phaseCanvas.hidden=true;phaseExposure.hidden=true;lastWipe="";return;
  }
  const phaseTime=t+sequenceOffset,previousPass=phaseAt(phaseTime-PASS_SECONDS);
  const key=Math.floor(phaseTime/PASS_SECONDS)+"/"+sequenceOffset+"/"+view.replay;
  if(key!==lastWipe){
    lastWipe=key;
    const w=Math.min(1440,stage.clientWidth);
    phaseCanvas.width=Math.max(1,w);phaseCanvas.height=Math.max(1,Math.round(w*stage.clientHeight/stage.clientWidth));
    if(view.mesh){
      const boundary=t-wrapping(phaseTime,PASS_SECONDS);
      world.render({mode:previousPass,angle:orbitAngle(boundary)+state.yaw,pitch:state.pitch+orbitPitch(boundary),zoom:state.zoom,state,time:boundary,transitionProgress:1});
      phaseContext.drawImage(mesh.querySelector("canvas"),0,0,phaseCanvas.width,phaseCanvas.height);
    } else drawReplayTile(phaseContext,previousPass,phaseCanvas.width,phaseCanvas.height);
  }
  const edge=-9+118*progress;
  phaseExposure.hidden=false;
  phaseExposure.style.setProperty("--splice",edge+"%");
  phaseCanvas.hidden=false;
  phaseCanvas.style.maskImage="linear-gradient(116deg,transparent "+(edge-4)+"%,#000 "+(edge+3)+"%)";
  phaseCanvas.style.opacity=String(1-progress*.28);
  phaseCanvas.style.transform=view.mesh?mesh.style.transform:replayWindow.style.transform;
}
function render(t,force=false) {
  if (disposed) return;
  const view=choose(t);effective=view;
  opening.hidden=!view.opening;
  const playerTime=view.pass==="optical"&&video.readyState>=2&&!mediaError?video.currentTime:sourceAt(t);
  const isPinned=Boolean(state.pinned);
  const modeChanged=activePass!==view.pass || lastBlend!==view.blend;
  if (modeChanged||force) {
    if (modeChanged) {
      const wasMesh=lastBlend===1||replayWindow.classList.contains("ready");activePass=view.pass;lastBlend=view.blend;
      if(!captureMode && !view.mesh && !view.replay && wasMesh && Number.isFinite(video.duration))video.currentTime=sourceAt(t);
      if(!captureMode)playMedia();
      if(view.replay){
        paintReplayTile();
        if(!replayWindow.classList.contains("ready")&&Math.abs(replay.currentTime-replayTime(t))>.025)replay.currentTime=replayTime(t);
        replayWindow.classList.add("ready");
      }else{replayWindow.classList.remove("ready");replay.pause();}
      gsap.killTweensOf(mesh);
      if (captureMode||reduced()||force) gsap.set(mesh,{opacity:view.blend});
      else gsap.to(mesh,{opacity:view.blend,duration:.16,ease:"power1.inOut",overwrite:true});
    }
    label("pass-name",view.title);
    const look=LOOKS[view.pass],cycling=state.choice==="auto"&&Boolean(look);
    label("pass-workspace",look?.workspace??"");$("pass-clock").hidden=!cycling;
    stage.style.setProperty("--pass-color",look?.color??"#accac1");
    app.style.setProperty("--active-material",look?.color??"#aec4cb");
    for(const tile of document.querySelectorAll(".material-slots button"))tile.setAttribute("aria-pressed",String(tile.dataset.action==="mode:"+view.pass));
    if(cycling)showWorkspace(look.workspace);
    label("pipeline-status",isPinned?"Reference camera":view.mesh?"Geometry engine":view.replay?"Rendered turntable":view.opening||view.pass==="preview"?"Preparing scan":"Optical feed");
    label("perspective-title",isPinned?cameraNames[state.pinned]:"User Perspective");
    for (const b of document.querySelectorAll(".view-modes button")) b.classList.toggle("active",b.dataset.action==="mode:"+view.mode);
  }
  const slotTime=wrapping(t+sequenceOffset,PASS_SECONDS);
  const progress=state.choice==="auto"?Math.min(slotTime/WIPE_SECONDS,1):1;
  const yaw=orbitAngle(t)+state.yaw;
  const phase=wrapping(t+sequenceOffset,LOOP_SECONDS),automatic=state.choice==="auto"&&!isPinned;
  const slot=automatic?phaseIndex(phase):-1;
  if(slot!==selectedClip||force){
    if(selectedClip>=0)clipStrip.children[selectedClip].removeAttribute("aria-current");
    if(slot>=0)clipStrip.children[slot].setAttribute("aria-current","step");
    selectedClip=slot;
    label("pass-index",slot>=0?String(slot+1).padStart(2,"0")+" / "+PASSES.length:"INSPECT");
  }
  sequenceNeedle.hidden=!automatic;
  if(automatic)sequenceNeedle.style.transform="translateX("+phase/LOOP_SECONDS*100+"%)";
  study.update(t,view.pass,yaw,modeChanged);
  if(view.replay&&!replay.requestVideoFrameCallback&&lastTileTime!==replay.currentTime)paintReplayTile();
  phaseWipe(t,view,progress);
  if(state.choice==="auto")clockBar.style.transform="scaleX("+slotTime/PASS_SECONDS+")";
  if (view.mesh||(!captureMode&&parseFloat(mesh.style.opacity)>.01)) {
    world?.render({mode:view.mesh?view.pass:view.mode,angle:yaw,pitch:state.pitch+orbitPitch(t),zoom:state.zoom,state,time:t,transitionProgress:progress});
  }
  if (view.pass==="optical") {
    if(useAlpha&&(force||Math.abs(t-guideFrame)>.05)){drawCameraGuides(guideCanvas,playerTime,state.grid,state.cameras);guideFrame=t;}
    face.update({time:t,mediaTime:playerTime,enabled:state.landmarks&&state.surface,reprojection:state.reprojection,mode:view.mode,strength:state.intensity,density:state.density,depth:state.depth,showMesh:state.points||state.topology});
  } else face.clear();
  if (force||Math.abs(t-lastOrtho)>=1/30) {orthos.update(t,state,view.mode);lastOrtho=t;}
  const dist=selectDistribution(view.mode);
  if (dist!==activeChart) {
    activeChart=dist;label("distribution-name",dist==="donut"?"Point Classification":"Error Distribution");
    $("distribution-graph").setAttribute("aria-label",dist==="donut"?"Classification of measured points by residual":"Distribution of scan residuals");
  }
  lastMetrics=telemetry.update({sourceFrame:sourceFrame(playerTime),distribution:dist});
  if (force||Math.abs(t-lastDom)>.091||modeChanged) {
    const frame=Math.floor(sourceFrame(playerTime))+1;
    label("timecode",timecode(automatic?phase:t));label("v-frame",String(frame).padStart(3,"0")+" / 289");
    label("survey-angle",String(Math.floor(wrapping(t/ORBIT_SECONDS*360+16,360))).padStart(3,"0")+"°");
    const a=(Math.sin(t*3.1)*5.3).toFixed(2),b=(Math.cos(t*2.3+.4)*4.5).toFixed(2);
    $("ribbon-path").setAttribute("d","M1 9 Q16 "+(9-Number(a))+" 31 9 T67 8 Q50 "+(11+Number(b))+" 34 11 T1 9Z");
    const residual=Number.isFinite(lastMetrics.selectedPx)?lastMetrics.selectedPx.toFixed(2):"—";
    label("v-error",residual+" px");label("trace-stat",residual);
    label("prop-error",lastMetrics.meanPx.toFixed(2)+" px");label("prop-rotation",Math.round(wrapping(yaw,TAU)*180/Math.PI)+"°");
    label("perspective-object","("+frame+") Scan | "+selectedName(state.selected));
    document.querySelectorAll(".frame-number").forEach(e=>{e.textContent=frame;});
    lastDom=t;
  }
}
function loop(now) {
  running=null;if(disposed||document.hidden) return;
  if(now<nextFrame-.65){running=requestAnimationFrame(loop);return;}
  const interval=1000/60;
  nextFrame+=Math.max(1,Math.floor((now-nextFrame+.65)/interval)+1)*interval;
  const dt=Math.max(0,(now-previous)/1000);previous=now;
  if (state.playing) {elapsed=openingReady&&!timelineTouched?opening.currentTime:elapsed+dt*state.speed;render(elapsed);if(effective.replay)recoverBufferedReplay(now);}
  if(state.playing && elapsed-lastMediaSync>2.5) {
    lastMediaSync=elapsed;
    for(const clip of mediaClips){
      if(clip.paused||clip.readyState<3||!Number.isFinite(clip.duration))continue;
      const target=clipTime(clip,elapsed);
      if(Math.abs(clip.currentTime-target)>.20 && Math.abs(clip.currentTime-target)<clip.duration-.20)clip.currentTime=target;
    }
  }
  fpsFrames++;
  if (now-fpsStart>=1200) {liveFps=fpsFrames*1000/(now-fpsStart);fpsStart=now;fpsFrames=0;}
  if (state.playing) running=requestAnimationFrame(loop);
}
function queueLoop() {if(running===null&&!document.hidden&&state.playing){previous=nextFrame=performance.now();fpsStart=previous;fpsFrames=0;running=requestAnimationFrame(loop);}}
function setPlaying(on) {
  state.playing=on;previous=performance.now();for (const clip of mediaClips)clip.playbackRate=state.speed*clipRate(clip);playMedia();
  replay.playbackRate=state.speed;
  if (running!==null) cancelAnimationFrame(running);
  running=null;queueLoop();redrawControls();render(elapsed,true);
}
function setPass(choice,pin=null) {
  if(choice!=="auto"||pin){timelineTouched=true;releaseOpening();}
  if(LOOKS[choice]){state.workspace=LOOKS[choice].workspace;showWorkspace(state.workspace);}
  state.choice=choice;state.pinned=pin;
  if(choice==="optical"&&!pin)openOpticalMedia();
  const image=$("pinned-image");
  if (pin) {image.src=asset("capture/"+pin+".webp");image.alt=cameraNames[pin];image.style.display="block";video.style.visibility="hidden";}
  else {image.style.display="none";video.style.visibility="";pointVideoAt(elapsed);ensureWorld();}
  lastWipe="";playMedia();activePass="";render(elapsed,true);
}
const layerNodes={cameras:"cameras",points:"points",surface:"mesh",topology:"retopo",landmarks:"refs"};
function setLayer(key,value,syncTree=true) {
  state[key]=Boolean(value);
  if(syncTree && layerNodes[key]){
    setTreeVisibility(layerNodes[key],Boolean(value),state.hidden);
    if(key==="cameras"&&value)setTreeVisibility("camera",true,state.hidden);
    $("scene-tree").innerHTML=rows(state);
  }
  if (["cameras","grid"].includes(key)) {
    // Switch to a separated optical plate only when the user wants independent rig visibility.
    if (video.canPlayType("video/webm; codecs=vp9") && (!state.cameras||!state.grid)!==useAlpha) {
      useAlpha=!state.cameras||!state.grid;videoKind=useAlpha?"alpha":"native";
      app.classList.toggle("alpha-plate",useAlpha);
      video.src=useAlpha?asset("capture/optical-alpha.webm"):projectedSource;
      video.poster=useAlpha?asset("capture/optical-cutout.webp"):projectedPoster;playMedia();
    }
  }
  if (key==="surface") video.style.opacity=value?"1":".14";
  redrawControls();render(elapsed,true);
}
function setProperty(tab) {
  state.tab=tab;$("properties-content").innerHTML=properties(tab,state);
  telemetry.attachClassification($("classification"));
  document.querySelectorAll("#property-rail button").forEach(e=>e.classList.toggle("active",e.dataset.action==="prop:"+tab));
  redrawControls();updateStats();render(elapsed,true);
}
function reset() {
  const playing=state.playing;
  state=settings();state.playing=playing;
  $("scene-tree").innerHTML=rows(state);
  document.querySelectorAll(".inspector-scroll details").forEach(e=>{e.open=true;});
  label("active-tool-label","Select Box");
  document.querySelectorAll(".tool-options button").forEach((e,i)=>e.classList.toggle("active",i===0));
  selectionOp=0;clearDrawing();
  sequenceOffset=0;elapsed=0;setPass("auto");pointVideoAt(0);setLayer("grid",true);setLayer("surface",true);
  setPlaying(playing);updateStats();setProperty("render");notice("Session reset");
}
const modeEntries=()=>[
  ["mode:auto","Automatic scan passes","repeat","A"],["mode:optical","Optical capture","camera","O"],
  ["mode:surface","Textured digital double","circle-dot","1"],["mode:topology","Retopology","sphere","2"],["mode:points","Point cloud","grid-dots","3"],
  ["mode:uv","UV editing","grid-dots"],["mode:alloy","Iridescent alloy","aperture"],["mode:motion","Animation · motion field","view-360"],["mode:capture","Reconstructed surface","cube-3d-sphere"]
];
function menuEntries(name) {
  const menus={
    File:[["frame-export","Save viewport image","photo"],["info","Session information","file-3d"],["reset","Reopen session","refresh"]],
    Edit:[["reset-view","Reset viewport","focus-2"],["reset","Restore session defaults","refresh"]],
    Render:[...modeEntries(),["presentation","Presentation playback","player-play"],["frame-export","Save viewport image","photo"]],
    Window:[["fullscreen","Full screen","maximize","F"],["inspector","Viewport sidebar","adjustments-horizontal","N"]],
    Help:[["shortcuts","Playback shortcuts","mouse"],["info","About Scan Studio","file-3d"]],
    View:[["reset-view","Frame performer","focus-2"],["pin:front","Front orthographic","viewport-wide"],["pin:side","Left orthographic","viewport-wide"],["pin:top","Top orthographic","viewport-wide"],["mode:auto","User perspective","view-360"]],
    Select:[["node:head","Head","triangle-inverted"],["node:locs","Locs","triangle-inverted"],["node:eyes","Eyes","triangle-inverted"]],
    Object:[["mode:surface","Inspect surface","circle-dot"],["mode:topology","Show retopology","sphere"],["mode:points","Show cloud","grid-dots"]],
    Orientation:[["reset-view","Global orientation","axis-x"],["pin:front","Front orthographic","viewport-wide"],["pin:side","Left orthographic","viewport-wide"],["pin:top","Top orthographic","viewport-wide"]],
    Filter:[["layer:cameras","Toggle camera guides","camera"],["layer:points","Toggle point samples","grid-dots"],["layer:topology","Toggle topology cage","sphere"]],
    Properties:[["prop:render","Render properties","camera-cog"],["prop:camera","Camera properties","camera"],["prop:object","Object properties","cube"],["prop:material","Material properties","color-filter"]],
    Outliner:[["tree-expand","Expand hierarchy","hierarchy"],["tree-collapse","Collapse hierarchy","folder"]],
    Mode:modeEntries(),Viewport:modeEntries()
  };
  return menus[name]||[];
}
function closeMenu(focus=false) {
  $("popover").hidden=true;currentPopover="";popoverSource?.setAttribute("aria-expanded","false");
  if(focus) popoverSource?.focus();popoverSource=null;
}
function openMenu(name,origin) {
  if(currentPopover===name){closeMenu();return;}
  closeMenu();const box=$("popover");
  box.innerHTML=menuEntries(name).map(row=>option(...row)).join("");
  currentPopover=name;popoverSource=origin;origin.setAttribute("aria-expanded","true");box.hidden=false;
  const a=app.getBoundingClientRect(),o=origin.getBoundingClientRect();
  box.style.left=Math.max(2,Math.min(o.left-a.left,a.width-box.offsetWidth-3))+"px";
  box.style.top=Math.min(o.bottom-a.top+2,a.height-box.offsetHeight-3)+"px";
  box.querySelector("button")?.focus({preventScroll:true});
}
function closeDialog() {const layer=$("dialog-layer");layer.hidden=true;layer.innerHTML="";modalSource?.focus();modalSource=null;}
function dialog(kind) {
  modalSource=document.activeElement?.closest("#popover")?document.querySelector('[data-action="menu:Help"]'):document.activeElement;
  const info=kind==="info";
  const pairs=info?[["Scene","Performer_01.acf"],["Output sequence","3840 × 2160 · 60 fps"],["Capture plates","Three orthographic + optical orbit"],["3D geometry",sceneStats?sceneStats.triangles.toLocaleString("en-US")+" triangles":"Loading"],["Viewport refresh",liveFps?Math.round(liveFps)+" fps":"Measuring"]]:[["Play / pause","Space"],["Replay the full sequence","A"],["Optical capture","O"],["Surface / topology / cloud","1 / 2 / 3"],["Viewport sidebar","N"],["Full screen","F"],["First frame","Home"]];
  $("dialog-layer").innerHTML='<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">'+button("close-dialog","Close","x","dialog-close")+'<h1 id="dialog-title">'+(info?"AICANFEEL Scan Studio":"Playback shortcuts")+'</h1>'+(info?'<p>Inspect a performer captured for music-video production. The charts compare 468 tracked facial landmarks with image motion measured between recorded frames. Errors are in pixels of the original capture.</p>':'')+'<dl>'+pairs.map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join("")+'</dl></section>';
  $("dialog-layer").hidden=false;$("dialog-layer").querySelector("button").focus();
}
function exportFrame() {
  const canvas=document.createElement("canvas");canvas.width=2420;canvas.height=1728;
  const c=canvas.getContext("2d");c.fillStyle="#2c2d2e";c.fillRect(0,0,canvas.width,canvas.height);
  const source=state.pinned?$("pinned-image"):effective.mesh?mesh.querySelector("canvas"):effective.replay?replay:video;
  if (!source || (source===video||source===replay) && source.readyState<2) {notice("Frame is loading");return;}
  if(effective.mesh)render(elapsed,true);
  if(state.pinned){const scale=Math.min(canvas.width/source.naturalWidth,canvas.height/source.naturalHeight);const w=source.naturalWidth*scale,h=source.naturalHeight*scale;c.drawImage(source,(canvas.width-w)/2,canvas.height-h,w,h);}
  else if(effective.replay)drawReplayTile(c,effective.pass,canvas.width,canvas.height);
  else {c.drawImage(source,0,0,canvas.width,canvas.height);if(!effective.mesh)c.drawImage($("landmarks"),0,0,canvas.width,canvas.height);}
  canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="AICANFEEL-Performer-"+Math.floor(elapsed*60)+".png";a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);},"image/png");
}
function action(command,origin=null) {
  const [op,value]=command.split(":");
  if(!["play","fullscreen","menu","info","shortcuts","close-dialog","inspector","prop","distribution"].includes(op)){
    if(!timelineTouched)releaseOpening();
    timelineTouched=true;
  }
  if(op==="menu"){openMenu(value,origin);return;}
  const originatingMenu=popoverSource;
  closeMenu();
  switch(op) {
    case "play":setPlaying(!state.playing);return;
    case "cue":{
      const index=Number(value);
      if(!Number.isInteger(index)||index<0||index>=PASSES.length)return;
      elapsed=index*PASS_SECONDS;sequenceOffset=0;lastMediaSync=-1;previous=performance.now();
      setPass("auto");pointVideoAt(elapsed);redrawControls();return;
    }
    case "restart":elapsed=0;sequenceOffset=0;lastMediaSync=-1;pointVideoAt(0);render(0,true);return;
    case "next-pass": {
      if(state.choice==="auto"){sequenceOffset+=PASS_SECONDS-wrapping(elapsed+sequenceOffset,PASS_SECONDS);lastWipe="";render(elapsed,true);}
      else {const options=["optical",...ATLAS_PASSES];setPass(options[(options.indexOf(state.choice)+1)%options.length]);}return;
    }
    case "fullscreen":(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.())?.catch(()=>notice("Use your browser’s full-screen command"));return;
    case "mode":if(value==="auto")sequenceOffset=-elapsed;setPass(value);return;
    case "presentation":location.assign(asset("present.html"));return;
    case "pin":setPass("optical",value);return;
    case "workspace":{
      state.workspace=value;
      const map={Layout:["capture","render"],Modeling:["topology","object"],Sculpting:["surface","object"],"UV Editing":["uv","material"],Shading:["alloy","material"],Animation:["motion","camera"],Compositing:["points","render"]};
      sequenceOffset=PASSES.indexOf(map[value][0])*PASS_SECONDS-elapsed;
      setProperty(map[value][1]);setPass("auto");redrawControls();return;
    }
    case "inspector":state.sidebar=!state.sidebar;redrawControls();return;
    case "distribution":state.distribution=selectDistribution(effective.mode)==="donut"?"histogram":"donut";render(elapsed,true);return;
    case "layer":setLayer(value,!state[value]);return;
    case "prop":setProperty(value);return;
    case "node":state.selected=value;$("scene-tree").innerHTML=rows(state);if(state.tab==="object")setProperty("object");render(elapsed,true);return;
    case "fold":if(state.collapsed.has(value))state.collapsed.delete(value);else state.collapsed.add(value);$("scene-tree").innerHTML=rows(state);return;
    case "tree-expand":state.collapsed.clear();$("scene-tree").innerHTML=rows(state);return;
    case "tree-collapse":state.collapsed=new Set(["rig","scan"]);$("scene-tree").innerHTML=rows(state);return;
    case "eye":{
      const visible=treeHidden(value,state.hidden);
      setTreeVisibility(value,visible,state.hidden);
      for(const [layer,node] of Object.entries(layerNodes)){
        const effectiveNode=layer==="cameras"?"camera":node;
        const showing=!treeHidden(effectiveNode,state.hidden);
        if(state[layer]!==showing)setLayer(layer,showing,false);
      }
      if(["head","eyes","locs"].includes(value)&&!["alloy","surface","topology","clay"].includes(effective.pass))setPass("surface");
      $("scene-tree").innerHTML=rows(state);render(elapsed,true);return;
    }
    case "tool":state.tool=value;redrawControls();label("active-tool-label",origin?.title||value);return;
    case "tool-option":document.querySelectorAll(".tool-options button").forEach((e,i)=>e.classList.toggle("active",i===Number(value)));selectionOp=Number(value);return;
    case "zoom-in":case "zoom-out":state.zoom=clamp(state.zoom*(op==="zoom-in"?1.13:1/1.13),.72,2.1);redrawControls();render(elapsed,true);return;
    case "reset-view":case "camera-home":state.zoom=1;state.pitch=.045;state.yaw=0;state.panX=state.panY=0;clearDrawing();setPass("auto");redrawControls();render(elapsed,true);return;
    case "info":case "shortcuts":dialog(op);if(originatingMenu)modalSource=originatingMenu;return;
    case "close-dialog":closeDialog();return;
    case "frame-export":exportFrame();return;
    case "reset":reset();return;
  }
}
app.addEventListener("click",event=>{
  const target=event.target.closest("[data-action]");
  if(target){action(target.dataset.action,target);return;}
  if(event.target===$("dialog-layer"))closeDialog();
  if(!event.target.closest("#popover") && currentPopover)closeMenu();
});
app.addEventListener("change",e=>{if(e.target.matches("[data-layer]"))setLayer(e.target.dataset.layer,e.target.checked);});
app.addEventListener("input",e=>{
  if(!e.target.matches("[data-param]"))return;
  state[e.target.dataset.param]=Number(e.target.value);redrawControls();render(elapsed,true);
});
document.addEventListener("keydown",e=>{
  if(e.altKey||e.ctrlKey||e.metaKey) return;
  if(e.key==="Escape"){if(!$("dialog-layer").hidden)closeDialog();else if(currentPopover)closeMenu(true);else if(state.pinned)action("mode:auto");return;}
  if(!$("dialog-layer").hidden){if(e.key==="Tab"){e.preventDefault();$("dialog-layer").querySelector("button")?.focus();}return;}
  if(currentPopover&&["ArrowDown","ArrowUp","Home","End"].includes(e.key)){
    e.preventDefault();const list=[...$("popover").querySelectorAll("button")],i=list.indexOf(document.activeElement);
    list[e.key==="Home"?0:e.key==="End"?list.length-1:(i+(e.key==="ArrowDown"?1:-1)+list.length)%list.length]?.focus();return;
  }
  if(e.target.matches("input")||e.code==="Space"&&e.target.matches("summary,button"))return;
  const shortcuts={Space:"play",KeyF:"fullscreen",KeyN:"inspector",KeyA:"mode:auto",KeyO:"mode:optical",Digit1:"mode:surface",Digit2:"mode:topology",Digit3:"mode:points",Home:"restart"};
  if(shortcuts[e.code]){e.preventDefault();action(shortcuts[e.code]);}
});

const mark=document.createElement("canvas");mark.className="annotation-canvas";stage.append(mark);
const ink=mark.getContext("2d");
let selectionOp=0;
function clearDrawing(){ink.clearRect(0,0,mark.width,mark.height);}
function cursorOffset(e){const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function scaleDrawing(){const r=stage.getBoundingClientRect();mark.width=Math.max(1,Math.round(r.width));mark.height=Math.max(1,Math.round(r.height));}
const markerResize=new ResizeObserver(scaleDrawing);markerResize.observe(stage);
let resizeFrame=0;
const boardResize=new ResizeObserver(()=>{
  cancelAnimationFrame(resizeFrame);
  resizeFrame=requestAnimationFrame(()=>{if(!disposed){chooseOpticalResolution();render(elapsed,true);}});
});
boardResize.observe(app);
stage.addEventListener("pointerdown",e=>{
  if(e.button!==0||e.target.closest("button, input, label, aside, summary"))return;
  if(currentPopover){closeMenu();return;}
  const p=cursorOffset(e);activePointer={id:e.pointerId,...p,ox:p.x,oy:p.y,moved:false};stage.setPointerCapture(e.pointerId);
  if(["annotate","measure","cursor"].includes(state.tool)){if(state.tool!=="annotate")clearDrawing();ink.beginPath();ink.moveTo(p.x,p.y);}
});
stage.addEventListener("pointermove",e=>{
  if(!activePointer||e.pointerId!==activePointer.id)return;
  const p=cursorOffset(e),dx=p.x-activePointer.x,dy=p.y-activePointer.y;
  activePointer.moved ||= Math.hypot(p.x-activePointer.ox,p.y-activePointer.oy)>3;
  if(!activePointer.moved)return;
  const unit=stage.clientWidth/1210;
  if(state.tool==="annotate"){ink.strokeStyle="#a8ced4";ink.lineWidth=1.8*unit;ink.lineTo(p.x,p.y);ink.stroke();ink.beginPath();ink.moveTo(p.x,p.y);}
  else if(state.tool==="measure"){clearDrawing();ink.strokeStyle="#dfb47d";ink.lineWidth=1.2*unit;ink.beginPath();ink.moveTo(activePointer.ox,activePointer.oy);ink.lineTo(p.x,p.y);ink.stroke();ink.font=(13*unit)+"px Inter";ink.fillStyle="#f0d6ab";ink.fillText(Math.round(Math.hypot(p.x-activePointer.ox,p.y-activePointer.oy))+" px",p.x+5,p.y-6);}
  else if(state.tool==="move"){state.panX=clamp(state.panX+dx/stage.clientWidth*100,-32,32);state.panY=clamp(state.panY+dy/stage.clientHeight*100,-32,32);redrawControls();}
  else if(state.tool==="scale"){state.zoom=clamp(state.zoom-dy/450,.72,2.1);redrawControls();}
  else if(state.tool!=="cursor"){
    if(!effective.mesh&&!effective.replay)setPass("surface");
    state.yaw-=dx/(stage.clientWidth/TAU);
    state.pitch=clamp(state.pitch+dy/(stage.clientHeight/2),-1.1,1.1);
    if(effective.replay && replay.readyState>=2)replay.currentTime=replayTime(elapsed);
  }
  activePointer.x=p.x;activePointer.y=p.y;render(elapsed,true);
});
stage.addEventListener("pointerup",e=>{
  if(!activePointer||e.pointerId!==activePointer.id)return;
  if(!activePointer.moved && state.tool==="cursor"){const {x,y}=cursorOffset(e);ink.beginPath();ink.strokeStyle="#db8c73";ink.arc(x,y,7,0,TAU);ink.moveTo(x-12,y);ink.lineTo(x+12,y);ink.moveTo(x,y-12);ink.lineTo(x,y+12);ink.stroke();}
  if(!activePointer.moved&&state.tool==="select"){action("node:"+((selectionOp===2)?"scene":"head"));}
  activePointer=null;stage.releasePointerCapture(e.pointerId);
});
stage.addEventListener("pointercancel",()=>{activePointer=null;});
stage.addEventListener("wheel",e=>{if(e.target.closest("aside"))return;e.preventDefault();state.zoom=clamp(state.zoom*Math.exp(-e.deltaY*.001),.72,2.1);redrawControls();render(elapsed,true);},{passive:false});
prefersCalm.addEventListener("change",e=>setPlaying(!e.matches));
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){wasHidden=true;for(const clip of mediaClips)clip.pause();replay.pause();opening.pause();if(running!==null)cancelAnimationFrame(running);running=null;}
  else if(wasHidden){wasHidden=false;pointVideoAt(elapsed);playMedia();queueLoop();render(elapsed,true);}
});
function dispose(){
  clearTimeout(cameraLoadTimer);
  releaseOpening();
  study.dispose();
  disposed=true;if(running!==null)cancelAnimationFrame(running);gsap.killTweensOf(mesh);clearTimeout(noticeTimer);
  if(decodedFrame!==null)replay.cancelVideoFrameCallback(decodedFrame);
  markerResize.disconnect();boardResize.disconnect();cancelAnimationFrame(resizeFrame);face.dispose();orthos.dispose();telemetry.dispose();world?.dispose();replay.pause();for(const clip of mediaClips)clip.pause();
}
window.addEventListener("pagehide",e=>{if(!e.persisted)dispose();});
window.addEventListener("pageshow",e=>{if(e.persisted){previous=performance.now();pointVideoAt(elapsed);playMedia();queueLoop();}});
if(import.meta.hot)import.meta.hot.dispose(dispose);
const diagnostics=()=>({elapsed,pass:effective.pass,slot:phaseIndex(elapsed+sequenceOffset),angle:orbitAngle(elapsed)+state.yaw,slotSeconds:PASS_SECONDS,orbitSeconds:ORBIT_SECONDS,playing:state.playing,fps:liveFps,world:world?.diagnostics(),worldReady:!!world,failedWorld,replayReason,mediaError,mediaTime:video.currentTime,videoFrames:video.getVideoPlaybackQuality?.(),scene:sceneStats?{vertices:sceneStats.vertices,triangles:sceneStats.triangles,points:sceneStats.points}:null});
if(params.has("qa")||captureMode) window.scanStudio={
  diagnostics, action, ready:()=>Promise.all([ensureWorld(),study.ready]),
  bakeViewport(pass,t,options={}) {
    if(!captureMode||!world)throw new Error("Viewport baking requires a prepared render session.");
    world.render({mode:pass,angle:orbitAngle(t),pitch:.045+orbitPitch(t),zoom:1,state,time:t,transitionProgress:1});
    const source=mesh.querySelector("canvas");
    const c=this.bakeCanvas??=document.createElement("canvas");
    if(c.width!==source.width||c.height!==source.height){c.width=source.width;c.height=source.height;}
    const ctx=c.getContext("2d",{alpha:false});
    ctx.fillStyle="#101719";ctx.fillRect(0,0,c.width,c.height);
    for(const [x,y,r,color] of [[-.10,-.08,.78,"#284d46"],[1.10,-.02,.65,"#293747"],[-.08,1.10,.60,"#332b43"]]){
      const grad=ctx.createRadialGradient(x*c.width,y*c.height,0,x*c.width,y*c.height,c.width*r);
      grad.addColorStop(0,color);grad.addColorStop(1,"transparent");ctx.fillStyle=grad;ctx.fillRect(0,0,c.width,c.height);
    }
    ctx.drawImage(source,0,0);return options.canvas?c:c.toDataURL("image/jpeg",.91);
  },
  async frame(t) {
    if(!captureMode)throw new Error("Frame stepping requires render mode");
    elapsed=t;state.playing=false;
    const clips=choose(t).mesh?mediaClips.filter(c=>c!==video):mediaClips;
    await Promise.all(clips.map(async clip=>{
      clip.pause();
      if(clip.readyState===0)await Promise.race([new Promise(r=>clip.addEventListener("loadeddata",r,{once:true})),new Promise(r=>setTimeout(r,1200))]);
      if(!Number.isFinite(clip.duration)||clip.duration<=0)return;
      const position=clipTime(clip,t);
      if(clip.readyState>0&&Math.abs(clip.currentTime-position)>.002) {
        await new Promise(resolve=>{const done=()=>{clearTimeout(timer);clip.removeEventListener("seeked",done);resolve();};const timer=setTimeout(done,700);clip.addEventListener("seeked",done,{once:true});clip.currentTime=position;});
      }
    }));
    render(t,true);return diagnostics();
  }
};
if(captureMode||prefersCalm.matches)openCameraFeeds();else cameraLoadTimer=setTimeout(openCameraFeeds,1300);
redrawControls();updateStats();render(0,true);prepareOpening();ensureWorld();queueLoop();


