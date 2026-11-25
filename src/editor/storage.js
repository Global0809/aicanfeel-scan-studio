import { ASSET_LIMIT, PROJECT_LIMIT, SESSION_SCORE, normalizeProject } from "./project.js";

const STORE = "workspace";
let database;
function openDatabase() {
  if (!database) database=new Promise((resolve,reject)=>{
    const request=indexedDB.open("aicanfeel-scan-studio",1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error("Project storage is in use in another tab."));
  });
  return database;
}
async function access(mode, run) {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);
    const request=run(tx.objectStore(STORE));
    tx.oncomplete=()=>resolve(request.result);
    tx.onabort=tx.onerror=()=>reject(tx.error || request.error || new Error("Project storage failed."));
  });
}
const activeFiles=(project,files)=>project.assets
  .filter(asset=>files.get(asset.id) instanceof Blob)
  .map(asset=>[asset.id,files.get(asset.id)]);

export async function restoreWorkspace() {
  const data=await access("readonly",table=>table.get("current"));
  if (!data) return null;
  return {project:normalizeProject(data.project),files:new Map(data.files)};
}
export function saveWorkspace(project,files) {
  return access("readwrite",table=>table.put({project,files:activeFiles(project,files)},"current"));
}

function assetAsBase64(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(",",2)[1]);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
export async function packProject(project,files) {
  const entries=activeFiles(project,files);
  const mediaBytes=entries.reduce((bytes,[,file])=>bytes+file.size,0);
  if (mediaBytes*4/3>PROJECT_LIMIT-20000) throw new Error("This project is too large to pack. Remove unused imports.");
  const media=await Promise.all(entries.map(async ([id,file])=>[id,await assetAsBase64(file)]));
  return new Blob([JSON.stringify({format:"AICANFEEL-SCAN-STUDIO",project,media})],
    {type:"application/json"});
}
export async function unpackProject(file) {
  if(file.size>PROJECT_LIMIT) throw new Error("Project exceeds the 80 MB limit.");
  let document;
  try { document=JSON.parse(await file.text()); }
  catch { throw new Error("This file is not readable project JSON."); }
  if(document?.format!=="AICANFEEL-SCAN-STUDIO") throw new Error("Choose an .acf.json project from Scan Studio.");
  const project=normalizeProject(document.project);
  const files=new Map();
  const records=Array.isArray(document.media)?document.media.slice(0,12):[];
  for (const asset of project.assets) {
    if(asset.id===SESSION_SCORE) continue;
    const encoded=records.find(record=>Array.isArray(record) && record[0]===asset.id)?.[1];
    if (typeof encoded!=="string" || encoded.length>Math.ceil(ASSET_LIMIT/3)*4) {
      throw new Error("The project is missing "+asset.name+".");
    }
    const raw=atob(encoded);
    if (raw.length>ASSET_LIMIT) throw new Error("An asset exceeds the 28 MB limit.");
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<bytes.length;i++) bytes[i]=raw.charCodeAt(i);
    files.set(asset.id,new Blob([bytes]));
  }
  return {project,files};
}
export function download(blob,fileName) {
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download=fileName;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
