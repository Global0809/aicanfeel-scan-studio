import "./studio.css";
import { gsap } from "gsap";
import { asset, icon, fillIcons } from "../ui.js";
import { ATLAS_PASSES, LOOKS, ORBIT_SECONDS, TAU } from "../sequence.js";
import { createPassStudy } from "../pass-study.js";
import {
  FPS, PERFORMER, SESSION_SCORE, SHORT_LOOKS, MAX_SHOTS, MIN_SHOT, MAX_SHOT, ASSET_LIMIT,
  assetKind, clamp, exampleProject, frameLabel, makeShot, materialName, normalizeProject, safeFileName, schedule,
  cameraAt, newProject,
} from "./project.js";
import { download, packProject, restoreWorkspace, saveWorkspace, unpackProject } from "./storage.js";
import { createSoundtrack } from "./audio.js";
import { createViewport } from "./viewport.js";
import { png, encodeScene } from "./render.js";

const $=id=>document.getElementById(id);
const app=$("studio"), stage=$("stage-frame"), clipLane=$("clip-lane"), waveform=$("waveform");
const motion=matchMedia("(prefers-reduced-motion: reduce)");
const captureMode=import.meta.env.DEV && new URLSearchParams(location.search).has("capture");
const numberFormat=new Intl.NumberFormat();
const soundtrack=createSoundtrack(), study=createPassStudy();
const saveStatus=$("save-state"), toast=$("toast"), scrubber=$("scrubber"), dialog=$("export-dialog");
const modelCache=new Map(), loadingModels=new Map(), decodedAudio=new Map();
const files=new Map();
const backward=[], forward=[];
const assetSelect=$("camera-asset"), lookGrid=$("look-grid");
const sliders=Array.from(app.querySelectorAll("[data-adjust]"));
const commands=Object.fromEntries([...app.querySelectorAll("[data-act]")].map(button=>[button.dataset.act,button]));
let project=exampleProject(), timeline=schedule(project.shots), selected=project.shots[0].id;
let frame=0, turns=0, playing=!motion.matches, looping=true, lastTick=performance.now();
let preview={yaw:0,pitch:0,zoom:1,clean:false,grid:project.grid}, draft=null;
let activeId=null, lastReadout=-1, dirty=true, closed=false, loopId=0, noticeTween=null, labelTween=null;
let saveTimer=0, changed=0, audioToken=0, loadedAudioId=null, measuredOffset=0, peaks=[];
let dragId=null, dropTarget=null, pointer=null, outputTask=null, trim=null, suppressClipClick=0;
let visiblePlaying=false, suspended=false, clockCount=0, countAt=performance.now(), actualRate=0;
let audition=false, selectedStop="start", bundledAudio;
let intakeChain=Promise.resolve(), projectEpoch=0;
let currentClipButtons=new Map();
const poseControls=new Set(["yaw","tilt","zoom"]);

fillIcons();
app.style.setProperty("--material-sheet",'url("'+asset("ui/shot-materials.webp")+'")');
const viewport=createViewport($("render-host"),$("stage-canvas"),engine=>{
  app.dataset.engine=engine;
  $("engine").textContent=engine==="webgl"?"Live WebGL":"Atlas preview";
  $("footer-engine").textContent=engine==="webgl"?"WebGL · Live scene":"Atlas · Preview renderer";
  $("stage-poster").hidden=true;
  if(engine!=="webgl") outputTask?.abort();
  dirty=true;
});

