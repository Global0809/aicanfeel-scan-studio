import * as THREE from "three";

function random(seed) {
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}

export function captureAtmosphere(scene) {
  // Out-of-focus survey returns run close to the floor and beyond the silhouette.
  const rng=random(851),positions=[],values=[];
  for(let i=0;i<1300;i++){
    const theta=rng()*Math.PI*2,rad=1.2+rng()**1.3*2.8;
    const floor=rng()<.77;
    positions.push(Math.cos(theta)*rad,floor?-1.09+rng()**2*.39:-.94+rng()*2.12,Math.sin(theta)*rad);
    values.push(rng());
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));g.setAttribute("weight",new THREE.Float32BufferAttribute(values,1));
  const mat=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{clock:{value:0},pixels:{value:1}},
    vertexShader:[
      "attribute float weight;uniform float clock,pixels;varying float w;varying float vLife;",
      "void main(){w=weight;vec3 p=position;",
      "p.y+=.027*sin(clock*.91+weight*97.0);p.x+=.033*sin(clock*.43+weight*210.0);",
      "vec4 v=modelViewMatrix*vec4(p,1);gl_Position=projectionMatrix*v;",
      "gl_PointSize=clamp(pixels*(.8+weight*weight*2.6)*3.7/max(1.0,-v.z),.7,8.0);",
      "vLife=.19+.42*pow(.5+.5*sin(clock*2.0+weight*156.0),4.0);}"
    ].join("\n"),
    fragmentShader:[
      "varying float w;varying float vLife;",
      "void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;",
      "vec3 c=mix(vec3(.20,.38,.36),vec3(.55,.48,.19),smoothstep(.57,.72,w));",
      "c=mix(c,vec3(.45,.42,.67),smoothstep(.82,.98,w));gl_FragColor=vec4(c,vLife*(1.-r*r));",
      "#include <colorspace_fragment>","}"
    ].join("\n")
  });
  const dust=new THREE.Points(g,mat);dust.frustumCulled=false;scene.add(dust);
  return {
    update(t,height,show){dust.visible=show;mat.uniforms.clock.value=t;mat.uniforms.pixels.value=height/853;},
    dispose(){g.dispose();mat.dispose();dust.removeFromParent();}
  };
}

export function studioEnvironment(renderer) {
  // Equirectangular area lights for a high-contrast spectral material preview. No external HDRI.
  const c=document.createElement("canvas");c.width=768;c.height=384;
  const ctx=c.getContext("2d");
  ctx.fillStyle="#111719";ctx.fillRect(0,0,c.width,c.height);
  function strip(x,y,w,h,stops) {
    const grad=ctx.createLinearGradient(x,y,x+w,y+h);
    for(const [p,col] of stops)grad.addColorStop(p,col);
    ctx.fillStyle=grad;ctx.fillRect(x,y,w,h);
  }
  strip(44,37,91,195,[[0,"#e6fff6"],[.27,"#c4dedc"],[1,"#2d7775"]]);
  strip(200,28,20,180,[[0,"#b5f9ff"],[1,"#5368bb"]]);
  strip(303,62,93,13,[[0,"#7e8cff"],[.4,"#fff7fa"],[1,"#bed1f6"]]);
  strip(443,45,45,150,[[0,"#e4f4d6"],[1,"#bc96ba"]]);
  strip(552,56,67,96,[[0,"#889bd7"],[.58,"#f8d8ef"],[1,"#9365ad"]]);
  strip(620,110,104,18,[[0,"#8d6152"],[1,"#f3dab0"]]);
  strip(0,262,768,27,[[0,"#182629"],[.5,"#28323b"],[1,"#1b2726"]]);
  const tex=new THREE.CanvasTexture(c);tex.mapping=THREE.EquirectangularReflectionMapping;tex.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromEquirectangular(tex);tex.dispose();pmrem.dispose();
  return env;
}

