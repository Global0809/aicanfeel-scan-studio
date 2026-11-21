#!/usr/bin/env node
// Render all inspection materials at one camera angle into one seekable video.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { parseArgs } = require("node:util");

const root = path.resolve(__dirname, "..");
const fps = 60, columns = 4, rows = 2, tileWidth = 800, tileHeight = 564;
const maxStaticBytes = 25 * 1024 * 1024;
const { values } = parseArgs({ options: {
  url: { type: "string" }, out: { type: "string" }, frames: { type: "string" },
  "compact-out": { type: "string" }, "no-compact": { type: "boolean" }, "poster-out": { type: "string" },
  "slots-from": { type: "string" }, "slots-out": { type: "string" },
  browser: { type: "string" }, playwright: { type: "string" }, help: { type: "boolean" },
} });
if (values.help) {
  console.log("node tools/bake-passes.cjs --url http://127.0.0.1:5317/ [--out file.mp4] [--frames 6 --out sample.mp4] [--compact-out file.mp4 | --no-compact] [--poster-out still.webp]\nnode tools/bake-passes.cjs --slots-from scan-atlas.mp4 [--slots-out material-slots.webp]");
  process.exit(0);
}

function command(program, args) {
  const result = spawnSync(program, args, { encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${program} exited ${result.status}`);
  return result.stdout;
}

function chromiumLibrary() {
  const explicit = values.playwright || process.env.PLAYWRIGHT_MODULE;
  const runtime = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime",
    "dependencies", "node", "node_modules", "playwright");
  for (const name of explicit ? [explicit] : ["playwright", "playwright-core", runtime]) {
    try { return require(name).chromium; } catch (error) { if (explicit) throw error; }
  }
  throw new Error("Install Playwright or set PLAYWRIGHT_MODULE to its installed path.");
}

function browserExecutable(chromium) {
  if (values.browser || process.env.CHROME_PATH) return values.browser || process.env.CHROME_PATH;
  const windows = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
    .filter(Boolean).flatMap(dir => [path.join(dir, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(dir, "Microsoft", "Edge", "Application", "msedge.exe")]);
  return [...windows, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", chromium.executablePath()].find(fs.existsSync);
}

function compactAtlas(input, output, ffmpeg, ffprobe, frameCount) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const pending = path.join(path.dirname(output), `.${path.basename(output)}.${process.pid}.pending.mp4`);
  try {
    command(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-threads", "2", "-i", input,
      "-an", "-vf", "scale=2304:816:flags=lanczos,setsar=1", "-c:v", "libx264", "-threads", "3", "-preset", "fast",
      "-crf", "21", "-maxrate", "5500k", "-bufsize", "3300k", "-g", "30", "-keyint_min", "30",
      "-sc_threshold", "0", "-r", String(fps), "-fps_mode", "cfr", "-video_track_timescale", "60000", "-movie_timescale", "60000",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", pending]);
    const probe = JSON.parse(command(ffprobe, ["-v", "error", "-select_streams", "v:0", "-count_frames",
      "-show_entries", "stream=codec_name,width,height,sample_aspect_ratio,avg_frame_rate,time_base,nb_read_frames,start_time,duration,duration_ts", "-of", "json", pending])).streams[0];
    const bytes = fs.statSync(pending).size;
    if (probe.codec_name !== "h264" || probe.width !== 2304 || probe.height !== 816 || probe.avg_frame_rate !== `${fps}/1`
      || probe.sample_aspect_ratio !== "1:1" || probe.time_base !== "1/60000" || Number(probe.nb_read_frames) !== frameCount
      || Number(probe.start_time) !== 0 || Number(probe.duration_ts) !== frameCount * 60000 / fps
      || bytes >= maxStaticBytes) throw new Error(`Compact atlas validation failed: ${JSON.stringify({ probe, bytes })}`);
    fs.renameSync(pending, output);
    console.log(JSON.stringify({ compact: output, bytes, tileWidth: 576, tileHeight: 408, probe }));
  } finally {
    if (fs.existsSync(pending)) fs.unlinkSync(pending);
  }
}

function materialSlots(input, output, ffmpeg, ffprobe, passes) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const pending = path.join(path.dirname(output), `.${path.basename(output)}.${process.pid}.pending.webp`);
  try {
    const source = JSON.parse(command(ffprobe, ["-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,nb_frames", "-of", "json", input])).streams[0];
    const w = source?.width / columns, h = source?.height / rows;
    if (!Number.isInteger(w) || !Number.isInteger(h) || Number(source?.nb_frames) < 15) throw new Error("Invalid replay atlas for material slots.");
    const looks = ["uv", "alloy", "motion", "topology"];
    const filter = ["[0:v]select='eq(n,14)',split=4[uv][alloy][motion][topology]"];
    for (const look of looks) {
      const index = passes.indexOf(look);
      if (index < 0) throw new Error(`Missing required material slot "${look}".`);
      const x = (index % columns) * w + Math.round(w * 0.20);
      const y = Math.floor(index / columns) * h + Math.round(h * 0.03);
      const width = Math.round(w * 0.48), height = Math.round(h * 0.51);
      filter.push(`[${look}]crop=${width}:${height}:${x}:${y}:exact=1,scale=160:120:flags=lanczos,setsar=1[${look}Tile]`);
    }
    filter.push("[uvTile][alloyTile][motionTile][topologyTile]hstack=inputs=4[slots]");
    command(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-threads", "2", "-i", input,
      "-filter_complex_threads", "2", "-filter_complex", filter.join(";"), "-map", "[slots]", "-an", "-frames:v", "1",
      "-c:v", "libwebp", "-quality", "95", "-threads", "2", pending]);
    const image = JSON.parse(command(ffprobe, ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", pending])).streams[0];
    if (image?.codec_name !== "webp" || image.width !== 640 || image.height !== 120) throw new Error("Invalid material slot sprite.");
    fs.renameSync(pending, output);
  } finally {
    if (fs.existsSync(pending)) fs.unlinkSync(pending);
  }
}

async function main() {
  const { ORBIT_SECONDS, ATLAS_PASSES, phaseAt } = await import(pathToFileURL(path.join(root, "src", "sequence.js")).href);
  const fullCount = Math.round(ORBIT_SECONDS * fps);
  const frameCount = values.frames === undefined ? fullCount : Number(values.frames);
  const deployed = path.join(root, "public", "replay", "scan-atlas.mp4");
  const destination = path.resolve(values.out || deployed);
  const defaultSlots = path.join(root, "public", "ui", "material-slots.webp");
  const slots = values["slots-out"] ? path.resolve(values["slots-out"]) : destination === deployed ? defaultSlots : null;
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg", ffprobe = process.env.FFPROBE_PATH || "ffprobe";
  if (values["slots-from"]) return materialSlots(fs.realpathSync(values["slots-from"]), slots || defaultSlots, ffmpeg, ffprobe, ATLAS_PASSES);
  const poster = values["poster-out"] ? path.resolve(values["poster-out"])
    : destination === deployed ? path.join(root, "public", "replay", "scan-poster.webp") : null;
  const posterTile = ATLAS_PASSES.indexOf(phaseAt(0));
  if (poster && posterTile < 0) throw new Error("The opening look is missing from the replay atlas.");
  const requestedCompact = values["compact-out"];
  const compact = requestedCompact ? path.resolve(requestedCompact) : destination === deployed && !values["no-compact"]
    ? path.join(root, "public", "replay", "scan-atlas-compact.mp4") : null;
  if (requestedCompact && values["no-compact"]) throw new Error("Choose --compact-out or --no-compact.");
  if (compact === destination) throw new Error("The two atlas variants need different output paths.");
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > fullCount) throw new Error("Invalid frame count.");
  if (frameCount !== fullCount && destination === deployed) throw new Error("A partial test bake needs --out.");
  if (ATLAS_PASSES.length !== columns * rows) throw new Error("Atlas material count does not match its tile layout.");
  const url = new URL(values.url || process.env.STUDIO_RENDER_URL || "http://127.0.0.1:5317/");
  url.searchParams.set("render", "1");
  if (slots && frameCount < 15) throw new Error("The material slot sprite needs at least fifteen atlas frames.");
  command(ffmpeg, ["-version"]); command(ffprobe, ["-version"]);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const pending = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}.pending.mp4`);
  const pendingPoster = poster && path.join(path.dirname(poster), `.${path.basename(poster)}.${process.pid}.pending.webp`);
  const chromium = chromiumLibrary();
  let browser, encoder, closed;
  const stop = () => { if (encoder) encoder.kill(); if (browser) browser.close().catch(() => {}); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    browser = await chromium.launch({
      executablePath: browserExecutable(chromium), headless: true,
      args: ["--enable-gpu", "--ignore-gpu-blocklist", "--force-color-profile=srgb",
        "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
        ...(process.platform === "win32" ? ["--use-angle=d3d11"] : [])],
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    if (page.routeWebSocket) await page.routeWebSocket("**/*", () => {});
    let pageError;
    page.on("pageerror", error => { pageError = error; console.error(error.message); });
    await page.goto(url.href, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => window.scanStudio?.bakeViewport, undefined, { timeout: 90000 });
    await page.evaluate(async () => { await document.fonts.ready; await window.scanStudio.ready(); });
    const surface = await page.evaluateHandle(({ columns, rows, tileWidth, tileHeight }) => {
      const canvas = document.createElement("canvas");
      canvas.width = columns * tileWidth;
      canvas.height = rows * tileHeight;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      return canvas;
    }, { columns, rows, tileWidth, tileHeight });
    encoder = spawn(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-threads", "2",
      "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "pipe:0", "-an", "-filter_threads", "2",
      "-vf", "scale=in_range=full:out_range=tv:out_color_matrix=bt709", "-c:v", "libx264", "-threads", "4",
      "-preset", "veryfast", "-crf", "18", "-maxrate", "28000k", "-bufsize", "3500k",
      "-g", "15", "-keyint_min", "15", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
      "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0",
      "-movflags", "+faststart", pending], { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
    let ffLog = "";
    encoder.stderr.on("data", chunk => { ffLog = (ffLog + chunk).slice(-5000); });
    encoder.stdin.on("error", () => {});
    closed = new Promise(resolve => {
      encoder.once("error", error => resolve({ error }));
      encoder.once("close", code => resolve({ code }));
    });
    const hashes = new Set(), started = Date.now();
    for (let i = 0; i < frameCount; i++) {
      if (pageError) throw pageError;
      const data = await page.evaluate(({ surface, passes, t, tileWidth, tileHeight, columns }) => {
        const ctx = surface.getContext("2d");
        for (let n = 0; n < passes.length; n++) {
          const source = window.scanStudio.bakeViewport(passes[n], t, { canvas: true });
          if (!(source instanceof HTMLCanvasElement)) throw new Error("bakeViewport must return the requested composited canvas.");
          ctx.drawImage(source, (n % columns) * tileWidth, Math.floor(n / columns) * tileHeight, tileWidth, tileHeight);
        }
        return surface.toDataURL("image/jpeg", 0.96);
      }, { surface, passes: ATLAS_PASSES, t: i / fps, tileWidth, tileHeight, columns });
      const jpeg = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
      if (!i && poster) {
        const webp = await page.evaluate(({ surface, posterTile, tileWidth, tileHeight, columns }) => {
          const still = document.createElement("canvas");
          still.width = tileWidth;
          still.height = tileHeight;
          const x = (posterTile % columns) * tileWidth, y = Math.floor(posterTile / columns) * tileHeight;
          still.getContext("2d", { alpha: false }).drawImage(surface, x, y, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
          return still.toDataURL("image/webp", 0.95).split(",")[1];
        }, { surface, posterTile, tileWidth, tileHeight, columns });
        fs.mkdirSync(path.dirname(poster), { recursive: true });
        fs.writeFileSync(pendingPoster, Buffer.from(webp, "base64"));
        const image = JSON.parse(command(ffprobe, ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", pendingPoster])).streams[0];
        if (image?.codec_name !== "webp" || image.width !== tileWidth || image.height !== tileHeight) throw new Error("Invalid opening viewport poster.");
      }
      if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error(`Invalid atlas frame ${i}.`);
      hashes.add(crypto.createHash("sha256").update(jpeg).digest("hex"));
      await new Promise((resolve, reject) => encoder.stdin.write(jpeg,
        error => error ? reject(new Error(ffLog || error.message)) : resolve()));
      if ((i + 1) % 30 === 0) console.log(`Atlas frame ${i + 1}/${frameCount}, ${((Date.now() - started) / 1000).toFixed(0)}s elapsed`);
    }
    encoder.stdin.end();
    const result = await closed;
    if (result.error || result.code !== 0) throw new Error(result.error?.message || ffLog || "Atlas encode failed.");
    if (hashes.size !== frameCount) throw new Error(`Only ${hashes.size} distinct source frames.`);
    const probe = JSON.parse(command(ffprobe, ["-v", "error", "-select_streams", "v:0", "-count_frames",
      "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_read_frames,duration,color_range",
      "-of", "json", pending])).streams[0];
    const size = fs.statSync(pending).size;
    if (probe.codec_name !== "h264" || probe.width !== tileWidth * columns || probe.height !== tileHeight * rows
      || probe.avg_frame_rate !== `${fps}/1` || Number(probe.nb_read_frames) !== frameCount
      || Math.abs(Number(probe.duration) - frameCount / fps) > 0.002 || size >= maxStaticBytes) {
      throw new Error(`Atlas validation failed: ${JSON.stringify({ probe, size })}`);
    }
    fs.renameSync(pending, destination);
    if (poster) fs.renameSync(pendingPoster, poster);
    console.log(JSON.stringify({ destination, bytes: size, tileWidth, tileHeight, passes: ATLAS_PASSES, probe }, null, 2));
  } finally {
    if (encoder && encoder.exitCode === null && encoder.signalCode === null) { encoder.kill(); await closed; }
    if (browser) await browser.close().catch(() => {});
    if (fs.existsSync(pending)) fs.unlinkSync(pending);
    if (pendingPoster && fs.existsSync(pendingPoster)) fs.unlinkSync(pendingPoster);
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
  if (compact) compactAtlas(destination, compact, ffmpeg, ffprobe, frameCount);
  if (slots) materialSlots(destination, slots, ffmpeg, ffprobe, ATLAS_PASSES);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
