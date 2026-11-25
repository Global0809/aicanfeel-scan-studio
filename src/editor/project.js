import { ATLAS_PASSES, LOOKS, ORBIT_SECONDS, orbitAngle, orbitPitch, wrap } from "../sequence.js";

export const FPS = 60;
export const MAX_SHOTS = 32;
export const MIN_SHOT = 15;
export const MAX_SHOT = 900;
export const ASSET_LIMIT = 28 * 1024 * 1024;
export const PROJECT_LIMIT = 80 * 1024 * 1024;
export const PERFORMER = "performer";
export const SESSION_SCORE = "studio-score";
export const SHORT_LOOKS = {
  points: "Point cloud", uv: "UV grid", alloy: "Titanium", motion: "Motion field",
  topology: "Topology", capture: "Capture", surface: "Surface", clay: "Clay",
};
export const GRADES = {
  polar: { title:"Polar", backdrop:"#101d28", tint:"#71ede3", filter:"none" },
  ember: { title:"Ember", backdrop:"#221a22", tint:"#ff9375", filter:"sepia(.20) saturate(1.24)" },
  violet: { title:"Violet", backdrop:"#1d172d", tint:"#bc9bff", filter:"hue-rotate(20deg) saturate(1.16)" },
  neutral: { title:"Neutral", backdrop:"#1e2328", tint:"#d4e3ec", filter:"saturate(.72)" },
};
const TRANSITIONS = ["scan", "cut", "dip"];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback, min, max) =>
  typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
const name = (text, fallback, length=60) => typeof text === "string" && text.trim()
  ? text.trim().replace(/[\x00-\x1f\x7f]/g, "").slice(0,length) || fallback
  : fallback;

export function makeShot(pass = "points", patch = {}) {
  return {
    id:crypto.randomUUID(), asset:PERFORMER, pass,
    frames:120, orbit:1, yaw:0, tilt:0, zoom:.95, cameraEnd:null,
    scan:72, pulse:0, exposure:1, grade:"polar", transition:"scan", ...patch,
  };
}
export function exampleProject() {
  const settings = [
    ["points",{scan:81,pulse:53}],
    ["uv",{zoom:.94,scan:76,pulse:41,cameraEnd:{yaw:13,tilt:4,zoom:1,ease:"smooth"}}],
    ["alloy",{grade:"violet",exposure:1.13,pulse:35}],
    ["motion",{grade:"ember",orbit:.90,pulse:62,cameraEnd:{yaw:1,tilt:8,zoom:.99,ease:"smooth"}}],
    ["topology",{zoom:.99,scan:72,pulse:55}],
    ["capture",{grade:"neutral",scan:80,orbit:.52,pulse:44}],
    ["clay",{grade:"ember",orbit:.42,pulse:22}],
    ["surface",{orbit:ORBIT_SECONDS-5.84,transition:"dip",pulse:38}],
  ];
  return {
    version:1, title:"Performer 01", shots:settings.map(([pass,patch])=>makeShot(pass,patch)),
    assets:[{id:SESSION_SCORE,name:"Session Pulse",kind:"audio"}], audio:SESSION_SCORE, audioOffset:0, volume:.8, grid:true,
  };
}
export function newProject(template) {
  if(template==="performer") return exampleProject();
  const looks={
    materials:["uv","alloy","clay","surface"],
    motion:["points","motion","topology","alloy"],
    blank:["points"],
  };
  const names={materials:"Material tests",motion:"Motion study",blank:"Untitled scene"};
  const shots=(looks[template]??looks.blank).map((pass,index)=>makeShot(pass,{
    grade:template==="materials"?["polar","violet","ember","neutral"][index]:"polar",
    cameraEnd:template==="motion"?{yaw:18,tilt:7,zoom:1.04,ease:"smooth"}:null,
  }));
  return {version:1,title:names[template]??names.blank,shots,assets:[],audio:null,audioOffset:0,volume:.8,grid:true};
}
export function assetKind(fileName) {
  if (/\.glb$/i.test(fileName)) return "model";
  if (/\.(mp3|wav|m4a|aac|ogg|opus|flac|aiff|aif)$/i.test(fileName)) return "audio";
  return null;
}
export function normalizeProject(input) {
  if (input?.version!==1 || !Array.isArray(input.shots) || input.shots.length<1 || input.shots.length>MAX_SHOTS) {
    throw new Error("Choose a valid Scan Studio project with 1–32 shots.");
  }
  const assets = [], ids = new Set([PERFORMER]);
  if (Array.isArray(input.assets)) for (const item of input.assets.slice(0,12)) {
    if (typeof item?.id!=="string" || !/^[a-z0-9-]{4,72}$/i.test(item.id) || ids.has(item.id)) continue;
    if ((item.kind!=="model" && item.kind!=="audio") || (item.id===SESSION_SCORE && item.kind!=="audio")) continue;
    ids.add(item.id);
    assets.push({id:item.id, name:name(item.name,"Imported asset",96), kind:item.kind});
  }
  const models = new Set([PERFORMER,...assets.filter(asset=>asset.kind==="model").map(asset=>asset.id)]);
  const shotIds = new Set();
  const shots = input.shots.map(raw => {
    const shot = raw ?? {};
    const id = typeof shot.id==="string" && /^[a-z0-9-]{4,72}$/i.test(shot.id) && !shotIds.has(shot.id)
      ? shot.id : crypto.randomUUID();
    shotIds.add(id);
    return makeShot(ATLAS_PASSES.includes(shot.pass) ? shot.pass : "points", {
      id, asset:models.has(shot.asset)?shot.asset:PERFORMER,
      frames:Math.round(number(shot.frames,120,MIN_SHOT,MAX_SHOT)),
      orbit:number(shot.orbit,1,-2,2), yaw:number(shot.yaw,0,-180,180), tilt:number(shot.tilt,0,-30,30),
      zoom:number(shot.zoom,.95,.7,1.52), scan:number(shot.scan,72,0,100), pulse:number(shot.pulse,0,0,100),
      exposure:number(shot.exposure,1,.55,1.65),
      grade:Object.hasOwn(GRADES,shot.grade)?shot.grade:"polar",
      transition:TRANSITIONS.includes(shot.transition)?shot.transition:"scan",
      cameraEnd:shot.cameraEnd && typeof shot.cameraEnd==="object"?{
        yaw:number(shot.cameraEnd.yaw,0,-180,180),tilt:number(shot.cameraEnd.tilt,0,-30,30),
        zoom:number(shot.cameraEnd.zoom,.95,.7,1.52),ease:shot.cameraEnd.ease==="linear"?"linear":"smooth",
      }:null,
    });
  });
  return {
    version:1, title:name(input.title,"Untitled scene"), shots, assets,
    audio:assets.some(asset=>asset.kind==="audio" && asset.id===input.audio)?input.audio:null,
    audioOffset:number(input.audioOffset,0,0,1800),volume:number(input.volume,.8,0,1), grid:input.grid!==false,
  };
}

