import { asset } from "./ui.js";

const markerIds = [1,4,6,10,17,33,37,46,52,61,67,70,78,82,93,98,103,105,107,116,122,127,132,136,145,150,152,154,158,160,172,176,195,197,205,234,249,263,267,276,282,291,297,300,308,312,323,327,332,334,336,345,351,356,361,365,374,377,379,381,385,387,397,400,425,454];
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const loopSeconds = 9.6;
export function sourceFrame(videoTime) {
  const playback = ((videoTime % loopSeconds + loopSeconds) % loopSeconds) * 60;
  return playback <= 288 ? playback : 576 - playback;
}

function fitCanvas(canvas, maxDpr = 2) {
  const width = Math.max(1,canvas.clientWidth);
  const height = Math.max(1,canvas.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1,maxDpr);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  return [canvas.width,canvas.height];
}

export function createFaceOverlay(canvas) {
  const ctx = canvas.getContext("2d");
  let track, depthTrack, info, width = 1, height = 1, dead = false, painted = false;
  const resize = new ResizeObserver(() => { [width,height] = fitCanvas(canvas); });
  resize.observe(canvas);
  Promise.all([
    fetch(asset("tracking/facial-track.bin")).then(r => r.ok ? r.arrayBuffer() : null),
    fetch(asset("tracking/facial-track.json")).then(r => r.ok ? r.json() : null),
    fetch(asset("tracking/facial-depth.bin")).then(r=>r.ok?r.arrayBuffer():null).catch(()=>null)
  ]).then(([buffer,metadata,depth]) => {
    if (!dead && buffer && metadata) { track = new Uint16Array(buffer); info = metadata;depthTrack=depth?new Int8Array(depth):null; }
  }).catch(() => {});
  const x = new Float32Array(468), y = new Float32Array(468);
  const volumeReturns=Array.from({length:360},(_,i)=>{
    const hash=n=>{const s=Math.sin(n*127.1+i*311.7)*43758.5453;return s-Math.floor(s);};
    return {theta:hash(1)*Math.PI*2,r:.32+hash(2)*.26,level:hash(3)**2,weight:hash(4),phase:hash(5)*Math.PI*2};
  });
  function clear() { if (painted) ctx.clearRect(0,0,width,height); painted = false; }
  return {
    update({ time, mediaTime, enabled, mode, strength, density, depth, showMesh, reprojection }) {
      if (!ctx || !track || !enabled) { clear(); return; }
      const f = clamp(sourceFrame(mediaTime), 0, info.frames-1);
      const base = Math.floor(f) * info.vertices*2;
      const next = Math.min(Math.floor(f)+1, info.frames-1) * info.vertices*2;
      const mix = f - Math.floor(f);
      const tipX = track[base+2]*width/65535, tipY = track[base+3]*height/65535;
      const u = width / 1210;
      // Tracking falls away gracefully in the most oblique views, as visibility decreases.
      const strengthFactor = clamp((275-f)/26,0,1) * strength/100;
      clear();
      if(showMesh && density>0){
        // A low band of returns follows the orbit outside the recorded bust silhouette.
        const orbit=f/288*1.3-.35, count=Math.round(volumeReturns.length*density/100);
        const palette=["#a4b695","#a2c6c5","#afa7ce","#b9b0a0"];
        for(let i=0;i<count;i++){
          const p=volumeReturns[i],az=p.theta+orbit;
          const sx=.47+Math.sin(az)*p.r,sy=.97-p.level*.30+Math.cos(az)*.075;
          if(sx>.18 && sx<.78 && sy<.965)continue;
          const pulse=.5+.5*Math.sin(time*2.15+p.phase);
          ctx.globalAlpha=(.13+.33*p.weight*pulse)*strength/100;
          ctx.fillStyle=palette[i%4];const size=(.8+p.weight*1.7)*u;
          ctx.fillRect(sx*width,sy*height,size,size);
        }
        ctx.globalAlpha=1;painted=true;
      }
      if (strengthFactor < .02) return;
      for (let i=0;i<468;i++) {
        const k=i*2;
        x[i]=(track[base+k]+(track[next+k]-track[base+k])*mix)*width/65535;
        y[i]=(track[base+k+1]+(track[next+k+1]-track[base+k+1])*mix)*height/65535;
      }
      const faceTop=y[10], faceBottom=y[152];
      const sweep = (Math.sin(time*3.45-.6)*.5+.5);
      const scanY=faceTop+(faceBottom-faceTop)*sweep;
      const band=Math.max(16*u,Math.abs(faceBottom-faceTop)*.11);
      const showAll = mode==="topology";
      if (depth && depthTrack) {
        const zBase=Math.floor(f)*info.vertices;
        const paths=Array.from({length:10},()=>new Path2D());
        for(let j=0;j<info.tessellation.length-2;j+=3){
          const [a,b]=info.tessellation[j],c=info.tessellation[j+1][1];
          const sample=(depthTrack[zBase+a]+depthTrack[zBase+b]+depthTrack[zBase+c])/3;
          const bin=clamp(Math.floor((sample+64)*10/128),0,9),path=paths[bin];
          path.moveTo(x[a],y[a]);path.lineTo(x[b],y[b]);path.lineTo(x[c],y[c]);path.closePath();
        }
        for(let n=0;n<paths.length;n++){
          ctx.fillStyle="hsla("+(163+n*11)+",56%,"+(66-n*2.1)+"%,"+(.31*strengthFactor)+")";ctx.fill(paths[n]);
        }
      }
      ctx.lineWidth=Math.max(.48,.73*u);
      if (showAll || showMesh || depth) {
        ctx.strokeStyle='rgba(145,206,199,' + (strengthFactor*(showAll?.62:.32)) + ')';
        ctx.beginPath();
        for (let n=0;n<info.tessellation.length;n+=2) {
          const [a,b]=info.tessellation[n];
          if (!showAll && Math.abs((y[a]+y[b])*.5-scanY) > band) continue;
          ctx.moveTo(x[a],y[a]);ctx.lineTo(x[b],y[b]);
        }
        ctx.stroke();
      }
      ctx.strokeStyle='rgba(195,225,213,' + (strengthFactor*.37) + ')';
      ctx.beginPath();
      for (const [a,b] of info.contours) {
        if (showAll || Math.abs(y[a]-scanY) < band*1.33) { ctx.moveTo(x[a],y[a]);ctx.lineTo(x[b],y[b]); }
      }
      ctx.stroke();
      ctx.fillStyle='rgba(148,220,211,'+(strengthFactor*.85)+')';
      const step=density>80?1:density>40?2:3;
      for (let n=0;n<markerIds.length;n+=step) {
        const a=markerIds[n], size=Math.abs(y[a]-scanY)<band?2.25*u:1.32*u;
        ctx.fillRect(x[a]-size*.5,y[a]-size*.5,size,size);
      }
      // Short, anchored tracking crosses are a readable sign of motion on a compressed call.
      const target = sweep>.5 ? 116 : 345;
      if (reprojection) {
      ctx.strokeStyle='rgba(238,174,105,'+(strengthFactor*.76)+')';ctx.lineWidth=Math.max(.65,u);
      const tX=x[target],tY=y[target], arm=3.1*u;
      ctx.beginPath();
      ctx.moveTo(tX-arm,tY);ctx.lineTo(tX+arm,tY);ctx.moveTo(tX,tY-arm);ctx.lineTo(tX,tY+arm);
      ctx.stroke();
      }
      if (depth) { ctx.strokeStyle='rgba(146,178,212,.6)';ctx.strokeRect(tipX-3*u,tipY-3*u,6*u,6*u); }
      painted=true;
    },
    clear,
    dispose() { dead=true;resize.disconnect(); }
  };
}

