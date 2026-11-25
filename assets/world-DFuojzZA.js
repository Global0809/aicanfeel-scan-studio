import{A as e,B as t,C as n,D as r,E as i,F as a,H as o,I as s,L as c,M as l,N as u,P as d,R as f,S as p,T as m,U as h,V as g,_,a as v,b as y,c as b,d as x,f as S,g as C,h as w,i as T,j as E,k as D,l as O,m as k,n as A,p as j,s as M,t as N,u as P,v as F,x as I,y as L,z as R}from"./three-D08llWCp.js";import{h as z,o as B}from"./preload-helper-l1BIi2QN.js";var V=`./subject/`,H=new Set([`surface`,`topology`,`points`]),U=new Set([`Brows`,`Hair_fibers`,`Hair_curl_veil`]),W={Face:3400,Eyes:1800};function G(e){return()=>(e=Math.imul(e,1664525)+1013904223|0,(e>>>0)/4294967296)}function K(e){let t=G(72913),n=[],r=[],i=new o,a=new o,s=new o,c=new o,l=new o,f=new o;for(let o of e){let e=o.geometry.index,u=o.geometry.getAttribute(`position`);if(!e||[`Brows`,`Hairline`,`Hair_fibers`,`Hair_curl_veil`,`Underside`].includes(o.name))continue;let d=e.count/3,p=W[o.name]??1200;for(let m=0;m<d;m++){i.fromBufferAttribute(u,e.getX(m*3)).applyMatrix4(o.matrixWorld),a.fromBufferAttribute(u,e.getX(m*3+1)).applyMatrix4(o.matrixWorld),s.fromBufferAttribute(u,e.getX(m*3+2)).applyMatrix4(o.matrixWorld),c.subVectors(a,i),l.subVectors(s,i),f.crossVectors(c,l);let d=f.length()*.5*p;f.normalize();let h=Math.floor(d+t());for(let e=0;e<h;e++){let e=Math.sqrt(t()),o=t(),c=1-e,l=e*(1-o),u=e*o;n.push(i.x*c+a.x*l+s.x*u+f.x*9e-4,i.y*c+a.y*l+s.y*u+f.y*9e-4,i.z*c+a.z*l+s.z*u+f.z*9e-4);let d=.4+t()*.47,p=t()>.96;r.push(d*(p?1:.46),d*(p?.62:.97),d*(p?.3:.88))}}}let p=new O;p.setAttribute(`position`,new C(n,3)),p.setAttribute(`color`,new C(r,3));let m=new d({vertexColors:!0,size:.007,sizeAttenuation:!0,depthWrite:!1}),h=new u(p,m);return h.name=`Surface samples`,h.renderOrder=3,h}async function ee({generateSamples:t=!0}={}){let[i,a]=await Promise.all([new A().setMeshoptDecoder(h).loadAsync(`${V}performer.glb`),fetch(`${V}cage.bin`)]);if(!a.ok)throw Error(`Scan cage could not load (${a.status}).`);let o=new Int16Array(await a.arrayBuffer()),s=new O;s.setAttribute(`position`,new C(Float32Array.from(o,e=>e/16e3),3));let c=new p({color:10989736,transparent:!0,opacity:.6,depthWrite:!1}),l=new n(s,c);l.name=`Retopology cage`,l.renderOrder=2;let f=new L;f.name=`Digital performer`,f.add(i.scene,l);let m=[],g=[],_=new S(13076816),v=new S(8829100),y=new S(11910330);for(let e=0,t=0;e+2<o.length;e+=57,t++){let n=o[e]/16e3,r=o[e+1]/16e3,i=o[e+2]/16e3;if(Math.abs(n)<.36&&r>-.33&&r<.77&&i>.29&&t%7!=0)continue;m.push(n,r,i);let a=t%29==0?_:t%3==0?y:v;g.push(a.r,a.g,a.b)}let b=new O;b.setAttribute(`position`,new C(m,3)),b.setAttribute(`color`,new C(g,3));let x=new d({size:.005,vertexColors:!0,transparent:!0,opacity:.56,depthWrite:!1}),w=new u(b,x);w.name=`Scanner returns`,w.renderOrder=3,f.add(w);let T=[],E=new Map,D=0,k=0;i.scene.traverse(e=>{e.isMesh&&(T.push(e),E.set(e,e.material),D+=e.geometry.attributes.position.count,k+=(e.geometry.index?.count??e.geometry.attributes.position.count)/3)}),i.scene.updateMatrixWorld(!0);let j=K(t?T:[]);f.add(j);let N=new e({color:4674126,roughness:.88,metalness:.05,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:1}),P=new r({color:1383451,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:2}),F=new r({visible:!1}),I=``;function R(e,t=!1){if(H.has(e)&&(t||e!==I)){I=e,l.visible=e===`topology`,j.visible=e===`points`,w.visible=e===`surface`;for(let t of T)t.visible=e===`surface`||!U.has(t.name),t.material=e===`surface`?E.get(t):U.has(t.name)?F:e===`topology`?N:P}}R(`surface`);function z(){let e=new Set([j.geometry,b,s,...T.map(e=>e.geometry)]),t=new Set([N,P,x,F,c,j.material,...E.values()]),n=new Set;for(let e of t){for(let t of Object.values(e))t?.isTexture&&n.add(t);e.dispose()}for(let t of e)t.dispose();for(let e of n)e.source?.data?.close?.(),e.dispose();f.removeFromParent()}return{group:f,originalMaterials:E,setMode:R,dispose:z,stats:{vertices:D,triangles:k,points:j.geometry.attributes.position.count,edges:o.length/6,bounds:new M().setFromObject(i.scene),parts:T.map(e=>({name:e.name,triangles:(e.geometry.index?.count??e.geometry.attributes.position.count)/3}))}}}function q(){let e=document.createElement(`canvas`);e.width=e.height=1024;let t=e.getContext(`2d`),n=[`#294756`,`#33535e`,`#38545b`,`#3e5353`,`#354762`,`#3b5167`,`#354e66`,`#3e5463`,`#2d4753`,`#305159`,`#3c5454`,`#455b52`,`#354451`,`#3c4b55`,`#3d535c`,`#46565c`];for(let e=0;e<4;e++)for(let r=0;r<4;r++){let i=e*4+r,a=r*256,o=e*256,s=(r+e)%4==0?`#efb466`:(r+e)%3==0?`#90b9d5`:`#99cfbe`;t.save(),t.translate(a,o),t.fillStyle=n[i],t.fillRect(0,0,256,256);for(let e=0;e<8;e++)for(let n=0;n<8;n++)(e+n)%2==0&&(t.fillStyle=`rgba(202,228,221,.085)`,t.fillRect(e*32,n*32,32,32));t.strokeStyle=`rgba(190,218,214,.36)`,t.lineWidth=1.5,t.beginPath();for(let e=1;e<8;e++)t.moveTo(32*e,0),t.lineTo(32*e,256),t.moveTo(0,32*e),t.lineTo(256,32*e);t.stroke(),t.strokeStyle=s,t.lineWidth=4,t.strokeRect(2,2,252,252),t.fillStyle=s;for(let e=0;e<32;e++){let n=e%4==0?12:5;t.fillRect(e*8,0,2,n),t.fillRect(0,e*8,n,2)}let c=String.fromCharCode(65+e)+(r+1);t.font=`600 43px Consolas,monospace`,t.fillStyle=`#e2e9de`,t.fillText(c,20,58),t.font=`bold 15px Consolas,monospace`,t.fillStyle=s,t.fillText(`U `+String(r).padStart(2,`0`)+`  V `+String(e).padStart(2,`0`),18,235),t.lineWidth=3,t.strokeStyle=`#c0d3ca`,t.beginPath(),t.arc(128,128,22,0,Math.PI*2),t.moveTo(96,128),t.lineTo(117,128),t.moveTo(139,128),t.lineTo(160,128),t.moveTo(128,96),t.lineTo(128,117),t.moveTo(128,139),t.lineTo(128,160),t.stroke(),t.fillStyle=s,t.beginPath(),t.moveTo(224,28),t.lineTo(239,49),t.lineTo(208,49),t.closePath(),t.fill(),t.restore()}let r=new P(e);return r.name=`Numbered UV calibration chart`,r.colorSpace=c,r.wrapS=r.wrapT=a,r.anisotropy=4,r}var J=B;function Y(){return{uScanCycle:{value:0},uScanPower:{value:.62},uScanEntry:{value:1}}}var X=`
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
`,te=`
varying vec3 scanPosition;
varying vec3 scanNormal;
varying vec2 scanUv;
`,ne={surface:`
    float flesh=faceWeight*smoothstep(-.47,-.18,p.y);
    float rim=pow(1.0-max(0.0,dot(n,normalize(cameraPosition-p))),3.8);
    outgoingLight*=mix(vec3(1.),vec3(1.055,.97,.93),flesh);
    outgoingLight+=vec3(.040,.071,.069)*rim*(.4+.6*faceWeight);
    float survey = fields.x * (0.30 + 0.70 * fields.y) + fields.z * 0.22;
    outgoingLight += power * survey * vec3(0.020, 0.075, 0.073);
  `,returns:`
    // The measured, registered colour plate closes gaps in sparse facial returns.
    float facial=exp(-pow((p.y-.30)/.55,4.0))*smoothstep(.04,.31,p.z)*(1.0-smoothstep(.25,.55,abs(p.x)));
    float bands=.5+.5*cos(scanTau*(p.y*2.0+p.x*.26-uScanCycle*2.0));
    vec3 charcoal=mix(vec3(.008,.016,.021),outgoingLight*.39,.64);
    outgoingLight=mix(charcoal,outgoingLight*vec3(.98,.90,.86),.13+.80*facial);
    outgoingLight+=vec3(.012,.081,.090)*fields.x*(.2+.8*bands)*power;
  `,capture:`
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
  `,uv:`
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
  `,alloy:`
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
  `,motion:`
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
  `,topology:`
    float facets = 0.5+0.5*dot(n,normalize(vec3(-0.52,0.69,0.51)));
    outgoingLight = mix(vec3(.004,.011,.022),vec3(.038,.076,.091),facets*facets);
    outgoingLight += power*(vec3(.06,.26,.23)*fields.x*.36 + vec3(.36,.22,.08)*fields.y*.23);
  `,clay:`
    float sculpt=.15+.93*max(0.,dot(n,normalize(vec3(-.57,.57,.69))));
    float grazing=clamp(dot(n,normalize(cameraPosition-p)),0.,1.);
    float rake=pow(max(0.,dot(n,normalize(vec3(.72,.45,-.46)))),2.5);
    float slip=.97+.03*sin(p.y*490.+p.z*38.)*(1.-smoothstep(.1,.7,fwidth(p.y*490.)));
    outgoingLight=vec3(.44,.154,.071)*sculpt*mix(.76,1.,grazing)*slip + vec3(.19,.094,.047)*rake;
    outgoingLight+=vec3(.083,.051,.039)*pow(1.-grazing,2.4);
  `};function Z(e,t,n,{frequency:r=[1,1],face:i=!1,chart:a=null}={}){return e.onBeforeCompile=e=>{Object.assign(e.uniforms,n),e.uniforms.uvFrequency={value:new g(...r)},e.uniforms.faceWeight={value:+!!i},a&&(e.uniforms.calibrationChart={value:a}),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
`+te).replace(`#include <project_vertex>`,`
        scanPosition = (modelMatrix * vec4(transformed,1.0)).xyz;
        scanNormal = normalize(mat3(modelMatrix) * normal);
        scanUv = uv;
        #include <project_vertex>`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
`+te+X+`
uniform vec2 uvFrequency; uniform float faceWeight;
`+(t===`uv`?`uniform sampler2D calibrationChart;
`:``)).replace(`#include <opaque_fragment>`,`
        vec3 p = scanPosition;
        vec3 n = normalize(scanNormal);
        vec3 fields = sectionFields(p);
        float power = uScanPower;
        float keyLight = 0.20 + 0.80*max(0.0,dot(n,normalize(vec3(-0.42,0.67,0.61))));
        ${ne[t]}
        outgoingLight += vec3(0.27,0.52,0.46)*entryFront(p)*power;
        #include <opaque_fragment>`)},e.customProgramCacheKey=()=>`performer-inspection-`+t,e}function re(t,n,r){let i=t.originalMaterials,a=new Map,o=new Set,s=q(),c=Z(new D({color:14144716,metalness:.94,roughness:.32,envMap:n,envMapIntensity:1.33,iridescence:.36,iridescenceIOR:1.42,iridescenceThicknessMinimum:130,iridescenceThicknessMaximum:340,anisotropy:.71,anisotropyRotation:.43,clearcoat:.24,clearcoatRoughness:.3}),`alloy`,r),l=Z(new e({color:7636606,roughness:.85,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:1}),`topology`,r),u=Z(new e({color:14071198,roughness:.91}),`clay`,r);o.add(c),o.add(l),o.add(u);for(let[t,n]of i){if(/eye/i.test(t.name)){a.set(t,{clay:u});continue}if(/eyes|cornea|brow|fiber|veil|hairline|underside/i.test(t.name))continue;let i=t.name===`Face`,d=i?[6,6]:t.name===`Locs`?[.53,2]:t.name===`Collar`?[3.4,.7]:[5,4.2],f={alloy:c,topology:l,clay:u};for(let t of[`uv`,`motion`]){let a=new e({color:16777215,roughness:.68,map:i?n.map:null});f[t]=Z(a,t,r,{frequency:d,face:i,chart:t===`uv`?s:null}),o.add(a)}i&&(n.roughness=.73,n.bumpMap=n.map,n.bumpScale=.0016),Z(n,`surface`,r,{face:i}),a.set(t,f)}return{for(e,t){return a.get(e)?.[t]},dispose(){s.dispose();for(let e of o)e.dispose()}}}function ie(e){let t=[],n=new o,r=new o;for(let i of e){if(![`Face`,`Crewneck`,`Collar`].includes(i.name))continue;let{position:e,normal:a,uv:o}=i.geometry.attributes,s=i.geometry.index;if(!s||!o)continue;let c=new Set,l=new Map,u=e.count;function d(e,t){let n=Math.min(e,t)*u+Math.max(e,t);c.has(n)?c.delete(n):c.add(n)}for(let e=0;e<s.count;e+=3){let t=s.getX(e),n=s.getX(e+1),r=s.getX(e+2);d(t,n),d(n,r),d(r,t)}let f=t=>[e.getX(t),e.getY(t),e.getZ(t)].map(e=>Math.round(e*3e4)).join(`,`);for(let s of c){let c=Math.floor(s/u),d=s%u,p=f(c),m=f(d);if(p===m)continue;p>m&&([p,m]=[m,p],[c,d]=[d,c]);let h=p+`|`+m,g=l.get(h);if(!g){l.set(h,[c,d]);continue}let _=(e,t)=>Math.abs(o.getX(e)-o.getX(t))+Math.abs(o.getY(e)-o.getY(t))>.001;if(_(c,g[0])||_(d,g[1]))for(let o of[c,d])n.fromBufferAttribute(e,o),a&&n.addScaledVector(r.fromBufferAttribute(a,o).normalize(),.0017),n.applyMatrix4(i.matrixWorld),t.push(n.x,n.y,n.z)}}return t}function ae(e,t){let r=new L;r.name=`UV chart seams`;let i=new O;i.setAttribute(`position`,new C(ie(e.originalMaterials.keys()),3));let a=new p({color:16756580,transparent:!0,opacity:.88,depthWrite:!1}),o=new n(i,a);o.renderOrder=3,r.add(o);let s=e.group.getObjectByName(`Retopology cage`).material;return s.onBeforeCompile=e=>{Object.assign(e.uniforms,t),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 cagePosition;`).replace(`#include <project_vertex>`,`cagePosition=(modelMatrix*vec4(transformed,1.0)).xyz;
#include <project_vertex>`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 cagePosition;
`+X).replace(`#include <opaque_fragment>`,`
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
        #include <opaque_fragment>`)},s.customProgramCacheKey=()=>`measured-cage-projection`,r.visible=!1,{group:r,seamEdges:i.attributes.position.count/2,update(e,t){o.visible=e===`uv`&&t.landmarks&&!t.hidden.has(`head`),r.visible=t.surface&&o.visible},dispose(){r.removeFromParent(),i.dispose(),a.dispose()}}}async function oe(e=Y()){let t=new A,[n,i,a]=await Promise.all([new N().loadAsync(z(`subject/optical-cloud.ply`)),t.loadAsync(z(`subject/optical-cloud.occluder.glb`)),t.loadAsync(z(`subject/optical-cloud.surface.glb`))]),o={...e,focalPixels:{value:1600},radius:{value:.015},fraction:{value:1},solid:{value:0}},s=new R({vertexColors:!0,uniforms:o,alphaToCoverage:!0,depthWrite:!0,transparent:!1,vertexShader:[`uniform float focalPixels, radius, fraction;`,X,`varying vec3 vColor, vFields; varying vec2 vCrossing; varying float vId, vEntry, vWindow;`,`void main(){`,`vec4 v = modelViewMatrix * vec4(position, 1.0);`,`vColor = color; vFields = sectionFields(position); vCrossing=crossingProjectors(position); vEntry = entryFront(position);`,`vWindow=pow(0.5+0.5*cos(scanTau*(position.y*.8 + position.x*.27 - uScanCycle*2.0)),2.0);`,`vId = fract(sin(dot(position,vec3(29.17,71.13,53.74)))*34567.81);`,`gl_Position=projectionMatrix*v;`,`float returnSize=0.83 + vId*0.38 + uScanPower*(0.15*vFields.x+0.34*step(0.965,vId)*vWindow + 0.22*vCrossing.x);`,`gl_PointSize=clamp(radius * focalPixels / max(0.1,-v.z) * returnSize,1.1,27.0);`,`if(vId>fraction)gl_Position=vec4(2.0,2.0,2.0,1.0);`,`}`].join(`
`),fragmentShader:`uniform float uScanPower, solid; varying vec3 vColor, vFields; varying vec2 vCrossing; varying float vId, vEntry, vWindow;
void main(){
vec2 p=gl_PointCoord*2.0-1.0; float d=dot(p,p); if(d>1.0) discard;
vec3 base=vColor*(0.73+0.18*(1.0-d));
float selected=step(0.975,vId)*vWindow;
vec3 projection=vec3(.15,.82,.67)*vFields.x*(.47+.53*vWindow)
  +vec3(.80,.36,.105)*vFields.y*.69 + vec3(.21,.44,.76)*vFields.z*.49
  +vec3(.44,1.0,.79)*vCrossing.x*.92 + vec3(.96,.53,.17)*vCrossing.y*.64;
vec3 rgb=base + uScanPower*(projection*.77 + vec3(.51,.77,.68)*selected + vec3(.37,.70,.64)*vEntry);
rgb=mix(rgb,base+projection*uScanPower*.68,solid*.48);
gl_FragColor=vec4(rgb,1.0-smoothstep(0.69,1.0,d));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`}),c=new u(n,s);c.name=`Optical point returns`,c.frustumCulled=!1;let l=new L;l.add(c,i.scene,a.scene),l.visible=!1;let d=new r({colorWrite:!1,depthWrite:!0,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:1});i.scene.traverse(e=>{e.isMesh&&(e.material.dispose(),e.material=d,e.renderOrder=-2)});let f=[];return a.scene.traverse(t=>{if(!t.isMesh)return;let n=t.material,i=Z(new r({map:n.map,color:16317176}),`capture`,e),a=Z(new r({map:n.map,color:16185075,polygonOffset:!0,polygonOffsetFactor:4,polygonOffsetUnits:6}),`returns`,e);t.material=i,f.push({obj:t,mat:i,plate:a}),n.dispose()}),{group:l,points:n.attributes.position.count,update(e,t,n,r,s=!1){o.focalPixels.value=n/(2*Math.tan(m.degToRad(t.fov)*.5)),o.fraction.value=.18+.82*r.density/100,o.radius.value=(s?.0029:.006)/Math.sqrt(o.fraction.value),o.uScanCycle.value=e/J,o.uScanPower.value=r.landmarks?r.intensity/100:0,o.solid.value=+!!s,c.visible=r.points,i.scene.visible=!s&&!r.surface,a.scene.visible=r.surface;for(let{obj:e,mat:t,plate:n}of f)e.renderOrder=-1,e.material=s?t:n},dispose(){n.dispose(),s.dispose(),d.dispose();for(let e of[i.scene,a.scene])e.traverse(e=>e.geometry?.dispose());for(let{mat:e,plate:t}of f)e.map?.dispose(),e.dispose(),t.dispose();l.removeFromParent()}}}function se(e){return()=>(e=Math.imul(e,1664525)+1013904223>>>0,e/4294967296)}function ce(e){let t=se(851),n=[],r=[];for(let e=0;e<1300;e++){let e=t()*Math.PI*2,i=1.2+t()**1.3*2.8,a=t()<.77;n.push(Math.cos(e)*i,a?-1.09+t()**2*.39:-.94+t()*2.12,Math.sin(e)*i),r.push(t())}let i=new O;i.setAttribute(`position`,new C(n,3)),i.setAttribute(`weight`,new C(r,1));let a=new R({transparent:!0,depthWrite:!1,blending:2,uniforms:{clock:{value:0},pixels:{value:1}},vertexShader:`attribute float weight;uniform float clock,pixels;varying float w;varying float vLife;
void main(){w=weight;vec3 p=position;
p.y+=.027*sin(clock*.91+weight*97.0);p.x+=.033*sin(clock*.43+weight*210.0);
vec4 v=modelViewMatrix*vec4(p,1);gl_Position=projectionMatrix*v;
gl_PointSize=clamp(pixels*(.8+weight*weight*2.6)*3.7/max(1.0,-v.z),.7,8.0);
vLife=.19+.42*pow(.5+.5*sin(clock*2.0+weight*156.0),4.0);}`,fragmentShader:`varying float w;varying float vLife;
void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
vec3 c=mix(vec3(.20,.38,.36),vec3(.55,.48,.19),smoothstep(.57,.72,w));
c=mix(c,vec3(.45,.42,.67),smoothstep(.82,.98,w));gl_FragColor=vec4(c,vLife*(1.-r*r));
#include <colorspace_fragment>
}`}),o=new u(i,a);return o.frustumCulled=!1,e.add(o),{update(e,t,n){o.visible=n,a.uniforms.clock.value=e,a.uniforms.pixels.value=t/853},dispose(){i.dispose(),a.dispose(),o.removeFromParent()}}}function le(e){let t=document.createElement(`canvas`);t.width=768,t.height=384;let n=t.getContext(`2d`);n.fillStyle=`#111719`,n.fillRect(0,0,t.width,t.height);function r(e,t,r,i,a){let o=n.createLinearGradient(e,t,e+r,t+i);for(let[e,t]of a)o.addColorStop(e,t);n.fillStyle=o,n.fillRect(e,t,r,i)}r(44,37,91,195,[[0,`#e6fff6`],[.27,`#c4dedc`],[1,`#2d7775`]]),r(200,28,20,180,[[0,`#b5f9ff`],[1,`#5368bb`]]),r(303,62,93,13,[[0,`#7e8cff`],[.4,`#fff7fa`],[1,`#bed1f6`]]),r(443,45,45,150,[[0,`#e4f4d6`],[1,`#bc96ba`]]),r(552,56,67,96,[[0,`#889bd7`],[.58,`#f8d8ef`],[1,`#9365ad`]]),r(620,110,104,18,[[0,`#8d6152`],[1,`#f3dab0`]]),r(0,262,768,27,[[0,`#182629`],[.5,`#28323b`],[1,`#1b2726`]]);let i=new P(t);i.mapping=303,i.colorSpace=c;let a=new T(e),o=a.fromEquirectangular(i);return i.dispose(),a.dispose(),o}var Q=Math.PI*2,$=new o(0,1,0);function ue(e){let t=Array.from({length:96},()=>({score:-1/0,p:null})),n=Array.from({length:140},()=>({score:-1/0,p:null})),r=new o;for(let i=0;i<e.count;i+=2){r.fromBufferAttribute(e,i);let a=Math.hypot(r.x,r.z);if(a<.2)continue;let o=(Math.atan2(r.x,r.z)+Q)%Q,s=Math.min(95,Math.floor(o/Q*96)),c=.32+.19*Math.sin(2*o+.27),l=a-7.8*Math.abs(c-r.y);l>t[s].score&&(t[s]={score:l,p:r.clone()});let u=Math.max(0,Math.min(9,Math.floor((r.y+1.03)/2.13*10))),d=Math.min(13,Math.floor(o/Q*14)),f=n[u*14+d];a>f.score&&(f.score=a,f.p=r.clone())}return{path:new x(t.flatMap(e=>e.p?[e.p]:[]),!0,`centripetal`),samples:n.flatMap(e=>e.p?[e.p]:[])}}function de(e,t){let n=[],r=[],a=[],s=[],c=new o,l=new o,u=new o,d=(e,t,i,o,c)=>{n.push(e.x,e.y+t,e.z),r.push(i),a.push(o),s.push(c)};for(let t=0;t<e.length;t++){let n=e[t],r=Math.hypot(n.x,n.z),i=t*.6180339887%1,a=.25+.36*i,o=.0035+.0029*Math.min(r,1);for(let e=0;e<7;e++){let t=e/7,s=(e+1)/7;c.copy(n).applyAxisAngle($,-a*(1-t)),l.copy(n).applyAxisAngle($,-a*(1-s)),c.x*=1.01,c.z*=1.01,l.x*=1.01,l.z*=1.01,d(c,-o,t,i,r),d(c,o,t,i,r),d(l,o,s,i,r),d(c,-o,t,i,r),d(l,o,s,i,r),d(l,-o,s,i,r)}u.copy(n).applyAxisAngle($,-.059),d(u,-o*3.1,.94,i,r),d(u,o*3.1,.94,i,r),d(l,0,1,i,r)}let f=new O;for(let[e,t,i]of[[`position`,n,3],[`sampleAge`,r,1],[`samplePhase`,a,1],[`radius`,s,1]])f.setAttribute(e,new C(t,i));let p=new R({transparent:!0,depthWrite:!1,side:2,forceSinglePass:!0,uniforms:t,vertexShader:`attribute float sampleAge,samplePhase,radius;varying vec3 data;
      void main(){data=vec3(sampleAge,samplePhase,radius);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uScanCycle,uScanPower;varying vec3 data;
      void main(){float travel=fract(uScanCycle*7.+data.y);
      float pulse=1.-smoothstep(.03,.25,abs(data.x-travel));
      vec3 c=mix(vec3(.13,.64,.82),vec3(1.,.35,.065),smoothstep(.42,.86,data.z));
      gl_FragColor=vec4(c*(.71+.83*pulse),(.39+.39*data.x+.31*pulse)*(.50+.50*uScanPower));
      #include <colorspace_fragment>
      }`}),m=new i(f,p);return m.name=`Rigid turntable displacement vectors`,m.renderOrder=4,m}function fe(e){let t=[];for(let[n,r,a]of[[15638119,-.42,.81],[7457506,-.82,.59]]){let o=new R({transparent:!0,depthWrite:!1,uniforms:{colour:{value:new S(n)},gain:{value:a}},vertexShader:`varying vec3 viewNormal,viewDirection;varying float h;
        void main(){vec4 v=modelViewMatrix*vec4(position,1.);viewNormal=normalMatrix*normal;viewDirection=-v.xyz;
        h=(modelMatrix*vec4(position,1.)).y;gl_Position=projectionMatrix*v;}`,fragmentShader:`uniform vec3 colour;uniform float gain;varying vec3 viewNormal,viewDirection;varying float h;
        void main(){float edge=pow(1.-max(0.,dot(normalize(viewNormal),normalize(viewDirection))),2.9);
        float contour=1.-smoothstep(.018,.075,abs(fract(h*12.+.5)-.5));
        gl_FragColor=vec4(colour,(.095+edge*.86+contour*.27)*gain);
        #include <colorspace_fragment>
        }`}),s=new L;for(let[t]of e.originalMaterials){if(![`Face`,`Crewneck`,`Locs`].includes(t.name))continue;let e=new i(t.geometry,o);e.matrix.copy(t.matrixWorld),e.matrixAutoUpdate=!1,e.renderOrder=2,s.add(e)}s.rotation.y=r,t.push({ghost:s,mat:o})}return t}function pe(a,c){let l=new L,u=a.group.getObjectByName(`Retopology cage`).geometry.attributes.position,{path:d,samples:f}=ue(u),m=de(f,c),h=fe(a),g=new L,_=new e({color:10267047,metalness:.67,roughness:.37}),v=new j(.029,.034,.035,12),y=new t(1,8,6),x=new b(.099,.04,.058),S=new j(.031,.031,.009,16),T=new O().setFromPoints([new o(-.064,.012,0),new o(-.064,-.042,0),new o(-.064,-.042,0),new o(.064,-.042,0),new o(.064,-.042,0),new o(.064,.012,0),new o(0,-.042,0),new o(0,-.1,0)]),E=new p({color:10532019,transparent:!0,opacity:.76}),D=new s(.024,.029,24),k=new o,A=new o,M=new o,N=new o,P=new o,F=new o(0,0,1),R=[9234646,16757612].map(e=>{let t=new r({color:e,side:2}),a=new L,o=new i(x,_),s=new i(v,_),c=new i(y,t),l=new i(S,t),u=new n(T,E);s.position.y=.03,l.position.y=.037,c.scale.set(.018,.005,.018),c.position.y=.05,a.add(o,s,l,c,u),g.add(a);let d=new i(y,t);d.scale.setScalar(.014);let f=new i(D,t);g.add(d,f);let m=new O;m.setAttribute(`position`,new C(new Float32Array(6),3).setUsage(w));let h=new I(m,new p({color:e,transparent:!0,opacity:.72,depthWrite:!1}));return h.frustumCulled=!1,h.renderOrder=5,g.add(h),{ship:a,contact:d,halo:f,beam:h,light:t}});return l.add(m,g,...h.map(e=>e.ghost)),l.visible=!1,{group:l,update(e,t,n,r){let i=e===`motion`&&n.reprojection&&n.surface,a=(e===`capture`||e===`points`)&&n.cameras&&n.landmarks;l.visible=i||a,m.visible=i,g.visible=a,i&&(P.setFromMatrixColumn(r.matrixWorld,0).normalize(),N.copy(r.position).normalize()),h.forEach(({ghost:e},t)=>{e.visible=i&&!n.hidden.has(`head`),e.visible&&e.position.copy(P).multiplyScalar(-(.27+.29*t)).addScaledVector(N,-(.42+.22*t))}),a&&R.forEach(({ship:e,contact:n,halo:r,beam:i},a)=>{let o=((t*2+a*.5)%1+1)%1;d.getPointAt(o,k);let s=Math.atan2(k.x,k.z)+.2*Math.sin(o*Q+a);A.set(k.x+.52*Math.sin(s),k.y+.18+.06*Math.sin(o*Q*2),k.z+.52*Math.cos(s)),M.subVectors(k,A).normalize(),e.position.copy(A),e.quaternion.setFromUnitVectors($,M),n.position.copy(k),r.position.copy(k).addScaledVector(M,-.004),r.quaternion.setFromUnitVectors(F,M);let c=i.geometry.attributes.position;c.setXYZ(0,A.x,A.y,A.z),c.setXYZ(1,k.x,k.y,k.z),c.needsUpdate=!0})},dispose(){l.removeFromParent(),m.geometry.dispose(),m.material.dispose(),h.forEach(e=>e.mat.dispose()),_.dispose(),v.dispose(),x.dispose(),S.dispose(),T.dispose(),E.dispose(),y.dispose(),D.dispose();for(let{beam:e,light:t}of R)e.geometry.dispose(),e.material.dispose(),t.dispose()}}}function me(){let e=[],t=(t,n)=>e.push(t.x,t.y,t.z,n.x,n.y,n.z),r=new o,i=new o(0,1,0),a=new o(0,.14,0),s=new o,c=new o,l=new o;for(let e=0;e<3;e++)for(let n=0;n<16;n++){let o=(n+.32*e)*Math.PI/8;if(Math.cos(o)>.18)continue;r.set(Math.sin(o)*(2.8+e*.23),-.4+e*.63,Math.cos(o)*(2.8+e*.23)),l.copy(a).sub(r).normalize(),s.crossVectors(l,i).normalize(),c.crossVectors(s,l).normalize();let u=r.clone().addScaledVector(l,.24),d=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([e,t])=>u.clone().addScaledVector(s,e*.115).addScaledVector(c,t*.075));for(let e=0;e<4;e++)t(d[e],d[(e+1)%4]),t(r,d[e]);let f=u.clone().addScaledVector(c,.113);t(d[2],f),t(d[3],f),n%4==0&&t(u,a.clone().addScaledVector(l,-.5))}let u=new O;return u.setAttribute(`position`,new C(e,3)),new n(u,new p({color:10264222,transparent:!0,opacity:.17,depthWrite:!1}))}function he(e){let t=e.getExtension(`WEBGL_debug_renderer_info`),n=e.getParameter(t?.UNMASKED_RENDERER_WEBGL??e.RENDERER)||``;return/swiftshader|llvmpipe|softpipe|lavapipe|swrast|software (?:rasterizer|renderer|adapter)|microsoft basic (?:render|display)|gdi generic|\bwarp\b/i.test(n)}function ge(){let e=new L,t=[],r=[],a=new o,s=new o,c=new S(6388859),u=new S(9676189),d=(e,t,n)=>n.set(Math.sin(e)*t,-1.104,Math.cos(e)*t),f=(e,n,i)=>{t.push(...e.toArray(),...n.toArray()),r.push(...i.toArray(),...i.toArray())};for(let e=0;e<180;e++){let t=e*Math.PI/90,n=e%15==0,r=e%5==0;d(t,1.55,a),d(t,1.55+(n?.081:r?.047:.019),s),f(a,s,n?u:c),e%5!=4&&(d(t,1.531,a),d(t+Math.PI/90,1.531,s),f(a,s,c))}let m=new O;m.setAttribute(`position`,new C(t,3)),m.setAttribute(`color`,new C(r,3));let h=new p({vertexColors:!0,transparent:!0,opacity:.45,depthWrite:!1});e.add(new n(m,h));let g=new l(3.8,3),_=new R({transparent:!0,depthWrite:!1,vertexShader:`varying vec2 screenUv;void main(){screenUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 screenUv;void main(){float r=length((screenUv-.5)*vec2(2.46,3.1));
      gl_FragColor=vec4(.012,.020,.024,.47*(1.-smoothstep(.10,1.,r)));}`}),v=new i(g,_);return v.rotation.x=-Math.PI/2,v.position.y=-1.109,v.renderOrder=1,e.add(v),{group:e,dispose(){m.dispose(),h.dispose(),g.dispose(),_.dispose(),e.removeFromParent()}}}async function _e(e,t,{allowSoftware:r=!1,clearColor:i=1054489}={}){let a=new v({antialias:!0,alpha:!0,powerPreference:`high-performance`,preserveDrawingBuffer:!1});if(!r&&he(a.getContext()))return a.dispose(),a.forceContextLoss(),null;a.setClearColor(i,0),a.outputColorSpace=c,a.toneMapping=0,e.append(a.domElement);let s=!1,l=new f;l.fog=new _(1054489,.065);let u=ce(l),d=new E(29.2,1,.05,80),h=new F(28,84,4679017,2901318),g=ge();l.add(g.group),h.position.y=-1.115,h.material.transparent=!0,h.material.opacity=.6,h.material.depthWrite=!1,l.add(h);let b=new O().setFromPoints([new o(-14,-1.11,0),new o(14,-1.11,0),new o(0,-1.11,-14),new o(0,-1.11,14)]);b.setAttribute(`color`,new C([.34,.1,.1,.34,.1,.1,.12,.29,.12,.12,.29,.12],3));let x=new n(b,new p({vertexColors:!0,transparent:!0,opacity:.41}));l.add(x);let S=me();l.add(S),l.add(new y(15594228,6707278,1.12));let w=new k(16770764,2.08);w.position.set(-3.4,3.6,4),l.add(w);let T=new k(14151412,.69);T.position.set(2.9,.8,2.6),l.add(T);let D=new k(11913193,2.18);D.position.set(1.8,2.6,-2.7),l.add(D);let A=new k(10348243,1.1);A.position.set(-2,.7,-1),l.add(A);let j=Y(),M,N;try{[M,N]=await Promise.all([ee({generateSamples:!1}),oe(j).catch(()=>null)])}catch(e){throw a.dispose(),a.domElement.remove(),e}l.add(M.group),N&&l.add(N.group);let P=le(a),I=re(M,P.texture,j),L=ae(M,j),R=pe(M,j);l.add(L.group,R.group);let z=0,B=1,V=``,H=``,U=null,W=null,G=()=>{let t=U?.width??e.clientWidth,n=U?.height??e.clientHeight;if(!t||!n)return;z=t;let r=Math.min(window.devicePixelRatio||1,2,3e3/t);a.setPixelRatio(U?1:r*B),a.setSize(t,n,!1),d.aspect=t/n,d.updateProjectionMatrix()},K=new ResizeObserver(G);K.observe(e),G();function q(e,t,n){let r=4.47/n;d.position.set(Math.sin(e)*Math.cos(t)*r,Math.sin(t)*r+.045,Math.cos(e)*Math.cos(t)*r),d.lookAt(.12,.005,0)}q(0,.045,1),await a.compileAsync(l,d).catch(()=>{});function X(e){e.preventDefault(),t?.()}return a.domElement.addEventListener(`webglcontextlost`,X),{canvas:a.domElement,stats:{...M.stats,points:N?.points??M.stats.points},render({mode:e,angle:t,pitch:n,zoom:r,state:i,time:o=0,transitionProgress:c=1,imported:f=null}){if(s||!z)return;j.uScanCycle.value=o/J,j.uScanPower.value=i.landmarks?i.intensity/100:0,j.uScanEntry.value=m.clamp(c,0,1);let p=e;if(q(t,n,r),S.rotation.y=t,h.visible=x.visible=g.group.visible=i.grid,S.visible=i.cameras,W!==f&&(W?.group.removeFromParent(),W=f,f&&l.add(f.group),l.environment=f?P.texture:null),L.group.visible=R.group.visible=!f&&i.annotations!==!1,f){M.group.visible=!1,N&&(N.group.visible=!1),f.draw(e,o,j.uScanPower.value),u.update(0,a.domElement.height,i.points&&i.atmosphere!==!1),V=``,a.render(l,d);return}if(V!==e){let t=p===`topology`||p===`clay`?`topology`:p===`points`?`points`:`surface`;M.setMode(t,!0);for(let e of M.originalMaterials.keys()){let t=I.for(e,p);t&&(e.material=t)}V=e,H=``}let _=(e===`points`||e===`capture`)&&!!N;M.group.visible=!_,N&&(N.group.visible=_,_&&N.update(o,d,a.domElement.height,i,e===`capture`)),L.update(p,i),d.updateMatrixWorld(),R.update(p,j.uScanCycle.value,i,d);let v=j.uScanCycle.value*Math.PI*2;u.update(3.9*Math.sin(v)+.7*Math.sin(v*3),a.domElement.height,i.points&&i.atmosphere!==!1);let y=[e,i.surface,i.points,i.topology,i.hidden.has(`locs`),i.hidden.has(`eyes`),i.hidden.has(`head`),i.density,i.intensity].join(`/`);if(y!==H){for(let t of M.originalMaterials.keys()){let n=/eye|iris|cornea|sclera/i.test(t.name),r=/hair|loc|groom/i.test(t.name),a=/face|skin|head/i.test(t.name)&&!r;t.visible=i.surface&&(!n||!i.hidden.has(`eyes`))&&(!r||!i.hidden.has(`locs`))&&(!a||!i.hidden.has(`head`))&&(e===`surface`||t.name!==`Brows`),[`alloy`,`uv`,`motion`,`topology`,`clay`].includes(e)&&/hairline|fibers|veil|stubble/i.test(t.name)&&(t.visible=!1)}let t=M.group.getObjectByName(`Retopology cage`);t&&(t.visible=e===`topology`||i.topology,t.material.color.set(e===`topology`?11259579:10989736),t.material.opacity=(e===`topology`?.58:.28)+.4*i.intensity/100);let n=M.group.getObjectByName(`Scanner returns`);n&&(n.visible=[`surface`,`alloy`,`motion`,`uv`].includes(e)&&i.points);let r=M.group.getObjectByName(`Surface samples`);r&&(r.visible=i.points&&e===`points`,r.geometry.setDrawRange(0,Math.floor(M.stats.points*(.2+.8*i.density/100)))),H=y}a.render(l,d)},setOutputSize(e,t){U=e&&t?{width:e,height:t}:null,G()},setQuality(e){e=Math.max(.5,Math.min(1,e)),e!==B&&(B=e,G())},diagnostics(){return{width:a.domElement.width,height:a.domElement.height,calls:a.info.render.calls,triangles:a.info.render.triangles,points:a.info.render.points,mode:V,scanPower:j.uScanPower.value,uvSeamEdges:L.seamEdges}},dispose(){s=!0,K.disconnect(),a.domElement.removeEventListener(`webglcontextlost`,X),W?.group.removeFromParent(),h.geometry.dispose(),h.material.dispose(),x.geometry.dispose(),x.material.dispose(),S.geometry.dispose(),S.material.dispose(),g.dispose(),R.dispose(),L.dispose(),I.dispose(),M.dispose(),N?.dispose(),u.dispose(),P.dispose(),a.dispose(),a.domElement.remove()}}}export{_e as createWorld};