const shell = document.querySelector("main");
const video = document.querySelector("video");
const play = document.querySelector("#play");
const issue = document.querySelector("#issue");
const calm = matchMedia("(prefers-reduced-motion: reduce)");
const options = new URLSearchParams(location.search);
const requested = options.get("quality");
const legacy = options.get("reel") === "scan";
if (legacy) {
  shell.dataset.reel = "scan";
  video.poster = "./brand/studio-preview.jpg";
}
const width = Math.min(innerWidth, innerHeight * 16 / 9) * (devicePixelRatio || 1);
const hls = new URL(legacy ? "./replay/session-4k.m3u8" : "./replay/workspace-4k.m3u8", location.href);
const compactHls = new URL(legacy ? "./replay/call-4k.m3u8" : "./replay/workspace-call-4k.m3u8", location.href);
const nativePlaylist = new URL(legacy ? "./replay/presentation-4k.m3u8" : "./replay/workspace-adaptive.m3u8", location.href);
const hd = new URL(legacy ? "./replay/session-hd.mp4" : "./replay/workspace-hd.mp4", location.href);
const codec = 'video/mp4; codecs="avc1.640034"';
const connection = navigator.connection;
const slowLink = connection?.saveData || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType)
  || (Number.isFinite(connection?.downlink) && connection.downlink < 5);
let high = requested === "4k" || (requested !== "hd" && width > 2100 && !slowLink);
let wantsPlayback = !calm.matches;
let disposeStream = () => {};
let pumpStream = () => {};
let studioVisible = false;
const studioLink = document.querySelector("#studio-entry");
const studioFrame = document.querySelector("#studio-frame");

function update() {
  play.textContent = video.paused ? "Play" : "Pause";
  shell.classList.toggle("paused", video.paused && (video.readyState >= 2 || !wantsPlayback));
}

function start() {
  if (wantsPlayback && !studioVisible) video.play().catch(error=>{
    update();
    if(error.name==="NotAllowedError")shell.classList.add("paused");
  });
}

function progressive(at = 0) {
  high = false;
  disposeStream();
  video.dataset.rendition = "hd";
  video.src = hd.href;
  video.addEventListener("loadedmetadata", () => {
    if (at > 0 && at < video.duration) video.currentTime = at;
    start();
  }, { once: true });
  start();
}

function playbackError() {
  if (high) {
    progressive(video.currentTime);
  } else {
    issue.textContent = "Playback unavailable. Select Open Studio to continue.";
    issue.hidden = false;
    update();
  }
}

