export function png(canvas) {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("The frame could not be encoded.")),"image/png"));
}
const yieldToPage=()=>globalThis.scheduler?.yield?.()??new Promise(resolve=>setTimeout(resolve,0));

export async function encodeScene({canvas,frames,fps,draw,audio,signal,onProgress}) {
  const { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output,
    Quality, WebMOutputFormat, canEncodeAudio, canEncodeVideo }=await import("mediabunny");
  const count=Math.ceil(frames),{width,height}=canvas;
  const bitrate=Math.round(width*height*(fps>=60?6.35:4.8));
  if(bitrate*(count/fps)/8>520*1024*1024) {
    throw new Error("This render exceeds the browser's export budget. Try a lower resolution or a shorter sequence.");
  }
  const quality=new Quality({bitrate});
  const videoOptions={width,height,frameRate:fps,quality};
  const audioQuality=new Quality({bitrate:160000});
  const audioOptions=audio?{numberOfChannels:audio.numberOfChannels,sampleRate:audio.sampleRate,quality:audioQuality}:null;
  let codec, audioCodec, format;
  if(await canEncodeVideo("avc",videoOptions) && (!audio || await canEncodeAudio("aac",audioOptions))) {
    codec="avc";audioCodec="aac";format=new Mp4OutputFormat({fastStart:false});
  } else {
    codec=await canEncodeVideo("vp9",videoOptions)?"vp9":await canEncodeVideo("vp8",videoOptions)?"vp8":null;
    if(!codec || (audio && !await canEncodeAudio("opus",audioOptions))) {
      throw new Error("The browser cannot encode this format at the selected resolution. Try 1080p or 720p.");
    }
    audioCodec="opus";format=new WebMOutputFormat();
  }
  signal.throwIfAborted();
  const target=new BufferTarget(), output=new Output({format,target});
  const video=new CanvasSource(canvas,{codec,quality,keyFrameInterval:1.5});
  output.addVideoTrack(video,{frameRate:fps});
  const sound=audio?new AudioBufferSource({codec:audioCodec,quality:audioQuality}):null;
  if(sound) output.addAudioTrack(sound);
  const cancel=()=>{output.cancel().catch(()=>{});};
  signal.addEventListener("abort",cancel);
  try {
    await output.start();
    let audioError;
    const soundtrack=sound?.add(audio).then(()=>sound.close()).catch(error=>{audioError=error;});
    for(let i=0;i<count;i++) {
      signal.throwIfAborted();
      if(audioError) throw audioError;
      const at=i/fps;
      draw(at);
      await video.add(at,1/fps,{keyFrame:i%Math.round(fps*1.5)===0});
      if(i%4===0 || i+1===count) {
        onProgress((i+1)/count,format.mimeType);
        await yieldToPage();
      }
    }
    video.close();
    await soundtrack;
    if(audioError) throw audioError;
    signal.throwIfAborted();
    await output.finalize();
    if(!target.buffer?.byteLength) throw new Error("No frames were written.");
    return new Blob([target.buffer],{type:format.mimeType});
  } catch(error) {
    await output.cancel().catch(()=>{});
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener("abort",cancel);
  }
}
