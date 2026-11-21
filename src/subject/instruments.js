import * as THREE from "three";

const TURN=Math.PI*2;
const yAxis=new THREE.Vector3(0,1,0);

function surveyAnchors(cage) {
  const contour=Array.from({length:96},()=>({score:-Infinity,p:null}));
  const field=Array.from({length:14*10},()=>({score:-Infinity,p:null}));
  const p=new THREE.Vector3();
  for(let i=0;i<cage.count;i+=2) {
    p.fromBufferAttribute(cage,i);
    const radius=Math.hypot(p.x,p.z);
    if(radius<.20)continue;
    const azimuth=(Math.atan2(p.x,p.z)+TURN)%TURN;
    const slot=Math.min(95,Math.floor(azimuth/TURN*96));
    const targetY=.32+.19*Math.sin(2*azimuth+.27);
    const score=radius-7.8*Math.abs(targetY-p.y);
    if(score>contour[slot].score)contour[slot]={score,p:p.clone()};
    const row=Math.max(0,Math.min(9,Math.floor((p.y+1.03)/2.13*10)));
    const col=Math.min(13,Math.floor(azimuth/TURN*14));
    const bin=field[row*14+col];
    if(radius>bin.score){bin.score=radius;bin.p=p.clone();}
  }
  return {
    path:new THREE.CatmullRomCurve3(contour.flatMap(o=>o.p?[o.p]:[]),true,"centripetal"),
    samples:field.flatMap(o=>o.p?[o.p]:[]),
  };
}