function cameraMap(image, type) {
  const sample = document.createElement("canvas");
  sample.width=image.naturalWidth;sample.height=image.naturalHeight;
  const ctx = sample.getContext("2d", {willReadFrequently:true});
  ctx.drawImage(image,0,0);
  const {data} = ctx.getImageData(0,0,sample.width,sample.height);
  const plate = document.createElement("canvas");
  plate.width=sample.width;plate.height=sample.height;
  const p = plate.getContext("2d");
  const w=sample.width,h=sample.height;
  const lum=(i)=>data[i]*.25+data[i+1]*.56+data[i+2]*.19;
  const tint = type==="top"?"#a8c9b8":"#a2d4ce";
  for (let y=2;y<h-2;y+=2) {
    for (let x=2;x<w-2;x+=2) {
      const i=(y*w+x)*4;
      if (data[i+3]<110) continue;
      const edge = Math.abs(lum(i+8)-lum(i-8))+Math.abs(lum(i+8*w)-lum(i-8*w));
      const hash=((x*51047 ^ y*73471) >>> 0)%113;
      if (edge < 16 && hash>2) continue;
      p.globalAlpha=clamp((edge/100+.07)*(hash<8?1:.58),.08,.85);
      p.fillStyle=hash<3?"#e4a26f":tint;
      p.fillRect(x,y,hash<8?1.35:.85,hash<8?1.35:.85);
    }
  }
  return plate;
}

