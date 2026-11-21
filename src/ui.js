const assetBase = import.meta.env.BASE_URL;
export const asset = path => assetBase + path;
export function icon(name, className = "") {
  return '<svg aria-hidden="true" class="icon ' + className + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="' + asset("ui/icons.svg#i-" + name) + '"></use></svg>';
}
export function button(action, label, glyph, extra = "") {
  return '<button type="button" class="icon-button ' + extra + '" data-action="' + action + '" title="' + label + '" aria-label="' + label + '">' + icon(glyph) + '</button>';
}
export function option(action, title, glyph = "", shortcut = "") {
  return '<button type="button" role="menuitem" data-action="' + action + '">' + (glyph ? icon(glyph) : "") + '<span>' + title + '</span><kbd>' + shortcut + '</kbd></button>';
}
export function fillIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(node => node.outerHTML = icon(node.dataset.icon));
}

const editorMenu = (name, glyph) => '<button class="editor-type" data-action="menu:' + name + '" aria-label="' + name + '">' + icon(glyph) + icon("chevron-down") + '</button>';
const textMenu = (name, caption = name) => '<button class="text-menu" data-action="menu:' + name + '">' + caption + '</button>';
const checkRow = (key, caption, checked = true) => '<label class="check-row"><input type="checkbox" data-layer="' + key + '" ' + (checked ? "checked" : "") + '><span>' + caption + '</span></label>';
const group = (title, body, extra = "") => '<details class="section-group ' + extra + '" open><summary>' + icon("chevron-right") + title + '</summary><div class="section-body">' + body + '</div></details>';
const stat = (caption, id, fallback) => '<div class="stat-row"><span>' + caption + '</span><output id="' + id + '">' + fallback + '</output></div>';

export function gizmo(id = "") {
  return '<div class="gizmo" aria-hidden="true"><svg viewBox="0 0 86 84"><g class="axis-ghost" stroke-width="2"><path stroke="#bd515a" d="M14 47 71 36"/><path stroke="#78a44a" d="M23 29 61 53"/><path stroke="#5a83c3" d="M43 12v60"/></g><g class="axis-rings"><circle cx="14" cy="47" r="6" fill="#613b3d" stroke="#a34650"/><circle cx="23" cy="29" r="5.8" fill="#445234" stroke="#759049"/><circle cx="43" cy="72" r="5.7" fill="#2c3c55" stroke="#49648c"/></g><g class="axis-labels"><circle cx="43" cy="12" r="8.1" fill="#6391db"/><text x="43" y="15">Z</text><circle cx="71" cy="36" r="7.8" fill="#d35b63"/><text x="71" y="39">X</text><circle cx="61" cy="53" r="7.8" fill="#92b957"/><text x="61" y="56">Y</text><circle cx="43" cy="42" r="3.1" fill="#d4d4d1"/></g></svg></div>';
}

const cameras = [
  {key:"front", title:"Front Orthographic", sub:"Front", number:"001"},
  {key:"side", title:"Left Orthographic", sub:"Profile", number:"042"},
  {key:"top", title:"Top Orthographic", sub:"Overhead", number:"083"}
];
export const cameraNames = Object.fromEntries(cameras.map(c => [c.key, c.title]));

function cameraView(c) {
  return '<section class="ortho-pane ' + c.key + '" aria-label="' + c.title + '"><div class="ortho-pic"><img src="' + asset("capture/" + c.key + ".webp") + '" alt="' + c.sub + ' capture of the performer" draggable="false"><canvas class="ortho-pass" data-camera="' + c.key + '" aria-hidden="true"></canvas></div><div class="ortho-hud"><button class="camera-name" data-action="pin:' + c.key + '" title="Inspect ' + c.sub.toLowerCase() + ' view">' + icon("viewport-wide") + '<strong>' + c.title + '</strong></button><span class="camera-object">(<b class="frame-number">1</b>) Scan | Head</span><span class="unit-note">10 Centimeters</span></div><div class="ortho-axis">' + gizmo() + '</div><div class="ortho-code"><i></i>CAM.' + c.number + '</div></section>';
}

