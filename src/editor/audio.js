export function createSoundtrack() {
  let context, buffer=null, source=null, gain=null, generation=0, envelope=null;
  function measure(decoded) {
    if(!decoded) return null;
    const data=decoded.getChannelData(0), stride=Math.floor(decoded.sampleRate/60);
    const levels=new Float32Array(Math.ceil(data.length/stride));
    for(let frame=0;frame<levels.length;frame++) {
      const start=frame*stride,end=Math.min(data.length,start+stride);
      let sum=0, samples=0;
      for(let tick=start;tick<end;tick+=5) {sum+=data[tick]*data[tick];samples++;}
      levels[frame]=Math.sqrt(sum/Math.max(1,samples));
    }
    const ranked=levels.slice().sort();
    const ref=Math.max(.018,ranked[Math.floor(ranked.length*.94)]??0);
    let sensor=0;
    for(let frame=0;frame<levels.length;frame++) {
      const next=Math.min(1,levels[frame]/ref);
      sensor=next>sensor?next:sensor*.57+next*.43;
      levels[frame]=sensor;
    }
    return {levels, periods:decoded.sampleRate/stride};
  }
  function bus() {
    if (!context) context=new AudioContext();
    return context;
  }
  function stop() {
    generation++;
    if (!source) return;
    try {source.stop();} catch {}
    source.disconnect();gain.disconnect();source=gain=null;
  }
  function route(ctx, destination, at, volume) {
    if(!buffer || at>=buffer.duration) return null;
    const node=ctx.createBufferSource(), level=ctx.createGain();
    node.buffer=buffer;level.gain.value=volume;
    node.connect(level);level.connect(destination);node.start(0,Math.max(0,at));
    return {node,level};
  }
  return {
    get duration() {return buffer?.duration??0;},
    async decode(file) {
      const result=await bus().decodeAudioData(await file.arrayBuffer());
      if(!result.duration) throw new Error("Audio file is empty.");
      return result;
    },
    use(decoded) {stop();buffer=decoded;envelope=measure(decoded);},
    level(at) {return envelope?.levels[Math.floor(at*envelope.periods)]??0;},
    async play(at,volume) {
      stop();
      if(!buffer) return;
      const version=generation,ctx=bus();
      await ctx.resume();
      if(version!==generation) return;
      const output=route(ctx,ctx.destination,at,volume);
      if(output) ({node:source,level:gain}=output);
    },
    stop,
    setVolume(volume) {if(gain) gain.gain.setTargetAtTime(volume,context.currentTime,.06);},
    peaks(count=384,at=0) {
      if(!buffer) return [];
      const channel=buffer.getChannelData(0),offset=Math.floor(at*buffer.sampleRate);
      const stride=Math.ceil(Math.max(0,channel.length-offset)/count);
      return Array.from({length:count},(_,index)=>{
        const start=offset+index*stride,end=Math.min(channel.length,start+stride);
        let peak=0;
        for(let i=start;i<end;i+=Math.max(1,Math.floor(stride/950))) peak=Math.max(peak,Math.abs(channel[i]));
        return peak;
      });
    },
    mix(seconds,volume,at=0) {
      if(!buffer || volume<=0) return null;
      const offset=Math.round(at*buffer.sampleRate);
      const length=Math.min(Math.round(seconds*buffer.sampleRate),buffer.length-offset);
      if(length<1) return null;
      const tracks=Math.min(2,buffer.numberOfChannels);
      const audio=new AudioBuffer({length,sampleRate:buffer.sampleRate,numberOfChannels:tracks});
      for(let channel=0;channel<tracks;channel++) {
        const source=buffer.getChannelData(channel),target=audio.getChannelData(channel);
        for(let i=0;i<length;i++) target[i]=source[i+offset]*volume;
      }
      return audio;
    },
    close() {stop();context?.close().catch(()=>{});},
  };
}
