// A small pilothouse work boat (~8 m) built from primitives: V-hull,
// cabin with windows, railings, twin outboards, mast lights and a spotlight.
// The boat's +Z axis points forward; the waterline is y = 0.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const LENGTH = 8;
const BEAM = 2.7;

function hullGeometry() {
  // Top-down outline: square stern, curved flanks, pointed bow.
  const half = BEAM / 2;
  const s = new THREE.Shape();
  s.moveTo(-half * 0.92, -LENGTH / 2);
  s.lineTo(half * 0.92, -LENGTH / 2);
  s.bezierCurveTo(half * 1.02, -LENGTH * 0.1, half * 0.95, LENGTH * 0.22, 0, LENGTH / 2);
  s.bezierCurveTo(-half * 0.95, LENGTH * 0.22, -half * 1.02, -LENGTH * 0.1, -half * 0.92, -LENGTH / 2);

  const depth = 1.25;
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24, steps: 4 });
  // Extrusion runs along +Z; turn it so the outline lies in XZ and height is Y.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.75, 0); // deck at y = 0.75, keel at y = -0.5

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = (0.75 - y) / depth; // 0 at deck, 1 at keel
    // Narrow towards the keel for a deep V, more so at the bow.
    const bow = THREE.MathUtils.smoothstep(z, -LENGTH * 0.1, LENGTH / 2);
    pos.setX(i, pos.getX(i) * (1 - k * (0.62 + bow * 0.3)));
    // Bow rises (sheer line).
    pos.setY(i, y + bow * bow * 0.35 * (1 - k * 0.5));
  }
  geo.computeVertexNormals();
  return geo;
}

function roundedBox(w, h, d, r = 0.06) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelSize: r * 0.6, bevelThickness: r * 0.6, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -d / 2);
  return mergeVertices(g);
}

