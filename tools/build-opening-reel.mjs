// A small rendition of the same turntable keeps the viewport in motion while the 3D scene loads.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATLAS_PASSES, PASSES, PASS_SECONDS } from "../src/sequence.js";
const root=fileURLToPath(new URL("../public/replay/",import.meta.url));
const rate=60, count=PASSES.length*PASS_SECONDS*rate;
const frameInPass="floor(n/"+(PASS_SECONDS*rate)+")";
const tile=PASSES.reduceRight((rest,pass,index)=>"if(eq("+frameInPass+","+index+"),"+ATLAS_PASSES.indexOf(pass)+","+rest+")","0");
const filter="setpts=N/(60*TB),crop=iw/4:ih/2:x='out_w*mod("+tile+",4)':y='out_h*floor("+tile+"/4)',scale=544:384:flags=lanczos,setsar=1";
const output=path.join(root,"opening-reel.mp4"),pending=path.join(path.dirname(output),".opening-"+process.pid+".mp4");
const run=(bin,args)=>{const r=spawnSync(bin,args,{encoding:"utf8",windowsHide:true});if(r.status!==0)throw Error(r.stderr||"Encoder failed");return r.stdout;};
try{
  run(process.env.FFMPEG_PATH||"ffmpeg",["-y","-v","error","-threads","2","-stream_loop","-1","-i",path.join(root,"scan-atlas.mp4"),"-an","-filter_threads","2","-vf",filter,"-r",String(rate),"-frames:v",String(count),"-c:v","libx264","-threads","2","-preset","fast","-crf","24","-maxrate","870k","-bufsize","300k","-g","30","-keyint_min","30","-sc_threshold","0","-pix_fmt","yuv420p","-movflags","+faststart",pending]);
  const probe=JSON.parse(run(process.env.FFPROBE_PATH||"ffprobe",["-v","error","-show_entries","stream=width,height,nb_frames,avg_frame_rate,duration","-of","json",pending])).streams[0];
  if(probe.width!==544||probe.height!==384||Number(probe.nb_frames)!==count||probe.avg_frame_rate!=="60/1")throw Error("Opening reel frame mismatch");
  fs.renameSync(pending,output);console.log(JSON.stringify({output,bytes:fs.statSync(output).size,...probe}));
}finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}

