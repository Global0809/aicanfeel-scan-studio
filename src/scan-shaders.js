import * as THREE from "three";
import { ORBIT_SECONDS } from "./sequence.js";
import { makeCalibrationChart } from "./subject/calibration.js";

// All passes repeat exactly once per turntable revolution. Each raw field is measured in model space.
export const REVOLUTION_SECONDS = ORBIT_SECONDS;
export function createScanClock() {
  return {
    uScanCycle: { value: 0 },
    uScanPower: { value: 0.62 },
    uScanEntry: { value: 1 },
  };
}

export const scanFields = /* glsl */ `
uniform float uScanCycle, uScanPower, uScanEntry;
const float scanTau = 6.28318530718;
float inkBand(float phase, float width) {
  float distanceToLine = abs(fract(phase + 0.5) - 0.5);
  return 1.0 - smoothstep(width * 0.28, width, distanceToLine);
}
vec3 sectionFields(vec3 p) {
  // Three independent projected families. The cylindrical field bends around the head.
  float latitude = p.y + p.x * 0.17 + p.z * 0.12;
  float meridian = p.x * 0.79 + p.z * 0.62 - p.y * 0.24;
  float ring = length(vec2(p.x * 0.78, (p.y - 0.34) * 0.86)) + p.z * 0.32;
  return vec3(
    inkBand(latitude * 5.4 - uScanCycle * 5.0, 0.076),
    inkBand(meridian * 4.7 + uScanCycle * 3.0, 0.060),
    inkBand(ring * 7.3 - uScanCycle * 4.0, 0.064)
  );
}
vec2 crossingProjectors(vec3 p) {
  // Paired vertical sheets cross the body from different azimuths in under one second.
  vec2 coordinate=vec2(dot(p,vec3(0.83,-0.15,0.56)),dot(p,vec3(-0.58,0.20,0.82)));
  vec2 d=abs(fract(coordinate*vec2(0.69,0.83)+uScanCycle*vec2(-8.0,5.0)+0.5)-0.5);
  vec2 core=1.0-smoothstep(vec2(0.004),vec2(0.022),d);
  vec2 penumbra=1.0-smoothstep(vec2(0.012),vec2(0.080),d);
  return core+0.24*penumbra;
}
float entryFront(vec3 pos) {
  float travel = mix(-1.60, 1.60, uScanEntry);
  return (1.0 - smoothstep(0.012, 0.085, abs(pos.y + pos.x * 0.24 - travel)))
    * smoothstep(0.0, 0.085, uScanEntry) * (1.0 - smoothstep(0.91, 1.0, uScanEntry));
}
float stripReflection(vec3 reflected,vec3 centre,float width,float height) {
  vec3 normal=normalize(centre);
  vec3 across=normalize(cross(vec3(0.,1.,0.),normal));
  vec3 along=cross(normal,across);
  float facing=dot(reflected,normal);
  vec2 uv=vec2(dot(reflected,across),dot(reflected,along))/max(.12,facing);
  float border=max(abs(uv.x)-width,abs(uv.y)-height);
  return (1.-smoothstep(0.,.075,border))*smoothstep(.10,.25,facing);
}
`;

const scanTransfer = /* glsl */ `
varying vec3 scanPosition;
varying vec3 scanNormal;
varying vec2 scanUv;
`;

