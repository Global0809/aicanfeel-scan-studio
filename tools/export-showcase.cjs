#!/usr/bin/env node
// Stream deterministic compositor frames into FFmpeg without an image sequence.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { parseArgs } = require("node:util");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const maxStaticBytes = 25 * 1024 * 1024;

const flagTypes = {
  url: "string", out: "string", width: "string", height: "string", fps: "string",
  seconds: "string", frames: "string", start: "string", crf: "string", quality: "string",
  threads: "string", preset: "string", browser: "string", playwright: "string",
  ffmpeg: "string", ffprobe: "string", "min-optical-width": "string", "no-fast-seek": "boolean",
  "streams-from": "string", "stream-dir": "string", "poster-out": "string", overwrite: "boolean", help: "boolean",
};
const { values: options } = parseArgs({
  options: Object.fromEntries(Object.entries(flagTypes).map(([key, type]) => [key, { type }])),
});
if (options.help) {
  console.log(`Export the Scan Studio loop with Chrome, Playwright, FFmpeg and FFprobe.

node tools/export-showcase.cjs --url http://127.0.0.1:5317/ --out showcase.mp4

--width 3840 --height 2160 --fps 60                  Default duration uses the full studio sequence
--frames 60 --start 0                              Exact frame count or starting time
--crf 16 --preset veryfast --quality 96 --threads 4  Master H.264 and compositor settings
--browser PATH --playwright PATH                   Optional local browser/libraries
--ffmpeg PATH --ffprobe PATH --overwrite            Encoder paths and replacement
--min-optical-width 2420                             Require the UHD optical source
--no-fast-seek                                      Use the delivered media's original GOPs
--poster-out PATH                                   Save a first-look workstation preview
--streams-from MASTER.mp4                           Package a completed master using the fast web preset
--stream-dir PATH                                    Destination for HLS 4K and progressive HD`);
  process.exit(0);
}