export function drawCameraGuides(canvas,t,grid,cameras) {
  const [w,h]=fitCanvas(canvas,1.5),ctx=canvas.getContext("2d");
  if(!ctx)return;
  ctx.clearRect(0,0,w,h);
  const unit=w/1210;
  ctx.lineWidth=Math.max(.5,.75*unit);
  if(grid){
    const horizon=h*.58;
    ctx.strokeStyle="rgba(133,163,159,.19)";ctx.beginPath();
    for(let i=-14;i<=14;i++){
      ctx.moveTo(w*.48+i*w*.013,horizon);ctx.lineTo(w*.5+i*w*.13,h);
    }
    for(let i=0;i<14;i++){const y=horizon+(h-horizon)*(i/13)**2;ctx.moveTo(0,y);ctx.lineTo(w,y);}
    ctx.stroke();
  }
  if(cameras){
    const a=sourceFrame(t)/288*1.1-.3;
    ctx.strokeStyle="rgba(165,191,184,.31)";ctx.beginPath();
    for(let row=0;row<3;row++)for(let col=0;col<15;col++){
      const theta=(col/15)*Math.PI*2+a+row*.12;
      const px=w*(.47+.55*Math.cos(theta)),py=h*(.18+row*.22+.065*Math.sin(theta));
      const dw=w*(.012+.007*(1+Math.sin(theta))),dh=dw*.64;
      ctx.rect(px-dw,py-dh,dw*2,dh*2);
      const apex=px+Math.cos(theta)*dw*2.8;
      for(const sign of [-1,1]){ctx.moveTo(px-sign*dw,py-dh);ctx.lineTo(apex,py-dh*.7);ctx.lineTo(px-sign*dw,py+dh);}
    }
    ctx.stroke();
  }
}