const currentEntry=()=>timeline.segments.find(item=>item.shot.id===selected)??timeline.segments[0];
const entryAt=(at,sequence=timeline)=>sequence.segments.find(item=>at<item.end)??sequence.segments.at(-1);
const sprite=pass=>{
  const index=ATLAS_PASSES.indexOf(pass);
  return String((index%4)*100/3)+"% "+(index<4?"0%":"100%");
};
const element=(tag,className="",content)=> {
  const node=document.createElement(tag);
  if(className) node.className=className;
  if(content!==undefined) node.textContent=content;
  return node;
};
function notify(message) {
  toast.textContent=message;toast.hidden=false;
  noticeTween?.kill();
  if(motion.matches) {
    gsap.set(toast,{opacity:1,y:0});
    noticeTween=gsap.delayedCall(3.7,()=>{toast.hidden=true;});
    return;
  }
  noticeTween=gsap.timeline({onComplete:()=>{toast.hidden=true;}});
  noticeTween.fromTo(toast,{opacity:0,y:7},{opacity:1,y:0,duration:.18,ease:"power2.out"})
    .to(toast,{opacity:0,y:4,duration:.28,ease:"power1.in"},"+=3.2");
}
function saveSoon() {
  clearTimeout(saveTimer);saveStatus.textContent="Saving…";
  const revision=++changed;
  saveTimer=setTimeout(async ()=>{
    saveTimer=0;
    try {
      await saveWorkspace(project,files);
      if(revision===changed) saveStatus.textContent="Saved on this device";
    } catch {
      if(revision===changed) saveStatus.textContent="Save unavailable";
    }
  },210);
}
function playAudio() {
  if(audition && playing && !suspended && !document.hidden) soundtrack.play(frame/FPS+project.audioOffset,project.volume).catch(()=>{});
}
function setPlaying(on,withAudio=true) {
  if(outputTask && on) return;
  playing=on;
  lastTick=performance.now();
  clockCount=0;countAt=lastTick;actualRate=0;
  if(playing && frame>=timeline.frames-1) {frame=0;turns=0;}
  if(!playing) soundtrack.stop();
  else if(withAudio) playAudio();
  const play=$("transport-play");
  play.innerHTML=icon(playing?"player-pause":"player-play");
  play.setAttribute("aria-label",playing?"Pause playback":"Play timeline");
  dirty=true;
}
function seek(at,{focus=false,pause=true}={}) {
  if(pause) setPlaying(false);
  frame=clamp(at,0,timeline.frames-1);turns=0;lastTick=performance.now();
  if(focus && selected!==entryAt(frame).shot.id) {
    selected=entryAt(frame).shot.id;selectedStop="start";preview={...preview,yaw:0,pitch:0,zoom:1};draft=null;
    updateInspector();
  }
  dirty=true;syncTime(true);
}
function selectShot(id) {
  const next=timeline.segments.find(item=>item.shot.id===id);
  if(!next) return;
  selected=id;selectedStop="start";draft=null;preview={...preview,yaw:0,pitch:0,zoom:1};
  seek(next.start+Math.min(7,next.shot.frames-1));
  updateInspector();
}
function updateProject(next,{selection=selected, position="preserve", history=true}={}) {
  const old=entryAt(frame), local=frame-old.start;
  const validated=normalizeProject(next);
  if(history) {
    backward.push(project);
    if(backward.length>60) backward.shift();
    forward.length=0;
  }
  project=validated; timeline=schedule(project.shots);draft=null;turns=0;
  const nextId=project.shots.some(shot=>shot.id===selection)?selection:timeline.segments[0].shot.id;
  if(nextId!==selected) selectedStop="start";
  selected=nextId;
  const active=position==="selected" ? currentEntry() : timeline.segments.find(part=>part.shot.id===old.shot.id)??currentEntry();
  frame=position==="selected" ? active.start+Math.min(7,active.shot.frames-1)
    : active.start+clamp(local,0,active.shot.frames-1);
  preview.grid=project.grid;
  updateUI();loadAudio();saveSoon();
}
function commit(edit,options) {
  const next=structuredClone(project);
  edit(next);
  updateProject(next,options);
}
function changeShot(patch) {
  const id=selected;
  commit(next=>Object.assign(next.shots.find(shot=>shot.id===id),patch),{position:"preserve"});
}
function stopFor(shot,key) {
  return selectedStop==="end"&&shot.cameraEnd&&poseControls.has(key)?shot.cameraEnd:shot;
}
function showKeyframe(stop) {
  const entry=currentEntry();
  selectedStop=stop==="end"&&entry.shot.cameraEnd?"end":"start";
  draft=null;preview={...preview,yaw:0,pitch:0,zoom:1};
  seek(selectedStop==="end"?entry.end-1:entry.start);
  updateInspector();
}
function historyMove(from,to) {
  if(!from.length) return;
  setPlaying(false);
  to.push(project);updateProject(from.pop(),{history:false});notify(from===backward?"Undone":"Redone");
}
function createShot(duplicate=false) {
  if(project.shots.length>=MAX_SHOTS){notify("The sequence holds up to 32 shots.");return;}
  const index=project.shots.findIndex(clip=>clip.id===selected);
  const source=currentEntry().shot;
  const shot=duplicate?{...source,id:crypto.randomUUID()} : makeShot(ATLAS_PASSES[(ATLAS_PASSES.indexOf(source.pass)+1)%ATLAS_PASSES.length],{asset:source.asset});
  setPlaying(false);
  commit(next=>next.shots.splice(index+1,0,shot),{selection:shot.id,position:"selected"});
  notify(duplicate?"Shot duplicated":"Shot added");
}
function moveShot(id,destination) {
  const origin=project.shots.findIndex(shot=>shot.id===id);
  const target=clamp(destination,0,project.shots.length-1);
  if(origin<0 || origin===target) return;
  setPlaying(false);
  commit(next=>{
    const [item]=next.shots.splice(origin,1);next.shots.splice(target,0,item);
  },{selection:id,position:"selected"});
}
function splitShot() {
  if(project.shots.length>=MAX_SHOTS){notify("The sequence holds up to 32 shots.");return;}
  const part=entryAt(frame), first=Math.round(frame-part.start), second=part.shot.frames-first;
  if(first<MIN_SHOT || second<MIN_SHOT){notify("Move the playhead at least 0.25 s from each shot edge.");return;}
  const newId=crypto.randomUUID(), index=project.shots.findIndex(shot=>shot.id===part.shot.id);
  setPlaying(false);
  commit(next=>{
    next.shots[index].frames=first;
    const secondShot={...part.shot,id:newId,frames:second,transition:"cut"};
    if(part.shot.cameraEnd) {
      next.shots[index].cameraEnd={...cameraAt(part.shot,first-1),ease:part.shot.cameraEnd.ease};
      Object.assign(secondShot,cameraAt(part.shot,first));
    }
    next.shots.splice(index+1,0,secondShot);
  },{selection:newId,position:"selected"});
  seek(part.start+first);
  notify("Shot split at "+frameLabel(part.start+first));
}
function removeShot() {
  if(project.shots.length<2){notify("Keep at least one shot in the sequence.");return;}
  const index=project.shots.findIndex(clip=>clip.id===selected);
  const nextId=project.shots[index+1]?.id??project.shots[index-1].id;
  setPlaying(false);
  commit(next=>next.shots.splice(index,1),{selection:nextId,position:"selected"});
  notify("Shot deleted · Undo to restore");
}
function updateInspector() {
  const {shot}=currentEntry();
  if(!shot.cameraEnd) selectedStop="start";
  const index=project.shots.findIndex(item=>item.id===shot.id);
  $("shot-index").textContent="SHOT "+String(index+1).padStart(2,"0");
  for(const button of lookGrid.children) button.setAttribute("aria-pressed",String(button.dataset.look===shot.pass));
  assetSelect.replaceChildren(new Option("Performer 01",PERFORMER),...project.assets.filter(item=>item.kind==="model").map(item=>new Option(item.name,item.id)));
  for(const control of sliders) {
    const property=control.dataset.adjust;
    control.value=property==="duration" ? (shot.frames/FPS).toFixed(2) : stopFor(shot,property)[property];
    if(property==="pulse") {
      control.disabled=!project.audio;
      control.title=project.audio?"Set how much the soundtrack drives the scan":"Add a soundtrack to drive the scan";
    }
    formatControl(property,Number(control.value));
  }
  $("animate-camera").checked=!!shot.cameraEnd;
  $("keyframe-controls").hidden=!shot.cameraEnd;
  $("camera-ease").value=shot.cameraEnd?.ease??"smooth";
  for(const button of app.querySelectorAll("[data-keypose]")) button.setAttribute("aria-pressed",String(button.dataset.keypose===selectedStop));
  for(const [id,button] of currentClipButtons) {
    button.classList.toggle("selected",id===selected);
    button.setAttribute("aria-pressed",String(id===selected));
  }
  commands.earlier.disabled=index===0;
  commands.later.disabled=index===project.shots.length-1;
  commands.remove.disabled=project.shots.length===1;
  commands.duplicate.disabled=commands.add.disabled=project.shots.length>=MAX_SHOTS;
  updateAssetSelection();
}
function formatControl(key,value) {
  const readout=app.querySelector('[data-value="'+key+'"]');
  if(!readout) return;
  if(key==="scan" || key==="pulse") readout.value=value.toFixed(0)+"%";
  else if(key==="yaw" || key==="tilt") readout.value=value.toFixed(0)+"°";
  else readout.value=value.toFixed(2)+"×";
}
function updateAssetSelection() {
  const model=currentEntry().shot.asset;
  for(const node of $("asset-list").querySelectorAll("[data-asset]")) node.setAttribute("aria-pressed",String(node.dataset.asset===model || node.dataset.asset===project.audio));
}
function renderAssets() {
  const entries=[{id:PERFORMER,name:"Performer 01",kind:"base"},...project.assets];
  $("asset-list").replaceChildren(...entries.map(item=>{
    const card=element("button","asset");card.type="button";card.dataset.asset=item.id;card.title=item.name;
    let emblem;
    if(item.kind==="base") {
      emblem=new Image();emblem.src=asset("capture/front.webp");emblem.alt="";
    } else {
      emblem=element("span","asset-symbol");emblem.innerHTML=icon(item.kind==="audio"?"adjustments-horizontal":"cube");
    }
    const text=element("span","asset-name");text.append(element("b","",item.name),element("small","",item.kind==="base"?"Studio scan":item.kind==="model"?"Local GLB model":item.id===SESSION_SCORE?"Demo soundtrack":"Local audio"));
    card.append(emblem,text,element("span","asset-flag",item.kind==="base"?"3D":item.kind==="model"?"GLB":"AUD"));
    const row=element("div","asset-row");row.append(card);
    if(item.id!==PERFORMER && item.id!==SESSION_SCORE) {
      const dismiss=element("button","asset-remove");
      dismiss.type="button";dismiss.dataset.removeAsset=item.id;dismiss.title="Remove "+item.name+" from the project";
      dismiss.setAttribute("aria-label",dismiss.title);dismiss.innerHTML=icon("x");
      row.append(dismiss);
    }
    return row;
  }));
  $("sound-status").hidden=!project.audio;
  commands.audition.setAttribute("aria-pressed",String(audition));
  commands.audition.textContent=audition?"Audio on":"Audio off";
  $("volume").value=project.volume;
  $("audio-name").textContent=project.assets.find(item=>item.id===project.audio)?.name??"";
  commands.audio.hidden=!!project.audio;
  commands["audio-settings"].hidden=!project.audio;
}
function renderTimeline() {
  const ratio=100/timeline.frames;
  const desired=timeline.frames/FPS/8;
  const interval=[.25,.5,1,2,3,5,10,15,20,30,45,60,90].find(value=>value>=desired)??120;
  const ticks=[];
  for(let n=0;n<timeline.frames/FPS-interval*.24;n+=interval) {
    const tick=element("span","",n+"s");tick.style.left=n*FPS*ratio+"%";ticks.push(tick);
  }
  const last=element("span","",(timeline.frames/FPS).toFixed(timeline.frames%FPS?1:0)+"s");last.style.left="100%";ticks.push(last);
  $("ruler-ticks").replaceChildren(...ticks);
  currentClipButtons=new Map();
  clipLane.replaceChildren(...timeline.segments.map(({shot},i)=>{
    const track=element("button","clip");track.type="button";track.draggable=true;track.dataset.clip=shot.id;
    track.style.setProperty("--clip",LOOKS[shot.pass].color);track.style.setProperty("--frames",shot.frames);
    track.style.setProperty("--sprite",sprite(shot.pass));
    track.title=String(i+1).padStart(2,"0")+" · "+materialName(shot.pass)+" · "+(shot.frames/FPS).toFixed(2)+" s";
    track.setAttribute("aria-label",track.title);
    track.append(element("span","clip-main",SHORT_LOOKS[shot.pass]),element("small","",(shot.frames/FPS).toFixed(2)+" s"));
    if(shot.cameraEnd) {
      const key=element("span","key-symbol");key.setAttribute("aria-hidden","true");track.append(key);
    }
    const grip=element("span","trim-grip");grip.setAttribute("aria-hidden","true");grip.title="Drag to trim shot";track.append(grip);
    currentClipButtons.set(shot.id,track);return track;
  }));
  scrubber.max=timeline.frames-1;
  $("total-time").textContent="/ "+frameLabel(timeline.frames);
  commands.undo.disabled=!backward.length;commands.redo.disabled=!forward.length;
  writeWaveform();
}
function updateUI() {
  $("project-name").value=project.title;
  commands.grid.setAttribute("aria-pressed",String(project.grid));
  renderAssets();renderTimeline();updateInspector();
  activeId=null;syncTime(true);dirty=true;
}
function syncTime(force=false) {
  const now=performance.now();
  const progress=100*frame/timeline.frames;
  $("playhead").style.left=progress+"%";
  if(force || now-lastReadout>47) {
    $("time-code").value=frameLabel(frame);
    scrubber.value=Math.floor(frame);
    scrubber.setAttribute("aria-valuetext",frameLabel(frame));
    lastReadout=now;
  }
}
function writeWaveform() {
  const w=Math.round(waveform.clientWidth),h=Math.round(waveform.clientHeight);
  if(!w || !h) return;
  const d=Math.min(2,devicePixelRatio||1);
  waveform.width=Math.round(w*d);waveform.height=Math.round(h*d);
  const ctx=waveform.getContext("2d");
  ctx.scale(d,d);
  if(!peaks.length) return;
  const cover=(soundtrack.duration-project.audioOffset)/(timeline.frames/FPS),part=Math.min(1,cover);
  if(part<=0) return;
  ctx.fillStyle="#28463e";ctx.fillRect(0,0,w*part,h);
  const fill=ctx.createLinearGradient(0,0,0,h);
  fill.addColorStop(0,"#dcffe6");fill.addColorStop(.5,"#67d6ad");fill.addColorStop(1,"#b6ffe5");
  ctx.fillStyle=fill;
  const columns=Math.max(1,Math.ceil(w*part/2));
  for(let i=0;i<columns;i++){
    const source=Math.min(peaks.length-1,Math.round(i/(columns*cover/part)*peaks.length));
    const amp=Math.max(.6,(peaks[source]??0)*h*.87);
    ctx.fillRect(i/columns*w*part,(h-amp)*.5,1.18,amp);
  }
}
const waveformObserver=new ResizeObserver(writeWaveform);
waveformObserver.observe(waveform);


