import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const assetRoot = `${import.meta.env.BASE_URL}subject/`;
const modes = new Set(["surface", "topology", "points"]);
const fineFiberLayers = new Set(["Brows", "Hair_fibers", "Hair_curl_veil"]);
const sampleDensities = { Face: 3400, Eyes: 1800 };

function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function createPoints(meshes) {
  const rng = randomSequence(72913);
  const samples = [];
  const tints = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const sideAB = new THREE.Vector3(),
    sideAC = new THREE.Vector3(),
    normal = new THREE.Vector3();

  for (const mesh of meshes) {
    const index = mesh.geometry.index;
    const pos = mesh.geometry.getAttribute("position");
    if (
      !index ||
      [
        "Brows",
        "Hairline",
        "Hair_fibers",
        "Hair_curl_veil",
        "Underside",
      ].includes(mesh.name)
    )
      continue;

    const tris = index.count / 3;
    const density = sampleDensities[mesh.name] ?? 1200;
    for (let i = 0; i < tris; i++) {
      a.fromBufferAttribute(pos, index.getX(i * 3)).applyMatrix4(
        mesh.matrixWorld,
      );
      b.fromBufferAttribute(pos, index.getX(i * 3 + 1)).applyMatrix4(
        mesh.matrixWorld,
      );
      c.fromBufferAttribute(pos, index.getX(i * 3 + 2)).applyMatrix4(
        mesh.matrixWorld,
      );
      sideAB.subVectors(b, a);
      sideAC.subVectors(c, a);
      normal.crossVectors(sideAB, sideAC);
      const expected = normal.length() * 0.5 * density;
      normal.normalize();
      const count = Math.floor(expected + rng());
      for (let n = 0; n < count; n++) {
        const r = Math.sqrt(rng()),
          s = rng();
        const u = 1 - r,
          v = r * (1 - s),
          w = r * s;
        samples.push(
          a.x * u + b.x * v + c.x * w + normal.x * 0.0009,
          a.y * u + b.y * v + c.y * w + normal.y * 0.0009,
          a.z * u + b.z * v + c.z * w + normal.z * 0.0009,
        );
        const tone = 0.4 + rng() * 0.47;
        const warm = rng() > 0.96;
        tints.push(
          tone * (warm ? 1 : 0.46),
          tone * (warm ? 0.62 : 0.97),
          tone * (warm ? 0.3 : 0.88),
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(samples, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(tints, 3));
  const material = new THREE.PointsMaterial({
    vertexColors: true,
    size: 0.007,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Surface samples";
  points.renderOrder = 3;
  return points;
}

export async function createSubject({ generateSamples = true } = {}) {
  const [gltf, cageResponse] = await Promise.all([
    new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(`${assetRoot}performer.glb`),
    fetch(`${assetRoot}cage.bin`),
  ]);
  if (!cageResponse.ok)
    throw new Error(`Scan cage could not load (${cageResponse.status}).`);
  const cageData = new Int16Array(await cageResponse.arrayBuffer());
  const cageGeometry = new THREE.BufferGeometry();
  cageGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      Float32Array.from(cageData, (v) => v / 16000),
      3,
    ),
  );
  const cageMaterial = new THREE.LineBasicMaterial({
    color: 0xa7b0a8,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const wire = new THREE.LineSegments(cageGeometry, cageMaterial);
  wire.name = "Retopology cage";
  wire.renderOrder = 2;

  const group = new THREE.Group();
  group.name = "Digital performer";
  group.add(gltf.scene, wire);
  const markerPositions = [],
    markerColors = [];
  const warm = new THREE.Color(0xc78950),
    cool = new THREE.Color(0x86b8ac),
    neutral = new THREE.Color(0xb5bcba);
  for (let i = 0, k = 0; i + 2 < cageData.length; i += 57, k++) {
    const x = cageData[i] / 16000,
      y = cageData[i + 1] / 16000,
      z = cageData[i + 2] / 16000;
    const face = Math.abs(x) < 0.36 && y > -0.33 && y < 0.77 && z > 0.29;
    if (face && k % 7 !== 0) continue;
    markerPositions.push(x, y, z);
    const ink = k % 29 === 0 ? warm : k % 3 === 0 ? neutral : cool;
    markerColors.push(ink.r, ink.g, ink.b);
  }
  const markerGeometry = new THREE.BufferGeometry();
  markerGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(markerPositions, 3),
  );
  markerGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(markerColors, 3),
  );
  const markerMaterial = new THREE.PointsMaterial({
    size: 0.005,
    vertexColors: true,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
  });
  const markers = new THREE.Points(markerGeometry, markerMaterial);
  markers.name = "Scanner returns";
  markers.renderOrder = 3;
  group.add(markers);
  const surfaces = [];
  const materials = new Map();
  let vertices = 0,
    triangles = 0;
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    surfaces.push(object);
    materials.set(object, object.material);
    vertices += object.geometry.attributes.position.count;
    triangles +=
      (object.geometry.index?.count ??
        object.geometry.attributes.position.count) / 3;
  });
  gltf.scene.updateMatrixWorld(true);
  const points = createPoints(generateSamples ? surfaces : []);
  group.add(points);
  const clay = new THREE.MeshStandardMaterial({
    color: 0x47524e,
    roughness: 0.88,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const shadow = new THREE.MeshBasicMaterial({
    color: 0x151c1b,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });

  const hiddenFiberMaterial = new THREE.MeshBasicMaterial({ visible: false });
  let currentMode = "";
  function setMode(mode, restore = false) {
    if (!modes.has(mode) || (!restore && mode === currentMode)) return;
    currentMode = mode;
    wire.visible = mode === "topology";
    points.visible = mode === "points";
    markers.visible = mode === "surface";
    for (const mesh of surfaces) {
      mesh.visible = mode === "surface" || !fineFiberLayers.has(mesh.name);
      if (mode === "surface") {
        mesh.material = materials.get(mesh);
      } else if (fineFiberLayers.has(mesh.name)) {
        mesh.material = hiddenFiberMaterial;
      } else {
        mesh.material = mode === "topology" ? clay : shadow;
      }
    }
  }
  setMode("surface");

  function dispose() {
    const geometries = new Set([
      points.geometry,
      markerGeometry,
      cageGeometry,
      ...surfaces.map((s) => s.geometry),
    ]);
    const allMaterials = new Set([
      clay,
      shadow,
      markerMaterial,
      hiddenFiberMaterial,
      cageMaterial,
      points.material,
      ...materials.values(),
    ]);
    const textures = new Set();
    for (const material of allMaterials) {
      for (const item of Object.values(material))
        if (item?.isTexture) textures.add(item);
      material.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) {
      texture.source?.data?.close?.();
      texture.dispose();
    }
    group.removeFromParent();
  }

  return {
    group,
    originalMaterials: materials,
    setMode,
    dispose,
    stats: {
      vertices,
      triangles,
      points: points.geometry.attributes.position.count,
      edges: cageData.length / 6,
      bounds: new THREE.Box3().setFromObject(gltf.scene),
      parts: surfaces.map((mesh) => ({
        name: mesh.name,
        triangles:
          (mesh.geometry.index?.count ??
            mesh.geometry.attributes.position.count) / 3,
      })),
    },
  };
}
