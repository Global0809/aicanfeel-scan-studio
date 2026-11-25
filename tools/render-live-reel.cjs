const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawn}=require("node:child_process");
const {once}=require("node:events");
const {parseArgs}=require("node:util");
const {values}=parseArgs({options:{url:{type:"string"},out:{type:"string"},poster:{type:"string"},frames:{type:"string"},playwright:{type:"string"}}});
const program=process.env.FFMPEG_PATH??"ffmpeg";
const playwrightPath=values.playwright??process.env.PLAYWRIGHT_MODULE??path.join(os.homedir(),".cache","codex-runtimes","codex-primary-runtime","dependencies","node","node_modules","playwright");
const {chromium}=require(playwrightPath);
const destination=path.resolve(values.out??"output/live-studio-4k60.mp4");
const poster=values.poster?path.resolve(values.poster):null;
const width=3840,height=2160,fps=60;

async function capture() {
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  const browser=await chromium.launch({channel:"chrome",headless:true,args:["--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
  let encoder;
  try {
    const page=await browser.newPage({viewport:{width,height},screen:{width,height},deviceScaleFactor:1,reducedMotion:"reduce"});
    const url=new URL(values.url??"http://127.0.0.1:5365/studio.html");url.searchParams.set("capture","1");
    const response=await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:30000});
    if(!response?.ok()) throw new Error("Open the development studio first.");
    const frameCount=await page.evaluate(()=>window.studioReel.ready());
    const frames=Math.min(frameCount,Number(values.frames??frameCount));
    if(!Number.isInteger(frames)||frames<1) throw new Error("Choose a valid frame count.");
    await page.evaluate(()=>window.studioReel.mark(0));
    const cdp=await page.context().newCDPSession(page);
    const dimensions=await page.locator("#stage-canvas").evaluate(canvas=>[canvas.width,canvas.height]);
    console.log(JSON.stringify({frames,width,height,fps,stage:dimensions}));
    encoder=spawn(program,[
      "-hide_banner","-loglevel","error","-nostdin","-y","-f","image2pipe","-framerate",String(fps),"-vcodec","mjpeg","-threads","3","-i","-",
      "-vf","scale=in_range=pc:out_range=tv:out_color_matrix=bt709","-pix_fmt","yuv420p","-c:v","libx264","-preset","ultrafast",
      "-crf","15","-threads","6","-g","120","-keyint_min","120","-sc_threshold","0",
      "-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709","-color_range","tv","-movflags","+faststart",destination,
    ],{stdio:["pipe","inherit","inherit"],windowsHide:true});
    const completed=once(encoder,"close");
    let pipeFault;
    encoder.stdin.on("error",error=>{pipeFault=error;});
    const origin=performance.now(),passes=new Set();
    for(let frame=0;frame<frames;frame++) {
      const pass=await page.evaluate(index=>window.studioReel.mark(index),frame);
      passes.add(pass);
      const screenshot=await cdp.send("Page.captureScreenshot",{format:"jpeg",quality:94,fromSurface:true});
      const jpeg=Buffer.from(screenshot.data,"base64");
      if(pipeFault) throw pipeFault;
      if(!encoder.stdin.write(jpeg)) await once(encoder.stdin,"drain");
      if(frame===24 && poster) fs.writeFileSync(poster,jpeg);
      if((frame+1)%60===0 || frame+1===frames) console.log(JSON.stringify({
        frame:frame+1,frames,pass,elapsed:+((performance.now()-origin)/1000).toFixed(1)}));
    }
    encoder.stdin.end();
    const [code]=await completed;
    if(code!==0) throw new Error("FFmpeg failed with code "+code);
    console.log(JSON.stringify({destination,passes:[...passes],bytes:fs.statSync(destination).size,frames}));
  } finally {
    if(encoder && encoder.exitCode===null) encoder.kill();
    await browser.close();
  }
}
capture().catch(error=>{console.error(error.message);process.exitCode=1});