function numberOption(key, fallback, minimum, maximum, integer = false) {
  const value = Number(options[key] ?? fallback);
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid --${key} value: ${options[key]}`);
  }
  return value;
}

function playwrightLibrary() {
  const explicit = options.playwright || process.env.PLAYWRIGHT_MODULE;
  const fallback = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime",
    "dependencies", "node", "node_modules", "playwright");
  for (const name of explicit ? [explicit] : ["playwright", "playwright-core", fallback]) {
    try { return require(name); } catch (error) { if (explicit) throw error; }
  }
  throw new Error("Playwright is unavailable. Supply its installed module path with --playwright.");
}

function browserPath(chromium) {
  const explicit = options.browser || process.env.CHROME_PATH;
  if (explicit) return explicit;
  const windows = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
    .filter(Boolean).flatMap(dir => [
      path.join(dir, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(dir, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]);
  const candidates = [...windows, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", chromium.executablePath()];
  return candidates.find(file => fs.existsSync(file));
}

function checkedCommand(program, args, cwd, input) {
  const response = spawnSync(program, args, { cwd, input, encoding: "utf8", windowsHide: true });
  if (response.error) throw response.error;
  if (response.status !== 0) throw new Error(`${program} failed: ${response.stderr.trim()}`);
  return response.stdout;
}

async function packageStreams({ PASS_SECONDS, LOOP_SECONDS }) {
  const ffmpeg = options.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg";
  const ffprobe = options.ffprobe || process.env.FFPROBE_PATH || "ffprobe";
  const source = fs.realpathSync(path.resolve(options["streams-from"]));
  const destination = path.resolve(options["stream-dir"] || path.join(root, "public", "replay"));
  const hd = "session-hd.mp4", playlist = "session-4k.m3u8", init = "session-4k-init.mp4";
  const filesPerLoop = LOOP_SECONDS / PASS_SECONDS, fps = 60;
  const chunks = Array.from({ length: filesPerLoop }, (_, i) => `session-4k-${String(i).padStart(3, "0")}.m4s`);
  const outputs = [hd, init, ...chunks, playlist];
  fs.mkdirSync(destination, { recursive: true });
  if (!options.overwrite && outputs.some(name => fs.existsSync(path.join(destination, name)))) {
    throw new Error("Presentation files already exist. Use --overwrite to replace the verified outputs.");
  }
  function verify(file, width, height, decode) {
    const args = ["-v", "error", "-threads", "3", "-select_streams", "v:0"];
    if (decode) args.push("-count_frames");
    const stream = JSON.parse(checkedCommand(ffprobe, [...args, "-show_entries",
      "stream=codec_name,width,height,avg_frame_rate,nb_frames,nb_read_frames,duration:format=duration",
      "-of", "json", file]));
    const v = stream.streams[0], count = Number(decode ? v.nb_read_frames : v.nb_frames);
    const duration = Number(v.duration || stream.format.duration);
    if (v.codec_name !== "h264" || v.width !== width || v.height !== height || v.avg_frame_rate !== "60/1"
      || count !== Math.round(LOOP_SECONDS * fps) || Math.abs(duration - LOOP_SECONDS) > 0.002) {
      throw new Error(`Invalid presentation media: ${JSON.stringify(stream)}`);
    }
    return { width, height, frames: count, seconds: duration };
  }
  verify(source, 3840, 2160, false);
  const stagingParent = destination === path.join(root, "public", "replay") ? path.join(root, "output") : destination;
  fs.mkdirSync(stagingParent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(stagingParent, ".stream-export-"));
  const input = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-threads", "3", "-i", source,
    "-map", "0:v:0", "-an", "-sn", "-dn", "-filter_threads", "2", "-c:v", "libx264",
    "-threads", String(numberOption("threads", 4, 1, 4, true)), "-preset", options.preset || "fast",
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", String(fps * PASS_SECONDS),
    "-keyint_min", String(fps * PASS_SECONDS), "-sc_threshold", "0",
    "-color_primaries", "bt709", "-colorspace", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0"];
  try {
    console.log("Encoding progressive HD presentation.");
    checkedCommand(ffmpeg, [...input, "-vf", "scale=1920:1080:flags=lanczos", "-crf", "18",
      "-maxrate", "4700k", "-bufsize", "1500k", "-movflags", "+faststart", hd], staging);
    console.log("Encoding independent two-second UHD presentation segments.");
    // Zero reorder delay puts the first presentation sample exactly at t=0 in
    // both native HLS and MSE. Each fragment starts with a closed IDR picture.
    checkedCommand(ffmpeg, [...input, "-bf", "0", "-level:v", "5.2", "-crf", "18",
      "-maxrate", "24000k", "-bufsize", "6000k", "-f", "hls", "-hls_time", String(PASS_SECONDS),
      "-hls_list_size", "0", "-hls_playlist_type", "vod", "-hls_segment_type", "fmp4",
      "-hls_flags", "independent_segments", "-hls_fmp4_init_filename", init,
      "-hls_segment_filename", "session-4k-%03d.m4s", playlist], staging);
    const manifest = fs.readFileSync(path.join(staging, playlist), "utf8");
    const segments = Array.from(manifest.matchAll(/^#EXTINF:([\d.]+),[^\n]*\r?\n([^\r\n]+)/gm));
    if (!manifest.includes(`#EXT-X-MAP:URI="${init}"`) || !manifest.includes("#EXT-X-ENDLIST")
      || segments.length !== chunks.length || segments.some((m, i) => Number(m[1]) !== PASS_SECONDS || m[2] !== chunks[i])) {
      throw new Error("The UHD playlist does not exactly cover the studio sequence.");
    }
    const sizes = Object.fromEntries(outputs.map(name => [name, fs.statSync(path.join(staging, name)).size]));
    if (Object.values(sizes).some(bytes => bytes < 1 || bytes >= maxStaticBytes)) {
      throw new Error(`Hosted asset exceeds its delivery budget: ${JSON.stringify(sizes)}`);
    }
    const hdCheck = verify(path.join(staging, hd), 1920, 1080, true);
    const uhdCheck = verify(path.join(staging, playlist), 3840, 2160, true);
    for (const name of outputs) fs.renameSync(path.join(staging, name), path.join(destination, name));
    console.log(JSON.stringify({ destination, hd: hdCheck, uhd: uhdCheck, fileBytes: sizes }, null, 2));
  } finally {
    for (const name of fs.readdirSync(staging)) {
      if (outputs.includes(name)) fs.unlinkSync(path.join(staging, name));
    }
    fs.rmdirSync(staging);
  }
}