// Physical trajectories of sampled vertices at prior angles of the rigid-body turntable.
function makeTrajectories(samples,clock) {
  const positions=[],ages=[],groups=[],velocity=[];
  const p=new THREE.Vector3(),q=new THREE.Vector3(),tail=new THREE.Vector3();
  const add=(v,dy,age,seed,speed)=>{
    positions.push(v.x,v.y+dy,v.z);ages.push(age);groups.push(seed);velocity.push(speed);
  };
  for(let i=0;i<samples.length;i++){
    const source=samples[i],rad=Math.hypot(source.x,source.z);
    const seed=(i*.6180339887)%1, duration=.25+.36*seed;
    const lift=.010, width=.0035+.0029*Math.min(rad,1.0);
    for(let j=0;j<7;j++) {
      const a=j/7,b=(j+1)/7;
      p.copy(source).applyAxisAngle(yAxis,-duration*(1-a));q.copy(source).applyAxisAngle(yAxis,-duration*(1-b));
      p.x*=1+lift;p.z*=1+lift;q.x*=1+lift;q.z*=1+lift;
      add(p,-width,a,seed,rad);add(p,width,a,seed,rad);add(q,width,b,seed,rad);
      add(p,-width,a,seed,rad);add(q,width,b,seed,rad);add(q,-width,b,seed,rad);
    }
    tail.copy(source).applyAxisAngle(yAxis,-.059);
    add(tail,-width*3.1,.94,seed,rad);add(tail,width*3.1,.94,seed,rad);add(q,0,1,seed,rad);
  }
  const g=new THREE.BufferGeometry();
  for(const [name,list,size] of [["position",positions,3],["sampleAge",ages,1],["samplePhase",groups,1],["radius",velocity,1]])
    g.setAttribute(name,new THREE.Float32BufferAttribute(list,size));
  const m=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,uniforms:clock,
    vertexShader:`attribute float sampleAge,samplePhase,radius;varying vec3 data;
      void main(){data=vec3(sampleAge,samplePhase,radius);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float uScanCycle,uScanPower;varying vec3 data;
      void main(){float travel=fract(uScanCycle*7.+data.y);
      float pulse=1.-smoothstep(.03,.25,abs(data.x-travel));
      vec3 c=mix(vec3(.13,.64,.82),vec3(1.,.35,.065),smoothstep(.42,.86,data.z));
      gl_FragColor=vec4(c*(.71+.83*pulse),(.39+.39*data.x+.31*pulse)*(.50+.50*uScanPower));
      #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(g,m);mesh.name="Rigid turntable displacement vectors";mesh.renderOrder=4;
  return mesh;
}

function makePoseGhosts(subject) {
  const groups=[];
  for(const [colour,offset,gain] of [[0xee9e67,-.42,.81],[0x71cae2,-.82,.59]]){
    const mat=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,uniforms:{colour:{value:new THREE.Color(colour)},gain:{value:gain}},
      vertexShader:`varying vec3 viewNormal,viewDirection;varying float h;
        void main(){vec4 v=modelViewMatrix*vec4(position,1.);viewNormal=normalMatrix*normal;viewDirection=-v.xyz;
        h=(modelMatrix*vec4(position,1.)).y;gl_Position=projectionMatrix*v;}`,
      fragmentShader:`uniform vec3 colour;uniform float gain;varying vec3 viewNormal,viewDirection;varying float h;
        void main(){float edge=pow(1.-max(0.,dot(normalize(viewNormal),normalize(viewDirection))),2.9);
        float contour=1.-smoothstep(.018,.075,abs(fract(h*12.+.5)-.5));
        gl_FragColor=vec4(colour,(.095+edge*.86+contour*.27)*gain);
        #include <colorspace_fragment>
        }`
    });
    const ghost=new THREE.Group();
    for(const [original] of subject.originalMaterials){
      if(!["Face","Crewneck","Locs"].includes(original.name))continue;
      const shell=new THREE.Mesh(original.geometry,mat);
      shell.matrix.copy(original.matrixWorld);shell.matrixAutoUpdate=false;shell.renderOrder=2;
      ghost.add(shell);
    }
    ghost.rotation.y=offset;groups.push({ghost,mat});
  }
  return groups;
}

export function createSurveyInstruments(subject,clock) {
  const group=new THREE.Group();
  const cage=subject.group.getObjectByName("Retopology cage").geometry.attributes.position;
  const {path,samples}=surveyAnchors(cage);
  const traces=makeTrajectories(samples,clock),ghosts=makePoseGhosts(subject);
  const optical=new THREE.Group();
  const housing=new THREE.MeshStandardMaterial({color:0x9ca9a7,metalness:.67,roughness:.37});
  const shaft=new THREE.CylinderGeometry(.029,.034,.035,12), dot=new THREE.SphereGeometry(1,8,6);
  const body=new THREE.BoxGeometry(.099,.040,.058),indicator=new THREE.CylinderGeometry(.031,.031,.009,16);
  const mount=new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-.064,.012,0),new THREE.Vector3(-.064,-.042,0),
    new THREE.Vector3(-.064,-.042,0),new THREE.Vector3(.064,-.042,0),
    new THREE.Vector3(.064,-.042,0),new THREE.Vector3(.064,.012,0),
    new THREE.Vector3(0,-.042,0),new THREE.Vector3(0,-.100,0),
  ]);
  const mountInk=new THREE.LineBasicMaterial({color:0xa0b4b3,transparent:true,opacity:.76});
  const contactRing=new THREE.RingGeometry(.024,.029,24);
  const point=new THREE.Vector3(), source=new THREE.Vector3(), direction=new THREE.Vector3();
  const viewDirection=new THREE.Vector3(),right=new THREE.Vector3(),forward=new THREE.Vector3(0,0,1);
  const sensorComponents=[0x8ce8d6,0xffb36c].map(color=>{
    const light=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide});
    const ship=new THREE.Group(),pod=new THREE.Mesh(body,housing),port=new THREE.Mesh(shaft,housing);
    const lens=new THREE.Mesh(dot,light),ring=new THREE.Mesh(indicator,light),yoke=new THREE.LineSegments(mount,mountInk);
    port.position.y=.030;ring.position.y=.037;
    lens.scale.set(.018,.005,.018);lens.position.y=.050;ship.add(pod,port,ring,lens,yoke);optical.add(ship);
    const contact=new THREE.Mesh(dot,light);contact.scale.setScalar(.014);
    const halo=new THREE.Mesh(contactRing,light);optical.add(contact,halo);
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(new Float32Array(6),3).setUsage(THREE.DynamicDrawUsage));
    const beam=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:.72,depthWrite:false}));
    beam.frustumCulled=false;beam.renderOrder=5;optical.add(beam);
    return {ship,contact,halo,beam,light};
  });
  group.add(traces,optical,...ghosts.map(item=>item.ghost));group.visible=false;
  return {
    group,
    update(mode,cycle,state,camera) {
      const motion=mode==="motion"&&state.reprojection&&state.surface;
      const scanning=(mode==="capture"||mode==="points")&&state.cameras&&state.landmarks;
      group.visible=motion||scanning;
      traces.visible=motion;optical.visible=scanning;
      if(motion){
        // Explode the two historic orientations along the inspection baseline, behind the live mesh.
        right.setFromMatrixColumn(camera.matrixWorld,0).normalize();
        viewDirection.copy(camera.position).normalize();
      }
      ghosts.forEach(({ghost},i)=>{
        ghost.visible=motion&&!state.hidden.has("head");
        if(ghost.visible)ghost.position.copy(right).multiplyScalar(-(.27+.29*i))
          .addScaledVector(viewDirection,-(.42+.22*i));
      });
      if(!scanning)return;
      sensorComponents.forEach(({ship,contact,halo,beam},i)=>{
        const phase=((cycle*2+i*.5)%1+1)%1;
        path.getPointAt(phase,point);
        const az=Math.atan2(point.x,point.z)+(.20*Math.sin(phase*TURN+i));
        source.set(point.x+.52*Math.sin(az),point.y+.18+.06*Math.sin(phase*TURN*2),point.z+.52*Math.cos(az));
        direction.subVectors(point,source).normalize();
        ship.position.copy(source);ship.quaternion.setFromUnitVectors(yAxis,direction);contact.position.copy(point);
        halo.position.copy(point).addScaledVector(direction,-.004);halo.quaternion.setFromUnitVectors(forward,direction);
        const a=beam.geometry.attributes.position;
        a.setXYZ(0,source.x,source.y,source.z);a.setXYZ(1,point.x,point.y,point.z);a.needsUpdate=true;
      });
    },
    dispose(){
      group.removeFromParent();traces.geometry.dispose();traces.material.dispose();
      ghosts.forEach(item=>item.mat.dispose());housing.dispose();shaft.dispose();body.dispose();indicator.dispose();mount.dispose();mountInk.dispose();dot.dispose();contactRing.dispose();
      for(const {beam,light} of sensorComponents){beam.geometry.dispose();beam.material.dispose();light.dispose();}
    },
  };
}