async function loadAudio() {
  const id=project.audio;
  if(id===loadedAudioId) {
    soundtrack.setVolume(project.volume);
    if(id && measuredOffset!==project.audioOffset) {
      measuredOffset=project.audioOffset;peaks=soundtrack.peaks(384,measuredOffset);writeWaveform();dirty=true;playAudio();
    }
    return;
  }
  const token=++audioToken;
  loadedAudioId=null;peaks=[];soundtrack.use(null);writeWaveform();
  if(!id) return;
  try {
    if(id===SESSION_SCORE) bundledAudio??=fetch(asset("ui/session-pulse.m4a")).then(response=>{
      if(!response.ok) throw new Error("Demo soundtrack is unavailable.");
      return response.blob();
    });
    const file=id===SESSION_SCORE?await bundledAudio:files.get(id);
    if(!file) return;
    const decoded=decodedAudio.get(id)??await soundtrack.decode(file);
    if(token!==audioToken || closed) return;
    decodedAudio.set(id,decoded);soundtrack.use(decoded);loadedAudioId=id;
    measuredOffset=project.audioOffset;peaks=soundtrack.peaks(384,measuredOffset);writeWaveform();dirty=true;playAudio();
  } catch {if(token===audioToken) notify("This sound file could not be played.");}
}
async function ensureModel(id) {
  if(id===PERFORMER || !files.has(id)) return null;
  if(modelCache.has(id)) return modelCache.get(id);
  if(!loadingModels.has(id)) loadingModels.set(id,import("./model.js")
    .then(({makeImportedModel})=>makeImportedModel(files.get(id)))
    .then(model=>{
      if(closed){model.dispose();return null;}
      modelCache.set(id,model);dirty=true;return model;
    }).catch(error=>{
      notify(error.message);modelCache.set(id,null);dirty=true;return null;
    }).finally(()=>loadingModels.delete(id)));
  return loadingModels.get(id);
}
function showScope(part,model,pose) {
  const custom=part.shot.asset!==PERFORMER;
  for(const node of [$("study-canvas"),$("study-legend"),$("study-value")]) node.hidden=custom;
  $("model-scope").hidden=!custom;
  if(custom) {
    $("study-title").textContent=model?"Mesh statistics":model===null?"Asset unavailable":"Opening asset…";
    $("study-unit").textContent="GLB";
    const values=model?.stats;
    for(const [label,key] of [["triangles","triangles"],["vertices","vertices"],["points","points"],["animation","animations"]]) {
      $("model-"+label).value=values?numberFormat.format(values[key]):"—";
    }
  } else {
    study.update(frame/FPS,part.shot.pass,pose.angle+preview.yaw);
  }
}
function modulated(entry,at) {
  if(!loadedAudioId || !entry.shot.pulse) return entry;
  const gain=soundtrack.level(at/FPS+project.audioOffset);
  const scan=clamp(entry.shot.scan+(gain-.24)*entry.shot.pulse*.65,0,100);
  return {...entry,shot:{...entry.shot,scan}};
}
function paint() {
  const base=entryAt(frame);
  const entry=base.shot.id===selected && draft?{...base,shot:{...base.shot,...draft}}:base;
  const {shot}=entry;
  const model=modelCache.get(shot.asset);
  if(shot.asset!==PERFORMER && model===undefined) ensureModel(shot.asset);
  const pose=viewport.draw(modulated(entry,frame),frame,preview,model,turns);
  if(activeId!==shot.id || $("active-look").textContent!==materialName(shot.pass)) {
    currentClipButtons.get(activeId)?.classList.remove("active");
    currentClipButtons.get(shot.id)?.classList.add("active");activeId=shot.id;
    const label=$("active-look");
    label.textContent=materialName(shot.pass);
    stage.style.setProperty("--scene-color",LOOKS[shot.pass].color);
    $("stage-segment").textContent="SHOT "+String(timeline.segments.findIndex(item=>item.shot.id===shot.id)+1).padStart(2,"0");
    labelTween?.kill();
    if(!motion.matches) labelTween=gsap.fromTo(label,{opacity:.53,y:3},{opacity:1,y:0,duration:.20,ease:"power2.out"});
    if(shot.asset===PERFORMER) study.update(frame/FPS,shot.pass,pose.angle,true);
  }
  const angle=((pose.angle+preview.yaw)/TAU*360%360+360)%360;
  $("angle-dial").style.transform="rotate("+angle.toFixed(2)+"deg)";
  if(clockCount%3===0 || !playing) $("stage-angle").textContent="YAW "+String(Math.round(angle)%360).padStart(3,"0")+"°";
  if(clockCount%2===0 || !playing) showScope(entry,model,pose);
  const stats=viewport.metrics(model);
  if(clockCount%12===0 || !playing) $("stage-metrics").textContent=stats
    ? numberFormat.format(stats.triangles??0)+" tris"+(actualRate?"  /  "+actualRate+" fps":"") : "";
  syncTime();
}
function tick(now) {
  if(closed) return;
  const delta=(now-lastTick)*FPS/1000;lastTick=now;
  if(!document.hidden && !suspended && !outputTask && !captureMode) {
    if(playing) {
      frame+=Math.max(0,delta);
      if(frame>=timeline.frames){
        if(looping) {
          turns+=timeline.orbit*Math.floor(frame/timeline.frames);
          frame%=timeline.frames;
          playAudio();
        } else {frame=timeline.frames-1;setPlaying(false);}
      }
      clockCount++;
      if(now-countAt>=1200) {
        actualRate=Math.min(240,Math.round(clockCount*1000/(now-countAt)));
        countAt=now;clockCount=0;
      }
    }
    if(playing || dirty){dirty=false;paint();}
  }
  loopId=requestAnimationFrame(tick);
}

