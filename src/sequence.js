export const TAU = 2 * Math.PI;
export const PASS_SECONDS = 2;
export const ORBIT_SECONDS = 3.8 / 0.6;
export const WIPE_SECONDS = 0.31;
export const ATLAS_PASSES = ["points", "uv", "alloy", "motion", "topology", "capture", "surface", "clay"];

export const LOOKS = {
  points:   { title:"Point cloud",             workspace:"Compositing", mode:"points",   color:"#8fdbc9" },
  uv:       { title:"UV calibration",          workspace:"UV Editing",  mode:"surface",  color:"#8be3d9" },
  alloy:    { title:"Brushed titanium",        workspace:"Shading",     mode:"surface",  color:"#d7b2ef" },
  motion:   { title:"Motion field",            workspace:"Animation",   mode:"surface",  color:"#f3ba83" },
  topology: { title:"Retopology",              workspace:"Modeling",    mode:"topology", color:"#8edabf" },
  capture:  { title:"Reconstructed surface",   workspace:"Layout",      mode:"surface",  color:"#adc6e5" },
  surface:  { title:"Textured surface",        workspace:"Sculpting",   mode:"surface",  color:"#e0cca9" },
  clay:     { title:"Sculpt inspection",       workspace:"Sculpting",   mode:"topology", color:"#d2c6b4" },
};

// Nineteen equal exposures close on precisely six rotations of the subject.
export const PASSES = [
  "points", "uv", "alloy", "motion", "topology", "capture",
  "uv", "topology", "points", "alloy", "capture", "motion",
  "topology", "uv", "motion", "alloy", "points", "capture", "surface",
];
export const LOOP_SECONDS = PASS_SECONDS * PASSES.length;
export const wrap = (value, length) => value - Math.floor(value / length) * length;
export const orbitAngle = time => wrap(time, ORBIT_SECONDS) * TAU / ORBIT_SECONDS - 0.23;
export const orbitPitch = time => Math.sin(wrap(time, ORBIT_SECONDS) * TAU / ORBIT_SECONDS) * .025;
export const phaseIndex = time => Math.floor(wrap(time, LOOP_SECONDS) / PASS_SECONDS);
export const phaseAt = time => PASSES[phaseIndex(time)];
