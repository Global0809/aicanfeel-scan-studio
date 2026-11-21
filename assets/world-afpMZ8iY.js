import{A as e,C as t,D as n,E as r,F as i,I as a,L as o,M as s,N as c,O as l,P as u,R as d,S as f,T as p,_ as m,a as h,b as g,c as _,d as v,f as y,g as b,h as x,i as S,j as C,k as w,l as T,m as E,n as D,o as O,p as k,r as A,s as j,t as M,u as N,v as P,w as F,x as I,y as L,z as R}from"./three-fe9Zxqwn.js";import{n as z,t as B}from"./index-ZvxFSYT7.js";var V=`./subject/`,H=new Set([`surface`,`topology`,`points`]),U=new Set([`Brows`,`Hair_fibers`,`Hair_curl_veil`]),W={Face:3400,Eyes:1800};function G(e){return()=>(e=Math.imul(e,1664525)+1013904223|0,(e>>>0)/4294967296)}function K(t){let n=G(72913),r=[],i=[],a=new R,o=new R,s=new R,c=new R,l=new R,u=new R;for(let e of t){let t=e.geometry.index,d=e.geometry.getAttribute(`position`);if(!t||[`Brows`,`Hairline`,`Hair_fibers`,`Hair_curl_veil`,`Underside`].includes(e.name))continue;let f=t.count/3,p=W[e.name]??1200;for(let m=0;m<f;m++){a.fromBufferAttribute(d,t.getX(m*3)).applyMatrix4(e.matrixWorld),o.fromBufferAttribute(d,t.getX(m*3+1)).applyMatrix4(e.matrixWorld),s.fromBufferAttribute(d,t.getX(m*3+2)).applyMatrix4(e.matrixWorld),c.subVectors(o,a),l.subVectors(s,a),u.crossVectors(c,l);let f=u.length()*.5*p;u.normalize();let h=Math.floor(f+n());for(let e=0;e<h;e++){let e=Math.sqrt(n()),t=n(),c=1-e,l=e*(1-t),d=e*t;r.push(a.x*c+o.x*l+s.x*d+u.x*9e-4,a.y*c+o.y*l+s.y*d+u.y*9e-4,a.z*c+o.z*l+s.z*d+u.z*9e-4);let f=.4+n()*.47,p=n()>.96;i.push(f*(p?1:.46),f*(p?.62:.97),f*(p?.3:.88))}}}let d=new _;d.setAttribute(`position`,new x(r,3)),d.setAttribute(`color`,new x(i,3));let f=new C({vertexColors:!0,size:.007,sizeAttenuation:!0,depthWrite:!1}),p=new e(d,f);return p.name=`Surface samples`,p.renderOrder=3,p}async function ee({generateSamples:t=!0}={}){let[r,i]=await Promise.all([new A().setMeshoptDecoder(D).loadAsync(`${V}performer.glb`),fetch(`${V}cage.bin`)]);if(!i.ok)throw Error(`Scan cage could not load (${i.status}).`);let a=new Int16Array(await i.arrayBuffer()),o=new _;o.setAttribute(`position`,new x(Float32Array.from(a,e=>e/16e3),3));let s=new I({color:10989736,transparent:!0,opacity:.6,depthWrite:!1}),c=new f(o,s);c.name=`Retopology cage`,c.renderOrder=2;let l=new P;l.name=`Digital performer`,l.add(r.scene,c);let u=[],d=[],m=new v(13076816),h=new v(8829100),g=new v(11910330);for(let e=0,t=0;e+2<a.length;e+=57,t++){let n=a[e]/16e3,r=a[e+1]/16e3,i=a[e+2]/16e3;if(Math.abs(n)<.36&&r>-.33&&r<.77&&i>.29&&t%7!=0)continue;u.push(n,r,i);let o=t%29==0?m:t%3==0?g:h;d.push(o.r,o.g,o.b)}let y=new _;y.setAttribute(`position`,new x(u,3)),y.setAttribute(`color`,new x(d,3));let b=new C({size:.005,vertexColors:!0,transparent:!0,opacity:.56,depthWrite:!1}),S=new e(y,b);S.name=`Scanner returns`,S.renderOrder=3,l.add(S);let w=[],T=new Map,E=0,k=0;r.scene.traverse(e=>{e.isMesh&&(w.push(e),T.set(e,e.material),E+=e.geometry.attributes.position.count,k+=(e.geometry.index?.count??e.geometry.attributes.position.count)/3)}),r.scene.updateMatrixWorld(!0);let j=K(t?w:[]);l.add(j);let M=new n({color:4674126,roughness:.88,metalness:.05,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:1}),N=new p({color:1383451,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:2}),F=new p({visible:!1}),L=``;function R(e,t=!1){if(H.has(e)&&(t||e!==L)){L=e,c.visible=e===`topology`,j.visible=e===`points`,S.visible=e===`surface`;for(let t of w)t.visible=e===`surface`||!U.has(t.name),t.material=e===`surface`?T.get(t):U.has(t.name)?F:e===`topology`?M:N}}R(`surface`);function z(){let e=new Set([j.geometry,y,o,...w.map(e=>e.geometry)]),t=new Set([M,N,b,F,s,j.material,...T.values()]),n=new Set;for(let e of t){for(let t of Object.values(e))t?.isTexture&&n.add(t);e.dispose()}for(let t of e)t.dispose();for(let e of n)e.source?.data?.close?.(),e.dispose();l.removeFromParent()}return{group:l,originalMaterials:T,setMode:R,dispose:z,stats:{vertices:E,triangles:k,points:j.geometry.attributes.position.count,edges:a.length/6,bounds:new O().setFromObject(r.scene),parts:w.map(e=>({name:e.name,triangles:(e.geometry.index?.count??e.geometry.attributes.position.count)/3}))}}}function te(){let e=document.createElement(`canvas`);e.width=e.height=1024;let t=e.getContext(`2d`),n=[`#294756`,`#33535e`,`#38545b`,`#3e5353`,`#354762`,`#3b5167`,`#354e66`,`#3e5463`,`#2d4753`,`#305159`,`#3c5454`,`#455b52`,`#354451`,`#3c4b55`,`#3d535c`,`#46565c`];for(let e=0;e<4;e++)for(let r=0;r<4;r++){let i=e*4+r,a=r*256,o=e*256,s=(r+e)%4==0?`#efb466`:(r+e)%3==0?`#90b9d5`:`#99cfbe`;t.save(),t.translate(a,o),t.fillStyle=n[i],t.fillRect(0,0,256,256);for(let e=0;e<8;e++)for(let n=0;n<8;n++)(e+n)%2==0&&(t.fillStyle=`rgba(202,228,221,.085)`,t.fillRect(e*32,n*32,32,32));t.strokeStyle=`rgba(190,218,214,.36)`,t.lineWidth=1.5,t.beginPath();for(let e=1;e<8;e++)t.moveTo(32*e,0),t.lineTo(32*e,256),t.moveTo(0,32*e),t.lineTo(256,32*e);t.stroke(),t.strokeStyle=s,t.lineWidth=4,t.strokeRect(2,2,252,252),t.fillStyle=s;for(let e=0;e<32;e++){let n=e%4==0?12:5;t.fillRect(e*8,0,2,n),t.fillRect(0,e*8,n,2)}let c=String.fromCharCode(65+e)+(r+1);t.font=`600 43px Consolas,monospace`,t.fillStyle=`#e2e9de`,t.fillText(c,20,58),t.font=`bold 15px Consolas,monospace`,t.fillStyle=s,t.fillText(`U `+String(r).padStart(2,`0`)+`  V `+String(e).padStart(2,`0`),18,235),t.lineWidth=3,t.strokeStyle=`#c0d3ca`,t.beginPath(),t.arc(128,128,22,0,Math.PI*2),t.moveTo(96,128),t.lineTo(117,128),t.moveTo(139,128),t.lineTo(160,128),t.moveTo(128,96),t.lineTo(128,117),t.moveTo(128,139),t.lineTo(128,160),t.stroke(),t.fillStyle=s,t.beginPath(),t.moveTo(224,28),t.lineTo(239,49),t.lineTo(208,49),t.closePath(),t.fill(),t.restore()}let r=new T(e);return r.name=`Numbered UV calibration chart`,r.colorSpace=u,r.wrapS=r.wrapT=s,r.anisotropy=4,r}var q=B;function J(){return{uScanCycle:{value:0},uScanPower:{value:.62},uScanEntry:{value:1}}}var Y=`
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
`,X=`
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
  `};function Z(e,t,n,{frequency:r=[1,1],face:i=!1,chart:a=null}={}){return e.onBeforeCompile=e=>{Object.assign(e.uniforms,n),e.uniforms.uvFrequency={value:new d(...r)},e.uniforms.faceWeight={value:+!!i},a&&(e.uniforms.calibrationChart={value:a}),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
`+X).replace(`#include <project_vertex>`,`
        scanPosition = (modelMatrix * vec4(transformed,1.0)).xyz;
        scanNormal = normalize(mat3(modelMatrix) * normal);
        scanUv = uv;
        #include <project_vertex>`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
`+X+Y+`
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
        #include <opaque_fragment>`)},e.customProgramCacheKey=()=>`performer-inspection-`+t,e}function re(e,t,i){let a=e.originalMaterials,o=new Map,s=new Set,c=te(),l=Z(new r({color:14144716,metalness:.94,roughness:.32,envMap:t,envMapIntensity:1.33,iridescence:.36,iridescenceIOR:1.42,iridescenceThicknessMinimum:130,iridescenceThicknessMaximum:340,anisotropy:.71,anisotropyRotation:.43,clearcoat:.24,clearcoatRoughness:.3}),`alloy`,i),u=Z(new n({color:7636606,roughness:.85,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:1}),`topology`,i),d=Z(new n({color:14071198,roughness:.91}),`clay`,i);s.add(l),s.add(u),s.add(d);for(let[e,t]of a){if(/eye/i.test(e.name)){o.set(e,{clay:d});continue}if(/eyes|cornea|brow|fiber|veil|hairline|underside/i.test(e.name))continue;let r=e.name===`Face`,a=r?[6,6]:e.name===`Locs`?[.53,2]:e.name===`Collar`?[3.4,.7]:[5,4.2],f={alloy:l,topology:u,clay:d};for(let e of[`uv`,`motion`]){let o=new n({color:16777215,roughness:.68,map:r?t.map:null});f[e]=Z(o,e,i,{frequency:a,face:r,chart:e===`uv`?c:null}),s.add(o)}r&&(t.roughness=.73,t.bumpMap=t.map,t.bumpScale=.0016),Z(t,`surface`,i,{face:r}),o.set(e,f)}return{for(e,t){return o.get(e)?.[t]},dispose(){c.dispose();for(let e of s)e.dispose()}}}function ie(e){let t=[],n=new R,r=new R;for(let i of e){if(![`Face`,`Crewneck`,`Collar`].includes(i.name))continue;let{position:e,normal:a,uv:o}=i.geometry.attributes,s=i.geometry.index;if(!s||!o)continue;let c=new Set,l=new Map,u=e.count;function d(e,t){let n=Math.min(e,t)*u+Math.max(e,t);c.has(n)?c.delete(n):c.add(n)}for(let e=0;e<s.count;e+=3){let t=s.getX(e),n=s.getX(e+1),r=s.getX(e+2);d(t,n),d(n,r),d(r,t)}let f=t=>[e.getX(t),e.getY(t),e.getZ(t)].map(e=>Math.round(e*3e4)).join(`,`);for(let s of c){let c=Math.floor(s/u),d=s%u,p=f(c),m=f(d);if(p===m)continue;p>m&&([p,m]=[m,p],[c,d]=[d,c]);let h=p+`|`+m,g=l.get(h);if(!g){l.set(h,[c,d]);continue}let _=(e,t)=>Math.abs(o.getX(e)-o.getX(t))+Math.abs(o.getY(e)-o.getY(t))>.001;if(_(c,g[0])||_(d,g[1]))for(let o of[c,d])n.fromBufferAttribute(e,o),a&&n.addScaledVector(r.fromBufferAttribute(a,o).normalize(),.0017),n.applyMatrix4(i.matrixWorld),t.push(n.x,n.y,n.z)}}return t}function ae(e,t){let n=new P;n.name=`UV chart seams`;let r=new _;r.setAttribute(`position`,new x(ie(e.originalMaterials.keys()),3));let i=new I({color:16756580,transparent:!0,opacity:.88,depthWrite:!1}),a=new f(r,i);a.renderOrder=3,n.add(a);let o=e.group.getObjectByName(`Retopology cage`).material;return o.onBeforeCompile=e=>{Object.assign(e.uniforms,t),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 cagePosition;`).replace(`#include <project_vertex>`,`cagePosition=(modelMatrix*vec4(transformed,1.0)).xyz;
#include <project_vertex>`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 cagePosition;
`+Y).replace(`#include <opaque_fragment>`,`
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
        #include <opaque_fragment>`)},o.customProgramCacheKey=()=>`measured-cage-projection`,n.visible=!1,{group:n,seamEdges:r.attributes.position.count/2,update(e,t){a.visible=e===`uv`&&t.landmarks&&!t.hidden.has(`head`),n.visible=t.surface&&a.visible},dispose(){n.removeFromParent(),r.dispose(),i.dispose()}}}async function oe(n=J()){let r=new A,[i,o,s]=await Promise.all([new M().loadAsync(z(`subject/optical-cloud.ply`)),r.loadAsync(z(`subject/optical-cloud.occluder.glb`)),r.loadAsync(z(`subject/optical-cloud.surface.glb`))]),c={...n,focalPixels:{value:1600},radius:{value:.015},fraction:{value:1},solid:{value:0}},l=new a({vertexColors:!0,uniforms:c,alphaToCoverage:!0,depthWrite:!0,transparent:!1,vertexShader:[`uniform float focalPixels, radius, fraction;`,Y,`varying vec3 vColor, vFields; varying vec2 vCrossing; varying float vId, vEntry, vWindow;`,`void main(){`,`vec4 v = modelViewMatrix * vec4(position, 1.0);`,`vColor = color; vFields = sectionFields(position); vCrossing=crossingProjectors(position); vEntry = entryFront(position);`,`vWindow=pow(0.5+0.5*cos(scanTau*(position.y*.8 + position.x*.27 - uScanCycle*2.0)),2.0);`,`vId = fract(sin(dot(position,vec3(29.17,71.13,53.74)))*34567.81);`,`gl_Position=projectionMatrix*v;`,`float returnSize=0.83 + vId*0.38 + uScanPower*(0.15*vFields.x+0.34*step(0.965,vId)*vWindow + 0.22*vCrossing.x);`,`gl_PointSize=clamp(radius * focalPixels / max(0.1,-v.z) * returnSize,1.1,27.0);`,`if(vId>fraction)gl_Position=vec4(2.0,2.0,2.0,1.0);`,`}`].join(`
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
}`}),u=new e(i,l);u.name=`Optical point returns`,u.frustumCulled=!1;let d=new P;d.add(u,o.scene,s.scene),d.visible=!1;let f=new p({colorWrite:!1,depthWrite:!0,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:1});o.scene.traverse(e=>{e.isMesh&&(e.material.dispose(),e.material=f,e.renderOrder=-2)});let m=[];return s.scene.traverse(e=>{if(!e.isMesh)return;let t=e.material,r=Z(new p({map:t.map,color:16317176}),`capture`,n),i=Z(new p({map:t.map,color:16185075,polygonOffset:!0,polygonOffsetFactor:4,polygonOffsetUnits:6}),`returns`,n);e.material=r,m.push({obj:e,mat:r,plate:i}),t.dispose()}),{group:d,points:i.attributes.position.count,update(e,n,r,i,a=!1){c.focalPixels.value=r/(2*Math.tan(t.degToRad(n.fov)*.5)),c.fraction.value=.18+.82*i.density/100,c.radius.value=(a?.0029:.006)/Math.sqrt(c.fraction.value),c.uScanCycle.value=e/q,c.uScanPower.value=i.landmarks?i.intensity/100:0,c.solid.value=+!!a,u.visible=i.points,o.scene.visible=!a&&!i.surface,s.scene.visible=i.surface;for(let{obj:e,mat:t,plate:n}of m)e.renderOrder=-1,e.material=a?t:n},dispose(){i.dispose(),l.dispose(),f.dispose();for(let e of[o.scene,s.scene])e.traverse(e=>e.geometry?.dispose());for(let{mat:e,plate:t}of m)e.map?.dispose(),e.dispose(),t.dispose();d.removeFromParent()}}}function se(e){return()=>(e=Math.imul(e,1664525)+1013904223>>>0,e/4294967296)}function ce(t){let n=se(851),r=[],i=[];for(let e=0;e<1300;e++){let e=n()*Math.PI*2,t=1.2+n()**1.3*2.8,a=n()<.77;r.push(Math.cos(e)*t,a?-1.09+n()**2*.39:-.94+n()*2.12,Math.sin(e)*t),i.push(n())}let o=new _;o.setAttribute(`position`,new x(r,3)),o.setAttribute(`weight`,new x(i,1));let s=new a({transparent:!0,depthWrite:!1,blending:2,uniforms:{clock:{value:0},pixels:{value:1}},vertexShader:`attribute float weight;uniform float clock,pixels;varying float w;varying float vLife;
void main(){w=weight;vec3 p=position;
p.y+=.027*sin(clock*.91+weight*97.0);p.x+=.033*sin(clock*.43+weight*210.0);
vec4 v=modelViewMatrix*vec4(p,1);gl_Position=projectionMatrix*v;
gl_PointSize=clamp(pixels*(.8+weight*weight*2.6)*3.7/max(1.0,-v.z),.7,8.0);
vLife=.19+.42*pow(.5+.5*sin(clock*2.0+weight*156.0),4.0);}`,fragmentShader:`varying float w;varying float vLife;
void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
vec3 c=mix(vec3(.20,.38,.36),vec3(.55,.48,.19),smoothstep(.57,.72,w));
c=mix(c,vec3(.45,.42,.67),smoothstep(.82,.98,w));gl_FragColor=vec4(c,vLife*(1.-r*r));
#include <colorspace_fragment>
}`}),c=new e(o,s);return c.frustumCulled=!1,t.add(c),{update(e,t,n){c.visible=n,s.uniforms.clock.value=e,s.uniforms.pixels.value=t/853},dispose(){o.dispose(),s.dispose(),c.removeFromParent()}}}function le(e){let t=document.createElement(`canvas`);t.width=768,t.height=384;let n=t.getContext(`2d`);n.fillStyle=`#111719`,n.fillRect(0,0,t.width,t.height);function r(e,t,r,i,a){let o=n.createLinearGradient(e,t,e+r,t+i);for(let[e,t]of a)o.addColorStop(e,t);n.fillStyle=o,n.fillRect(e,t,r,i)}r(44,37,91,195,[[0,`#e6fff6`],[.27,`#c4dedc`],[1,`#2d7775`]]),r(200,28,20,180,[[0,`#b5f9ff`],[1,`#5368bb`]]),r(303,62,93,13,[[0,`#7e8cff`],[.4,`#fff7fa`],[1,`#bed1f6`]]),r(443,45,45,150,[[0,`#e4f4d6`],[1,`#bc96ba`]]),r(552,56,67,96,[[0,`#889bd7`],[.58,`#f8d8ef`],[1,`#9365ad`]]),r(620,110,104,18,[[0,`#8d6152`],[1,`#f3dab0`]]),r(0,262,768,27,[[0,`#182629`],[.5,`#28323b`],[1,`#1b2726`]]);let i=new T(t);i.mapping=303,i.colorSpace=u;let a=new S(e),o=a.fromEquirectangular(i);return i.dispose(),a.dispose(),o}var Q=Math.PI*2,$=new R(0,1,0);function ue(e){let t=Array.from({length:96},()=>({score:-1/0,p:null})),n=Array.from({length:140},()=>({score:-1/0,p:null})),r=new R;for(let i=0;i<e.count;i+=2){r.fromBufferAttribute(e,i);let a=Math.hypot(r.x,r.z);if(a<.2)continue;let o=(Math.atan2(r.x,r.z)+Q)%Q,s=Math.min(95,Math.floor(o/Q*96)),c=.32+.19*Math.sin(2*o+.27),l=a-7.8*Math.abs(c-r.y);l>t[s].score&&(t[s]={score:l,p:r.clone()});let u=Math.max(0,Math.min(9,Math.floor((r.y+1.03)/2.13*10))),d=Math.min(13,Math.floor(o/Q*14)),f=n[u*14+d];a>f.score&&(f.score=a,f.p=r.clone())}return{path:new N(t.flatMap(e=>e.p?[e.p]:[]),!0,`centripetal`),samples:n.flatMap(e=>e.p?[e.p]:[])}}function de(e,t){let n=[],r=[],i=[],o=[],s=new R,c=new R,l=new R,u=(e,t,a,s,c)=>{n.push(e.x,e.y+t,e.z),r.push(a),i.push(s),o.push(c)};for(let t=0;t<e.length;t++){let n=e[t],r=Math.hypot(n.x,n.z),i=t*.6180339887%1,a=.25+.36*i,o=.0035+.0029*Math.min(r,1);for(let e=0;e<7;e++){let t=e/7,l=(e+1)/7;s.copy(n).applyAxisAngle($,-a*(1-t)),c.copy(n).applyAxisAngle($,-a*(1-l)),s.x*=1.01,s.z*=1.01,c.x*=1.01,c.z*=1.01,u(s,-o,t,i,r),u(s,o,t,i,r),u(c,o,l,i,r),u(s,-o,t,i,r),u(c,o,l,i,r),u(c,-o,l,i,r)}l.copy(n).applyAxisAngle($,-.059),u(l,-o*3.1,.94,i,r),u(l,o*3.1,.94,i,r),u(c,0,1,i,r)}let d=new _;for(let[e,t,a]of[[`position`,n,3],[`sampleAge`,r,1],[`samplePhase`,i,1],[`radius`,o,1]])d.setAttribute(e,new x(t,a));let f=new a({transparent:!0,depthWrite:!1,side:2,forceSinglePass:!0,uniforms:t,vertexShader:`attribute float sampleAge,samplePhase,radius;varying vec3 data;
      void main(){data=vec3(sampleAge,samplePhase,radius);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uScanCycle,uScanPower;varying vec3 data;
      void main(){float travel=fract(uScanCycle*7.+data.y);
      float pulse=1.-smoothstep(.03,.25,abs(data.x-travel));
      vec3 c=mix(vec3(.13,.64,.82),vec3(1.,.35,.065),smoothstep(.42,.86,data.z));
      gl_FragColor=vec4(c*(.71+.83*pulse),(.39+.39*data.x+.31*pulse)*(.50+.50*uScanPower));
      #include <colorspace_fragment>
      }`}),p=new F(d,f);return p.name=`Rigid turntable displacement vectors`,p.renderOrder=4,p}function fe(e){let t=[];for(let[n,r,i]of[[15638119,-.42,.81],[7457506,-.82,.59]]){let o=new a({transparent:!0,depthWrite:!1,uniforms:{colour:{value:new v(n)},gain:{value:i}},vertexShader:`varying vec3 viewNormal,viewDirection;varying float h;
        void main(){vec4 v=modelViewMatrix*vec4(position,1.);viewNormal=normalMatrix*normal;viewDirection=-v.xyz;
        h=(modelMatrix*vec4(position,1.)).y;gl_Position=projectionMatrix*v;}`,fragmentShader:`uniform vec3 colour;uniform float gain;varying vec3 viewNormal,viewDirection;varying float h;
        void main(){float edge=pow(1.-max(0.,dot(normalize(viewNormal),normalize(viewDirection))),2.9);
        float contour=1.-smoothstep(.018,.075,abs(fract(h*12.+.5)-.5));
        gl_FragColor=vec4(colour,(.095+edge*.86+contour*.27)*gain);
        #include <colorspace_fragment>
        }`}),s=new P;for(let[t]of e.originalMaterials){if(![`Face`,`Crewneck`,`Locs`].includes(t.name))continue;let e=new F(t.geometry,o);e.matrix.copy(t.matrixWorld),e.matrixAutoUpdate=!1,e.renderOrder=2,s.add(e)}s.rotation.y=r,t.push({ghost:s,mat:o})}return t}function pe(e,t){let r=new P,i=e.group.getObjectByName(`Retopology cage`).geometry.attributes.position,{path:a,samples:s}=ue(i),l=de(s,t),u=fe(e),d=new P,m=new n({color:10267047,metalness:.67,roughness:.37}),h=new y(.029,.034,.035,12),v=new o(1,8,6),b=new j(.099,.04,.058),S=new y(.031,.031,.009,16),C=new _().setFromPoints([new R(-.064,.012,0),new R(-.064,-.042,0),new R(-.064,-.042,0),new R(.064,-.042,0),new R(.064,-.042,0),new R(.064,.012,0),new R(0,-.042,0),new R(0,-.1,0)]),w=new I({color:10532019,transparent:!0,opacity:.76}),T=new c(.024,.029,24),D=new R,O=new R,k=new R,A=new R,M=new R,N=new R(0,0,1),L=[9234646,16757612].map(e=>{let t=new p({color:e,side:2}),n=new P,r=new F(b,m),i=new F(h,m),a=new F(v,t),o=new F(S,t),s=new f(C,w);i.position.y=.03,o.position.y=.037,a.scale.set(.018,.005,.018),a.position.y=.05,n.add(r,i,o,a,s),d.add(n);let c=new F(v,t);c.scale.setScalar(.014);let l=new F(T,t);d.add(c,l);let u=new _;u.setAttribute(`position`,new x(new Float32Array(6),3).setUsage(E));let y=new g(u,new I({color:e,transparent:!0,opacity:.72,depthWrite:!1}));return y.frustumCulled=!1,y.renderOrder=5,d.add(y),{ship:n,contact:c,halo:l,beam:y,light:t}});return r.add(l,d,...u.map(e=>e.ghost)),r.visible=!1,{group:r,update(e,t,n,i){let o=e===`motion`&&n.reprojection&&n.surface,s=(e===`capture`||e===`points`)&&n.cameras&&n.landmarks;r.visible=o||s,l.visible=o,d.visible=s,o&&(M.setFromMatrixColumn(i.matrixWorld,0).normalize(),A.copy(i.position).normalize()),u.forEach(({ghost:e},t)=>{e.visible=o&&!n.hidden.has(`head`),e.visible&&e.position.copy(M).multiplyScalar(-(.27+.29*t)).addScaledVector(A,-(.42+.22*t))}),s&&L.forEach(({ship:e,contact:n,halo:r,beam:i},o)=>{let s=((t*2+o*.5)%1+1)%1;a.getPointAt(s,D);let c=Math.atan2(D.x,D.z)+.2*Math.sin(s*Q+o);O.set(D.x+.52*Math.sin(c),D.y+.18+.06*Math.sin(s*Q*2),D.z+.52*Math.cos(c)),k.subVectors(D,O).normalize(),e.position.copy(O),e.quaternion.setFromUnitVectors($,k),n.position.copy(D),r.position.copy(D).addScaledVector(k,-.004),r.quaternion.setFromUnitVectors(N,k);let l=i.geometry.attributes.position;l.setXYZ(0,O.x,O.y,O.z),l.setXYZ(1,D.x,D.y,D.z),l.needsUpdate=!0})},dispose(){r.removeFromParent(),l.geometry.dispose(),l.material.dispose(),u.forEach(e=>e.mat.dispose()),m.dispose(),h.dispose(),b.dispose(),S.dispose(),C.dispose(),w.dispose(),v.dispose(),T.dispose();for(let{beam:e,light:t}of L)e.geometry.dispose(),e.material.dispose(),t.dispose()}}}function me(){let e=[],t=(t,n)=>e.push(t.x,t.y,t.z,n.x,n.y,n.z),n=new R,r=new R(0,1,0),i=new R(0,.14,0),a=new R,o=new R,s=new R;for(let e=0;e<3;e++)for(let c=0;c<16;c++){let l=(c+.32*e)*Math.PI/8;if(Math.cos(l)>.18)continue;n.set(Math.sin(l)*(2.8+e*.23),-.4+e*.63,Math.cos(l)*(2.8+e*.23)),s.copy(i).sub(n).normalize(),a.crossVectors(s,r).normalize(),o.crossVectors(a,s).normalize();let u=n.clone().addScaledVector(s,.24),d=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([e,t])=>u.clone().addScaledVector(a,e*.115).addScaledVector(o,t*.075));for(let e=0;e<4;e++)t(d[e],d[(e+1)%4]),t(n,d[e]);let f=u.clone().addScaledVector(o,.113);t(d[2],f),t(d[3],f),c%4==0&&t(u,i.clone().addScaledVector(s,-.5))}let c=new _;return c.setAttribute(`position`,new x(e,3)),new f(c,new I({color:10264222,transparent:!0,opacity:.17,depthWrite:!1}))}function he(e){let t=e.getExtension(`WEBGL_debug_renderer_info`),n=e.getParameter(t?.UNMASKED_RENDERER_WEBGL??e.RENDERER)||``;return/swiftshader|llvmpipe|softpipe|lavapipe|swrast|software (?:rasterizer|renderer|adapter)|microsoft basic (?:render|display)|gdi generic|\bwarp\b/i.test(n)}function ge(){let e=new P,t=[],n=[],r=new R,i=new R,o=new v(6388859),s=new v(9676189),c=(e,t,n)=>n.set(Math.sin(e)*t,-1.104,Math.cos(e)*t),l=(e,r,i)=>{t.push(...e.toArray(),...r.toArray()),n.push(...i.toArray(),...i.toArray())};for(let e=0;e<180;e++){let t=e*Math.PI/90,n=e%15==0,a=e%5==0;c(t,1.55,r),c(t,1.55+(n?.081:a?.047:.019),i),l(r,i,n?s:o),e%5!=4&&(c(t,1.531,r),c(t+Math.PI/90,1.531,i),l(r,i,o))}let u=new _;u.setAttribute(`position`,new x(t,3)),u.setAttribute(`color`,new x(n,3));let d=new I({vertexColors:!0,transparent:!0,opacity:.45,depthWrite:!1});e.add(new f(u,d));let p=new w(3.8,3),m=new a({transparent:!0,depthWrite:!1,vertexShader:`varying vec2 screenUv;void main(){screenUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 screenUv;void main(){float r=length((screenUv-.5)*vec2(2.46,3.1));
      gl_FragColor=vec4(.012,.020,.024,.47*(1.-smoothstep(.10,1.,r)));}`}),h=new F(p,m);return h.rotation.x=-Math.PI/2,h.position.y=-1.109,h.renderOrder=1,e.add(h),{group:e,dispose(){u.dispose(),d.dispose(),p.dispose(),m.dispose(),e.removeFromParent()}}}async function _e(e,n,{allowSoftware:r=!1}={}){let a=new h({antialias:!0,alpha:!0,powerPreference:`high-performance`,preserveDrawingBuffer:!1});if(!r&&he(a.getContext()))return a.dispose(),a.forceContextLoss(),null;a.setClearColor(1054489,0),a.outputColorSpace=u,a.toneMapping=0,e.append(a.domElement);let o=!1,s=new i;s.fog=new b(1054489,.065);let c=ce(s),d=new l(29.2,1,.05,80),p=new m(28,84,4679017,2901318),g=ge();s.add(g.group),p.position.y=-1.115,p.material.transparent=!0,p.material.opacity=.6,p.material.depthWrite=!1,s.add(p);let v=new _().setFromPoints([new R(-14,-1.11,0),new R(14,-1.11,0),new R(0,-1.11,-14),new R(0,-1.11,14)]);v.setAttribute(`color`,new x([.34,.1,.1,.34,.1,.1,.12,.29,.12,.12,.29,.12],3));let y=new f(v,new I({vertexColors:!0,transparent:!0,opacity:.41}));s.add(y);let S=me();s.add(S),s.add(new L(15594228,6707278,1.12));let C=new k(16770764,2.08);C.position.set(-3.4,3.6,4),s.add(C);let w=new k(14151412,.69);w.position.set(2.9,.8,2.6),s.add(w);let T=new k(11913193,2.18);T.position.set(1.8,2.6,-2.7),s.add(T);let E=new k(10348243,1.1);E.position.set(-2,.7,-1),s.add(E);let D=J(),O,A;try{[O,A]=await Promise.all([ee({generateSamples:!1}),oe(D).catch(()=>null)])}catch(e){throw a.dispose(),a.domElement.remove(),e}s.add(O.group),A&&s.add(A.group);let j=le(a),M=re(O,j.texture,D),N=ae(O,D),P=pe(O,D);s.add(N.group,P.group);let F=0,z=1,B=``,V=``,H=()=>{let t=e.clientWidth,n=e.clientHeight;if(!t||!n)return;F=t;let r=Math.min(window.devicePixelRatio||1,2,3e3/t);a.setPixelRatio(r*z),a.setSize(t,n,!1),d.aspect=t/n,d.updateProjectionMatrix()},U=new ResizeObserver(H);U.observe(e),H();function W(e,t,n){let r=4.47/n;d.position.set(Math.sin(e)*Math.cos(t)*r,Math.sin(t)*r+.045,Math.cos(e)*Math.cos(t)*r),d.lookAt(.12,.005,0)}W(0,.045,1),await a.compileAsync(s,d).catch(()=>{});function G(e){e.preventDefault(),n?.()}return a.domElement.addEventListener(`webglcontextlost`,G),{stats:{...O.stats,points:A?.points??O.stats.points},render({mode:e,angle:n,pitch:r,zoom:i,state:l,time:u=0,transitionProgress:f=1}){if(o||!F)return;D.uScanCycle.value=u/q,D.uScanPower.value=l.landmarks?l.intensity/100:0,D.uScanEntry.value=t.clamp(f,0,1);let m=e;if(B!==e){let t=m===`topology`||m===`clay`?`topology`:m===`points`?`points`:`surface`;O.setMode(t,!0);for(let e of O.originalMaterials.keys()){let t=M.for(e,m);t&&(e.material=t)}B=e,V=``}W(n,r,i),S.rotation.y=n;let h=(e===`points`||e===`capture`)&&!!A;O.group.visible=!h,A&&(A.group.visible=h,h&&A.update(u,d,a.domElement.height,l,e===`capture`)),N.update(m,l),d.updateMatrixWorld(),P.update(m,D.uScanCycle.value,l,d);let _=D.uScanCycle.value*Math.PI*2;c.update(3.9*Math.sin(_)+.7*Math.sin(_*3),a.domElement.height,l.points),p.visible=y.visible=g.group.visible=l.grid,S.visible=l.cameras;let v=[e,l.surface,l.points,l.topology,l.hidden.has(`locs`),l.hidden.has(`eyes`),l.hidden.has(`head`),l.density,l.intensity].join(`/`);if(v!==V){for(let t of O.originalMaterials.keys()){let n=/eye|iris|cornea|sclera/i.test(t.name),r=/hair|loc|groom/i.test(t.name),i=/face|skin|head/i.test(t.name)&&!r;t.visible=l.surface&&(!n||!l.hidden.has(`eyes`))&&(!r||!l.hidden.has(`locs`))&&(!i||!l.hidden.has(`head`))&&(e===`surface`||t.name!==`Brows`),[`alloy`,`uv`,`motion`,`topology`,`clay`].includes(e)&&/hairline|fibers|veil|stubble/i.test(t.name)&&(t.visible=!1)}let t=O.group.getObjectByName(`Retopology cage`);t&&(t.visible=e===`topology`||l.topology,t.material.color.set(e===`topology`?11259579:10989736),t.material.opacity=(e===`topology`?.58:.28)+.4*l.intensity/100);let n=O.group.getObjectByName(`Scanner returns`);n&&(n.visible=[`surface`,`alloy`,`motion`,`uv`].includes(e)&&l.points);let r=O.group.getObjectByName(`Surface samples`);r&&(r.visible=l.points&&e===`points`,r.geometry.setDrawRange(0,Math.floor(O.stats.points*(.2+.8*l.density/100)))),V=v}a.render(s,d)},setQuality(e){e=Math.max(.5,Math.min(1,e)),e!==z&&(z=e,H())},diagnostics(){return{width:a.domElement.width,height:a.domElement.height,calls:a.info.render.calls,triangles:a.info.render.triangles,points:a.info.render.points,mode:B,scanPower:D.uScanPower.value,uvSeamEdges:N.seamEdges}},dispose(){o=!0,U.disconnect(),a.domElement.removeEventListener(`webglcontextlost`,G),p.geometry.dispose(),p.material.dispose(),y.geometry.dispose(),y.material.dispose(),S.geometry.dispose(),S.material.dispose(),g.dispose(),P.dispose(),N.dispose(),M.dispose(),O.dispose(),A?.dispose(),c.dispose(),j.dispose(),a.dispose(),a.domElement.remove()}}}export{_e as createWorld};