export function schedule(shots) {
  let start=0, orbit=0;
  const segments=shots.map(shot=>{
    const entry={shot,start,end:start+shot.frames,orbit};
    start=entry.end;
    orbit+=shot.frames/FPS*shot.orbit;
    return entry;
  });
  return {segments, frames:start, orbit};
}
export function cameraAt(shot, local) {
  const { yaw,tilt,zoom,cameraEnd }=shot;
  if(!cameraEnd) return {yaw,tilt,zoom};
  const t=clamp(local/Math.max(1,shot.frames-1),0,1);
  const q=cameraEnd.ease==="linear"?t:t*t*(3-2*t);
  const rotation=((cameraEnd.yaw-yaw+180)%360+360)%360-180;
  return {
    yaw:((yaw+rotation*q+180)%360+360)%360-180,
    tilt:tilt+(cameraEnd.tilt-tilt)*q,
    zoom:zoom+(cameraEnd.zoom-zoom)*q,
  };
}
export function angleAt(entry, local, turns = 0) {
  const t = entry.orbit + local / FPS * entry.shot.orbit + turns;
  const {yaw,tilt,zoom}=cameraAt(entry.shot,local);
  return {
    angle:orbitAngle(t) + yaw*Math.PI/180,
    pitch:.045 + orbitPitch(t) + tilt*Math.PI/180,
    zoom, yaw, orbitTime:wrap(t,ORBIT_SECONDS),
  };
}
export function frameLabel(frame) {
  const whole=Math.max(0,Math.floor(frame));
  const pad=value=>String(value).padStart(2,"0");
  return pad(Math.floor(whole/(FPS*60)))+":"+pad(Math.floor(whole/FPS)%60)+":"+pad(whole%FPS);
}
export function materialName(key) { return LOOKS[key]?.title ?? "Point cloud"; }
export function safeFileName(title) {
  return title.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase() || "scan-studio";
}