// Source-pixel landmarks annotated on the original orthographic plates and measured
// every eight atlas frames with forward/backward pyramidal optical flow. The crown
// camera is locked. Profile features drop out as the corresponding anatomy turns away.
const orthoTracks = {
  front: [
    [187,135,245,135,218,169,198,197,239,196,218,234],
    [191,134,249,135,223,168,203,197,244,196,223,234],
    [196,134,253,135,230,169,209,197,249,195,229,234],
    [202,134,258,135,237,169,215,197,255,195,235,234],
    [210,135,263,135,244,169,222,197,261,195,242,234],
    [217,135,269,135,252,168,229,197,267,195,249,234],
    [224,135,273,135,259,168,237,197,272,194,256,233],
    [231,135,276,135,265,168,244,197,276,194,262,233],
    [237,135,279,135,272,168,250,197,279,194,268,232],
    [243,135,282,135,277,167,256,196,282,193,272,232],
    [249,135,283,135,281,167,262,196,285,193,276,231],
    [255,135,285,134,284,167,267,195,288,192,280,231],
    [260,135,285,134,287,166,271,195,290,192,283,231],
    [264,135,285,133,290,166,275,195,292,191,285,230],
    [268,135,285,133,291,166,278,194,293,191,287,229],
    [272,135,285,133,292,165,281,194,294,191,289,229],
    [274,135,285,133,293,165,283,193,294,191,290,229],
    [276,135,285,134,293,165,283,193,294,191,291,228],
    [277,136,286,134,292,165,284,194,294,191,291,228]
  ],
  side: [
    [200,122,284,120,304,150,296,177,281,204],
    [204,122,285,120,304,150,296,177,283,204],
    [208,122,286,120,303,150,296,177,284,203],
    [213,122,286,120,301,149,295,177,285,203],
    [218,122,286,121,300,149,293,176,285,202],
    [222,122,286,121,297,149,292,176,284,202],
    [227,123,285,121,295,149,290,176,284,202],
    [231,123,285,121,293,149,289,175,283,201],
    [235,123,283,120,290,149,287,174,282,202],
    [240,123,282,119,287,149,286,174,282,202],
    [243,123,282,118,285,148,285,172,282,202],
    [247,123,282,116,284,147,284,170,283,201],
    [251,124,281,114,283,146,285,169,284,201],
    [254,125,281,112,284,146,286,169,285,201],
    [257,125,281,112,284,145,285,168,285,200],
    [260,126,280,112,283,145,285,168,284,199],
    [262,126,280,112,282,144,284,167,284,199],
    [263,126,279,112,281,144,283,167,283,198],
    [265,127,279,112,280,143,282,166,282,198]
  ],
  top: [
    [112,111,183,55,256,60,307,147,212,218]
  ]
};
const cameraRects = {front:[0,315], side:[316,287], top:[604,259]};
const sweepTurns = [17,13,9];

