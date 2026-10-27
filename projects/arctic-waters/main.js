// Arctic Waters: a lone boat on a mirror-calm sea under a heavy sky.
// Recreation of a scene shared on r/threejs ("Arctic waters in three.js").
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Water } from "three/addons/objects/Water.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import waterNormalsUrl from "./waternormals.jpg";
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
  skyRotation: 0,
  skyBrightness: 0.45,
  saturation: 0.2,
  contrast: 1.3,
  coolness: 0.35,
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

// When a sky image is loaded it replaces the generated clouds.
let skyImage = null;
const pmrem = new THREE.PMREMGenerator(renderer);
let imageEnv = null;

function renderSky() {
  const dir = moonDirection();
  water.material.uniforms.sunDirection.value.copy(dir);
  moonLight.position.copy(dir).multiplyScalar(100);
  scene.fog.density = 0.0035 * settings.mist;
  if (skyImage) return alignToSkyImage();
  sky.uniforms.uCoverage.value = settings.coverage;
  sky.uniforms.uMoonDir.value.copy(dir);
  sky.uniforms.uMist.value = settings.mist;
  sky.uniforms.uSeed.value = settings.seed;
  scene.background = sky.texture;
  scene.environment = sky.update();
  scene.environmentIntensity = 0.9;
}

/**
 * Uses a 360° equirectangular image (.hdr, .exr, .jpg, .png, .webp) as the sky,
 * the water's reflection and the boat's lighting.
 */
async function loadSkyImage(url, name = url) {
  const ext = name.split(".").pop().toLowerCase().split("?")[0];
  const loader = ext === "hdr" ? new HDRLoader() : ext === "exr" ? new EXRLoader() : new THREE.TextureLoader();
  if (loader.setDataType) loader.setDataType(THREE.FloatType); // so the pixels can be analysed
  const texture = await loader.loadAsync(url);
  skyInfo = analyseSky(texture);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  if (loader instanceof THREE.TextureLoader) texture.colorSpace = THREE.SRGBColorSpace;
  skyImage?.dispose();
  imageEnv?.dispose();
  skyImage = texture;
  imageEnv = pmrem.fromEquirectangular(texture);
  scene.background = texture;
  scene.environment = imageEnv.texture;
  applySkyTransform();
  document.getElementById("sky-source").textContent = name.split("/").pop();
  document.getElementById("generated-sky").hidden = false;
  document.getElementById("generated-controls").hidden = true;
}

/**
 * Finds the sun (brightest pixel) and the average colour just above the horizon
 * in an equirectangular image, so the water glint and the mist can match it.
 */
let skyInfo = null;
function analyseSky(texture) {
  let w, h, read;
  if (texture.image?.data) {
    ({ width: w, height: h } = texture.image);
    const d = texture.image.data;
    const ch = d.length / (w * h);
    read = (x, y) => [d[(y * w + x) * ch], d[(y * w + x) * ch + 1], d[(y * w + x) * ch + 2]];
  } else {
    // 8-bit image: sample a reduced copy through a canvas.
    w = 512;
    h = 256;
    const ctx = Object.assign(document.createElement("canvas"), { width: w, height: h }).getContext("2d", { willReadFrequently: true });
    ctx.drawImage(texture.image, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const lin = (v) => (v / 255) ** 2.2;
    read = (x, y) => [lin(d[(y * w + x) * 4]), lin(d[(y * w + x) * 4 + 1]), lin(d[(y * w + x) * 4 + 2])];
  }
  // Row 0 is the top of the sky unless the texture is stored bottom-up.
  const topDown = texture.flipY !== false || !texture.image?.data;
  const rowToV = (y) => (topDown ? 1 - (y + 0.5) / h : (y + 0.5) / h);

  let best = -1, bx = 0, by = 0;
  const horizon = new THREE.Color(0, 0, 0);
  let n = 0;
  for (let y = 0; y < h; y += 2) {
    const v = rowToV(y);
    for (let x = 0; x < w; x += 2) {
      const [r, g, b] = read(x, y);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (v > 0.5 && lum > best) [best, bx, by] = [lum, x, y];
      if (v > 0.5 && v < 0.53) {
        horizon.r += r;
        horizon.g += g;
        horizon.b += b;
        n++;
      }
    }
  }
  horizon.multiplyScalar(1 / Math.max(n, 1));
  // Same mapping three.js uses to sample equirectangular maps.
  const phi = ((bx + 0.5) / w - 0.5) * Math.PI * 2;
  const theta = (rowToV(by) - 0.5) * Math.PI;
  const sun = new THREE.Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));
  return { sun, horizon };
}

