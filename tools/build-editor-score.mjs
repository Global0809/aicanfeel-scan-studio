import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const total=16, rate=48000, twoPi=Math.PI*2, notes=[55,65.406,49,73.416];
const pcm=Buffer.alloc(44+total*rate*4);
const put=(at,value)=>pcm.writeUInt32LE(value,at);
pcm.write("RIFF",0);put(4,pcm.length-8);pcm.write("WAVEfmt ",8);put(16,16);
pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(2,22);put(24,rate);put(28,rate*4);
pcm.writeUInt16LE(4,32);pcm.writeUInt16LE(16,34);pcm.write("data",36);put(40,pcm.length-44);
let seed=4089, previousNoise=0;
const sin=cycles=>Math.sin(twoPi*cycles);
const decay=(t,fall,attack=.004)=> (1-Math.exp(-t/attack))*Math.exp(-t/fall);
for(let sample=0;sample<total*rate;sample++) {
  const t=sample/rate;
  const bar=Math.floor(t/2);
  const base=notes[bar%notes.length];
  const beat=t%.5;
  const off=t%.25;
  const measure=t%2;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=seed/0x80000000-1;
  const bright=noise*.63-(previousNoise*.37);
  previousNoise=noise;
  const kick=sin(45*beat+1.33*(1-Math.exp(-34*beat)))*decay(beat,.055,.002)*.61;
  const rimTime=(t+.5)%1;
  const rim=(bright*.73+.27*sin(rimTime*187))*decay(rimTime,.048)*.13;
  const hat=bright*decay(off,beat>.24?.034:.017)*.091;
  const pulse=Math.max(0,off-.035);
  const low=(sin(base*pulse)+.25*sin(base*2*pulse))*decay(pulse,.14,.009)*.148;
  const padEnv=(1-Math.exp(-measure*3.2))*(1-Math.exp(-(2-measure)*8));
  const chord=(sin(t*base*4+.20*sin(t*.19))+ .55*sin(t*base*6+.23*sin(t*.43))
    +.31*sin(t*base*7.135+.27*sin(t*.23)))*padEnv*.064;
  const chirp=Math.max(0,measure-.738);
  const note=(sin(4*base*chirp+sin((base*9)*chirp)*Math.exp(-21*chirp)*.6))*decay(chirp,.075,.008)*.082;
  const baseMix=kick+rim+hat+low;
  const envelope=Math.min(1,t*250,(total-t)*12);
  const mono=baseMix*.91+chord;
  for(let channel=0;channel<2;channel++) {
    const panorama=note*(channel===0?.75:1.25)+chord*(channel===0?.22:-.15)*sin(t*.28);
    const signal=Math.tanh((mono+panorama)*1.18)*.92*envelope;
    pcm.writeInt16LE(Math.round(signal*32766),44+sample*4+channel*2);
  }
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"acf-score-"));
const wav=path.join(temp,"session.wav");
const output=fileURLToPath(new URL("../public/ui/session-pulse.m4a",import.meta.url));
try {
  fs.writeFileSync(wav,pcm);
  execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-i",wav,"-c:a","aac","-b:a","144k","-movflags","+faststart",output],{stdio:"inherit"});
} finally {
  fs.unlinkSync(wav);
  fs.rmdirSync(temp);
}
console.log(output);