const surfaceLooks = {
  surface: /* glsl */ `
    float flesh=faceWeight*smoothstep(-.47,-.18,p.y);
    float rim=pow(1.0-max(0.0,dot(n,normalize(cameraPosition-p))),3.8);
    outgoingLight*=mix(vec3(1.),vec3(1.055,.97,.93),flesh);
    outgoingLight+=vec3(.040,.071,.069)*rim*(.4+.6*faceWeight);
    float survey = fields.x * (0.30 + 0.70 * fields.y) + fields.z * 0.22;
    outgoingLight += power * survey * vec3(0.020, 0.075, 0.073);
  `,
  returns: /* glsl */ `
    // The measured, registered colour plate closes gaps in sparse facial returns.
    float facial=exp(-pow((p.y-.30)/.55,4.0))*smoothstep(.04,.31,p.z)*(1.0-smoothstep(.25,.55,abs(p.x)));
    float bands=.5+.5*cos(scanTau*(p.y*2.0+p.x*.26-uScanCycle*2.0));
    vec3 charcoal=mix(vec3(.008,.016,.021),outgoingLight*.39,.64);
    outgoingLight=mix(charcoal,outgoingLight*vec3(.98,.90,.86),.13+.80*facial);
    outgoingLight+=vec3(.012,.081,.090)*fields.x*(.2+.8*bands)*power;
  `,
  capture: /* glsl */ `
    // Original camera colour sits under three traveling structured-light projections.
    float window = pow(0.5 + 0.5*cos(scanTau * (p.y*0.77 + p.x*0.12 - uScanCycle*2.0)), 2.0);
    vec2 lattice = vec2(p.x + p.z*0.45, p.y - p.z*0.19) * vec2(28.0, 34.0);
    vec2 dots = fract(lattice + 0.5) - 0.5;
    float contacts = 1.0-smoothstep(0.050, 0.15, length(dots));
    vec2 crossing=crossingProjectors(p);
    outgoingLight = outgoingLight * (0.97 - 0.12 * window * power)
      + power * (vec3(0.22,0.41,0.69) * fields.x * (0.31 + 0.69*window)
      + vec3(0.68,0.23,0.055) * fields.y * (0.16 + 0.71*window)
      + vec3(0.24,0.40,0.51) * fields.z * 0.34 + vec3(0.67,0.80,0.98)*contacts*window*0.56
      + vec3(0.45,0.75,1.0)*crossing.x*0.92 + vec3(0.78,0.40,0.16)*crossing.y*0.58);
  `,
  uv: /* glsl */ `
    vec3 chart=texture2D(calibrationChart,scanUv*uvFrequency).rgb;
    float enamel=.41+.78*keyLight;
    float cutoff=p.x + .19*p.y + .07*sin(scanTau*uScanCycle);
    float chroma=smoothstep(-.17,.08,cutoff);
    float faceFront=faceWeight*smoothstep(-.03,.24,p.z);
    float applied=mix(.99,mix(.13,.98,chroma),faceFront);
    outgoingLight=mix(outgoingLight*.88,chart*enamel*1.65,applied);
    float slice=1.-smoothstep(.004,.018,abs(cutoff+.045));
    outgoingLight+=vec3(.84,.42,.100)*slice*faceFront
      +vec3(.08,.21,.18)*fields.x*power*applied;
  `,
  alloy: /* glsl */ `
    float facing = clamp(dot(n, normalize(cameraPosition-p)),0.0,1.0);
    float treatment=smoothstep(-.46,.56,(-p.x*.43+n.x*.81+n.y*.16)-.15);
    float temper=smoothstep(.17,.94,.50+.5*sin(p.y*3.2+p.z*2.1+.88*n.x+(1.-facing)*2.));
    vec3 cold=mix(vec3(.052,.27,.31),vec3(.23,.081,.37),temper*.86);
    vec3 oxide=mix(cold,vec3(.91,.49,.19),treatment);
    float brushing=dot(p,vec3(.41,1.0,.23))*315.0+sin(p.z*17.0+p.x*13.0)*.19;
    float grain=cos(scanTau*brushing)*(1.-smoothstep(.14,.60,fwidth(brushing)));
    vec3 reflected=reflect(-normalize(cameraPosition-p),n);
    float booth=stripReflection(reflected,vec3(-.79,.28,.64),.046,.74);
    float reverse=stripReflection(reflected,vec3(.85,.22,-.48),.090,.60);
    outgoingLight=outgoingLight/(1.+.42*outgoingLight);
    outgoingLight*=vec3(.13)+oxide*(1.48+.12*grain);
    outgoingLight+=oxide*(.060+.13*pow(1.-facing,2.6)) + booth*vec3(.50,.44,.30) + reverse*vec3(.12,.41,.48);
    outgoingLight+=power*(vec3(.30,.61,.63)*fields.x*.20 + vec3(.52,.29,.12)*fields.z*.13);
  `,
  motion: /* glsl */ `
    float angularRadius = length(p.xz);
    vec2 tangent = vec2(p.z,-p.x) / max(angularRadius,0.01);
    float direction = dot(tangent, normalize(vec2(0.63,0.79)));
    float phaseField = p.y*4.4 + p.z*1.6 + p.x*0.62 + n.x*0.38;
    float contour = inkBand(phaseField - uScanCycle*4.0,0.10);
    float secondary = inkBand(phaseField*2.0 - uScanCycle*8.0 + 0.23,0.075);
    float dash = smoothstep(-0.54,0.20,cos(scanTau*(p.x*3.4-p.z*2.9+uScanCycle*3.0)));
    vec3 warm = vec3(1.0,0.32,0.065), cool = vec3(0.22,0.49,1.0);
    vec3 flow = mix(cool,warm,smoothstep(-0.38,0.38,direction));
    float photo = clamp(dot(diffuseColor.rgb,vec3(0.25,0.63,0.12))*1.55,0.0,1.0);
    float facing = clamp(dot(n,normalize(cameraPosition-p)),0.0,1.0);
    vec3 shaded=outgoingLight;
    outgoingLight=mix(vec3(.008,.019,.026),vec3(.052,.085,.107),keyLight)
      * (.65+photo*.65) + flow*pow(1.-facing,3.5)*.18;
    outgoingLight=mix(outgoingLight,shaded*vec3(.81,.86,.94),faceWeight*.82);
    outgoingLight+=power*(flow*(contour*.16+secondary*dash*.065)+vec3(.13,.27,.33)*fields.y*.10);
  `,
  topology: /* glsl */ `
    float facets = 0.5+0.5*dot(n,normalize(vec3(-0.52,0.69,0.51)));
    outgoingLight = mix(vec3(.004,.011,.022),vec3(.038,.076,.091),facets*facets);
    outgoingLight += power*(vec3(.06,.26,.23)*fields.x*.36 + vec3(.36,.22,.08)*fields.y*.23);
  `,
  clay: /* glsl */ `
    float sculpt=.15+.93*max(0.,dot(n,normalize(vec3(-.57,.57,.69))));
    float grazing=clamp(dot(n,normalize(cameraPosition-p)),0.,1.);
    float rake=pow(max(0.,dot(n,normalize(vec3(.72,.45,-.46)))),2.5);
    float slip=.97+.03*sin(p.y*490.+p.z*38.)*(1.-smoothstep(.1,.7,fwidth(p.y*490.)));
    outgoingLight=vec3(.44,.154,.071)*sculpt*mix(.76,1.,grazing)*slip + vec3(.19,.094,.047)*rake;
    outgoingLight+=vec3(.083,.051,.039)*pow(1.-grazing,2.4);
  `,
};