/** Points the water glint and the key light at the sun in the sky image. */
function alignToSkyImage() {
  if (!skyInfo) return;
  const dir = skyInfo.sun.clone().applyEuler(scene.backgroundRotation);
  water.material.uniforms.sunDirection.value.copy(dir);
  moonLight.position.copy(dir).multiplyScalar(100);
  scene.fog.color.copy(skyInfo.horizon).multiplyScalar(settings.skyBrightness);
}

function useGeneratedSky() {
  skyImage?.dispose();
  imageEnv?.dispose();
  skyImage = imageEnv = skyInfo = null;
  scene.fog.color.set(0x9aa7b6);
  document.getElementById("generated-controls").hidden = false;
  document.getElementById("sky-source").textContent = "Generated clouds";
  document.getElementById("generated-sky").hidden = true;
  applySkyTransform();
  renderSky();
}

function applySkyTransform() {
  const r = THREE.MathUtils.degToRad(settings.skyRotation);
  scene.backgroundRotation.set(0, r, 0);
  scene.environmentRotation.set(0, r, 0);
  scene.backgroundIntensity = settings.skyBrightness;
  scene.environmentIntensity = skyImage ? settings.skyBrightness * 0.8 : 0.9;
  alignToSkyImage();
}

// --- Water -----------------------------------------------------------------------
const water = new Water(new THREE.PlaneGeometry(6000, 6000), {
  textureWidth: LOW ? 256 : 1024,
  textureHeight: LOW ? 256 : 1024,
  waterNormals: new THREE.TextureLoader().load(waterNormalsUrl, (t) => (t.wrapS = t.wrapT = THREE.RepeatWrapping)),
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
        float arms = exp(-pow((abs(x) - spread) / (0.06 + d * 0.12), 2.0));
        float prop = exp(-pow(x / (0.08 + d * 0.25), 2.0)) * (1.0 - d);
        float n = noise(vec2(x * 18.0, d * 60.0 - uTime * 1.5));
        float a = (arms * 0.6 + prop * 0.9) * (0.5 + 0.5 * n) * pow(1.0 - d, 1.6);
        gl_FragColor = vec4(vec3(0.75, 0.8, 0.86) * a * 0.1 * uStrength, 1.0);
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
const generatedControls = document.getElementById("generated-controls");
const deg = (v) => `${v}°`;
slider(generatedControls, { key: "moonElevation", label: "Moon height", min: 2, max: 60, step: 1, format: deg, onChange: renderSky });
slider(generatedControls, { key: "moonAzimuth", label: "Moon bearing", min: -180, max: 180, step: 1, format: deg, onChange: renderSky });
slider(generatedControls, { key: "coverage", label: "Cloud cover", min: 0.3, max: 0.9, step: 0.01, format: (v) => `${Math.round(v * 100)}%`, onChange: renderSky });
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
  if (skyImage) useGeneratedSky();
  else renderSky();
});

