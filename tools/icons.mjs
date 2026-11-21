import { readFile, writeFile, mkdir } from "node:fs/promises";

const names = `adjustments-horizontal aperture arrows-move axis-x box box-model 
camera camera-cog camera-rotate chart-dots-2 chart-histogram chart-pie check chevron-down
chevron-right chevrons-down circle circle-dashed circle-dot circles circles-relation color-filter
crosshair cube cube-3d-sphere device-desktop device-floppy dots dots-vertical eye eye-off
file-3d focus-2 folder folder-open frame geometry grid-3x3 grid-dots grid-pattern hand-stop
hierarchy hierarchy-2 layers-intersect layers-subtract lock magnet maximize mouse
pencil perspective photo pinned player-pause player-play player-skip-back player-skip-forward
pointer refresh repeat resize rotate-360 rotate-3d ruler scan scan-eye search select settings
sitemap slash sphere stack sun timeline topology-star-3 triangle triangle-inverted vector-bezier-2
view-360 viewport-wide x zoom-in zoom-out`.split(/\s+/);
const folder = new URL("../node_modules/@tabler/icons/", import.meta.url);
const target = new URL("../public/ui/", import.meta.url);
await mkdir(target, {recursive: true});
const symbols = [];
for (const name of names) {
  const source = await readFile(new URL("icons/outline/" + name + ".svg", folder), "utf8");
  const geometry = source.slice(source.indexOf(">") + 1, source.lastIndexOf("</svg>"));
  symbols.push('<symbol viewBox="0 0 24 24" id="i-' + name + '">' + geometry + "</symbol>");
}
await writeFile(new URL("icons.svg", target), '<svg xmlns="http://www.w3.org/2000/svg"><defs>' + symbols.join("\n") + "</defs></svg>");
await writeFile(new URL("tabler-license.txt", target), await readFile(new URL("LICENSE", folder)));

