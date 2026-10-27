// Shared boilerplate: renderer, camera, orbit controls and resize handling.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function createScene({ fov = 60, position = [4, 3, 6], background = 0x0b0d12 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(...position);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  /** Starts the render loop; `update(elapsedSeconds, deltaSeconds)` runs every frame. */
  function animate(update = () => {}) {
    renderer.setAnimationLoop(() => {
      update(clock.getElapsedTime(), clock.getDelta());
      controls.update();
      renderer.render(scene, camera);
    });
  }

  return { THREE, renderer, scene, camera, controls, animate };
}