const skyControls = document.getElementById("sky-controls");
const gradeControls = document.getElementById("grade-controls");
const setGrade = () => {
  grade.uniforms.uSaturation.value = settings.saturation;
  grade.uniforms.uContrast.value = settings.contrast;
  grade.uniforms.uCool.value = settings.coolness;
};
slider(gradeControls, { key: "saturation", label: "Colour", min: 0, max: 1.2, step: 0.01, format: (v) => `${Math.round(v * 100)}%`, onInput: setGrade });
slider(gradeControls, { key: "contrast", label: "Contrast", min: 0.7, max: 1.6, step: 0.01, format: (v) => v.toFixed(2), onInput: setGrade });
slider(gradeControls, { key: "coolness", label: "Cool tint", min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2), onInput: setGrade });
slider(skyControls, { key: "skyRotation", label: "Sky rotation", min: -180, max: 180, step: 1, format: deg, onInput: applySkyTransform });
slider(skyControls, { key: "skyBrightness", label: "Sky brightness", min: 0.2, max: 2, step: 0.01, format: (v) => v.toFixed(2), onInput: applySkyTransform });

const skyFile = document.getElementById("sky-file");
async function openSkyFile(file) {
  const url = URL.createObjectURL(file);
  try {
    await loadSkyImage(url, file.name);
  } catch (err) {
    document.getElementById("sky-source").textContent = `Couldn't read ${file.name}. Use a 360° .hdr, .exr, .jpg or .png.`;
    console.error(err);
  } finally {
    URL.revokeObjectURL(url);
  }
}
skyFile.addEventListener("change", () => skyFile.files[0] && openSkyFile(skyFile.files[0]));
document.getElementById("load-sky").addEventListener("click", () => skyFile.click());
document.getElementById("generated-sky").addEventListener("click", useGeneratedSky);
// Dropping an image anywhere on the page also loads it.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) openSkyFile(file);
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

// --- Colour grading ----------------------------------------------------------------
// Applied to the whole frame in linear light, before tone mapping (OutputPass):
// desaturate, cool the tint and add contrast for the moody blue-grey look.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: settings.saturation },
    uContrast: { value: settings.contrast },
    uCool: { value: settings.coolness },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uCool;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = max(tex.rgb, 0.0);
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSaturation);
      c *= mix(vec3(1.0), vec3(0.86, 0.95, 1.12), uCool);
      // Contrast around middle grey, in log space so highlights survive.
      c = 0.18 * pow(c / 0.18 + 1e-5, vec3(uContrast));
      gl_FragColor = vec4(c, tex.a);
    }
  `,
});
composer.addPass(grade);
composer.addPass(new OutputPass());
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// --- Start -----------------------------------------------------------------------
renderer.toneMappingExposure = settings.exposure;
placeBoat(0, 0);
lastBoatPos.copy(boatPos);
camera.position.copy(boatPos).add(boatToWorld(VIEWS.Horizon));
controls.target.copy(boatPos).add(new THREE.Vector3(0, 1.4, 0));
document.querySelector('#view-buttons button[data-view="Horizon"]').setAttribute("aria-pressed", "true");

// A sky image placed next to this file (sky.hdr, sky.exr, sky.jpg, ...) is used
// automatically; otherwise the clouds are generated.
const bundledSky = Object.entries(import.meta.glob("./sky.{hdr,exr,jpg,jpeg,png,webp}", { query: "?url", import: "default", eager: true }));
if (bundledSky.length) {
  scene.background = new THREE.Color(0x8f98a3); // until the image arrives
  loadSkyImage(bundledSky[0][1], bundledSky[0][0]).catch((err) => {
    console.error(err);
    renderSky();
  });
} else {
  renderSky();
}

// Handle for poking at the scene from the console: open with ?debug.
if (new URLSearchParams(location.search).has("debug")) window.debug = { THREE, scene, camera, controls, sky, settings, renderSky, renderer, loadSkyImage };

const timer = new THREE.Timer();
renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const t = timer.getElapsed();
  const dt = Math.min(timer.getDelta(), 0.1);
  placeBoat(t, dt);
  updateCamera(dt);
  water.material.uniforms.time.value = t * 0.25;
  controls.update(dt);
  composer.render(dt);
});
