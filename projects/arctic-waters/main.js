// Arctic Waters: a calm polar sea at low sun, with procedural icebergs,
// drifting ice floes, light snowfall and a physically based sky.
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";
import { createScene } from "../../src/setup.js";
import { createNoise3D, fbm } from "../../src/noise.js";

const { THREE, renderer, scene, camera, controls, animate } = createScene({
  fov: 50,
  position: [-38, 9, 58],
  far: 20000,
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
controls.target.set(0, 4, 0);
controls.maxPolarAngle = Math.PI * 0.495; // stay above the water
controls.minDistance = 10;
controls.maxDistance = 400;

const settings = {
  elevation: 4, // sun height above the horizon, degrees
  azimuth: 200,
  exposure: 0.55,
  waterColor: "#0b2f3a",
  distortion: 2.2,
  fog: 0.0012,
  snow: true,
};

// --- Sky and sun -------------------------------------------------------------
const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
sky.material.uniforms.turbidity.value = 6;
sky.material.uniforms.rayleigh.value = 1.6;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.85;

const sun = new THREE.Vector3();
const sunLight = new THREE.DirectionalLight(0xffd9b0, 2.2);
scene.add(sunLight);
scene.add(new THREE.HemisphereLight(0xbcd7ff, 0x0d2a36, 0.7));
scene.fog = new THREE.FogExp2(0xc4cbd2, settings.fog);

// --- Water -------------------------------------------------------------------
const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
  textureWidth: 512,
  textureHeight: 512,
  waterNormals: createWaterNormals(256),
  sunDirection: new THREE.Vector3(),
  sunColor: 0xffe2c0,
  waterColor: new THREE.Color(settings.waterColor),
  distortionScale: settings.distortion,
  fog: true,
});
water.rotation.x = -Math.PI / 2;
water.material.uniforms.size.value = 6;
scene.add(water);

/**
 * Tileable normal map built from a sum of sine waves with integer frequencies
 * (so it repeats seamlessly), avoiding the need for an external texture file.
 */
function createWaterNormals(size) {
  const waves = Array.from({ length: 24 }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const f = 2 + Math.floor(Math.random() * (6 + i));
    return {
      fx: Math.round(Math.cos(angle) * f),
      fy: Math.round(Math.sin(angle) * f),
      amp: 1 / (f * 0.6),
      phase: Math.random() * Math.PI * 2,
    };
  });
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const a = ((w.fx * x + w.fy * y) / size) * Math.PI * 2 + w.phase;
        const c = Math.cos(a) * w.amp;
        dx += c * w.fx;
        dy += c * w.fy;
      }
      const n = new THREE.Vector3(-dx * 0.08, -dy * 0.08, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// --- Icebergs ----------------------------------------------------------------
const iceMaterial = new THREE.MeshStandardMaterial({
  color: 0xeaf6ff,
  emissive: 0x2a6a8a,
  emissiveIntensity: 0.12,
  roughness: 0.55,
  metalness: 0,
  flatShading: true,
});

/**
 * A berg is a displaced icosphere: stretched, noise-eroded, with the top
 * optionally sheared flat (tabular berg) and most of its mass under water.
 */
function createIceberg({ seed, radius, height, tabular }) {
  const noise = createNoise3D(seed);
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + 0.35 * fbm(noise, v.x * 1.3, v.y * 1.3, v.z * 1.3, 4) + 0.12 * noise(v.x * 6, v.y * 6, v.z * 6);
    v.multiplyScalar(d);
    v.x *= radius;
    v.z *= radius * (0.7 + 0.3 * Math.abs(noise(seed, 0.5, 0.5)));
    v.y = v.y * height;
    if (tabular && v.y > height * 0.55) v.y = height * 0.55 + (v.y - height * 0.55) * 0.08;
    v.y -= height * 0.35; // sink: roughly a third stays above the waterline
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, iceMaterial);
}

const bergs = [
  { seed: 3, radius: 14, height: 16, tabular: true, x: 6, z: -10, rot: 0.4 },
  { seed: 11, radius: 6, height: 12, tabular: false, x: -26, z: 8, rot: 1.2 },
  { seed: 7, radius: 9, height: 9, tabular: true, x: 40, z: 22, rot: 2.1 },
  { seed: 19, radius: 4, height: 7, tabular: false, x: -12, z: 30, rot: 0.2 },
  { seed: 23, radius: 22, height: 20, tabular: true, x: -70, z: -110, rot: 0.9 },
  { seed: 29, radius: 16, height: 26, tabular: false, x: 110, z: -160, rot: 1.7 },
  { seed: 31, radius: 30, height: 18, tabular: true, x: -200, z: -260, rot: 2.6 },
].map((b) => {
  const mesh = createIceberg(b);
  mesh.position.set(b.x, 0, b.z);
  mesh.rotation.y = b.rot;
  scene.add(mesh);
  return { mesh, phase: b.seed };
});