async function prepareSeekMedia(page, ffmpeg, cacheDir, skipOptical) {
  const clips = await page.evaluate(skipOptical => [...document.querySelectorAll("video")]
    .filter(video => !skipOptical || video.id !== "optical-video")
    .map(video => ({ url: video.currentSrc || video.src, duration: video.duration, width: video.videoWidth }))
    .filter(clip => {
      if (!clip.url || !Number.isFinite(clip.duration) || !clip.width) return false;
      const url = new URL(clip.url, location.href);
      return ["http:", "https:"].includes(url.protocol) && url.origin === location.origin && /\.mp4$/i.test(url.pathname);
    }), skipOptical);
  const sources = [...new Map(clips.map(clip => [clip.url, clip])).values()];
  if (!sources.length) return;
  const files = [];
  for (const [index, clip] of sources.entries()) {
    const file = path.join(cacheDir, `media-${index}.mp4`);
    // A maximum of three predicted frames bounds the cost of each frame seek.
    // RGB geometry, cadence and dimensions match the real source. H.264 CRF 9
    // keeps this temporary generation visually transparent through the final encode.
    checkedCommand(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-threads", "2", "-i", clip.url,
      "-map", "0:v:0", "-an", "-c:v", "libx264", "-threads", "3", "-preset", "veryfast", "-crf", "9",
      "-g", "4", "-keyint_min", "4", "-sc_threshold", "0", "-bf", "0", "-pix_fmt", "yuv420p",
      "-fps_mode", "passthrough", "-movflags", "+faststart", file]);
    files.push(file);
    console.log(`Prepared seek media ${index + 1}/${sources.length}: ${path.basename(new URL(clip.url).pathname)}`);
  }
  // Local File-backed blob URLs preserve origin-clean video canvases without
  // copying entire media files into JS memory or adding files to the website.
  const input = await page.evaluateHandle(() => {
    const element = document.createElement("input");
    element.type = "file"; element.multiple = true; element.hidden = true;
    document.body.appendChild(element);
    return element;
  });
  await input.asElement().setInputFiles(files);
  await page.evaluate(async ({ input, sources }) => {
    const urls = new Map(sources.map((clip, index) => [clip.url, URL.createObjectURL(input.files[index])]));
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    input.remove();
    await Promise.all([...document.querySelectorAll("video")].map(async clip => {
      const original = clip.currentSrc || clip.src;
      if (!urls.has(original)) return;
      const oldDuration = clip.duration, oldWidth = clip.videoWidth, oldHeight = clip.videoHeight;
      // Preserve the application's ability to select a different view or source.
      Object.defineProperty(clip, "src", {
        configurable: true, get() { return descriptor.get.call(this); },
        set(value) { descriptor.set.call(this, urls.get(new URL(value, location.href).href) || value); },
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out opening export seek media.")), 15000);
        clip.addEventListener("loadeddata", () => { clearTimeout(timer); resolve(); }, { once: true });
        clip.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not decode export seek media.")); }, { once: true });
        clip.src = original;
        clip.load();
      });
      if (clip.videoWidth !== oldWidth || clip.videoHeight !== oldHeight || Math.abs(clip.duration - oldDuration) > 0.003) {
        throw new Error("Export seek media does not match source dimensions or duration.");
      }
    }));
  }, { input, sources });
  await input.dispose();
}

