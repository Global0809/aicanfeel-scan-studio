import { asset } from "../ui.js";
import { ATLAS_PASSES, ORBIT_SECONDS, WIPE_SECONDS, wrap } from "../sequence.js";
import { GRADES, clamp, angleAt, FPS, PERFORMER } from "./project.js";

const worldLayers = {
  grid:true,cameras:true,landmarks:true,surface:true,points:true,topology:false,
  reprojection:true,depth:false,intensity:76,density:88,hidden:new Set(["retopo"]),
};

export function createViewport(host, canvas, notify) {
  let world=null, engine="loading", lastAtlasTime=-1, output=null, stopped=false;
  let width=0,height=0;
  const target=canvas.getContext("2d",{alpha:false});
  const poster=new Image();
  poster.src=asset("replay/scan-poster.webp");
  const atlas=document.createElement("video");
  atlas.muted=true;atlas.playsInline=true;atlas.preload="auto";
  for(const event of ["loadeddata","seeked"]) atlas.addEventListener(event,()=>{if(!stopped) notify(engine);});
  function fallback() {
    if(stopped) return;
    world?.dispose();
    world=null;
    engine="atlas";
    if(!atlas.src) atlas.src=asset("replay/scan-atlas-compact.mp4");
    notify(engine);
  }
  const ready=import("../world.js").then(async ({createWorld})=>{
    const active=await createWorld(host,fallback,{allowSoftware:new URLSearchParams(location.search).has("software")});
    if(stopped) {active?.dispose();return;}
    if(!active){fallback();return;}
    world=active;engine="webgl";width=height=0;notify(engine);
  }).catch(fallback);

  function setDimensions(w,h) {
    if(width===w && height===h) return;
    width=w;height=h;
    world?.setOutputSize(w,h);
  }
  function renderSize() {
    const ratio=Math.min(window.devicePixelRatio||1,1.45,2300/Math.max(canvas.clientWidth,1));
    const w=Math.max(32,Math.round(canvas.clientWidth*ratio));
    const h=Math.max(18,Math.round(canvas.clientHeight*ratio));
    if(canvas.width!==w || canvas.height!==h) {canvas.width=w;canvas.height=h;}
    return [w,h];
  }
  function paintAtlas(ctx,pass,time,w,h,zoom) {
    if(atlas.readyState>=2 && atlas.videoWidth>0) {
      const t=Math.min(atlas.duration-1/60,wrap(time,ORBIT_SECONDS));
      if(!atlas.seeking && Math.abs(t-lastAtlasTime)>.038) {
        atlas.currentTime=Math.max(0,t);
        lastAtlasTime=t;
      }
      const tile=ATLAS_PASSES.indexOf(pass), tw=atlas.videoWidth/4,th=atlas.videoHeight/2;
      const drawH=h*zoom/1.04,drawW=drawH*tw/th;
      ctx.drawImage(atlas,(tile%4)*tw,Math.floor(tile/4)*th,tw,th,(w-drawW)*.5,(h-drawH)*.48,drawW,drawH);
    } else if(poster.complete && poster.naturalWidth) {
      const ratio=poster.naturalWidth/poster.naturalHeight,drawH=h*.99,drawW=drawH*ratio;
      ctx.drawImage(poster,(w-drawW)*.5,0,drawW,drawH);
    }
  }
  function plate(ctx,w,h,grade) {
    const wash=ctx.createRadialGradient(w*.5,h*.44,h*.06,w*.5,h*.46,w*.63);
    wash.addColorStop(0,grade.backdrop);
    wash.addColorStop(.61,"#0c121b");
    wash.addColorStop(1,"#070a0f");
    ctx.fillStyle=wash;ctx.fillRect(0,0,w,h);
  }
  function sweep(ctx,w,h,time,local,clip,grade) {
    const strength=clip.scan/100;
    if(strength>0) {
      const wings=ctx.createLinearGradient(0,0,w,0);
      wings.addColorStop(0,"transparent");wings.addColorStop(.25,"transparent");
      wings.addColorStop(.50,grade.tint);wings.addColorStop(.76,"transparent");wings.addColorStop(1,"transparent");
      const y=h*(.18+.67*wrap(time*.83,1));
      ctx.save();
      ctx.globalCompositeOperation="screen";ctx.fillStyle=wings;
      ctx.globalAlpha=strength*.14;ctx.fillRect(0,y-h*.011,w,h*.029);
      ctx.globalAlpha=strength*.49;ctx.fillRect(0,y,w,Math.max(1,h*.0021));
      ctx.globalAlpha=strength*.20;ctx.fillRect(0,y+h*.065,w,Math.max(1,h*.0014));
      ctx.restore();
    }
    if(clip.transition==="dip" && local<.22) {
      ctx.fillStyle="rgba(4,7,11,"+(.90*(1-local/.22))+")";ctx.fillRect(0,0,w,h);
    } else if(clip.transition==="scan" && local<.36) {
      const fade=1-local/.36,x=w*(-.18+1.36*local/.36);
      const flash=ctx.createLinearGradient(x-w*.22,0,x+w*.22,h*.1);
      flash.addColorStop(0,"transparent");flash.addColorStop(.49,grade.tint);flash.addColorStop(1,"transparent");
      ctx.save();ctx.globalCompositeOperation="screen";ctx.globalAlpha=.25*fade;
      ctx.fillStyle=flash;ctx.fillRect(0,0,w,h);ctx.restore();
    }
  }
  function draw(entry,frame,view,model,loopTurn=0) {
    const local=clamp(frame-entry.start,0,entry.shot.frames-1);
    const clip=entry.shot,grade=GRADES[clip.grade],pose=angleAt(entry,local,loopTurn);
    const pair=output?[output.canvas.width,output.canvas.height]:renderSize();
    const [w,h]=pair,ctx=output?.ctx??target;
    setDimensions(w,h);
    const time=frame/FPS;
    const isolated=view.backdrop==="alpha" || view.backdrop==="chroma";
    if(view.backdrop==="alpha") ctx.clearRect(0,0,w,h);
    else if(view.backdrop==="chroma"){ctx.fillStyle="#00b43c";ctx.fillRect(0,0,w,h);}
    else plate(ctx,w,h,grade);
    const scan=view.clean?0:clip.scan;
    const transition=clip.transition==="scan" ? Math.min(1,local/(FPS*WIPE_SECONDS)) : 1;
    ctx.save();
    ctx.filter=(grade.filter==="none"?"":grade.filter+" ")+"brightness("+clip.exposure+")";
    if(world) {
      worldLayers.grid=view.grid&&!isolated;
      worldLayers.cameras=worldLayers.grid&&!view.clean;
      worldLayers.annotations=!isolated;
      worldLayers.atmosphere=!isolated;
      worldLayers.intensity=scan;
      worldLayers.landmarks=scan>0;
      worldLayers.points=scan>0;
      world.render({
        mode:clip.pass,angle:pose.angle+(view.yaw??0),pitch:pose.pitch+(view.pitch??0),
        zoom:clamp(pose.zoom*(view.zoom??1),.55,1.8),state:worldLayers,
        time,transitionProgress:transition,imported:model??null,
      });
      ctx.drawImage(world.canvas,0,0,w,h);
    } else {
      const orbit=pose.orbitTime+(pose.yaw*Math.PI/180+(view.yaw??0))*ORBIT_SECONDS/(Math.PI*2);
      paintAtlas(ctx,clip.pass,orbit,w,h,pose.zoom*(view.zoom??1));
    }
    ctx.restore();
    if(!view.clean && !isolated) sweep(ctx,w,h,time,local/FPS,clip,grade);
    return pose;
  }

  return {
    ready,draw,
    get engine() {return engine;},
    metrics(model) {return model?.stats??world?.stats??null;},
    setOutput(canvas,alpha=false) {output=canvas?{canvas,ctx:canvas.getContext("2d",{alpha})}:null;},
    dispose() {
      stopped=true;world?.dispose();world=null;
      atlas.pause();atlas.removeAttribute("src");atlas.load();
    },
  };
}