function drawRegistration(ctx, type, frame, phase, w, h, strength) {
  const track=orthoTracks[type], sy=cameraRects[type][1];
  const at=Math.min(track.length-1,frame/8);
  const low=Math.floor(at), a=track[low], b=track[Math.min(low+1,track.length-1)];
  const x=[],y=[], lerp=at-low;
  for(let p=0;p<a.length;p+=2) {
    x.push(a[p]+(b[p]-a[p])*lerp);
    y.push(a[p+1]+(b[p+1]-a[p+1])*lerp);
  }
  const front=type==="front", top=type==="top", eyeWeight=front?clamp((x[1]-x[0]-12)/24,0,1):1;
  const profileWeight=type==="side"?clamp((88-frame)/40,0,1):1;
  const left=Math.min(...x),right=Math.max(...x),upper=Math.min(...y),lower=Math.max(...y);
  const ax=front?x[2]:top?(x[0]+x[3])/2:x[0], ay=front?y[2]:top?(y[1]+y[4])/2:y[0];
  const tone=top?"#bdd5f2":"#a5efd8", accent=top?"#d0e6f5":"#ffc78e";
  ctx.save();ctx.scale(w/408,h/sy);
  // Thin strokes get a dark keyline so registration remains recognizable on both skin and hair.
  ctx.lineCap="butt";ctx.lineJoin="round";ctx.shadowColor="rgba(7,15,16,.88)";ctx.shadowBlur=.9;
  const stroke=(color,alpha,width)=>{ctx.strokeStyle=color;ctx.globalAlpha=alpha*strength;ctx.lineWidth=width;ctx.stroke();};
  const segment=(x1,y1,x2,y2)=>{ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);};
  if(top){
    const rx=(right-left)*.56,ry=(lower-upper)*.56;
    ctx.beginPath();ctx.ellipse(ax,ay,rx,ry,0,0,Math.PI*2);stroke(tone,.84,1.3);
    ctx.beginPath();
    for(let k=0;k<16;k++){
      const theta=k*Math.PI/8,c=Math.cos(theta),s=Math.sin(theta),tick=k%4===0?6:2.8;
      segment(ax+c*(rx-tick),ay+s*(ry-tick),ax+c*(rx+1.8),ay+s*(ry+1.8));
    }
    stroke(tone,.95,1.55);
    const theta=phase*Math.PI*2-Math.PI/2;
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.ellipse(ax,ay,rx,ry,0,theta-.38,theta);ctx.closePath();
    ctx.fillStyle=tone;ctx.globalAlpha=.14*strength;ctx.fill();
    ctx.beginPath();segment(ax,ay,ax+rx*Math.cos(theta),ay+ry*Math.sin(theta));stroke(tone,.92,1.7);
  }else{
    const l=left-(front?13:12),r=right+11,u=upper-13,d=lower+11,c=8;
    ctx.beginPath();
    for(const [bx,by,dx,dy] of [[l,u,1,1],[r,u,-1,1],[l,d,1,-1],[r,d,-1,-1]]){
      ctx.moveTo(bx,by+c*dy);ctx.lineTo(bx,by);ctx.lineTo(bx+c*dx,by);
    }
    stroke(tone,.98,2.05);
    ctx.beginPath();
    const edges=front?[[0,2],[2,3],[3,4],[4,2],[3,5],[4,5]]:[[0,1],[1,2],[2,3],[3,4]];
    for(const [from,to] of edges)segment(x[from],y[from],x[to],y[to]);
    stroke(tone,.78*profileWeight,1.25);
    if(front){ctx.beginPath();segment(x[0],y[0],x[1],y[1]);segment(x[1],y[1],x[2],y[2]);stroke(tone,.8*eyeWeight,1.3);}
    // A narrow scan line and two end ticks traverse only the measured region.
    const q=u+phase*(d-u),slant=front?-3:9;
    ctx.beginPath();ctx.moveTo(l,q);ctx.lineTo(r,q+slant);ctx.lineTo(r,q+slant-5);ctx.lineTo(l,q-5);ctx.closePath();
    ctx.fillStyle=accent;ctx.globalAlpha=.16*strength;ctx.fill();
    ctx.beginPath();segment(l,q,r,q+slant);segment(l,q-2.5,l,q+2.5);segment(r,q+slant-2.5,r,q+slant+2.5);stroke(accent,1,1.7);
  }
  for(let i=0;i<x.length;i++){
    const weight=top?1:front?(i===1||i===4?eyeWeight:1):i===0?clamp((135-frame)/27,0,1):profileWeight;
    if(weight<.08)continue;
    ctx.globalAlpha=.95*strength*weight;
    ctx.fillStyle="#101c20";ctx.strokeStyle=tone;ctx.lineWidth=1.65;
    ctx.beginPath();ctx.arc(x[i],y[i],2.95,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  // Once the ear rotates completely out of sight, it no longer supplies a reference.
  const anchorWeight=type==="side"?clamp((135-frame)/27,0,1):1;
  if(anchorWeight>.02){
    ctx.beginPath();segment(ax-9,ay,ax-3,ay);segment(ax+3,ay,ax+9,ay);segment(ax,ay-9,ax,ay-3);segment(ax,ay+3,ax,ay+9);
    stroke(accent,anchorWeight,2);
  }
  // Coordinates are source pixels in the 408px-wide plate, independent of the display.
  const label=anchorWeight<=.02?"OCCLUDED":(top?"CROWN":front?"NOSE":"EAR")+"  "+Math.round(ax)+", "+Math.round(ay)+" px";
  ctx.shadowBlur=0;ctx.globalAlpha=.93*strength;ctx.font="600 11.25px 'Share Tech Mono',Consolas,monospace";
  const labelWidth=ctx.measureText(label).width+14;
  ctx.fillStyle="#0c171a";ctx.fillRect(8,sy-22,labelWidth,17);
  ctx.fillStyle=tone;ctx.fillRect(8,sy-22,2,17);
  ctx.globalAlpha=strength;ctx.fillStyle="#e8f5ef";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(label,15,sy-13);
  ctx.restore();
}

export function createOrthos() {
  const passCanvases = Array.from(document.querySelectorAll(".ortho-pass"));
  const views = passCanvases.map(canvas => ({canvas, ctx:canvas.getContext("2d"), image:canvas.previousElementSibling, type:canvas.dataset.camera, plate:null, width:1,height:1}));
  const video=document.createElement("video");
  video.className="atlas-source";video.defaultMuted=true;video.muted=true;video.loop=true;video.playsInline=true;
  video.setAttribute("aria-hidden","true");video.preload="auto";video.dataset.src=asset("capture/ortho-atlas.mp4");
  document.querySelector(".ortho-views").append(video);
  let dead=false;
  const size=()=>views.forEach(v=>{
    const maxRatio=Math.min(2,408/Math.max(1,v.canvas.clientWidth),cameraRects[v.type][1]/Math.max(1,v.canvas.clientHeight));
    [v.width,v.height]=fitCanvas(v.canvas,maxRatio);
  });
  const observer = new ResizeObserver(size);
  views.forEach(v=>{
    observer.observe(v.canvas);
    v.image.decode().then(()=>{ if (!dead) v.plate=cameraMap(v.image,v.type); }).catch(()=>{});
  });
  return {
    video,
    update(time, state, mode) {
      const strength=state.intensity/100;
      views.forEach((v,i)=>{
        const {ctx,width:w,height:h,plate}=v;
        if (!ctx) return;
        if (video.readyState>=2 && state.surface) {
          const [sy,sh]=cameraRects[v.type];
          ctx.drawImage(video,0,sy,408,sh,0,0,w,h);
          if (video.videoWidth>=816 && (state.landmarks||state.points||state.topology)) {
            ctx.globalCompositeOperation="screen";
            ctx.globalAlpha=state.points?strength*(mode==="points"?.31:.12):0;
            if (ctx.globalAlpha>0)ctx.drawImage(video,408,sy,408,sh,0,0,w,h);
            if(state.landmarks||state.topology){
              const scan=(time*sweepTurns[i]/38+i*.33)%1;
              const from=Math.max(0,scan*(sh+34)-34),rows=Math.min(sh-from,34);
              if(rows>0){ctx.globalAlpha=.65*strength;ctx.drawImage(video,408,sy+from,408,rows,0,from/sh*h,w,rows/sh*h);}
            }
            ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
          }
          if(state.landmarks&&strength>0){
            const trackFrame=sourceFrame(video.currentTime)*.5;
            drawRegistration(ctx,v.type,trackFrame,(time*sweepTurns[i]/38+i*.33)%1,w,h,Math.min(1,strength*1.26));
          }
          return;
        }
        ctx.clearRect(0,0,w,h);
        if (!plate || (!state.landmarks&&!state.points&&!state.topology)) return;
        const scale=Math.min(w/plate.width,h/plate.height);
        const dw=plate.width*scale,dh=plate.height*scale, dx=(w-dw)/2, dy=h-dh;
        const sweep=(time*sweepTurns[i]/38+i*.33)%1;
        ctx.globalAlpha=state.points ? strength*(mode==="points"?.73:.25) : strength*.09;
        ctx.drawImage(plate,dx,dy,dw,dh);
        if (state.landmarks || state.topology) {
          const sy=sweep*(plate.height+52)-52;
          const y=Math.max(0,sy), size=Math.min(52+Math.min(sy,0),plate.height-y);
          if (size>0) {
            ctx.globalAlpha=clamp(strength*1.15,0,1);
            ctx.drawImage(plate,0,y,plate.width,size,dx,dy+y*scale,dw,size*scale);
          }
        }
        if(state.landmarks&&strength>0){
          ctx.save();ctx.translate(dx,dy);drawRegistration(ctx,v.type,0,(time*sweepTurns[i]/38+i*.33)%1,dw,dh,Math.min(1,strength*1.26));ctx.restore();
        }
        ctx.globalAlpha=1;
      });
    },
    dispose() { dead=true;observer.disconnect();video.pause();video.removeAttribute("src");video.load();video.remove(); }
  };
}

