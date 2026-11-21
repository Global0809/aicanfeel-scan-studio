import { asset } from "./ui.js";
import { ORBIT_SECONDS, TAU, wrap } from "./sequence.js";

const studies = {
  points: ["Optical sections","Axial slice","Y / XZ"],
  uv: ["Face UV atlas","UV detail","UDIM 1001"],
  alloy: ["Surface normals","Tangent / normal","XZ"],
  motion: ["Orbit analysis","Angular position","6.33 s / turn"],
  topology: ["Contour study","Section profiles","Y / XZ"],
  capture: ["Reprojection","Front / profile","XY / ZY"],
  optical: ["Capture geometry","Front / profile","XY / ZY"],
  camera: ["Capture geometry","Front / profile","XY / ZY"],
  surface: ["Vertex colour","Colour distribution","sRGB"],
  clay: ["Surface normals","Tangent / normal","XZ"],
};

export function createPassStudy() {
  const canvas = document.getElementById("study-canvas");
  const ctx = canvas.getContext("2d",{alpha:false});
  const title = document.getElementById("study-title"), legend = document.getElementById("study-legend");
  const unit = document.getElementById("study-unit"), value = document.getElementById("study-value");
  const uv = new Image(); uv.src=asset("ui/face-uv.png");
  const positions=[], rings=[], histogram=Array.from({length:3},()=>new Uint16Array(24));
  let lastTime=-5,lastPass="",w=1,h=1,dead=false,previousAngle=0;
  const ready=fetch(asset("ui/section-samples.bin")).then(r=>{if(!r.ok)throw Error(r.status);return r.arrayBuffer();}).then(buffer=>{
    if(dead)return;
    const bytes=new Uint8Array(buffer), count=new DataView(buffer).getUint16(0,true), levels=bytes[2], spokes=bytes[3];
    let at=4;
    const position=()=>[bytes[at++]/127.5-1,bytes[at++]/127.5-1,bytes[at++]/127.5-1];
    for(let i=0;i<count;i++){
      const xyz=position(),r=bytes[at++],g=bytes[at++],b=bytes[at++];
      positions.push([...xyz,r,g,b]);
      [r,g,b].forEach((c,k)=>histogram[k][Math.min(23,Math.floor(c*24/256))]++);
    }
    for(let i=0;i<levels;i++)rings.push(Array.from({length:spokes},position));
    update(lastTime,lastPass,previousAngle,true);
  }).catch(()=>{unit.textContent="Sample unavailable";});
  function resize(){
    w=Math.max(1,canvas.clientWidth);h=Math.max(1,canvas.clientHeight);
    const d=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0);
    update(lastTime,lastPass,previousAngle,true);
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function stroke(points,color,width=1,closed=false) {
    if(!points.length)return;
    ctx.beginPath();ctx.moveTo(...points[0]);
    for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
    if(closed)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }
  function cross(x,y,r,color){
    stroke([[x-r,y],[x+r,y]],color);stroke([[x,y-r],[x,y+r]],color);
  }
  function base(){
    ctx.fillStyle="#101719";ctx.fillRect(0,0,w,h);
    const pitch=Math.max(9,h*.155);
    ctx.beginPath();
    for(let x=w/2%pitch;x<w;x+=pitch){ctx.moveTo(x,0);ctx.lineTo(x,h);}
    for(let y=h/2%pitch;y<h;y+=pitch){ctx.moveTo(0,y);ctx.lineTo(w,y);}
    ctx.strokeStyle="#233032";ctx.lineWidth=.55;ctx.stroke();
    stroke([[w*.52,0],[w*.52,h]],"#43504f",.8);
    ctx.font=Math.max(7,h*.073)+"px 'IBM Plex Mono',monospace";
    ctx.fillStyle="#94a6a2";
  }
  function drawRing(ring,angle,centerX,centerY,scale,color,width){
    const c=Math.cos(angle),s=Math.sin(angle);
    const pts=ring.map(([x,y,z])=>[centerX+(x*c+z*s)*scale,centerY-y*scale+(z*c-x*s)*scale*.12]);
    stroke(pts,color,width,true);
  }
  function sections(t,angle,pass,band){
    const ring=rings[band],s=Math.min(h*.49,w*.242),cx=w*.255,cy=h*.51;
    const c=Math.cos(angle),sin=Math.sin(angle);
    for(let i=0;i<positions.length;i+=2){
      const [x,y,z]=positions[i],front=z*c-x*sin;
      ctx.fillStyle=front>0?"#79968b":"#374d50";
      ctx.fillRect(cx+(x*c+z*sin)*s,cy-y*s+front*s*.12,Math.max(.7,h*.009),Math.max(.7,h*.009));
    }
    for(let i=0;i<rings.length;i+=2)drawRing(rings[i],angle,cx,cy,s,i===band?"#d6f1dc":"#57767a",.7);
    drawRing(ring,angle,cx,cy,s,"#ceedd4",1.7);
    const rx=w*.76,ry=h*.5,rs=Math.min(w*.22,h*.62);
    cross(rx,ry,h*.30,"#485757");
    ctx.strokeStyle="#3b5050";ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(rx,ry,rs*.85,rs*.75,0,0,TAU);ctx.stroke();
    const poly=ring.map(([x,,z])=>[rx+x*rs,ry-z*rs]);
    stroke(poly,"#bde5be",1.55,true);
    if(pass==="alloy"||pass==="clay"){
      for(let i=0;i<poly.length;i+=3){
        const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1;
        stroke([a,[a[0]+dy/d*h*.084,a[1]-dx/d*h*.084]],"#cea8f3",.9);
      }
    }else{
      const marker=poly[Math.floor(wrap(t/ORBIT_SECONDS,1)*poly.length)];
      stroke([[rx,ry],marker],"#d3c4a0");ctx.fillStyle="#f8dba5";ctx.fillRect(marker[0]-2,marker[1]-2,4,4);
    }
  }
  function projection(angle,pass){
    const size=Math.min(h*.47,w*.235);
    for(const [c,offset] of [[angle,w*.256],[angle+Math.PI/2,w*.75]]){
      const sin=Math.sin(c),cos=Math.cos(c);
      for(let i=0;i<positions.length;i+=2){
        const [x,y,z,r,g,b]=positions[i];
        const depth=z*cos-x*sin;
        ctx.fillStyle=pass==="surface"?"rgb("+r+" "+g+" "+b+")":depth>0?"#c8e4cc":"#557d80";
        ctx.fillRect(offset+(x*cos+z*sin)*size,h*.51-y*size,Math.max(1,h*.014),Math.max(1,h*.014));
      }
    }
  }
  function chartUV(t){
    if(!uv.complete||!uv.naturalWidth)return;
    const side=Math.min(w*.45,h*.9),center=w*.26,y=(h-side)/2;
    const v=.56+.18*Math.sin(t*TAU/ORBIT_SECONDS),u=.77+.05*Math.cos(t*TAU/ORBIT_SECONDS);
    ctx.save();ctx.globalCompositeOperation="screen";ctx.drawImage(uv,center-side/2,y,side,side);
    const radius=.16,zoom=Math.min(w*.43,h*.92);
    ctx.drawImage(uv,(u-radius)*uv.width,(v-radius)*uv.height,2*radius*uv.width,2*radius*uv.height,w*.758-zoom/2,(h-zoom)/2,zoom,zoom);
    ctx.restore();
    ctx.strokeStyle="#f0bc83";ctx.lineWidth=1;
    ctx.strokeRect(center-side/2+(u-radius)*side,y+(v-radius)*side,side*radius*2,side*radius*2);
    cross(w*.758,h*.5,h*.095,"#ffdfa2");
  }
  function motion(angle){
    const c=w*.26,y=h*.5,r=Math.min(h*.34,w*.205);
    ctx.beginPath();ctx.ellipse(c,y,r,r*.76,0,0,TAU);ctx.strokeStyle="#617576";ctx.lineWidth=1;ctx.stroke();
    cross(c,y,r*1.12,"#415457");
    const tip=[c+Math.sin(angle)*r,y-Math.cos(angle)*r*.76];
    stroke([[c,y],tip],"#ffd1a7",1.8);ctx.fillStyle="#f5d7a9";ctx.fillRect(tip[0]-2,tip[1]-2,4,4);
    for(const [phase,color] of [[0,"#f2c197"],[Math.PI*.5,"#8bd3cd"]]){
      const curve=Array.from({length:41},(_,i)=>[w*(.545+.42*i/40),h*(.5-.27*Math.sin(i*TAU/40-angle+phase))]);
      stroke(curve,color,1.2);
    }
  }
  function colors(angle){
    const size=Math.min(h*.48,w*.235),c=Math.cos(angle),s=Math.sin(angle);
    for(const [x,y,z,r,g,b] of positions){
      ctx.fillStyle="rgb("+r+" "+g+" "+b+")";ctx.fillRect(w*.26+(x*c+z*s)*size,h*.52-y*size,1.45,1.45);
    }
    const max=Math.max(...histogram.flatMap(channel=>Array.from(channel)),1);
    for(let i=0;i<3;i++)stroke(Array.from(histogram[i],(n,j)=>[w*(.55+j/23*.42),h*(.84-Math.sqrt(n/max)*.66)]),["#e7a589","#9fccb5","#95b7dd"][i],1.2);
  }
  function update(t=0,pass="points",angle=0,force=false) {
    if(dead)return;
    if(!studies[pass])pass="points";
    if(!force&&pass===lastPass&&Math.abs(t-lastTime)<1/24)return;
    const changed=lastPass!==pass;
    lastTime=t;lastPass=pass;previousAngle=angle;
    const [name,key,units]=studies[pass];
    if(force||changed){title.textContent=name;legend.textContent=key;unit.textContent=units;}
    base();if(!rings.length)return;
    const scan=(1-Math.cos(t*TAU/ORBIT_SECONDS))*.5, band=Math.min(rings.length-2,1+Math.floor(scan*(rings.length-3)));
    if(pass==="uv"){chartUV(t);value.textContent="1 : 3.1";}
    else if(pass==="motion"){motion(angle);value.textContent=Math.round(wrap(angle,TAU)/TAU*360)+"°";}
    else if(["capture","camera","optical"].includes(pass)){projection(angle,pass);value.textContent="2 views";}
    else if(pass==="surface"){colors(angle);value.textContent="RGB";}
    else {sections(t,angle,pass,band);value.textContent=String(band+1).padStart(2,"0")+" / "+rings.length;}
  }
  uv.decode().then(()=>update(lastTime,lastPass,previousAngle,true)).catch(()=>{});
  resize();
  return { update,ready,dispose(){dead=true;observer.disconnect();} };
}