const treeSpec = [
  ["scene", "", "Scene Collection", "stack", "light"],
  ["rig","scene","Capture Rig","folder-open","amber"],
  ["cameras","rig","Cameras (120)","camera","green"],
  ["camera","cameras","Camera.001","camera","green"],
  ["scan","scene","Scan","folder-open","amber"],
  ["raw","scan","Raw","folder-open","amber"],
  ["points","raw","Point Cloud","grid-dots","cyan"],
  ["mesh","scan","Mesh","folder-open","amber"],
  ["head","mesh","Head","triangle-inverted","orange"],
  ["locs","mesh","Locs","triangle-inverted","orange"],
  ["eyes","mesh","Eyes","triangle-inverted","orange"],
  ["retopo","scan","Retopology","folder-open","amber"],
  ["head-mesh","retopo","Head_Retopo","triangle-inverted","green"],
  ["eye-mesh","retopo","Eyes_Retopo","triangle-inverted","green"],
  ["refs","scene","Reference","folder","amber"]
];
const treeParents=Object.fromEntries(treeSpec.map(([id,parent])=>[id,parent]));
export function treeHidden(id,hidden) {
  for(let node=id;node;node=treeParents[node])if(hidden.has(node))return true;
  return false;
}
export function setTreeVisibility(id,visible,hidden) {
  if(!visible){hidden.add(id);return;}
  for(let node=id;node;node=treeParents[node])hidden.delete(node);
}
export function rows(state) {
  const { collapsed, hidden, selected } = state;
  const byId = new Map(treeSpec.map(r => [r[0], r]));
  return treeSpec.map(([id, parent, name, glyph, color]) => {
    let depth = 0;
    let ancestor = parent;
    while (ancestor) {
      if (collapsed.has(ancestor)) return "";
      ancestor = byId.get(ancestor)[1];
      depth++;
    }
    const branch = treeSpec.some(r => r[1] === id);
    const caret = branch ? button("fold:" + id, (collapsed.has(id) ? "Expand " : "Collapse ") + name, collapsed.has(id) ? "chevron-right" : "chevron-down", "disclosure") : '<span class="disclosure"></span>';
    const invisible=treeHidden(id,hidden);
    const eye = id === "scene" ? "" : button("eye:" + id, (invisible ? "Show " : "Hide ") + name, invisible ? "eye-off" : "eye", "tree-eye");
    return '<div role="treeitem" aria-selected="' + (selected === id) + '" aria-level="' + (depth+1) + '" class="tree-row ' + (selected === id ? "selected " : "") + (invisible ? "muted " : "") + '" style="--level:' + depth + '">' + caret + '<button class="object-name" data-action="node:' + id + '" title="Select ' + name + '">' + icon(glyph,color) + '<span>' + name + '</span></button>' + eye + '</div>';
  }).join("");
}
export function selectedName(id) { return treeSpec.find(r => r[0] === id)?.[2] ?? "Head"; }

export function rangeControl(key, label, value, min = 0, max = 100) {
  return '<label class="range-row"><span>' + label + '</span><span class="range-field"><input tabindex="0" type="range" data-param="' + key + '" min="' + min + '" max="' + max + '" value="' + value + '" aria-label="' + label + '"><output>' + value + '%</output></span></label>';
}
export function properties(tab, settings) {
  const { density, intensity } = settings;
  const row = (k,v) => '<div class="field-row"><span>' + k + '</span><strong>' + v + '</strong></div>';
  if (tab === "camera") return group("Capture Camera", row("Projection","Perspective")+row("Optical feed","1210 × 864")+row("Source","Camera rig")) + group("Views", cameras.map(c=>'<button class="property-button" data-action="pin:'+c.key+'">'+c.title+'</button>').join(""))+group("World",checkRow("grid","Floor grid",settings.grid)+checkRow("cameras","Camera guides",settings.cameras));
  if (tab === "object") return group("Object",row("Selected", selectedName(settings.selected))+row("Collection","Scan")) + group("Transform",stat("Rotation Y","prop-rotation","0.0°")+row("Scale","1.000")+row("Axis","Y up")) + group("Visibility",checkRow("surface","Surface",settings.surface)+checkRow("points","Point cloud",settings.points)+checkRow("topology","Topology",settings.topology));
  if (tab === "material") return group("Surface Material",row("Shader","Principled BSDF")+row("Pass","Albedo / Beauty")+row("Color space","sRGB")) + group("Display",rangeControl("intensity","Overlay strength",intensity)+checkRow("landmarks","Face landmarks",settings.landmarks)+checkRow("surface","Surface",settings.surface)) + group("Geometry",rangeControl("density","Point density",density));
  return group("Scan data", '<div class="measurement-grid">'+stat("Vertices","prop-vertices","—") + stat("Triangles","prop-triangles","—") + stat("Landmarks","prop-landmarks","468") + stat("Mean error","prop-error","—") + stat("Frames","prop-frames","289") + stat("Views","prop-views","3 / 3")+'</div>') +
    group("Reconstruction", rangeControl("density","Point density",density) + rangeControl("intensity","Overlay strength",intensity) + '<div class="cleanup-actions">'+checkRow("landmarks","Landmarks",settings.landmarks)+'<button class="property-button" data-action="mode:topology">' + icon("triangle-inverted") + 'Topology</button></div>') +
    group("Point classification",'<canvas id="classification" aria-label="Point classification by scan residual"></canvas>',"classification-group")+
    group("Material slots",'<div class="material-slots">'+[["uv","UV"],["alloy","Alloy"],["motion","Motion"],["topology","Topology"]].map(([mode,label],i)=>'<button type="button" data-action="mode:'+mode+'" title="Inspect '+label+'" style="--slot-offset:'+i*100/3+'%"><i aria-hidden="true"></i><span>'+label+'</span></button>').join("")+'</div>',"material-library");
}