function queueIntake(list,onlyAudio=false) {
  const target=selected, epoch=projectEpoch;
  intakeChain=intakeChain.then(()=>intake(list,onlyAudio,target,epoch));
}
async function intake(list,onlyAudio,target,epoch) {
  for(const file of list.slice(0,12)) {
    if(epoch!==projectEpoch || closed) return;
    const kind=assetKind(file.name);
    if(!kind || (onlyAudio && kind!=="audio")) {notify("Choose a GLB model or a supported audio file.");continue;}
    if(file.size>ASSET_LIMIT) {notify("Each asset can be up to 28 MB.");continue;}
    if(project.assets.length>=12) {notify("This project has 12 imported assets.");break;}
    const id=crypto.randomUUID();
    try {
      notify(kind==="model"?"Opening "+file.name:"Reading soundtrack…");
      let model, decoded;
      if(kind==="model") {
        const {makeImportedModel}=await import("./model.js");
        model=await makeImportedModel(file);
      } else {
        decoded=await soundtrack.decode(file);
      }
      if(epoch!==projectEpoch || closed){model?.dispose();return;}
      if(model) modelCache.set(id,model);
      if(decoded) decodedAudio.set(id,decoded);
      const entry={id,name:file.name,kind};
      files.set(id,file);
      setPlaying(false);
      const targetExists=project.shots.some(shot=>shot.id===target);
      commit(next=>{
        next.assets.push(entry);
        if(kind==="model") {
          const shot=next.shots.find(shot=>shot.id===target);
          if(shot) shot.asset=id;
        }
        else {next.audio=id;next.audioOffset=0;}
      },{position:kind==="model"&&target===selected?"selected":"preserve"});
      notify(kind==="model"?file.name+(targetExists?" added to the shot":" added to Assets"):"Soundtrack ready · Audio on to preview");
    } catch(error) {notify(error.message || "Could not read "+file.name);}
  }
}
async function openProject(file) {
  const epoch=++projectEpoch;
  try {
    const data=await unpackProject(file);
    if(epoch!==projectEpoch || closed) return;
    for(const [id,blob] of data.files) {
      if(!files.has(id)) files.set(id,blob);
      else {
        const fresh=crypto.randomUUID();
        files.set(fresh,blob);
        data.project.assets.find(asset=>asset.id===id).id=fresh;
        for(const shot of data.project.shots) if(shot.asset===id) shot.asset=fresh;
        if(data.project.audio===id) data.project.audio=fresh;
      }
    }
    setPlaying(false);
    updateProject(data.project,{selection:data.project.shots[0].id,position:"selected"});
    notify(project.title+" opened");
  } catch(error) {notify(error.message);}
}
async function downloadProject() {
  try {download(await packProject(project,files),safeFileName(project.title)+".acf.json");notify("Project saved with its media");}
  catch(error){notify(error.message);}
}
function exportDialog() {
  $("export-message").value="";
  $("export-progress").hidden=true;
  $("encode-preview").hidden=true;
  exportAvailability();
  if(!dialog.open) dialog.showModal();
}
function exportAvailability() {
  const alpha=$("export-backdrop").value==="alpha";
  commands["export-movie"].disabled=alpha || !!outputTask;
  $("export-hint").textContent=alpha?"Save a transparent performer frame for compositing."
    :"The renderer writes every frame of your edited scene, along with the soundtrack.";
}
async function runExport(kind) {
  if(outputTask) return;
  const still=kind==="png";
  if(viewport.engine!=="webgl") {
    $("export-message").value="A WebGL renderer is required to export the live scene.";
    return;
  }
  const resume=playing;
  setPlaying(false);
  const cancel=new AbortController();
  outputTask=cancel;
  const h=Number($("export-size").value), w=Math.round(h*16/9), fps=Number($("export-fps").value);
  const canvas=element("canvas");canvas.width=w;canvas.height=h;
  const progress=$("export-progress"), message=$("export-message");
  const monitor=$("encode-preview");
  const backdrop=$("export-backdrop").value;
  const exportView={...preview,grid:project.grid,clean:false,backdrop};
  progress.hidden=still;progress.value=0;
  message.value=still?"Rendering frame…":"Preparing render…";
  commands["export-png"].disabled=commands["export-movie"].disabled=true;
  commands["cancel-export"].hidden=still;
  if(!still) {monitor.replaceChildren(canvas);monitor.hidden=false;}
  try {
    const required=still?[entryAt(frame).shot.asset]:[...new Set(project.shots.map(shot=>shot.asset))];
    await Promise.all(required.map(async id=>{
      if(id!==PERFORMER && !await ensureModel(id)) throw new Error("Open all the models before exporting.");
    }));
    if(!still && project.audio && loadedAudioId!==project.audio) {
      await loadAudio();
      if(loadedAudioId!==project.audio) throw new Error("Open a readable soundtrack before exporting this sequence.");
    }
    if(cancel.signal.aborted) throw new DOMException("Export canceled","AbortError");
    viewport.setOutput(canvas,still&&backdrop==="alpha");
    const basename=safeFileName(project.title);
    const draw=at=>{
      const segment=entryAt(at),model=modelCache.get(segment.shot.asset);
      viewport.draw(modulated(segment,at),at,exportView,model);
    };
    if(still) {
      draw(frame);
      download(await png(canvas),basename+"-"+frameLabel(frame).replaceAll(":","-")+(backdrop==="alpha"?"-alpha":"")+".png");
      message.value="Frame downloaded · "+w+" × "+h;
    } else {
      exportView.yaw=exportView.pitch=0;exportView.zoom=1;
      const frames=timeline.frames/FPS*fps, duration=Math.ceil(frames)/fps;
      const audio=loadedAudioId===project.audio?soundtrack.mix(duration,project.volume,project.audioOffset):null;
      const blob=await encodeScene({
        canvas,frames,fps,draw:seconds=>draw(seconds*FPS),
        audio,signal:cancel.signal,
        onProgress:(fraction,type)=>{
          progress.value=fraction;
          const percent=Math.floor(fraction*100)+"%";
          if(!message.value.endsWith(percent)) message.value=(type.includes("mp4")?"MP4":"WebM")+" · "+w+" × "+h+" · "+percent;
        },
      });
      progress.value=1;
      download(blob,basename+(blob.type.includes("mp4")?".mp4":".webm"));
      message.value="Video downloaded · "+w+" × "+h;
    }
  } catch(error) {
    message.value=error.name==="AbortError"?"Export canceled.":error.message;
  } finally {
    outputTask=null;viewport.setOutput(null);dirty=true;
    commands["export-png"].disabled=false;exportAvailability();
    commands["cancel-export"].hidden=true;
    if(resume && !document.hidden) setPlaying(true);
  }
}
function fullScreen() {
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  else app.requestFullscreen?.().catch(()=>notify("Full screen is unavailable here."));
}
function showPresentation() {
  if(window.parent!==window) window.parent.postMessage({type:"acf:show-presentation"},location.origin);
  else location.assign(asset("present.html?quality=4k"));
}
function cameraView(preset) {
  const settings={front:{yaw:14,tilt:0},side:{yaw:100,tilt:0},top:{yaw:14,tilt:27}};
  const entry=currentEntry(),baseAngle=(entry.orbit/ORBIT_SECONDS*360)%360;
  const value=settings[preset];
  setPlaying(false);seek(entry.start);
  preview={...preview,yaw:0,pitch:0,zoom:1};
  const pose={...value,yaw:((value.yaw-baseAngle+180)%360+360)%360-180};
  if(selectedStop==="end" && entry.shot.cameraEnd) {
    seek(entry.end-1);
    changeShot({orbit:0,cameraEnd:{...entry.shot.cameraEnd,...pose}});
  } else {
    changeShot({...pose,orbit:0});
  }
}
function skip(offset) {
  const index=timeline.segments.indexOf(entryAt(frame));
  const next=timeline.segments[(index+offset+timeline.segments.length)%timeline.segments.length];
  selectShot(next.shot.id);
}
const actions={
  play:()=>setPlaying(!playing), previous:()=>skip(-1), next:()=>skip(1),
  loop:()=>{looping=!looping;commands.loop.setAttribute("aria-pressed",String(looping));},
  add:()=>createShot(), duplicate:()=>createShot(true), split:splitShot, remove:removeShot,
  earlier:()=>moveShot(selected,project.shots.findIndex(shot=>shot.id===selected)-1),
  later:()=>moveShot(selected,project.shots.findIndex(shot=>shot.id===selected)+1),
  undo:()=>historyMove(backward,forward), redo:()=>historyMove(forward,backward),
  "reset-view":()=>{preview={...preview,yaw:0,pitch:0,zoom:1};dirty=true;},
  "use-view":()=>{
    const {shot}=currentEntry();
    const from=stopFor(shot,"yaw");
    const pose={
      yaw:((from.yaw+preview.yaw/TAU*360+180)%360+360)%360-180,
      tilt:clamp(from.tilt+preview.pitch/TAU*360,-30,30),
      zoom:clamp(from.zoom*preview.zoom,.7,1.52),
    };
    changeShot(from===shot?pose:{cameraEnd:{...from,...pose}});
    actions["reset-view"]();notify("Camera saved to the shot");
  },
  clean:()=>{preview.clean=!preview.clean;app.classList.toggle("clean-view",preview.clean);commands.clean.setAttribute("aria-pressed",String(preview.clean));dirty=true;},
  grid:()=>commit(next=>{next.grid=!next.grid;}),
  fullscreen:fullScreen, presentation:showPresentation,
  export:exportDialog, "export-png":()=>runExport("png"), "export-movie":()=>runExport("video"),
  "cancel-export":()=>outputTask?.abort(),
  new:()=>$("new-dialog").showModal(), open:()=>$("project-file").click(), save:downloadProject,
  import:()=>$("asset-file").click(), audio:()=>$("audio-file").click(),
  "audio-settings":()=>{
    if(!loadedAudioId){notify("The soundtrack is still loading.");return;}
    $("audio-source-name").textContent=project.assets.find(item=>item.id===project.audio)?.name??"";
    $("audio-offset").max=Math.max(0,soundtrack.duration-.025).toFixed(2);
    $("audio-offset").value=project.audioOffset.toFixed(2);
    $("audio-dialog").showModal();
  },
  "audio-replace":()=>{$("audio-dialog").close();$("audio-file").click();},
  "audio-apply":()=>{
    const offset=$("audio-offset");
    if(!Number.isFinite(offset.valueAsNumber)) return;
    const value=clamp(offset.valueAsNumber,0,Number(offset.max));
    if(value!==project.audioOffset) commit(next=>{next.audioOffset=value;});
    $("audio-dialog").close();
  },
  audition:()=>{
    audition=!audition;
    commands.audition.setAttribute("aria-pressed",String(audition));
    commands.audition.textContent=audition?"Audio on":"Audio off";
    if(audition) playAudio();
    else soundtrack.stop();
  },
  mute:()=>{commit(next=>{next.audio=null;});notify("Soundtrack removed from the sequence");},
};
function removeAsset(id) {
  const item=project.assets.find(asset=>asset.id===id);
  if(!item) return;
  commit(next=>{
    next.assets=next.assets.filter(asset=>asset.id!==id);
    if(next.audio===id) next.audio=null;
  });
  notify(item.name+" removed · Undo to restore");
}

