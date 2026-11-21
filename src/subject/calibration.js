import * as THREE from "three";

// One repeat contains sixteen numbered UV charts. The fine subdivisions remain stable in minification.
export function makeCalibrationChart() {
  const canvas=document.createElement("canvas"), size=1024, cell=256;
  canvas.width=canvas.height=size;
  const ctx=canvas.getContext("2d");
  const papers=["#294756","#33535e","#38545b","#3e5353","#354762","#3b5167","#354e66","#3e5463",
    "#2d4753","#305159","#3c5454","#455b52","#354451","#3c4b55","#3d535c","#46565c"];
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    const index=y*4+x, ox=x*cell, oy=y*cell;
    const accent=(x+y)%4===0?"#efb466":(x+y)%3===0?"#90b9d5":"#99cfbe";
    ctx.save();ctx.translate(ox,oy);
    ctx.fillStyle=papers[index];ctx.fillRect(0,0,cell,cell);
    for(let i=0;i<8;i++)for(let j=0;j<8;j++)if((i+j)%2===0){
      ctx.fillStyle="rgba(202,228,221,.085)";ctx.fillRect(i*32,j*32,32,32);
    }
    ctx.strokeStyle="rgba(190,218,214,.36)";ctx.lineWidth=1.5;ctx.beginPath();
    for(let i=1;i<8;i++){ctx.moveTo(32*i,0);ctx.lineTo(32*i,cell);ctx.moveTo(0,32*i);ctx.lineTo(cell,32*i);}ctx.stroke();
    ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.strokeRect(2,2,252,252);
    ctx.fillStyle=accent;
    for(let i=0;i<32;i++){
      const reach=i%4===0?12:5;ctx.fillRect(i*8,0,2,reach);ctx.fillRect(0,i*8,reach,2);
    }
    const glyph=String.fromCharCode(65+y)+(x+1);
    ctx.font="600 43px Consolas,monospace";ctx.fillStyle="#e2e9de";ctx.fillText(glyph,20,58);
    ctx.font="bold 15px Consolas,monospace";ctx.fillStyle=accent;ctx.fillText("U "+String(x).padStart(2,"0")+"  V "+String(y).padStart(2,"0"),18,235);
    ctx.lineWidth=3;ctx.strokeStyle="#c0d3ca";
    ctx.beginPath();ctx.arc(128,128,22,0,Math.PI*2);ctx.moveTo(96,128);ctx.lineTo(117,128);ctx.moveTo(139,128);ctx.lineTo(160,128);
    ctx.moveTo(128,96);ctx.lineTo(128,117);ctx.moveTo(128,139);ctx.lineTo(128,160);ctx.stroke();
    ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(224,28);ctx.lineTo(239,49);ctx.lineTo(208,49);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  const chart=new THREE.CanvasTexture(canvas);
  chart.name="Numbered UV calibration chart";chart.colorSpace=THREE.SRGBColorSpace;
  chart.wrapS=chart.wrapT=THREE.RepeatWrapping;chart.anisotropy=4;
  return chart;
}
