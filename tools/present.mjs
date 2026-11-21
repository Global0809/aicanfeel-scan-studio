// Launch the compiled website in a local application window using Node's built-in server.
import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const directory=fileURLToPath(new URL("../dist/",import.meta.url));
if(!existsSync(path.join(directory,"index.html")))throw new Error("Build the site with npm run build before starting the preview.");
const types={".html":"text/html", ".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png",".webp":"image/webp",".jpg":"image/jpeg",".mp4":"video/mp4",".m3u8":"application/vnd.apple.mpegurl",".m4s":"video/iso.segment",".webm":"video/webm",".json":"application/json",".glb":"model/gltf-binary",".woff":"font/woff",".woff2":"font/woff2",".txt":"text/plain"};
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405).end();return;}
    const url=new URL(req.url,"http://127.0.0.1");
    const routes={"/":"/index.html","/present":"/present.html"};
    const name=decodeURIComponent(url.pathname);
    const file=path.resolve(directory,"."+(routes[name]??name));
    const relative=path.relative(directory,file);
    if(relative.startsWith("..")||path.isAbsolute(relative)){res.writeHead(403).end();return;}
    const entry=await stat(file);
    if(!entry.isFile()){res.writeHead(404).end();return;}
    const headers={"Content-Type":types[path.extname(file).toLowerCase()]||"application/octet-stream","Accept-Ranges":"bytes","Cache-Control":"no-cache"};
    let start=0,end=entry.size-1,status=200;
    if(req.headers.range){
      const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!m||(!m[1]&&!m[2])){res.writeHead(416,{"Content-Range":"bytes */"+entry.size}).end();return;}
      start=m[1]?Number(m[1]):Math.max(0,entry.size-Number(m[2]));
      end=m[1]&&m[2]?Math.min(Number(m[2]),end):end;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end){res.writeHead(416,{"Content-Range":"bytes */"+entry.size}).end();return;}
      headers["Content-Range"]="bytes "+start+"-"+end+"/"+entry.size;status=206;
    }
    headers["Content-Length"]=Math.max(0,end-start+1);
    res.writeHead(status,headers);
    if(req.method==="HEAD"||entry.size===0){res.end();return;}
    const stream=createReadStream(file,{start,end});stream.on("error",()=>res.destroy());res.on("close",()=>stream.destroy());stream.pipe(res);
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
server.listen(0,"127.0.0.1",()=>{
  const url="http://127.0.0.1:"+server.address().port+"/";
  console.log("AICANFEEL Scan Studio\n"+url+"\nKeep this window open during the session. Ctrl+C closes the local server.");
  if(process.argv.includes("--server-only"))return;
  const dirs=[process.env.ProgramFiles,process.env["ProgramFiles(x86)"],process.env.LOCALAPPDATA].filter(Boolean);
  const candidates=dirs.flatMap(root=>["Google/Chrome/Application/chrome.exe","Microsoft/Edge/Application/msedge.exe"].map(exe=>path.join(root,exe)));
  const browser=candidates.find(existsSync);
  if(browser){const child=spawn(browser,["--app="+url,"--start-fullscreen"],{detached:true,stdio:"ignore",windowsHide:true});child.unref();}
  else if(process.platform==="darwin"){spawn("open",[url],{stdio:"ignore"}).unref();}
  else if(process.platform==="linux"){spawn("xdg-open",[url],{stdio:"ignore"}).on("error",()=>{}).unref();}
});