export function inspector(state) {
  return '<div class="inspector-scroll">' +
    group("Active Tool",'<div class="active-tool">'+icon("select")+'<span id="active-tool-label">Select Box</span></div><div class="tool-options">' + ["select","layers-intersect","layers-subtract","box-model"].map((g,i)=>'<button class="' + (i===0?"active":"") + '" data-action="tool-option:'+i+'" title="'+["Set","Extend","Subtract","Intersect"][i]+' selection">'+icon(g)+'</button>').join("") + '</div>') +
    group("Viewport",checkRow("grid","Floor grid",state.grid)+checkRow("cameras","Cameras",state.cameras)+checkRow("landmarks","Landmarks",state.landmarks)) +
    group("Scan Cleanup",'<div class="subhead">Display</div>'+checkRow("points","Point Cloud",state.points)+checkRow("surface","Mesh",state.surface)+checkRow("topology","Topology",state.topology)+'<div class="subhead">Show</div>'+checkRow("reprojection","Reprojection",state.reprojection)+checkRow("depth","Depth Map",state.depth)) +
    group("Statistics",stat("Vertices","v-vertices","—")+stat("Triangles","v-triangles","—")+stat("Landmarks","v-landmarks","468")+stat("Frame","v-frame","001 / 289")+stat("Error","v-error","0.00 px")) +
    group("Turntable",'<button class="survey-view" data-action="mode:points" title="Inspect the full rotating point cloud"><video id="survey-video" data-src="'+asset("subject/survey-turntable.mp4")+'" poster="'+asset("subject/survey-poster.webp")+'" muted loop playsinline preload="auto" aria-label="Full 360-degree reconstructed point-cloud turntable"></video><span class="survey-tag">Orbit Y</span><span id="survey-angle">000°</span></button>',"survey-group") +
    '</div><div class="inspector-tabs"><button data-action="inspector" title="Hide sidebar (N)">Item</button><span>Tool</span><span>View</span></div>';
}

export function makeLayout(state) {
  document.getElementById("main-menu").innerHTML = ["File","Edit","Render","Window","Help"].map(n=>textMenu(n)).join("");
  document.getElementById("workspaces").innerHTML = ["Layout","Modeling","Sculpting","UV Editing","Shading","Animation","Compositing"].map(n=>'<button data-action="workspace:'+n+'" class="'+(n==="Layout"?"active":"")+'">'+n+'</button>').join("");
  document.querySelector(".fullscreen").innerHTML = "Full screen";
  document.getElementById("ortho-views").innerHTML = cameras.map(cameraView).join("");
  document.getElementById("view-toolbar").innerHTML = editorMenu("Viewport","viewport-wide") + '<button class="object-mode" data-action="menu:Mode">' + icon("cube") + 'Object Mode' + icon("chevron-down") + '</button>' + ["View","Select","Object"].map(n=>textMenu(n)).join("") + '<span class="toolbar-space"></span><button data-action="menu:Orientation" class="orient-menu">' + icon("axis-x") + 'Global' + icon("chevron-down") + '</button><span class="toolbar-space"></span>'+ button("layer:grid","Toggle floor grid","grid-3x3") + button("inspector","Toggle sidebar (N)","adjustments-horizontal","active") + '<span class="view-modes">' + button("mode:points","Point cloud (3)","grid-dots") + button("mode:topology","Topology (2)","sphere") + button("mode:surface","Surface (1)","circle-dot","active") + '</span>';
  document.getElementById("tool-rail").innerHTML = [["select","Select Box","select"],["cursor","3D Cursor","crosshair"],["move","Move","arrows-move"],["rotate","Rotate","rotate-3d"],["scale","Scale","resize"],["transform","Transform","box-model"],["annotate","Annotate","pencil"],["measure","Measure","ruler"]].map(([id,label,glyph])=>button("tool:"+id,label,glyph,id==="select"?"active":"")).join("");
  document.getElementById("camera-controls").innerHTML = gizmo() + '<div class="orbit-tools">' + button("zoom-in","Zoom in","zoom-in")+button("zoom-out","Zoom out","zoom-out")+button("camera-home","Reset view","focus-2")+button("layer:grid","Floor grid","grid-3x3")+'</div>';
  document.getElementById("viewport-inspector").innerHTML = inspector(state);
  document.getElementById("outliner-toolbar").innerHTML = editorMenu("Outliner","hierarchy") + '<span class="editor-caption">Scene Collection</span><span class="toolbar-space"></span>'+button("menu:Filter","Outliner filter","adjustments-horizontal");
  document.getElementById("scene-tree").innerHTML = rows(state);
  document.getElementById("properties-toolbar").innerHTML = editorMenu("Properties","adjustments-horizontal") + '<span class="editor-caption">'+icon("camera-cog")+'Properties</span><span class="toolbar-space"></span>'+button("menu:Properties","Property tabs","chevron-down");
  document.getElementById("property-rail").innerHTML = [["render","camera-cog","Render properties"],["camera","camera","Camera properties"],["object","box","Object properties"],["material","color-filter","Material properties"]].map(([a,g,t])=>button("prop:"+a,t,g,a==="render"?"active":"")).join("");
  document.getElementById("properties-content").innerHTML = properties("render",state);
  fillIcons();
}