async function main() {
  const sequence = await import(pathToFileURL(path.join(root, "src", "sequence.js")).href);
  if (options["streams-from"]) return packageStreams(sequence);
  if (options.frames && options.seconds) throw new Error("Choose --frames or --seconds.");
  const width = numberOption("width", 3840, 16, 16384, true);
  const height = numberOption("height", Math.round(width * 9 / 16), 16, 16384, true);
  if (width % 2 || height % 2) throw new Error("H.264 output dimensions must be even.");
  const fps = numberOption("fps", 60, 1, 120, true);
  const frameCount = numberOption("frames", Math.round(numberOption("seconds", sequence.LOOP_SECONDS, 1 / fps, 3600) * fps),
    1, 432000, true);
  const start = numberOption("start", 0, 0, 86400);
  const quality = numberOption("quality", 96, 70, 100, true);
  const crf = numberOption("crf", 16, 0, 51, true);
  const threads = numberOption("threads", 4, 1, 4, true);
  const minimumOpticalWidth = numberOption("min-optical-width", 0, 0, 16384, true);
  const ffmpeg = options.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg";
  const ffprobe = options.ffprobe || process.env.FFPROBE_PATH || "ffprobe";
  const output = path.resolve(options.out || "aicanfeel-scan-studio-4k60.mp4");
  const official = path.join(root, "output", "AICANFEEL-Scan-Studio-4K60.mp4");
  const poster = options["poster-out"] ? path.resolve(options["poster-out"])
    : output === official ? path.join(root, "public", "brand", "studio-preview.jpg") : null;
  const pendingPoster = poster && path.join(path.dirname(poster), `.${path.basename(poster)}.${process.pid}.pending.jpg`);
  const tempOutput = path.join(path.dirname(output), `.${path.basename(output)}.${process.pid}.partial.mp4`);
  const url = new URL(options.url || "http://127.0.0.1:5317/");
  url.searchParams.set("render", "1");
  if (fs.existsSync(output) && !options.overwrite) throw new Error(`Output already exists: ${output}`);
  checkedCommand(ffmpeg, ["-version"]);
  checkedCommand(ffprobe, ["-version"]);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const { chromium } = playwrightLibrary();
  let browser, encoder, encoderDone, interrupted = false, verifiedMaster = false;
  let cacheDir;
  const stop = () => {
    interrupted = true;
    if (encoder && encoder.exitCode === null) encoder.kill();
    if (browser) browser.close().catch(() => {});
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    browser = await chromium.launch({
      executablePath: browserPath(chromium), headless: true,
      args: ["--enable-gpu", "--ignore-gpu-blocklist", "--force-color-profile=srgb",
        "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
        "--autoplay-policy=no-user-gesture-required", ...(process.platform === "win32" ? ["--use-angle=d3d11"] : [])],
    });
    const page = await browser.newPage({ viewport: { width, height }, screen: { width, height }, deviceScaleFactor: 1,
      reducedMotion: "no-preference", colorScheme: "dark" });
    if (page.routeWebSocket) await page.routeWebSocket("**/*", () => {});
    let pageError;
    page.on("pageerror", error => { pageError = error; console.error(error.message); });
    await page.goto(url.href, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => typeof window.scanStudio?.frame === "function", undefined, { timeout: 30000 });
    const scene = await page.evaluate(async () => {
      await document.fonts.ready;
      await window.scanStudio.ready();
      return await window.scanStudio.frame(0);
    });
    if (!scene.worldReady || scene.mediaError) throw new Error("Scan Studio could not initialize the 3D scene or optical feed.");
    const mediaSources = await page.evaluate(() => [...document.querySelectorAll("video")].map(video => ({
      id: video.id || video.className, source: video.currentSrc || video.src,
      width: video.videoWidth, height: video.videoHeight, seconds: video.duration,
    })));
    const optical = mediaSources.find(media => media.id === "optical-video");
    if (minimumOpticalWidth && (!optical || optical.width < minimumOpticalWidth)) {
      throw new Error(`Expected optical source at least ${minimumOpticalWidth}px wide; received ${JSON.stringify(optical)}`);
    }
    console.log(`Rendering ${frameCount} frames at ${width}×${height}, ${fps} fps.`);
    if (!options["no-fast-seek"]) {
      cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "aicanfeel-export-"));
      await prepareSeekMedia(page, ffmpeg, cacheDir, sequence.PASSES.every(pass => sequence.LOOKS[pass]));
    }
    const cdp = await page.context().newCDPSession(page);
    const ffargs = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y",
      "-threads", "2", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "pipe:0", "-an",
      "-filter_threads", "2", "-vf", "scale=in_range=full:out_range=tv:out_color_matrix=bt709",
      "-c:v", "libx264", "-threads", String(threads), "-preset", options.preset || "veryfast",
      "-crf", String(crf), "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", String(fps * 2),
      "-color_primaries", "bt709", "-colorspace", "bt709", "-color_trc", "bt709", "-color_range", "tv",
      "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0",
      "-movflags", "+faststart", tempOutput];
    encoder = spawn(ffmpeg, ffargs, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
    let ffLog = "";
    encoder.stderr.on("data", data => { ffLog = (ffLog + data).slice(-6000); });
    encoder.stdin.on("error", () => {}); // Per-write callbacks below carry pipe errors.
    encoderDone = new Promise(resolve => {
      encoder.once("error", error => resolve({ error }));
      encoder.once("close", code => resolve({ code }));
    });
    const started = performance.now();
    let seekMs = 0, screenshotMs = 0, pipeMs = 0;
    const passes = {};
    const posterFrame = Math.min(frameCount - 1, Math.round(0.4 * fps));
    let posterJpeg;
    let previousWrite = Promise.resolve();
    for (let index = 0; index < frameCount; index++) {
      if (interrupted || pageError) throw pageError || new Error("Export interrupted.");
      // Sample inside each media frame to avoid 60 Hz rounded timestamp boundaries.
      const t = start + (index + 0.125) / fps;
      const beforeSeek = performance.now();
      const status = await page.evaluate(async time => {
        let result = await window.scanStudio.frame(time);
        const seeking = [...document.querySelectorAll("video")].filter(clip => clip.seeking);
        if (seeking.length) {
          await Promise.all(seeking.map(clip => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Video seek did not finish before capture.")), 3000);
            clip.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
          })));
          result = await window.scanStudio.frame(time);
        }
        await new Promise(requestAnimationFrame);
        return { pass: result.pass, mediaError: result.mediaError, failedWorld: result.failedWorld };
      }, t);
      if (status.mediaError || status.failedWorld) throw new Error(`Media or 3D rendering failed at frame ${index}.`);
      if (status.pass !== sequence.phaseAt(t)) {
        throw new Error(`Frame ${index} rendered "${status.pass}" in the "${sequence.phaseAt(t)}" slot.`);
      }
      passes[status.pass] = (passes[status.pass] || 0) + 1;
      const beforeCapture = performance.now();
      const capture = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality, fromSurface: true,
        captureBeyondViewport: false, optimizeForSpeed: true });
      const beforeWrite = performance.now();
      const jpeg = Buffer.from(capture.data, "base64");
      if (poster && index === posterFrame) posterJpeg = jpeg;
      const writeError = await previousWrite;
      if (writeError) throw writeError;
      // Keep at most one write in flight while Chrome paints the next frame.
      previousWrite = new Promise(resolve => encoder.stdin.write(jpeg,
        error => resolve(error && new Error(`Encoder pipe failed: ${ffLog || error.message}`))));
      const now = performance.now();
      seekMs += beforeCapture - beforeSeek;
      screenshotMs += beforeWrite - beforeCapture;
      pipeMs += now - beforeWrite;
      if ((index + 1) % fps === 0) {
        const rate = 1000 * (index + 1) / (now - started);
        const remaining = Math.ceil((frameCount - index - 1) / rate);
        console.log(`Rendered ${index + 1}/${frameCount} at ${rate.toFixed(1)} frames/s, about ${remaining}s left`);
      }
    }
    const writeError = await previousWrite;
    if (writeError) throw writeError;
    encoder.stdin.end();
    const result = await encoderDone;
    if (result.error || result.code !== 0) throw new Error(`FFmpeg failed: ${result.error?.message || ffLog || result.code}`);
    const probe = JSON.parse(checkedCommand(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries",
      "stream=codec_name,width,height,avg_frame_rate,nb_frames,duration,color_primaries,color_transfer,color_space",
      "-of", "json", tempOutput])).streams[0];
    if (!probe || probe.width !== width || probe.height !== height || Number(probe.nb_frames) !== frameCount
      || Math.abs(Number(probe.duration) - frameCount / fps) > 0.002 || probe.avg_frame_rate !== `${fps}/1`) {
      throw new Error(`Encoded stream failed verification: ${JSON.stringify(probe)}`);
    }
    verifiedMaster = true;
    if (poster) {
      fs.mkdirSync(path.dirname(poster), { recursive: true });
      checkedCommand(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-threads", "2",
        "-f", "image2pipe", "-c:v", "mjpeg", "-i", "pipe:0", "-filter_threads", "2",
        "-vf", "scale=1920:1080:flags=lanczos,setsar=1", "-frames:v", "1", "-c:v", "mjpeg", "-threads", "2",
        "-q:v", "2", "-update", "1", pendingPoster], undefined, posterJpeg);
      const image = JSON.parse(checkedCommand(ffprobe, ["-v", "error", "-show_entries", "stream=codec_name,width,height",
        "-of", "json", pendingPoster])).streams[0];
      if (image?.codec_name !== "mjpeg" || image.width !== 1920 || image.height !== 1080) throw new Error("Invalid workstation preview.");
    }
    fs.renameSync(tempOutput, output);
    if (poster) fs.renameSync(pendingPoster, poster);
    const seconds = (performance.now() - started) / 1000;
    console.log(JSON.stringify({ output, verified: probe, mediaSources, bytes: fs.statSync(output).size, passes,
      wallSeconds: +seconds.toFixed(2), exportFramesPerSecond: +(frameCount / seconds).toFixed(2),
      meanMilliseconds: { seekAndPaint: +(seekMs / frameCount).toFixed(1),
        compositorJpeg: +(screenshotMs / frameCount).toFixed(1), pipe: +(pipeMs / frameCount).toFixed(1) } }, null, 2));
  } catch (error) {
    if (verifiedMaster && fs.existsSync(tempOutput)) error.message += ` Verified render retained at ${tempOutput}.`;
    throw error;
  } finally {
    if (encoder && encoder.exitCode === null && encoder.signalCode === null) { encoder.kill(); await encoderDone; }
    if (browser) await browser.close().catch(() => {});
    if (!verifiedMaster && fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    if (pendingPoster && fs.existsSync(pendingPoster)) fs.unlinkSync(pendingPoster);
    if (cacheDir) {
      for (const name of fs.readdirSync(cacheDir)) {
        if (/^media-\d+\.mp4$/.test(name)) fs.unlinkSync(path.join(cacheDir, name));
      }
      fs.rmdirSync(cacheDir);
    }
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
