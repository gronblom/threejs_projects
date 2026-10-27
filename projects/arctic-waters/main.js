// Arctic Waters: a lone boat on a mirror-calm sea under a moonlit storm.
// Recreation of a scene shared on r/threejs ("Arctic waters in three.js").
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Water } from "three/addons/objects/Water.js";
import { StormSky } from "./sky.js";
import { createBoat } from "./boat.js";

// ?quality=low lowers the sky and reflection resolution for weak GPUs.
const LOW = new URLSearchParams(location.search).get("quality") === "low";

// --- Renderer, camera ----------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(LOW ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.domElement.classList.add("scene");
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 5;
controls.maxDistance = 120;

const settings = {
  moonElevation: 18,
  moonAzimuth: 0,
  coverage: 0.68,
  mist: 1.0,
  ripples: 0.35,
  exposure: 0.8,
  spotlight: true,
  fov: 45,
  autoOrbit: false,
  orbitSpeed: 0.4,
  cruise: true,
  seed: 3,
};

// --- Sky -------------------------------------------------------------------------
const sky = new StormSky(renderer, { size: LOW ? 512 : 1024 });
scene.background = sky.texture;
scene.fog = new THREE.FogExp2(0x9aa7b6, 0.0035);

const moonLight = new THREE.DirectionalLight(0xdfe7f2, 1.2);
scene.add(moonLight, moonLight.target);

function moonDirection() {
  const phi = THREE.MathUtils.degToRad(90 - settings.moonElevation);
  const theta = THREE.MathUtils.degToRad(settings.moonAzimuth);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

function renderSky() {
  const dir = moonDirection();
  sky.uniforms.uCoverage.value = settings.coverage;
  sky.uniforms.uMoonDir.value.copy(dir);
  sky.uniforms.uMist.value = settings.mist;
  sky.uniforms.uSeed.value = settings.seed;
  scene.environment = sky.update();
  scene.environmentIntensity = 0.9;
  water.material.uniforms.sunDirection.value.copy(dir);
  moonLight.position.copy(dir).multiplyScalar(100);
  scene.fog.density = 0.0035 * settings.mist;
}

// --- Water -----------------------------------------------------------------------
/**
 * Tileable ripple normal map from sine waves with integer frequencies, so the
 * scene needs no texture files.
 */
function createWaterNormals(size = 256) {
  const waves = Array.from({ length: 28 }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const f = 2 + Math.floor(Math.random() * (6 + i));
    return { fx: Math.round(Math.cos(angle) * f), fy: Math.round(Math.sin(angle) * f), amp: 1 / (f * 0.6), phase: Math.random() * Math.PI * 2 };
  });
  const data = new Uint8Array(size * size * 4);
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const c = Math.cos(((w.fx * x + w.fy * y) / size) * Math.PI * 2 + w.phase) * w.amp;
        dx += c * w.fx;
        dy += c * w.fy;
      }
      n.set(-dx * 0.06, -dy * 0.06, 1).normalize();
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
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const water = new Water(new THREE.PlaneGeometry(6000, 6000), {
  textureWidth: LOW ? 256 : 1024,
  textureHeight: LOW ? 256 : 1024,
  waterNormals: createWaterNormals(),
  sunDirection: new THREE.Vector3(),
  sunColor: 0xf2f6ff,
  waterColor: 0x05080d,
  distortionScale: settings.ripples,
  fog: true,
});
water.rotation.x = -Math.PI / 2;
// Calm water: reflect more than three's default (rf0 = 0.02) at steep angles.
water.material.fragmentShader = water.material.fragmentShader.replace("float rf0 = 0.02;", "float rf0 = 0.22;");
water.material.uniforms.size.value = 0.8;
scene.add(water);

// --- Boat and wake ---------------------------------------------------------------
const boat = createBoat();
scene.add(boat);