// --- Ice floes (instanced flat chunks) ---------------------------------------
const floeGeo = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 0.35, 11, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const r = 0.7 + 0.22 * Math.sin(a * 3 + 1) * Math.cos(a * 2) + 0.12 * Math.sin(a * 7);
    if (Math.hypot(p.getX(i), p.getZ(i)) > 0.01) p.setXYZ(i, Math.cos(a) * r, p.getY(i), Math.sin(a) * r);
  }
  g.computeVertexNormals();
  return g;
})();
const FLOES = 260;
const floes = new THREE.InstancedMesh(floeGeo, iceMaterial, FLOES);
const floeData = [];
const m = new THREE.Matrix4();
for (let i = 0; i < FLOES; i++) {
  const r = 18 + Math.random() ** 0.7 * 160;
  const a = Math.random() * Math.PI * 2;
  floeData.push({
    x: Math.cos(a) * r,
    z: Math.sin(a) * r,
    s: 0.4 + Math.random() ** 2 * 3.2,
    rot: Math.random() * Math.PI * 2,
    phase: Math.random() * 10,
  });
}
scene.add(floes);

function updateFloes(t) {
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  floeData.forEach((f, i) => {
    e.set(Math.sin(t * 0.7 + f.phase) * 0.04, f.rot + t * 0.01, Math.cos(t * 0.6 + f.phase) * 0.04);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(f.x + Math.sin(t * 0.05 + f.phase) * 0.6, 0.02 + Math.sin(t * 0.9 + f.phase) * 0.05, f.z),
      q,
      new THREE.Vector3(f.s, 1, f.s * (0.6 + 0.4 * Math.sin(f.phase))),
    );
    floes.setMatrixAt(i, m);
  });
  floes.instanceMatrix.needsUpdate = true;
}

// --- Snow --------------------------------------------------------------------
const SNOW = 4000;
const snowPositions = new Float32Array(SNOW * 3);
for (let i = 0; i < SNOW; i++) {
  snowPositions.set([(Math.random() - 0.5) * 200, Math.random() * 60, (Math.random() - 0.5) * 200], i * 3);
}
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
const snow = new THREE.Points(
  snowGeo,
  new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.8, depthWrite: false }),
);
scene.add(snow);

function updateSnow(dt) {
  const p = snowGeo.attributes.position;
  for (let i = 0; i < SNOW; i++) {
    let y = p.getY(i) - dt * (1.5 + (i % 7) * 0.2);
    if (y < 0) y += 60;
    p.setY(i, y);
    p.setX(i, p.getX(i) + Math.sin(y * 0.3 + i) * dt * 0.3);
  }
  p.needsUpdate = true;
  // Keep the snow volume around the camera.
  snow.position.set(camera.position.x, 0, camera.position.z);
}

// --- Sun position, environment lighting --------------------------------------
const pmrem = new THREE.PMREMGenerator(renderer);
const skyScene = new THREE.Scene();
let envTarget;

function updateSun() {
  const phi = THREE.MathUtils.degToRad(90 - settings.elevation);
  const theta = THREE.MathUtils.degToRad(settings.azimuth);
  sun.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms.sunPosition.value.copy(sun);
  water.material.uniforms.sunDirection.value.copy(sun).normalize();
  sunLight.position.copy(sun).multiplyScalar(100);

  // Reflections and ambient light come from the sky itself.
  envTarget?.dispose();
  skyScene.add(sky);
  envTarget = pmrem.fromScene(skyScene);
  scene.add(sky);
  scene.environment = envTarget.texture;
}
updateSun();

// --- Controls ----------------------------------------------------------------
const gui = new GUI({ title: "Arctic Waters" });
gui.add(settings, "elevation", -2, 30, 0.1).name("sun elevation").onChange(updateSun);
gui.add(settings, "azimuth", 0, 360, 1).name("sun azimuth").onChange(updateSun);
gui.add(settings, "exposure", 0.1, 1.5, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
gui.addColor(settings, "waterColor").name("water colour").onChange((v) => water.material.uniforms.waterColor.value.set(v));
gui.add(settings, "distortion", 0, 8, 0.1).onChange((v) => (water.material.uniforms.distortionScale.value = v));
gui.add(settings, "fog", 0, 0.01, 0.0001).onChange((v) => (scene.fog.density = v));
gui.add(settings, "snow").onChange((v) => (snow.visible = v));
if (window.innerWidth < 700) gui.close();

// --- Loop --------------------------------------------------------------------
animate((t, dt) => {
  water.material.uniforms.time.value = t * 0.35;
  bergs.forEach(({ mesh, phase }) => {
    mesh.position.y = Math.sin(t * 0.4 + phase) * 0.12;
    mesh.rotation.z = Math.sin(t * 0.3 + phase) * 0.006;
  });
  updateFloes(t);
  if (snow.visible) updateSnow(Math.min(dt, 0.05));
});
