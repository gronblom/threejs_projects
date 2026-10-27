// Basics: meshes, materials, lights and shadows.
import { createScene } from "../../src/setup.js";

const { THREE, renderer, scene, animate } = createScene();
renderer.shadowMap.enabled = true;

scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x202030, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(5, 8, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const shapes = [
  new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4f8cff, roughness: 0.4 })),
  new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 32), new THREE.MeshStandardMaterial({ color: 0xff6b6b, metalness: 0.6, roughness: 0.2 })),
  new THREE.Mesh(new THREE.TorusKnotGeometry(0.45, 0.16, 160, 24), new THREE.MeshStandardMaterial({ color: 0x5ee39a, roughness: 0.3 })),
];
shapes.forEach((mesh, i) => {
  mesh.position.set((i - 1) * 2.2, 1, 0);
  mesh.castShadow = true;
  scene.add(mesh);
});

animate((t) => {
  shapes.forEach((mesh, i) => {
    mesh.rotation.x = t * 0.5 + i;
    mesh.rotation.y = t * 0.7 + i;
    mesh.position.y = 1 + Math.sin(t * 1.5 + i) * 0.25;
  });
});