// The fixed VOD playlist has one init fragment and independently decodable
// look-length fragments. Keep the current and upcoming looks buffered.
async function playSegments() {
  const control = new AbortController();
  const media = new MediaSource();
  const blob = URL.createObjectURL(media);
  let buffer, busy = false, playable = false;
  const events = ["timeupdate", "seeking", "waiting", "play"];
  disposeStream = () => {
    control.abort();
    for (const name of events) video.removeEventListener(name, pump);
    URL.revokeObjectURL(blob);
    disposeStream = () => {};
    pumpStream = () => {};
  };
  function fragmentURL(name) {
    const url = new URL(name, hls);
    if (url.origin !== hls.origin) throw new Error("Unexpected presentation media origin.");
    return url;
  }
  async function fetchFile(url) {
    const response = await fetch(url, { signal: control.signal });
    if (!response.ok) throw new Error(`Media request failed (${response.status}).`);
    return response;
  }
  function changeBuffer(operation) {
    return new Promise((resolve, reject) => {
      const clean = () => {
        buffer.removeEventListener("updateend", done);
        buffer.removeEventListener("error", fail);
        control.signal.removeEventListener("abort", fail);
      };
      const done = () => { clean(); resolve(); };
      const fail = () => { clean(); reject(new Error("Presentation buffer unavailable.")); };
      if (control.signal.aborted) return fail();
      buffer.addEventListener("updateend", done, { once: true });
      buffer.addEventListener("error", fail, { once: true });
      control.signal.addEventListener("abort", fail, { once: true });
      try { operation(); } catch (error) { clean(); reject(error); }
    });
  }
  // Both encodes carry the same 120-frame closed GOP at every material cut.
  // Select bandwidth independently of resolution, and append the matching AVC
  // parameter sets before samples from a different encoder enter the buffer.
  async function readRendition(url) {
    const text = await (await fetchFile(url)).text();
    const initialization = /^#EXT-X-MAP:URI="([^"]+)"/m.exec(text);
    const records = Array.from(text.matchAll(/^#EXTINF:([\d.]+),[^\n]*\r?\n([^\r\n]+)/gm));
    if (!initialization || !records.length || !text.includes("#EXT-X-ENDLIST")) throw Error("Invalid presentation playlist.");
    let end = 0;
    const chunks = records.map(([, length, name]) => {
      const start = end, seconds = Number(length);
      if (!Number.isFinite(seconds) || seconds <= 0) throw Error("Invalid fragment duration.");
      end += seconds;
      return { start, end, url: fragmentURL(name.trim()) };
    });
    return { name:url===hls?"studio-4k":"call-4k", chunks, duration:end, initURL:fragmentURL(initialization[1]), init:null };
  }
  let segments = [], total = 0, studio, call, next, installed, fastSamples=0;
  async function fetchFragment(index) {
    const current = next;
    const started = performance.now();
    const response = await fetchFile(current.chunks[index].url);
    let data;
    // Catch an overestimated connection early enough to avoid downloading a
    // six-megabyte studio fragment while the call-ready version is available.
    if (current===studio && call && !playable && response.body?.getReader) {
      const reader=response.body.getReader(), blocks=[];
      let bytes=0;
      while (true) {
        const result=await reader.read();
        if(result.done) break;
        blocks.push(result.value);bytes+=result.value.length;
        const ms=performance.now()-started;
        if(ms>470 && bytes>=196608 && bytes*8/ms<17800) {
          await reader.cancel().catch(()=>{});
          next=call;return fetchFragment(index);
        }
      }
      data=await new Blob(blocks).arrayBuffer();
    } else data=await response.arrayBuffer();
    const ms=Math.max(1,performance.now()-started), megabits=data.byteLength*.008/ms;
    if(current===studio && call && megabits<25.5){next=call;fastSamples=0;}
    if(current===call && !connection?.saveData){
      fastSamples=megabits>=32 ? fastSamples+1 : 0;
      if(fastSamples>=2){next=studio;fastSamples=0;}
    }
    if(installed!==current){
      current.init??=await (await fetchFile(current.initURL)).arrayBuffer();
      await changeBuffer(()=>buffer.appendBuffer(current.init));
      installed=current;video.dataset.rendition=current.name;
    }
    return data;
  }
  function contains(t) {
    for (let i = 0; i < buffer.buffered.length; i++) {
      if (buffer.buffered.start(i) <= t && buffer.buffered.end(i) > t) return true;
    }
    return false;
  }
  async function pump() {
    if (!buffer || busy || control.signal.aborted || studioVisible) return;
    busy = true;
    const t = Math.min(video.currentTime, total - 0.01);
    try {
      const first = segments.findIndex(chunk => chunk.end > t);
      if (first < 0) return;
      if (first >= 6 && contains(segments[first - 5].start + 0.05)) {
        await changeBuffer(() => buffer.remove(segments[0].end, segments[first - 4].start));
      }
      const ahead = wantsPlayback ? 4 : 1;
      for (let index = first; index < Math.min(first + ahead, segments.length) && !studioVisible; index++) {
        const chunk = segments[index];
        if (contains((chunk.start + chunk.end) / 2)) continue;
        const data = await fetchFragment(index);
        try {
          await changeBuffer(() => buffer.appendBuffer(data));
        } catch (error) {
          if (error.name !== "QuotaExceededError") throw error;
          if (t >= 6) await changeBuffer(() => buffer.remove(0, segments[first].start - 2));
          else await changeBuffer(() => buffer.remove(chunk.end + 2, total));
          await changeBuffer(() => buffer.appendBuffer(data));
        }
        if (!playable) { playable = true; start(); }
        if (Math.abs(video.currentTime - t) > 3) break;
      }
      if (contains(total - 0.03) && media.readyState === "open") media.endOfStream();
    } catch (error) {
      if (!control.signal.aborted) playbackError();
    } finally {
      busy = false;
      if (!control.signal.aborted && Math.abs(video.currentTime - t) > 1) queueMicrotask(pump);
    }
  }

  try {
    const opened = new Promise(resolve => media.addEventListener("sourceopen", resolve, { once: true }));
    video.src = blob;
    [studio,call]=await Promise.all([readRendition(hls),readRendition(compactHls).catch(()=>null)]);
    segments=studio.chunks;total=studio.duration;
    if(call && (call.chunks.length!==segments.length || call.chunks.some((x,i)=>Math.abs(x.end-segments[i].end)>.002)))call=null;
    next=call && (connection?.saveData || connection?.downlink && connection.downlink<9) ? call : studio;
    await opened;
    if (control.signal.aborted) return;
    media.duration = total;
    buffer = media.addSourceBuffer(codec);
    for (const name of events) video.addEventListener(name, pump);
    pumpStream = pump;
    pump();
  } catch (error) {
    if (!control.signal.aborted) playbackError();
  }
}

video.defaultMuted = true;
video.addEventListener("play", update);
video.addEventListener("pause", update);
// Windows WebKit can pause while seeking its progressive MP4 back to zero.
video.addEventListener("seeked", () => {
  if (video.loop && wantsPlayback && video.paused && video.currentTime < 0.08 && !document.hidden) start();
});
video.addEventListener("ended", () => {
  if (video.loop && wantsPlayback) { video.currentTime = 0; start(); }
});
video.addEventListener("error", playbackError);
const mseAvailable = window.MediaSource?.isTypeSupported(codec);
const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");
if (high && nativeHls && (!mseAvailable || navigator.vendor === "Apple Computer, Inc.")) {
  video.dataset.rendition="native-4k";
  video.src = nativePlaylist.href;
  start();
} else if (high && mseAvailable) {
  playSegments();
} else {
  progressive();
}
update();

function toggle() {
  wantsPlayback = video.paused;
  if (wantsPlayback) start();
  else video.pause();
}
function showStudio(visible) {
  studioVisible = visible;
  shell.hidden = visible;
  studioFrame.hidden = !visible;
  if (visible) {
    video.pause();
    if (!studioFrame.hasAttribute("src")) studioFrame.src = studioLink.href;
    studioFrame.focus();
  } else {
    pumpStream();
    start();
    studioLink.focus({preventScroll:true});
  }
  studioFrame.contentWindow?.postMessage({type:"acf:studio-visibility",visible},location.origin);
}
studioLink.addEventListener("click", event => {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  showStudio(true);
});
window.addEventListener("message", event => {
  if (studioVisible && event.origin === location.origin && event.source === studioFrame.contentWindow &&
      event.data?.type === "acf:show-presentation") showStudio(false);
});
function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  else video.webkitEnterFullscreen?.();
}
play.onclick = toggle;
document.querySelector("#full").onclick = fullscreen;
video.ondblclick = fullscreen;
document.addEventListener("keydown", event => {
  if (studioVisible || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === "KeyF") { event.preventDefault(); fullscreen(); }
  if (event.code === "Space" && !event.target.closest("a,button")) { event.preventDefault(); toggle(); }
});
let timer;
document.addEventListener("pointermove", () => {
  shell.classList.add("tools");
  clearTimeout(timer);
  timer = setTimeout(() => shell.classList.remove("tools"), 1300);
});
calm.addEventListener("change", event => {
  wantsPlayback = !event.matches;
  if (wantsPlayback) start();
  else video.pause();
});
window.addEventListener("pagehide", event => { if (!event.persisted) disposeStream(); });
