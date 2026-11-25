import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const source=path.resolve(process.argv[2]??"output/live-studio-4k60.mp4");
const poster=process.argv[3]?path.resolve(process.argv[3]):null;
const root=fileURLToPath(new URL("../",import.meta.url));
const media=path.join(root,"public","replay");
const stage=fs.mkdtempSync(path.join(os.tmpdir(),"acf-reel-"));
const ffmpeg=process.env.FFMPEG_PATH??"ffmpeg";
const ffprobe=process.env.FFPROBE_PATH??"ffprobe";
const input=["-hide_banner","-loglevel","error","-nostdin","-y","-threads","3","-i",source,"-an"];
const colors=["-colorspace","bt709","-color_trc","bt709","-color_primaries","bt709","-color_range","tv","-pix_fmt","yuv420p"];
const sourceProbe=readVideo(source);
const fps=60, frames=Number(sourceProbe.nb_frames), seconds=frames/fps;
if(sourceProbe.width!==3840 || sourceProbe.height!==2160 || sourceProbe.avg_frame_rate!=="60/1" || !frames || frames%120!==0) {
  fs.rmdirSync(stage);
  throw new Error("The 4K master must have a whole number of two-second, 60 fps fragments.");
}
function readVideo(file,decode=false) {
  const data=execFileSync(ffprobe,[
    "-v","error","-threads","4","-select_streams","v:0",...(decode?["-count_frames"]:[]),
    "-show_entries","stream=width,height,avg_frame_rate,nb_frames,nb_read_frames,profile,level,pix_fmt:format=duration",
    "-of","json",file,
  ],{encoding:"utf8",maxBuffer:20*1024*1024,windowsHide:true});
  return JSON.parse(data).streams[0];
}
function encode(label,args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(ffmpeg,args,{cwd:stage,stdio:["ignore","inherit","inherit"],windowsHide:true});
    child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(Error(label+" failed ("+code+").")));
  });
}
function fragments(prefix,bitrate,limit,preset) {
  return [
    ...input,"-c:v","libx264","-profile:v","high","-level:v","5.2","-threads","7","-preset",preset,
    "-b:v",bitrate,"-maxrate",limit,"-bufsize",String(Math.round(parseInt(bitrate)*.90))+"k",
    "-g","120","-keyint_min","120","-bf","0","-sc_threshold","0",
    "-x264-params","open-gop=0:force-cfr=1","-video_track_timescale","15360",...colors,
    "-hls_time","2","-hls_playlist_type","vod","-hls_flags","independent_segments",
    "-hls_segment_type","fmp4","-hls_fmp4_init_filename",prefix+"-init.mp4",
    "-hls_segment_filename",prefix+"-%03d.m4s",prefix+".m3u8",
  ];
}
function validateStream(prefix) {
  const list=fs.readFileSync(path.join(stage,prefix+".m3u8"),"utf8");
  const matches=Array.from(list.matchAll(/^#EXTINF:([\d.]+),[^\n]*\r?\n([^\r\n]+)/gm));
  if(matches.length!==seconds/2 || !list.includes("#EXT-X-INDEPENDENT-SEGMENTS") ||
    matches.some(([_,len,uri],i)=>Math.abs(Number(len)-2)>.001||uri!==prefix+"-"+String(i).padStart(3,"0")+".m4s")) {
    throw Error("Unexpected fragment timestamps for "+prefix);
  }
  const check=readVideo(path.join(stage,prefix+".m3u8"),true);
  if(check.width!==3840||check.height!==2160||check.avg_frame_rate!=="60/1"||Number(check.nb_read_frames)!==frames||
    check.profile!=="High"||check.level!==52||check.pix_fmt!=="yuv420p") throw new Error("Invalid "+prefix+" video.");
  const lengths=matches.map(match=>fs.statSync(path.join(stage,match[2])).size);
  return {
    bandwidth:Math.ceil(Math.max(...lengths)*4*1.02),
    average:Math.ceil(lengths.reduce((a,b)=>a+b,0)*8/seconds),
  };
}
try {
  const encoded=await Promise.allSettled([
    encode("Studio UHD",fragments("workspace-4k","22500k","24600k","fast")),
    encode("Call UHD",fragments("workspace-call-4k","6500k","7100k","fast")),
    encode("Progressive HD",[
      ...input,"-vf","scale=1920:1080:flags=lanczos","-c:v","libx264","-threads","5",
      "-profile:v","high","-level:v","4.2","-preset","fast","-crf","19","-maxrate","5200k","-bufsize","8000k",
      "-g","120","-movflags","+faststart",...colors,"workspace-hd.mp4",
    ]),
    encode("Poster",["-hide_banner","-loglevel","error","-y",...(!poster?["-ss",".4"]:[]),"-i",poster??source,
      "-vf","scale=1920:1080:flags=lanczos","-frames:v","1","-q:v","3","workspace-preview.jpg"]),
  ]);
  const failed=encoded.find(result=>result.status==="rejected");
  if(failed) throw failed.reason;
  const studio=validateStream("workspace-4k"), call=validateStream("workspace-call-4k");
  const hd=readVideo(path.join(stage,"workspace-hd.mp4"),true);
  if(hd.width!==1920 || hd.height!==1080 || hd.avg_frame_rate!=="60/1" || Number(hd.nb_read_frames)!==frames) throw new Error("Invalid HD presentation.");
  const variant=(data,file)=>"#EXT-X-STREAM-INF:BANDWIDTH="+data.bandwidth+",AVERAGE-BANDWIDTH="+data.average+
    ',RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="avc1.640034"\n'+file;
  fs.writeFileSync(path.join(stage,"workspace-adaptive.m3u8"),[
    "#EXTM3U","#EXT-X-VERSION:7","#EXT-X-INDEPENDENT-SEGMENTS",
    variant(call,"workspace-call-4k.m3u8"),variant(studio,"workspace-4k.m3u8"),"",
  ].join("\n"));
  const outputs=fs.readdirSync(stage);
  const total=outputs.reduce((bytes,file)=>bytes+fs.statSync(path.join(stage,file)).size,0);
  for(const file of outputs) fs.copyFileSync(path.join(stage,file),
    path.join(root,"public",file.endsWith(".jpg")?"brand":"replay",file));
  console.log(JSON.stringify({frames,seconds,studio,call,files:outputs.length,total}));
} finally {
  for(const file of fs.readdirSync(stage)) fs.unlinkSync(path.join(stage,file));
  fs.rmdirSync(stage);
}