// Augment the renderer's standard material, retaining its normal lighting, colour management and depth.
export function installScanLook(material, look, clock, { frequency=[1,1], face=false, chart=null }={}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms,clock);
    shader.uniforms.uvFrequency={value:new THREE.Vector2(...frequency)};
    shader.uniforms.faceWeight={value:face?1:0};
    if(chart)shader.uniforms.calibrationChart={value:chart};
    shader.vertexShader=shader.vertexShader.replace("#include <common>", "#include <common>\n"+scanTransfer)
      .replace("#include <project_vertex>", `
        scanPosition = (modelMatrix * vec4(transformed,1.0)).xyz;
        scanNormal = normalize(mat3(modelMatrix) * normal);
        scanUv = uv;
        #include <project_vertex>`);
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>", "#include <common>\n"+scanTransfer+scanFields+
      "\nuniform vec2 uvFrequency; uniform float faceWeight;\n"+(look==="uv"?"uniform sampler2D calibrationChart;\n":""))
      .replace("#include <opaque_fragment>", `
        vec3 p = scanPosition;
        vec3 n = normalize(scanNormal);
        vec3 fields = sectionFields(p);
        float power = uScanPower;
        float keyLight = 0.20 + 0.80*max(0.0,dot(n,normalize(vec3(-0.42,0.67,0.61))));
        ${surfaceLooks[look]}
        outgoingLight += vec3(0.27,0.52,0.46)*entryFront(p)*power;
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>"performer-inspection-"+look;
  return material;
}

export function makeInspectionMaterials(subject,environment,clock) {
  const originals=subject.originalMaterials;
  const altered=new Map();
  const owned=new Set();
  const chart=makeCalibrationChart();
  const alloy=installScanLook(new THREE.MeshPhysicalMaterial({
    color:0xd7d4cc,metalness:.94,roughness:.32,envMap:environment,envMapIntensity:1.33,
    iridescence:.36,iridescenceIOR:1.42,iridescenceThicknessMinimum:130,iridescenceThicknessMaximum:340,
    anisotropy:.71,anisotropyRotation:.43,clearcoat:.24,clearcoatRoughness:.30,
  }),"alloy",clock);
  const topology=installScanLook(new THREE.MeshStandardMaterial({
    color:0x74867e,roughness:.85,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,
  }),"topology",clock);
  const clay=installScanLook(new THREE.MeshStandardMaterial({color:0xd6b59e,roughness:.91}),"clay",clock);
  owned.add(alloy);owned.add(topology);owned.add(clay);
  for(const [mesh,original] of originals) {
    if(/eye/i.test(mesh.name)){altered.set(mesh,{clay});continue;}
    if (/eyes|cornea|brow|fiber|veil|hairline|underside/i.test(mesh.name)) continue;
    const face=mesh.name==="Face";
    const frequency=face?[6,6]:mesh.name==="Locs"?[.53,2.0]:mesh.name==="Collar"?[3.4,.7]:[5.0,4.2];
    const materials={alloy,topology,clay};
    for(const look of ["uv","motion"]) {
      const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.68,map:face?original.map:null});
      materials[look]=installScanLook(mat,look,clock,{frequency,face,chart:look==="uv"?chart:null});owned.add(mat);
    }
    if(face){
      original.roughness=.73;
      // Pigmentation captured in the photographed skin gently breaks up broad specular highlights.
      original.bumpMap=original.map;original.bumpScale=.0016;
    }
    installScanLook(original,"surface",clock,{face});
    altered.set(mesh,materials);
  }
  return {
    for(mesh,look){return altered.get(mesh)?.[look];},
    dispose(){chart.dispose();for(const material of owned)material.dispose();},
  };
}

// A geometric edge is a UV seam when its neighbouring triangles agree in 3D and differ in UV.
// Restrict the expensive candidate comparison to chart boundaries of the face and the garment.
function uvSeamPositions(meshes) {
  const positions=[];
  const vertex=new THREE.Vector3(),normal=new THREE.Vector3();
  for(const mesh of meshes) {
    if (!["Face","Crewneck","Collar"].includes(mesh.name)) continue;
    const {position,normal:orientation,uv}=mesh.geometry.attributes;
    const indices=mesh.geometry.index;
    if(!indices||!uv)continue;
    const boundary=new Set(), matched=new Map(), stride=position.count;
    function edge(a,b) {
      const key=Math.min(a,b)*stride+Math.max(a,b);
      if(boundary.has(key))boundary.delete(key);else boundary.add(key);
    }
    for(let i=0;i<indices.count;i+=3) {
      const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
      edge(a,b);edge(b,c);edge(c,a);
    }
    const positionKey=i=>[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Math.round(v*30000)).join(",");
    for(const key of boundary) {
      let a=Math.floor(key/stride), b=key%stride;
      let ga=positionKey(a),gb=positionKey(b);
      if(ga===gb)continue;
      if(ga>gb){[ga,gb]=[gb,ga];[a,b]=[b,a];}
      const pair=ga+"|"+gb,other=matched.get(pair);
      if(!other){matched.set(pair,[a,b]);continue;}
      const different=(i,j)=>Math.abs(uv.getX(i)-uv.getX(j))+Math.abs(uv.getY(i)-uv.getY(j))>.001;
      if(!different(a,other[0])&&!different(b,other[1]))continue;
      for(const i of [a,b]) {
        vertex.fromBufferAttribute(position,i);
        if(orientation)vertex.addScaledVector(normal.fromBufferAttribute(orientation,i).normalize(),.0017);
        vertex.applyMatrix4(mesh.matrixWorld);
        positions.push(vertex.x,vertex.y,vertex.z);
      }
    }
  }
  return positions;
}

export function makeScanAnnotations(subject,clock) {
  const group=new THREE.Group();
  group.name="UV chart seams";
  const seams=new THREE.BufferGeometry();
  seams.setAttribute("position",new THREE.Float32BufferAttribute(uvSeamPositions(subject.originalMaterials.keys()),3));
  const seamInk=new THREE.LineBasicMaterial({color:0xffaf64,transparent:true,opacity:.88,depthWrite:false});
  const seamLines=new THREE.LineSegments(seams,seamInk);
  seamLines.renderOrder=3;group.add(seamLines);

  const cage=subject.group.getObjectByName("Retopology cage");
  const cageInk=cage.material;
  cageInk.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,clock);
    shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 cagePosition;")
      .replace("#include <project_vertex>","cagePosition=(modelMatrix*vec4(transformed,1.0)).xyz;\n#include <project_vertex>");
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nvarying vec3 cagePosition;\n"+scanFields)
      .replace("#include <opaque_fragment>",`
        vec2 front=crossingProjectors(cagePosition);
        vec3 sampling=sectionFields(cagePosition);
        vec2 eye=(vec2(abs(cagePosition.x)-.165,cagePosition.y-.397))/vec2(.14,.077);
        vec2 mouth=(cagePosition.xy-vec2(0.0,.028))/vec2(.158,.063);
        float feature=max(1.-smoothstep(.06,.50,abs(length(eye)-1.)),1.-smoothstep(.06,.50,abs(length(mouth)-1.)));
        feature*=smoothstep(.20,.39,cagePosition.z);
        float frontal=smoothstep(-.18,.46,cagePosition.z);
        outgoingLight=mix(vec3(.17,.37,.44),vec3(.52,.79,.75),frontal);
        outgoingLight=mix(outgoingLight,vec3(.95,.58,.25),feature*(.31+.37*front.y));
        outgoingLight+=uScanPower*(vec3(.23,.80,.68)*sampling.x + vec3(1.,.41,.08)*front.x);
        #include <opaque_fragment>`);
  };
  cageInk.customProgramCacheKey=()=>"measured-cage-projection";
  group.visible=false;
  return {
    group,
    seamEdges:seams.attributes.position.count/2,
    update(mode,state) {
      seamLines.visible=mode==="uv"&&state.landmarks&&!state.hidden.has("head");
      group.visible=state.surface&&seamLines.visible;
    },
    dispose(){
      group.removeFromParent();seams.dispose();seamInk.dispose();
    },
  };
}