export function createBoat() {
  const boat = new THREE.Group();
  boat.name = "boat";

  const hullMat = new THREE.MeshPhysicalMaterial({ color: 0x1b2230, roughness: 0.35, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x8c949e, roughness: 0.8 });
  const cabinMat = new THREE.MeshPhysicalMaterial({ color: 0xc9ced4, roughness: 0.4, clearcoat: 0.5 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1018, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0d1016, roughness: 0.5, metalness: 0.3 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.25, metalness: 0.9 });

  // Hull + a pale stripe along the sheer.
  const hull = new THREE.Mesh(hullGeometry(), hullMat);
  boat.add(hull);
  const stripeGeo = hullGeometry();
  stripeGeo.scale(1.004, 0.08, 1.004);
  const stripe = new THREE.Mesh(stripeGeo, new THREE.MeshStandardMaterial({ color: 0xa9b1bb, roughness: 0.5 }));
  stripe.position.y = 0.63;
  boat.add(stripe);

  // Deck plate slightly inset.
  const deckShape = hullGeometry();
  deckShape.scale(0.93, 0.02, 0.96);
  const deck = new THREE.Mesh(deckShape, deckMat);
  deck.position.y = 0.73;
  boat.add(deck);

  // Pilothouse with a raked windscreen.
  const cabin = new THREE.Group();
  cabin.position.set(0, 0.75, -0.2);
  boat.add(cabin);
  const body = new THREE.Mesh(roundedBox(2.1, 1.5, 2.8, 0.1), cabinMat);
  body.position.y = 0.75;
  // Rake the front face backwards towards the roof.
  const bp = body.geometry.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    if (bp.getZ(i) > 0.5) bp.setZ(i, bp.getZ(i) - (bp.getY(i) + 0.75) * 0.35);
  }
  body.geometry.computeVertexNormals();
  cabin.add(body);

  const roof = new THREE.Mesh(roundedBox(2.3, 0.12, 3.2, 0.05), cabinMat);
  roof.position.set(0, 1.56, -0.15);
  cabin.add(roof);

  // Windows: front (raked), sides, rear.
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.62), glassMat);
  front.position.set(0, 1.1, 1.28);
  front.rotation.x = -0.34;
  cabin.add(front);
  for (const side of [-1, 1]) {
    for (const z of [-0.65, 0.35]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), glassMat);
      w.position.set(side * 1.07, 1.1, z);
      w.rotation.y = side * Math.PI / 2;
      cabin.add(w);
    }
  }
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.55), glassMat);
  rear.position.set(0, 1.1, -1.42);
  rear.rotation.y = Math.PI;
  cabin.add(rear);

  // Warm cabin glow behind the glass.
  const glow = new THREE.PointLight(0xffc98a, 2.5, 4, 2);
  glow.position.set(0, 1.0, 0);
  cabin.add(glow);

  // Railings along the foredeck and sides.
  const railPts = [];
  for (let i = 0; i <= 20; i++) {
    const z = -LENGTH / 2 + 0.3 + (i / 20) * (LENGTH - 0.9);
    const bow = THREE.MathUtils.smoothstep(z, -LENGTH * 0.1, LENGTH / 2);
    const half = (BEAM / 2) * (1 - bow * bow * 0.95) * 0.9;
    railPts.push(new THREE.Vector3(half, 1.32 + bow * bow * 0.35, z));
  }
  const railCurve = new THREE.CatmullRomCurve3([
    ...railPts.slice().reverse().map((p) => new THREE.Vector3(-p.x, p.y, p.z)),
    ...railPts.slice(1),
  ].filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 0.01));
  boat.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve, 120, 0.025, 6, false), steelMat));
  railPts.forEach((p, i) => {
    if (i % 3) return;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, p.y - 0.75, 6), steelMat);
      post.position.set(p.x * sx, (p.y + 0.75) / 2, p.z);
      boat.add(post);
    }
  });

  // Twin outboards on the transom.
  for (const sx of [-0.55, 0.55]) {
    const motor = new THREE.Group();
    motor.position.set(sx, 0.55, -LENGTH / 2 - 0.25);
    const cowl = new THREE.Mesh(roundedBox(0.55, 0.75, 0.7, 0.18), darkMat);
    cowl.position.y = 0.55;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.32), darkMat);
    leg.position.y = -0.35;
    const cav = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.55), darkMat);
    cav.position.set(0, -0.2, 0.05);
    motor.add(cowl, leg, cav);
    boat.add(motor);
  }

  // Mast with antennas and nav lights.
  const mast = new THREE.Group();
  mast.position.set(0, 2.38, -0.6);
  boat.add(mast);
  const arch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), steelMat);
  arch.position.y = 0.25;
  mast.add(arch);
  for (const [x, h] of [[-0.6, 1.4], [0.6, 1.0], [0.1, 0.7]]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, h, 5), cabinMat);
    ant.position.set(x, 0.25 + h / 2, 0);
    mast.add(ant);
  }
  const navWhite = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  navWhite.position.set(0.1, 1.0, 0);
  mast.add(navWhite);
  for (const [x, color] of [[-1.08, 0xff3b30], [1.08, 0x34c759]]) {
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color }));
    nav.position.set(x, 1.45, 0.9);
    cabin.add(nav);
  }

  // Roof spotlight shining ahead.
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.18, 12), darkMat);
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, 1.72, 1.2);
  cabin.add(lamp);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), new THREE.MeshBasicMaterial({ color: 0xfff6e8 }));
  lens.position.set(0, 1.72, 1.3);
  cabin.add(lens);
  const spot = new THREE.SpotLight(0xfff1dc, 60, 60, 0.32, 0.5, 1.6);
  spot.position.copy(lens.position);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, -0.5, 14);
  cabin.add(spot, spotTarget);
  spot.target = spotTarget;

  boat.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  boat.userData.lights = { spot, glow, lens, navWhite };
  return boat;
}