const wake = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 60, 1, 1).rotateX(-Math.PI / 2).translate(0, 0.03, -30 - 4),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uStrength;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float d = vUv.y;                     // 0 at the stern, 1 far behind
        float x = (vUv.x - 0.5) * 2.0;       // -1..1 across
        float spread = 0.12 + d * 0.85;      // V opens behind the boat
        float arms = exp(-pow((abs(x) - spread) / (0.03 + d * 0.05), 2.0));
        float prop = exp(-pow(x / (0.08 + d * 0.25), 2.0)) * (1.0 - d);
        float n = noise(vec2(x * 18.0, d * 60.0 - uTime * 1.5));
        float a = (arms * 0.6 + prop * 0.9) * (0.5 + 0.5 * n) * pow(1.0 - d, 1.6);
        gl_FragColor = vec4(vec3(0.75, 0.8, 0.86) * a * 0.35 * uStrength, 1.0);
      }
    `,
  }),
);
boat.add(wake);

// The boat runs a slow, wide circle.
const path = { radius: 90, speed: 2.2, angle: 0, heading: 0 };
const boatPos = new THREE.Vector3();
const lastBoatPos = new THREE.Vector3();

function placeBoat(t, dt) {
  if (settings.cruise) path.angle += (path.speed / path.radius) * dt;
  boatPos.set(Math.cos(path.angle) * path.radius, 0, Math.sin(path.angle) * path.radius);
  path.heading = -path.angle; // tangent direction for counter-clockwise travel
  boat.position.set(boatPos.x, Math.sin(t * 0.9) * 0.04 - 0.02, boatPos.z);
  boat.rotation.set(Math.sin(t * 0.7) * 0.012, path.heading, Math.sin(t * 0.55 + 1) * 0.02);
  wake.material.uniforms.uTime.value = t;
  wake.material.uniforms.uStrength.value = THREE.MathUtils.lerp(wake.material.uniforms.uStrength.value, settings.cruise ? 1 : 0, dt);
}

// --- Views -----------------------------------------------------------------------
// Camera offsets in the boat's frame (x: starboard, y: up, z: forward).
const VIEWS = {
  Horizon: new THREE.Vector3(10, 2.2, 26),
  Stern: new THREE.Vector3(4, 5, -13),
  Aerial: new THREE.Vector3(2, 34, -10),
  Broadside: new THREE.Vector3(-22, 3, 2),
  "Low water": new THREE.Vector3(6, 0.6, 12),
  Wide: new THREE.Vector3(-34, 9, 48),
};
let transition = null;

function boatToWorld(offset) {
  return offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), path.heading);
}

function goToView(name) {
  transition = {
    from: camera.position.clone().sub(boatPos),
    to: boatToWorld(VIEWS[name]),
    t: 0,
  };
  document.querySelectorAll("#view-buttons button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === name)));
}

function updateCamera(dt) {
  // Carry the camera along with the boat so the framing holds.
  camera.position.add(boatPos.clone().sub(lastBoatPos));
  if (transition) {
    transition.t = Math.min(1, transition.t + dt / 2.2);
    const e = transition.t < 0.5 ? 4 * transition.t ** 3 : 1 - (-2 * transition.t + 2) ** 3 / 2;
    camera.position.copy(boatPos).add(transition.from.clone().lerp(transition.to, e));
    if (transition.t >= 1) transition = null;
  }
  controls.target.copy(boatPos).add(new THREE.Vector3(0, 1.4, 0));
  controls.autoRotate = settings.autoOrbit && !transition;
  controls.autoRotateSpeed = settings.orbitSpeed;
  lastBoatPos.copy(boatPos);
}

// --- UI --------------------------------------------------------------------------
function slider(container, { key, label, min, max, step, format = (v) => v, onInput, onChange }) {
  const id = `ctl-${key}`;
  const row = document.createElement("label");
  row.className = "row";
  row.htmlFor = id;
  row.innerHTML = `<span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><output></output>`;
  const input = row.querySelector("input");
  const out = row.querySelector("output");
  const sync = () => {
    out.textContent = format(settings[key]);
    input.style.setProperty("--fill", `${((settings[key] - min) / (max - min)) * 100}%`);
  };
  input.addEventListener("input", () => {
    settings[key] = Number(input.value);
    sync();
    onInput?.(settings[key]);
  });
  input.addEventListener("change", () => onChange?.(settings[key]));
  sync();
  container.append(row);
}

function toggle(container, { key, label, onChange }) {
  const row = document.createElement("label");
  row.className = "row toggle";
  row.innerHTML = `<span>${label}</span><input type="checkbox" id="ctl-${key}" ${settings[key] ? "checked" : ""}>`;
  row.querySelector("input").addEventListener("change", (e) => {
    settings[key] = e.target.checked;
    onChange?.(settings[key]);
  });
  container.append(row);
}

// Tabs open one panel at a time.
const tabs = document.querySelectorAll(".tabs button");
tabs.forEach((tab) =>
  tab.addEventListener("click", () => {
    const open = tab.getAttribute("aria-expanded") !== "true";
    tabs.forEach((t) => {
      t.setAttribute("aria-expanded", String(open && t === tab));
      document.getElementById(`panel-${t.dataset.panel}`).hidden = !(open && t === tab);
    });
  }),
);

const viewButtons = document.getElementById("view-buttons");
for (const name of Object.keys(VIEWS)) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = name;
  b.dataset.view = name;
  b.addEventListener("click", () => goToView(name));
  viewButtons.append(b);
}
document.getElementById("cruise").addEventListener("change", (e) => (settings.cruise = e.target.checked));

const waterControls = document.getElementById("water-controls");
const deg = (v) => `${v}°`;
slider(waterControls, { key: "moonElevation", label: "Moon height", min: 2, max: 60, step: 1, format: deg, onChange: renderSky });
slider(waterControls, { key: "moonAzimuth", label: "Moon bearing", min: -180, max: 180, step: 1, format: deg, onChange: renderSky });
slider(waterControls, { key: "coverage", label: "Cloud cover", min: 0.3, max: 0.9, step: 0.01, format: (v) => `${Math.round(v * 100)}%`, onChange: renderSky });
slider(waterControls, { key: "mist", label: "Horizon mist", min: 0, max: 3, step: 0.05, format: (v) => v.toFixed(2), onChange: renderSky });
slider(waterControls, { key: "ripples", label: "Ripples", min: 0, max: 4, step: 0.05, format: (v) => v.toFixed(2), onInput: (v) => (water.material.uniforms.distortionScale.value = v) });
slider(waterControls, { key: "exposure", label: "Exposure", min: 0.3, max: 1.6, step: 0.01, format: (v) => v.toFixed(2), onInput: (v) => (renderer.toneMappingExposure = v) });
toggle(waterControls, {
  key: "spotlight",
  label: "Boat spotlight",
  onChange: (v) => {
    const { spot, lens } = boat.userData.lights;
    spot.visible = v;
    lens.material.color.set(v ? 0xfff6e8 : 0x30343a);
  },
});
document.getElementById("new-sky").addEventListener("click", () => {
  settings.seed = Math.round(Math.random() * 1000) / 10;
  renderSky();
});

const cameraControls = document.getElementById("camera-controls");
slider(cameraControls, {
  key: "fov",
  label: "Field of view",
  min: 20,
  max: 80,
  step: 1,
  format: deg,
  onInput: (v) => {
    camera.fov = v;
    camera.updateProjectionMatrix();
  },
});
toggle(cameraControls, { key: "autoOrbit", label: "Slow orbit" });
slider(cameraControls, { key: "orbitSpeed", label: "Orbit speed", min: 0.1, max: 2, step: 0.05, format: (v) => v.toFixed(2) });

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Start -----------------------------------------------------------------------
renderer.toneMappingExposure = settings.exposure;
placeBoat(0, 0);
lastBoatPos.copy(boatPos);
camera.position.copy(boatPos).add(boatToWorld(VIEWS.Horizon));
controls.target.copy(boatPos).add(new THREE.Vector3(0, 1.4, 0));
document.querySelector('#view-buttons button[data-view="Horizon"]').setAttribute("aria-pressed", "true");
renderSky();

// Handle for poking at the scene from the console: open with ?debug.
if (new URLSearchParams(location.search).has("debug")) window.debug = { THREE, scene, camera, controls, sky, settings, renderSky, renderer };

const timer = new THREE.Timer();
renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const t = timer.getElapsed();
  const dt = Math.min(timer.getDelta(), 0.1);
  placeBoat(t, dt);
  updateCamera(dt);
  water.material.uniforms.time.value = t * 0.25;
  controls.update(dt);
  renderer.render(scene, camera);
});
