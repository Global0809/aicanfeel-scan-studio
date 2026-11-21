// Encode the lightweight 4K presentation with local FFmpeg/FFprobe. Both binaries may be overridden.
// node tools/encode-call-4k.mjs [--input master.mp4] [--output-dir path] [--encoder auto|nvenc|x264]
//                               [--ffmpeg path] [--ffprobe path] [--verify-only]
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const {values}=parseArgs({options:{
  input:{type:"string",default:path.join(root,"output","AICANFEEL-Scan-Studio-4K60.mp4")},
  "output-dir":{type:"string",default:path.join(root,"public","replay")},
  encoder:{type:"string",default:"auto"},
  ffmpeg:{type:"string",default:process.env.FFMPEG_PATH||"ffmpeg"},
  ffprobe:{type:"string",default:process.env.FFPROBE_PATH||"ffprobe"},
  "verify-only":{type:"boolean",default:false},
}});
const input=path.resolve(values.input),destination=path.resolve(values["output-dir"]);
const segmentName=i=>"call-4k-"+String(i).padStart(3,"0")+".m4s";
const initName="call-4k-init.mp4",playlistName="call-4k.m3u8";
const names=Array.from({length:19},(_,index)=>segmentName(index));

function assert(condition,message) {if(!condition)throw new Error(message);}
function invoke(binary,args,options={}) {
  const run=spawnSync(binary,args,{encoding:"utf8",windowsHide:true,maxBuffer:16*1024*1024,...options});
  if(run.error)throw run.error;
  if(run.status!==0)throw new Error((run.stderr||run.stdout||binary+" returned "+run.status).trim());
  return run.stdout||"";
}
function sourceInfo() {
  const json=invoke(values.ffprobe,["-v","error","-select_streams","v:0","-show_entries",
    "stream=width,height,avg_frame_rate,nb_frames,duration","-of","json",input]);
  const {width,height,avg_frame_rate,nb_frames,duration}=JSON.parse(json).streams[0];
  assert(width===3840&&height===2160&&avg_frame_rate==="60/1"&&Number(nb_frames)===2280&&Math.abs(Number(duration)-38)<.001,
    "Expected a 38-second 3840×2160 60 fps master containing exactly 2280 frames.");
}
const encoders={
  nvenc:{name:"h264_nvenc",decode:["-hwaccel","cuda","-hwaccel_output_format","cuda"],options:[
    "-preset","p7","-tune","hq","-multipass","fullres","-rc","cbr","-rc-lookahead","12","-spatial-aq","1",
    "-aq-strength","7","-temporal-aq","1","-strict_gop","1","-no-scenecut","1","-forced-idr","1"]},
  x264:{name:"libx264",decode:[],options:["-preset","veryfast","-threads","2","-pix_fmt","yuv420p",
    "-x264-params","nal-hrd=cbr:force-cfr=1:scenecut=0:min-keyint=120:lookahead-threads=1"]},
};
function encode(staging) {
  const requested=values.encoder;
  assert(requested==="auto"||Object.hasOwn(encoders,requested),"Unknown encoder "+requested);
  const candidates=requested==="auto"?["nvenc","x264"]:[requested];
  for(const [index,key] of candidates.entries()){
    const backend=encoders[key];
    try{
      // Driver/API compatibility is only established after actually encoding a frame.
      invoke(values.ffmpeg,["-v","error","-f","lavfi","-i","color=s=256x256:r=60","-frames:v","2",
        "-c:v",backend.name,"-f","null","-"]);
      console.log("Encoding with "+backend.name);
      invoke(values.ffmpeg,["-nostdin","-y","-hide_banner","-loglevel","error",...backend.decode,"-threads","2","-i",input,
        "-map","0:v:0","-an","-sn","-dn","-map_metadata","-1","-c:v",backend.name,...backend.options,
        "-b:v","6650k","-maxrate","6650k","-bufsize","1700k","-g","120","-bf","0",
        "-force_key_frames","expr:gte(t,n_forced*2)","-profile:v","high","-level:v","5.2","-color_range","tv",
        "-colorspace","bt709","-color_trc","bt709","-color_primaries","bt709","-fps_mode","passthrough",
        "-avoid_negative_ts","disabled","-f","hls","-hls_time","2","-hls_list_size","0","-hls_playlist_type","vod",
        "-hls_segment_type","fmp4","-hls_flags","independent_segments","-hls_fmp4_init_filename",initName,
        "-hls_segment_filename","call-4k-%03d.m4s",playlistName],{cwd:staging});
      verify(staging);
      return key;
    }catch(error){
      if(index===candidates.length-1)throw error;
      console.warn(backend.name+" did not produce a verified rendition: "+error.message.split("\n")[0]);
    }
  }
}

function firstVideoNalIsIdr(media,lengthBytes) {
  for(let offset=0;offset+8<=media.length;){
    const length=media.readUInt32BE(offset),type=media.toString("ascii",offset+4,offset+8);
    if(length<8||offset+length>media.length)return false;
    if(type==="mdat"){
      const end=offset+length;
      for(let at=offset+8;at+lengthBytes<end;){
        const size=media.readUIntBE(at,lengthBytes);at+=lengthBytes;
        if(!size||at+size>end)return false;
        const nalType=media[at]&31;
        if(nalType>=1&&nalType<=5)return nalType===5;
        at+=size;
      }
      return false;
    }
    offset+=length;
  }
  return false;
}

