// Terrain: a plane displaced by layered sine "noise", with water and fog.
import { createScene } from "../../src/setup.js";

const { THREE, scene, animate } = createScene({ position: [18, 14, 18], background: 0x9cc4e8 });
scene.fog = new THREE.Fog(0x9cc4e8, 30, 90);

scene.add(new THREE.HemisphereLight(0xdfefff, 0x3a2f20, 0.8));
const sun = new THREE.DirectionalLight(0xfff2dd, 2);
sun.position.set(-20, 30, 10);
scene.add(sun);

function height(x, z) {
  return (
    Math.sin(x * 0.12) * Math.cos(z * 0.1) * 4 +
    Math.sin(x * 0.31 + z * 0.17) * 1.6 +
    Math.cos(z * 0.47 - x * 0.23) * 0.7
  );
}

const size = 80;
const segments = 200;
const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
geometry.rotateX(-Math.PI / 2);

const pos = geometry.attributes.position;
const colors = new Float32Array(pos.count * 3);
const sand = new THREE.Color(0xd8c48f), grass = new THREE.Color(0x4f8a3c), rock = new THREE.Color(0x6b6259), snow = new THREE.Color(0xf4f6f8);
for (let i = 0; i < pos.count; i++) {
  const y = height(pos.getX(i), pos.getZ(i));
  pos.setY(i, y);
  const c = y < -0.5 ? sand : y < 2.5 ? grass : y < 4.5 ? rock : snow;
  colors.set([c.r, c.g, c.b], i * 3);
}
geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
geometry.computeVertexNormals();

scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })));

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(size, size),
  new THREE.MeshStandardMaterial({ color: 0x2f6fa8, transparent: true, opacity: 0.75, roughness: 0.2, metalness: 0.1 }),
);
water.rotation.x = -Math.PI / 2;
scene.add(water);

animate((t) => {
  water.position.y = -0.8 + Math.sin(t * 0.8) * 0.08;
});
