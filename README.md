# AICANFEEL Scan Studio

[Open the live studio](https://global0809.github.io/aicanfeel-scan-studio/studio.html) · [Play the 4K presentation](https://global0809.github.io/aicanfeel-scan-studio/present.html?quality=4k)

Open `present.html?quality=4k` to start the 4K60 client presentation. The eight-shot reel uses the live workspace to show the performer's scan, materials, camera animation and soundtrack waveform. Use **Open Studio** to start editing in the same tab. **Presentation** returns to the reel. Add `&reel=scan` to see the earlier 38-second scan study with six continuous turns and three tracking cameras.

The automatic sequence includes a registered optical portrait, numbered UV calibration, brushed titanium, motion trails, facial topology, reconstructed capture and a textured surface. The pass monitor displays the corresponding section profile, face UV map, tangent normals, orbit or colour distribution. Click a timeline clip to seek to its material cut. The Material slots and Render menu hold individual looks for inspection.

## Edit and export

1. Open `studio.html` or select **Open Studio** in the player. Use **New** for the performer demo, a material or motion study, or a single-shot project.
2. Select a shot and change its material, scan strength, colour grade, camera, duration or transition. Drag a clip to move it and drag its right edge to trim it. Use **Split** at the playhead. In the **Camera** tab, enable animation to set separate start and end poses.
3. Import a self-contained GLB or an audio file. Choose a soundtrack from the asset list and enable audio preview. Select the waveform to set its starting point. Each shot's audio-reactive scan level follows the same trimmed audio.
4. **Save** downloads an `.acf.json` project containing the imported media. **Open** restores it. Edits also save automatically to this browser. Files stay on the device.
5. **Export** renders the clean scene at 720p, 1080p or UHD. Save an opaque or transparent PNG, or render a 30 or 60 fps movie. Video export uses MP4 where the browser supports AVC and AAC encoding, with WebM available on compatible browsers. Set the backdrop to **Chroma green** to key the movie in another editor.

The live 3D editor and scene exports require WebGL. The renderer uses a synchronized atlas for the built-in performer on devices without a supported GPU.

## Present on Windows

Open **Open Scan Studio.cmd** to start the compiled site locally in a full-screen Chrome or Edge window. It uses the installed Node.js runtime and the files in `dist/`. Keep the launcher window open during the call. The public site runs directly in a browser.

Press **F** for full screen, **Space** to pause or play, **A** for the automatic sequence, and **Home** to return to the first frame. The Help menu lists the individual view shortcuts. When the operating system requests reduced motion, playback starts paused.

For a screen share with minimal graphics load, choose **Render → Presentation playback**. The player selects a 60 fps HD or UHD recording to fit the screen. Opening `present.html?quality=4k` requests UHD. Its two 3840 × 2160 encodes share keyframes at the material cuts so the player can use less bandwidth when a call is sharing the connection. Use **Open Studio** to enter the editing workspace.

## Build

Run `npm ci` and `npm run build` to produce the static website in `dist/`. Use `npm run dev` for local development. Fonts, motion plates and geometry are bundled with the build.

The workstation reel uses Chrome and FFmpeg. Start the development server, capture the live workspace, then prepare its two UHD streams and the HD fallback.

```sh
node tools/render-live-reel.cjs --url http://127.0.0.1:5173/studio.html --out output/live-studio-4k60.mp4
node tools/package-live-reel.mjs output/live-studio-4k60.mp4
```

The included Session Pulse soundtrack was synthesized by `tools/build-editor-score.mjs`. The browser muxer is [Mediabunny](https://mediabunny.dev/), with its license in `public/licenses/mediabunny-MPL-2.0.txt`.

The central viewport uses hardware-accelerated WebGL. During a cold load, a small video of the same material sequence can carry the viewport until the geometry is ready. The renderer takes over at the angle and phase already visible. Software-rendered browsers use a synchronized video atlas. Smaller displays and slower connections use its compact version. Choosing Optical capture loads the recording at the appropriate resolution, including an enhanced 2420 × 1728 plate for high-density screens. The supplied recording was 1920 × 1080 at 24 fps.

## Capture and geometry

The three camera feeds and the central optical capture come from the supplied recording. The fitted digital double and the reconstructed optical point cloud are separate inspection passes. `public/subject/CREDITS.txt` records the geometry sources. The graphs show measured differences between facial landmarks and independent optical-flow predictions in source pixels. See `tools/optical-tracking-method.md` for the measurement method.

The scope's 32 cross-sections and its vertex colours come from the registered optical point cloud. Its UV atlas uses the fitted face mesh's texture coordinates. After replacing either model, run `node tools/build-instrument-plates.mjs` to refresh the scope data.

After changing the model materials, start the development site and rebuild its fallback turntables, swatch previews and opening sequence. The capture tools use Chrome, Playwright, FFmpeg and FFprobe.

```sh
node tools/bake-passes.cjs --url http://127.0.0.1:5173/
node tools/build-opening-reel.mjs
```

Render the 3840 × 2160, 60 fps presentation from that scene, then encode the studio and call-quality streams.

```sh
node tools/export-showcase.cjs --url http://127.0.0.1:5173/ --out output/AICANFEEL-Scan-Studio-4K60.mp4 --overwrite
node tools/export-showcase.cjs --streams-from output/AICANFEEL-Scan-Studio-4K60.mp4 --overwrite
node tools/encode-call-4k.mjs
```