function verify(folder) {
  const init=readFileSync(path.join(folder,initName));
  const avcc=init.indexOf("avcC");
  assert(avcc>=0&&init[avcc+4]===1,"Missing AVC decoder configuration.");
  const codec="avc1."+init.subarray(avcc+5,avcc+8).toString("hex");
  const nalLengthBytes=(init[avcc+8]&3)+1;
  assert(codec==="avc1.640034","Unexpected AVC profile/level "+codec);
  const playlist=readFileSync(path.join(folder,playlistName),"utf8");
  assert(playlist.includes('#EXT-X-MAP:URI="'+initName+'"')&&playlist.includes("#EXT-X-INDEPENDENT-SEGMENTS")&&playlist.includes("#EXT-X-ENDLIST"),
    "Missing VOD initialization, independence, or end marker.");
  const entries=[...playlist.matchAll(/^#EXTINF:([0-9.]+),\r?\n([^\r\n]+)/gm)];
  assert(entries.length===19,"Expected 19 segments.");
  const sizes=[];
  for(let i=0;i<entries.length;i++){
    assert(Number(entries[i][1])===2&&entries[i][2]===names[i],"Incorrect manifest entry "+i);
    const media=readFileSync(path.join(folder,names[i]));
    sizes.push(media.length);
    assert(firstVideoNalIsIdr(media,nalLengthBytes),"Fragment does not start with an AVC IDR picture: "+names[i]);
    // Probe each fragment with only its init bytes. No preceding media segment is available.
    const probe=invoke(values.ffprobe,["-v","error","-threads","1","-select_streams","v:0","-show_streams","-show_packets",
      "-show_entries","stream=codec_name,profile,width,height,pix_fmt,level,has_b_frames,time_base,r_frame_rate,color_range,color_space,color_transfer,color_primaries:packet=pts,dts,duration,flags",
      "-of","json","pipe:0"],{input:Buffer.concat([init,media])});
    const {streams:[stream],packets}=JSON.parse(probe);
    assert(stream.codec_name==="h264"&&stream.profile==="High"&&stream.level===52&&stream.width===3840&&stream.height===2160
      &&stream.has_b_frames===0&&stream.pix_fmt==="yuv420p"&&stream.r_frame_rate==="60/1"&&stream.time_base==="1/15360"
      &&stream.color_range==="tv"&&stream.color_space==="bt709"&&stream.color_transfer==="bt709"&&stream.color_primaries==="bt709",
      "Unexpected stream metadata in "+names[i]+": "+JSON.stringify(stream));
    assert(packets.length===120&&packets[0].flags.includes("K"),"Fragment must start with an independent keyframe and contain 120 frames.");
    for(let n=0;n<packets.length;n++) {
      const packet=packets[n],time=(i*120+n)*256;
      assert(packet.pts===time&&packet.dts===time&&packet.duration===256,"Discontinuity in "+names[i]+" at sample "+n);
    }
  }
  const bytes=sizes.reduce((sum,length)=>sum+length,0)+init.length;
  const average=bytes*8/38,peak=Math.max(...sizes)*4;
  assert(average<7_500_000&&peak<8_000_000,"Rendition exceeded the shared-call bitrate budget.");
  // Decode all samples in sequence with the software decoder as a portability check.
  const decoded=invoke(values.ffmpeg,["-nostdin","-hide_banner","-loglevel","error","-xerror","-threads","2","-i",
    path.join(folder,playlistName),"-map","0:v:0","-an","-progress","pipe:1","-nostats","-f","null","-"]);
  const counts=[...decoded.matchAll(/^frame=(\d+)$/gm)];
  assert(Number(counts.at(-1)?.[1])===2280,"Could not decode every presentation frame.");
  const result={frames:2280,duration:38,width:3840,height:2160,fps:60,codec,timescale:15360,
    averageMbps:Number((average/1e6).toFixed(3)),peakSegmentMbps:Number((peak/1e6).toFixed(3)),bytes,
    minSegmentBytes:Math.min(...sizes),maxSegmentBytes:Math.max(...sizes)};
  console.log(JSON.stringify(result,null,2));return result;
}

if(values["verify-only"])verify(destination);
else {
  sourceInfo();
  const staging=mkdtempSync(path.join(tmpdir(),"acf-call-4k-"));
  try{
    encode(staging);mkdirSync(destination,{recursive:true});
    // Publish a verified manifest last. Copy-by-name keeps other render qualities independent.
    for(const name of [initName,...names,playlistName]) {
      const target=path.join(destination,name),temporary=target+"."+process.pid+".tmp";
      try{copyFileSync(path.join(staging,name),temporary);renameSync(temporary,target);}
      finally{if(existsSync(temporary)&&statSync(temporary).isFile())rmSync(temporary);}
    }
    console.log("Verified call rendition at",path.join(destination,playlistName));
  }finally{
    const normalized=path.resolve(staging);
    assert(path.dirname(normalized)===path.resolve(tmpdir())&&path.basename(normalized).startsWith("acf-call-4k-"),
      "Unexpected temporary staging path.");
    rmSync(normalized,{recursive:true,force:true});
  }
}
