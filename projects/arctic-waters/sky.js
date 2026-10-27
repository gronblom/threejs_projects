// Stormy cumulus sky. The clouds are ray-marched in a fragment shader on a
// sky sphere, but only into a cube map (re-rendered when settings change), so
// the expensive shader never runs per frame. The cube map then serves as the
// scene background, the water's reflection and the image-based lighting.
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vDir;

  uniform vec3 uMoonDir;
  uniform float uCoverage;   // 0..1, how much of the sky is cloud
  uniform float uDensity;    // optical thickness
  uniform float uSeed;
  uniform vec3 uLight;       // lit cloud colour
  uniform vec3 uShadow;      // cloud shadow colour
  uniform vec3 uSkyTop;
  uniform vec3 uHorizon;     // mist band colour
  uniform float uMist;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p, int octaves) {
    float sum = 0.0, amp = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      sum += amp * noise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      amp *= 0.5;
    }
    return sum;
  }

  // Cloud layer between these heights (arbitrary units; camera is at the origin).
  const float BASE = 1.0;
  const float TOP = 3.2;

  float remap(float v, float lo, float hi) { return clamp((v - lo) / (hi - lo), 0.0, 1.0); }

  float cloudDensity(vec3 p, int octaves) {
    float h = clamp((p.y - BASE) / (TOP - BASE), 0.0, 1.0);
    // Flat-ish bases, rounded towering tops.
    float profile = smoothstep(0.0, 0.08, h) * smoothstep(1.0, 0.35, h);
    vec3 q = p * 0.55 + vec3(uSeed, 0.0, uSeed * 0.37);
    // Large cloud masses...
    float shape = fbm(q * vec3(0.55, 1.2, 0.55), 4);
    float base = remap(shape, (1.0 - uCoverage) * 0.8, 0.85) * profile;
    // ...eroded by billowy detail ("cauliflower" edges), less so in the cores.
    float billow = 1.0 - abs(fbm(q * 2.6, octaves) * 2.0 - 1.0);
    float d = remap(base, billow * 0.45, 1.0);
    return d * uDensity;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float up = dir.y;

    // Background behind the clouds: dim at the zenith, bright misty horizon.
    float horizonGlow = exp(-max(up, 0.0) * 9.0);
    vec3 sky = mix(uSkyTop, uHorizon, horizonGlow);
    float moon = dot(dir, uMoonDir);
    sky += vec3(0.9, 0.95, 1.0) * pow(max(moon, 0.0), 300.0) * 0.6;   // halo

    vec3 color = sky;
    if (up > 0.01) {
      float t0 = BASE / up;
      float t1 = min(TOP / up, t0 + 18.0);
      const int STEPS = 56;
      float stepLen = (t1 - t0) / float(STEPS);
      float transmittance = 1.0;
      vec3 scattered = vec3(0.0);
      // Jitter the start to hide banding.
      float t = t0 + stepLen * hash(dir * 431.7);
      for (int i = 0; i < STEPS; i++) {
        vec3 p = dir * t;
        float d = cloudDensity(p, 4);
        if (d > 0.001) {
          // Short march towards the moon for self-shadowing.
          float shadow = 0.0;
          for (int j = 1; j <= 5; j++) {
            shadow += cloudDensity(p + uMoonDir * float(j) * 0.22, 2);
          }
          float beer = exp(-shadow * 0.12);
          // Fine relief: compare density a small step towards the moon. Surfaces
          // facing the moon get brighter, billows facing away fall into shade.
          float facing = clamp((d - cloudDensity(p + uMoonDir * 0.09, 3)) * 0.45 + 0.5, 0.0, 1.0);
          float hgt = clamp((p.y - BASE) / (TOP - BASE), 0.0, 1.0);
          // Silver lining: forward scattering when looking towards the moon.
          float forward = pow(max(moon, 0.0), 8.0) * 2.0;
          vec3 ambient = mix(uShadow * 1.1, uShadow * 2.2, hgt);
          float lightT = beer * facing;
          vec3 lit = ambient + uLight * lightT * (1.1 + forward);
          float a = 1.0 - exp(-d * stepLen * 2.2);
          scattered += transmittance * a * lit;
          transmittance *= 1.0 - a;
          if (transmittance < 0.02) break;
        }
        t += stepLen;
      }
      color = sky * transmittance + scattered;
      // Distant clouds fade into the mist.
      float haze = 1.0 - exp(-t0 * uMist * 0.12);
      color = mix(color, uHorizon, haze);
    } else {
      color = uHorizon;
    }

    // Moon disc on top, slightly veiled.
    color += vec3(1.0) * smoothstep(0.99985, 0.99995, moon) * 2.0;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class StormSky {
  constructor(renderer, { size = 1024 } = {}) {
    this.renderer = renderer;
    this.uniforms = {
      uMoonDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
      uCoverage: { value: 0.68 },
      uDensity: { value: 16.0 },
      uSeed: { value: 3.0 },
      uLight: { value: new THREE.Color(0xc3ccd8) },
      uShadow: { value: new THREE.Color(0x10151e) },
      uSkyTop: { value: new THREE.Color(0x222a36) },
      uHorizon: { value: new THREE.Color(0x9aa7b6) },
      uMist: { value: 1.0 },
    };
    this.scene = new THREE.Scene();
    this.scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(100, 64, 32),
        new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: this.uniforms,
          side: THREE.BackSide,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    this.target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCamera = new THREE.CubeCamera(0.1, 1000, this.target);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
  }

  get texture() {
    return this.target.texture;
  }

  /** Re-renders the cube map and the derived lighting environment. */
  update() {
    this.cubeCamera.update(this.renderer, this.scene);
    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromCubemap(this.target.texture);
    return this.envTarget.texture;
  }
}