for(const pass of ATLAS_PASSES) {
  const item=element("button","look-button");item.type="button";item.dataset.look=pass;item.title=materialName(pass);item.setAttribute("aria-label",materialName(pass));
  item.style.setProperty("--look-color",LOOKS[pass].color);item.style.setProperty("--sprite",sprite(pass));
  item.append(element("span","look-image"),element("span","look-name",SHORT_LOOKS[pass]));lookGrid.append(item);
}
app.addEventListener("click",event=>{
  const control=event.target.closest("button");
  if(!control || control.disabled) return;
  const {act,clip,look,asset:assetId,pane,angle,keypose,removeAsset:discard,template}=control.dataset;
  if(act) actions[act]?.();
  else if(discard) removeAsset(discard);
  else if(clip) {if(performance.now()>suppressClipClick) selectShot(clip);}
  else if(look) {retargetShot();changeShot({pass:look});}
  else if(assetId) {
    const kind=project.assets.find(item=>item.id===assetId)?.kind;
    if(kind==="audio") {
      if(project.audio!==assetId) commit(next=>{next.audio=assetId;next.audioOffset=0;});
    } else {retargetShot();changeShot({asset:assetId});}
  } else if(pane) {
    for(const button of app.querySelectorAll("[data-pane]")) button.setAttribute("aria-pressed",String(button.dataset.pane===pane));
    $("material-pane").hidden=pane!=="material";$("camera-pane").hidden=pane!=="camera";
  } else if(angle) cameraView(angle);
  else if(keypose) showKeyframe(keypose);
  else if(template) {
    const next=newProject(template);
    projectEpoch++;
    $("new-dialog").close();
    setPlaying(false);
    preview={...preview,yaw:0,pitch:0,zoom:1};
    updateProject(next,{selection:next.shots[0].id,position:"selected"});
    seek(0);
    notify(next.title+" ready · Undo restores the previous project");
  }
});
function retargetShot(key) {
  const item=currentEntry();
  if(poseControls.has(key) && item.shot.cameraEnd) {
    seek(selectedStop==="end"?item.end-1:item.start);
  } else if(playing || entryAt(frame).shot.id!==selected) seek(item.start+Math.min(7,item.shot.frames-1));
}
function adjustmentPatch(key,value) {
  const {shot}=currentEntry();
  const from=stopFor(shot,key);
  return from===shot?{[key]:value}:{cameraEnd:{...from,[key]:value}};
}
for(const control of sliders) {
  const key=control.dataset.adjust;
  if(control.type==="range") control.addEventListener("input",()=>{
    retargetShot(key);
    draft={...draft,...adjustmentPatch(key,Number(control.value))};dirty=true;
    formatControl(key,Number(control.value));
  });
  control.addEventListener("change",()=>{
    const value=control.tagName==="SELECT"?control.value:Number(control.value);
    retargetShot(key);
    if(key==="duration") {
      if(!Number.isFinite(control.valueAsNumber)){updateInspector();return;}
      const count=clamp(Math.round(control.valueAsNumber*FPS),MIN_SHOT,MAX_SHOT);
      if(count!==currentEntry().shot.frames) changeShot({frames:count});else updateInspector();
    } else if(value!==stopFor(currentEntry().shot,key)[key]) changeShot(adjustmentPatch(key,value));
    else {draft=null;dirty=true;}
  });
}
$("animate-camera").addEventListener("change",event=>{
  const {shot}=currentEntry();
  if(event.target.checked) {
    changeShot({cameraEnd:{
      yaw:((shot.yaw+196)%360+360)%360-180,
      tilt:shot.tilt,zoom:clamp(shot.zoom+.10,.7,1.52),ease:"smooth",
    }});
    showKeyframe("end");
  } else {
    changeShot({cameraEnd:null});showKeyframe("start");
  }
});
$("camera-ease").addEventListener("change",event=>{
  const {shot}=currentEntry();
  if(shot.cameraEnd) changeShot({cameraEnd:{...shot.cameraEnd,ease:event.target.value}});
});
$("project-name").addEventListener("change",event=>{
  if(event.target.value.trim()!==project.title) commit(next=>{next.title=event.target.value;});
  else event.target.value=project.title;
});
$("project-name").addEventListener("keydown",event=>{if(event.key==="Enter") event.target.blur();});
$("volume").addEventListener("input",event=>soundtrack.setVolume(Number(event.target.value)));
$("volume").addEventListener("change",event=>commit(next=>{next.volume=Number(event.target.value);}));
$("asset-file").addEventListener("change",event=>{queueIntake([...event.target.files]);event.target.value="";});
$("audio-file").addEventListener("change",event=>{queueIntake([...event.target.files],true);event.target.value="";});
$("project-file").addEventListener("change",event=>{if(event.target.files[0])openProject(event.target.files[0]);event.target.value="";});
$("asset-drop").addEventListener("dragover",event=>{event.preventDefault();event.currentTarget.classList.add("dragging");});
$("asset-drop").addEventListener("dragleave",event=>event.currentTarget.classList.remove("dragging"));
$("asset-drop").addEventListener("drop",event=>{
  event.preventDefault();event.currentTarget.classList.remove("dragging");queueIntake([...event.dataTransfer.files]);
});
clipLane.addEventListener("dragstart",event=>{
  if(trim){event.preventDefault();return;}
  const item=event.target.closest("[data-clip]");
  if(!item) return;
  dragId=item.dataset.clip;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",dragId);
});
clipLane.addEventListener("dragover",event=>{
  if(!dragId) return;
  const target=event.target.closest("[data-clip]");
  if(!target || target.dataset.clip===dragId) return;
  event.preventDefault();event.dataTransfer.dropEffect="move";
  if(dropTarget!==target){dropTarget?.classList.remove("drop-target");dropTarget=target;target.classList.add("drop-target");}
});
clipLane.addEventListener("drop",event=>{
  event.preventDefault();
  const id=event.target.closest("[data-clip]")?.dataset.clip;
  if(dragId && id) moveShot(dragId,project.shots.findIndex(shot=>shot.id===id));
  dropTarget?.classList.remove("drop-target");dragId=dropTarget=null;
});
clipLane.addEventListener("dragend",()=>{dropTarget?.classList.remove("drop-target");dragId=dropTarget=null;});
clipLane.addEventListener("pointerdown",event=>{
  if(event.button!==0 || !event.target.closest(".trim-grip")) return;
  const track=event.target.closest("[data-clip]");
  if(!track) return;
  const entry=timeline.segments.find(item=>item.shot.id===track.dataset.clip);
  if(!entry) return;
  event.preventDefault();
  selectShot(entry.shot.id);
  trim={pointer:event.pointerId,x:event.clientX,entry,track,frames:entry.shot.frames,
    ratio:timeline.frames/Math.max(1,clipLane.clientWidth)};
  clipLane.setPointerCapture(event.pointerId);
  clipLane.classList.add("trimming");
});
clipLane.addEventListener("pointermove",event=>{
  if(trim?.pointer!==event.pointerId) return;
  const frames=clamp(trim.entry.shot.frames+Math.round((event.clientX-trim.x)*trim.ratio),MIN_SHOT,MAX_SHOT);
  trim.frames=frames;
  trim.track.style.setProperty("--frames",frames);
  trim.track.querySelector("small").textContent=(frames/FPS).toFixed(2)+" s";
  $("shot-duration").value=(frames/FPS).toFixed(2);
});
for(const type of ["pointerup","pointercancel","lostpointercapture"]) clipLane.addEventListener(type,event=>{
  if(trim?.pointer!==event.pointerId) return;
  const gesture=trim;trim=null;
  clipLane.classList.remove("trimming");
  suppressClipClick=performance.now()+220;
  if(type==="pointerup" && gesture.frames!==gesture.entry.shot.frames) {
    changeShot({frames:gesture.frames});
  } else {
    gesture.track.style.setProperty("--frames",gesture.entry.shot.frames);
    gesture.track.querySelector("small").textContent=(gesture.entry.shot.frames/FPS).toFixed(2)+" s";
    updateInspector();
  }
});
scrubber.addEventListener("input",()=>seek(Number(scrubber.value),{focus:true}));
stage.addEventListener("pointerdown",event=>{
  if(event.button!==0 || outputTask) return;
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  stage.setPointerCapture(event.pointerId);stage.classList.add("dragging");
});
stage.addEventListener("pointermove",event=>{
  if(pointer?.id!==event.pointerId) return;
  preview.yaw+=(event.clientX-pointer.x)*.009;
  preview.pitch=clamp(preview.pitch+(event.clientY-pointer.y)*.006,-.42,.42);
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY};dirty=true;
});
for(const type of ["pointerup","pointercancel","lostpointercapture"])stage.addEventListener(type,event=>{
  if(pointer?.id===event.pointerId){pointer=null;stage.classList.remove("dragging");}
});
stage.addEventListener("wheel",event=>{
  event.preventDefault();preview.zoom=clamp(preview.zoom*Math.exp(-event.deltaY*.0013),.61,1.67);dirty=true;
},{passive:false});
stage.addEventListener("dblclick",actions["reset-view"]);
const stageObserver=new ResizeObserver(()=>{dirty=true;});
stageObserver.observe(stage);
dialog.addEventListener("close",()=>outputTask?.abort());
$("export-backdrop").addEventListener("change",exportAvailability);
document.addEventListener("keydown",event=>{
  if(event.repeat && !["ArrowLeft","ArrowRight"].includes(event.key)) return;
  if(document.querySelector("dialog[open]") || event.target.closest("input,select,textarea,[contenteditable]")) return;
  const cmd=event.ctrlKey||event.metaKey;
  const key=event.key.toLowerCase();
  let run;
  if(cmd && key==="z") run=event.shiftKey?actions.redo:actions.undo;
  else if(cmd && key==="s") run=actions.save;
  else if(!cmd && !event.altKey) {
    if(event.code==="Space" && !event.target.closest("button,a")) run=actions.play;
    else if(key==="f") run=actions.fullscreen;
    else if(key==="s") run=actions.split;
    else if(key==="delete") run=actions.remove;
    else if(key==="home") run=()=>seek(0,{focus:true});
    else if(key==="arrowleft" || key==="arrowright") run=()=>seek(Math.round(frame)+(key==="arrowleft"?-1:1)*(event.shiftKey?FPS:1),{focus:true});
  }
  if(run){event.preventDefault();run();}
});
motion.addEventListener("change",event=>{if(event.matches) setPlaying(false);});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden) {visiblePlaying=playing;soundtrack.stop();}
  else {lastTick=performance.now();if(visiblePlaying) playAudio();dirty=true;}
});
window.addEventListener("message",event=>{
  if(event.origin!==location.origin || event.source!==window.parent) return;
  if(event.data?.type==="acf:studio-visibility"){
    suspended=!event.data.visible;
    lastTick=performance.now();dirty=true;
    if(suspended) soundtrack.stop();
    else playAudio();
  }
});
window.addEventListener("pagehide",event=>{
  if(event.persisted) return;
  closed=true;
  if(saveTimer){clearTimeout(saveTimer);saveWorkspace(project,files).catch(()=>{});}
  cancelAnimationFrame(loopId);viewport.dispose();study.dispose();stageObserver.disconnect();waveformObserver.disconnect();
  for(const model of modelCache.values())model?.dispose();
  soundtrack.close();noticeTween?.kill();labelTween?.kill();outputTask?.abort();
},{once:true});

updateUI();setPlaying(playing,false);loopId=requestAnimationFrame(tick);
const workspaceReady=restoreWorkspace().then(data=>{
  if(data && changed===0){
    for(const [id,blob] of data.files) files.set(id,blob);
    project=data.project;timeline=schedule(project.shots);selected=project.shots[0].id;
    frame=0;preview.grid=project.grid;lastTick=performance.now();
    saveStatus.textContent="Saved on this device";updateUI();
  }
}).catch(()=>{saveStatus.textContent="Local storage unavailable";}).finally(loadAudio);
if(captureMode) {
  window.studioReel={
    async ready() {
      await Promise.all([workspaceReady,viewport.ready,study.ready,document.fonts.ready]);
      if(viewport.engine!=="webgl") throw new Error("The presentation capture requires WebGL.");
      setPlaying(true,false);
      return timeline.frames;
    },
    mark(at) {
      frame=clamp(at,0,timeline.frames-1);
      const cue=entryAt(frame);
      if(selected!==cue.shot.id) {selected=cue.shot.id;updateInspector();}
      actualRate=0;
      paint();syncTime(true);
      return cue.shot.pass;
    },
  };
}
