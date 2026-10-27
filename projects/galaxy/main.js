// Galaxy: a spiral of 60k particles rendered as additive points.
import { createScene } from "../../src/setup.js";

const { THREE, scene, animate } = createScene({ position: [0, 4, 7], background: 0x02030a });

const params = { count: 60000, radius: 6, branches: 4, spin: 1.1, randomness: 0.35, inside: 0xffa45c, outside: 0x4f6bff };

const positions = new Float32Array(params.count * 3);
const colors = new Float32Array(params.count * 3);
const inside = new THREE.Color(params.inside);
const outside = new THREE.Color(params.outside);

for (let i = 0; i < params.count; i++) {
  const r = Math.random() ** 1.5 * params.radius;
  const branch = ((i % params.branches) / params.branches) * Math.PI * 2;
  const angle = branch + r * params.spin;
  // Scatter more strongly away from the arms' centre lines, less towards the core.
  const jitter = () => (Math.random() - 0.5) * params.randomness * r * (Math.random() < 0.5 ? 1 : 0.4);

  positions.set([Math.cos(angle) * r + jitter(), jitter() * 0.4, Math.sin(angle) * r + jitter()], i * 3);
  const c = inside.clone().lerp(outside, r / params.radius);
  colors.set([c.r, c.g, c.b], i * 3);
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const galaxy = new THREE.Points(
  geometry,
  new THREE.PointsMaterial({ size: 0.02, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending }),
);
scene.add(galaxy);

animate((t) => {
  galaxy.rotation.y = t * 0.05;
});
