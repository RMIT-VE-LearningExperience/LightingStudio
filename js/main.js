import * as THREE from 'three';
import { OrbitControls }    from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { HDRLoader }         from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader }        from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer }    from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }        from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass }   from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass }        from 'three/examples/jsm/postprocessing/OutputPass.js';
import { initWelcome }       from './tutorial.js';

// ─── RENDERER ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75;

// ─── SCENE & CAMERA ──────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color('#080808');

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 2.5, 8);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.target.set(0, 1.2, 0);
orbit.minDistance = 1;
orbit.maxDistance = 30;
orbit.maxPolarAngle = Math.PI / 2 - 0.02; // prevent camera going below ground

// ─── BLOOM ───────────────────────────────────────────────────────────────────

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.5, 0.88);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ─── TRANSFORM CONTROLS ──────────────────────────────────────────────────────

const transform = new TransformControls(camera, renderer.domElement);
transform.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });
transform.setMode('translate');
scene.add(transform.getHelper());

// ─── HDR ENVIRONMENT ─────────────────────────────────────────────────────────

new HDRLoader().load('/hdr/studio_small_02.hdr', texture => {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromEquirectangular(texture).texture;
  texture.dispose(); pmrem.dispose();
});

// ─── TEXTURES ────────────────────────────────────────────────────────────────

const tLoader = new THREE.TextureLoader();
function tex(path, repeat = 4) {
  const t = tLoader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

// ─── STUDIO ROOM ─────────────────────────────────────────────────────────────

const floorMat = new THREE.MeshStandardMaterial({
  map: tex('/textures/floor_diff.jpg', 5),
  roughnessMap: tex('/textures/floor_rough.jpg', 5),
  normalMap: tex('/textures/floor_norm.jpg', 5),
  color: '#505050',
  roughness: 0.92, metalness: 0.0, envMapIntensity: 0.2,
});

const wallMat = new THREE.MeshStandardMaterial({
  map: tex('/textures/wall_diff.jpg', 3),
  roughnessMap: tex('/textures/wall_rough.jpg', 3),
  normalMap: tex('/textures/wall_norm.jpg', 3),
  color: '#4a4a4a', roughness: 0.95, metalness: 0.0, envMapIntensity: 0.1,
});

const ceilMat = new THREE.MeshStandardMaterial({ color: '#0e0e0e', roughness: 1 });

// Floor
const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 0);
floor.receiveShadow = true;
floor.userData.isStudio = true;
scene.add(floor);

// Back wall
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), wallMat);
backWall.position.set(0, 3.5, -6);
backWall.receiveShadow = true;
backWall.userData.isStudio = true;
scene.add(backWall);

// Left wall
const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), wallMat);
leftWall.rotation.y = Math.PI / 2;
leftWall.position.set(-8, 3.5, -0);
leftWall.receiveShadow = true;
leftWall.userData.isStudio = true;
scene.add(leftWall);

// Right wall
const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), wallMat);
rightWall.rotation.y = -Math.PI / 2;
rightWall.position.set(8, 3.5, 0);
rightWall.receiveShadow = true;
rightWall.userData.isStudio = true;
scene.add(rightWall);

// Ceiling
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), ceilMat);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.set(0, 7, 0);
scene.add(ceiling);

// Cyclorama sweep (floor→back wall curve)
(function buildSweep() {
  const W = 16, R = 1.4, segs = 20, xSegs = 22;
  const profile = [], profN = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * (Math.PI / 2);
    profile.push([-(4.6 + Math.sin(a) * R), (1 - Math.cos(a)) * R]);
    profN.push([-Math.sin(a), Math.cos(a)]);
  }
  const pLen = profile.length, pos = [], nor = [], uv = [], idx = [];
  for (let xi = 0; xi <= xSegs; xi++) {
    const x = -W / 2 + (xi / xSegs) * W, u = xi / xSegs;
    for (let pi = 0; pi < pLen; pi++) {
      const [z, y] = profile[pi], [nz, ny] = profN[pi];
      pos.push(x, y, z); nor.push(0, ny, nz); uv.push(u, pi / (pLen - 1));
    }
  }
  for (let xi = 0; xi < xSegs; xi++) for (let pi = 0; pi < pLen - 1; pi++) {
    const a = xi * pLen + pi, b = a + 1, c = (xi + 1) * pLen + pi, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,  2));
  geo.setIndex(idx);
  const sweep = new THREE.Mesh(geo, wallMat);
  sweep.receiveShadow = true;
  sweep.userData.isStudio = true;
  scene.add(sweep);
})();

// ─── AMBIENT ─────────────────────────────────────────────────────────────────

const ambient = new THREE.AmbientLight('#ffffff', 0.06);
scene.add(ambient);
const hemi = new THREE.HemisphereLight('#bbccff', '#c8a87a', 0.2);
scene.add(hemi);

// ─── SHARED EQUIPMENT MATERIALS ──────────────────────────────────────────────

const darkMat = new THREE.MeshStandardMaterial({ color: '#1c1c1c', metalness: 0.8, roughness: 0.3 });
const silvMat = new THREE.MeshStandardMaterial({ color: '#aaaaaa', metalness: 0.88, roughness: 0.18 });
const rubbMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.95 });

function emissiveMat(hex, intensity) {
  return new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: intensity });
}

// ─── TRIPOD STAND ────────────────────────────────────────────────────────────

function buildStand(poleH, group) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const piv = new THREE.Group(); piv.rotation.y = a;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.56, 8), darkMat);
    leg.rotation.z = Math.PI / 2; leg.position.x = 0.28; piv.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), rubbMat);
    foot.position.x = 0.56; piv.add(foot);
    group.add(piv);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 12), silvMat);
  hub.position.y = 0.02; group.add(hub);
  const loH = poleH * 0.55;
  const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, loH, 10), darkMat);
  lo.position.y = 0.04 + loH / 2; group.add(lo);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.038, 12), silvMat);
  collar.position.y = 0.04 + loH; group.add(collar);
  const upH = poleH * 0.44;
  const up = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.018, upH, 10), silvMat);
  up.position.y = 0.04 + loH + 0.038 + upH / 2; group.add(up);
  const spig = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), silvMat);
  spig.position.y = poleH + 0.025; group.add(spig);
}

// ─── LIGHT EQUIPMENT HEADS ───────────────────────────────────────────────────

function buildFlashHead(colorHex) {
  const g = new THREE.Group();
  const yokeL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.025), silvMat);
  const yokeR = yokeL.clone();
  yokeL.position.set(-0.1, 0, 0); yokeR.position.set(0.1, 0, 0); g.add(yokeL, yokeR);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.28, 18), darkMat);
  body.rotation.x = Math.PI / 2; body.position.z = 0.02; g.add(body);
  [-0.06, 0.04].forEach(z => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.007, 8, 20), silvMat);
    ring.position.z = z; g.add(ring);
  });
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.07, 0.1, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: '#c0c0c0', metalness: 0.92, roughness: 0.1, side: THREE.DoubleSide })
  );
  dish.rotation.x = -Math.PI / 2; dish.position.z = 0.17; g.add(dish);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 16), emissiveMat(colorHex, 4));
  bulb.name = 'emissive'; bulb.position.z = 0.22; g.add(bulb);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0, transmission: 0.8 })
  );
  dome.rotation.x = Math.PI / 2; dome.position.z = 0.16; g.add(dome);
  g.rotation.x = 0.25;
  return g;
}

function buildParSpot(colorHex) {
  const g = new THREE.Group();
  const yokeL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.025), silvMat);
  const yokeR = yokeL.clone();
  yokeL.position.set(-0.12, 0, 0); yokeR.position.set(0.12, 0, 0); g.add(yokeL, yokeR);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.28, 20), darkMat);
  body.position.y = -0.15; g.add(body);
  [0.02, -0.09, -0.2].forEach(y => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.007, 8, 22), silvMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
  });
  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.2, 26, 1, true),
    new THREE.MeshStandardMaterial({ color: '#b0b0b0', metalness: 0.88, roughness: 0.12, side: THREE.DoubleSide })
  );
  dish.position.y = -0.31; g.add(dish);
  [0, 1, 2, 3].forEach(i => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.014, 0.095), darkMat);
    door.position.set(Math.cos(a) * 0.2, -0.43, Math.sin(a) * 0.2);
    door.rotation.y = a; door.rotation.z = (i % 2 === 0) ? 0.28 : -0.28; g.add(door);
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 14), emissiveMat(colorHex, 5));
  bulb.name = 'emissive'; bulb.position.y = -0.22; g.add(bulb);
  const coneLen = 5.5, coneR = Math.tan(Math.PI / 7) * coneLen;
  const volCone = new THREE.Mesh(
    new THREE.ConeGeometry(coneR, coneLen, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex), transparent: true, opacity: 0.055, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  volCone.name = 'volCone'; volCone.position.y = -0.22 - coneLen / 2; g.add(volCone);
  return g;
}

function buildSoftbox(colorHex) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 10, 26), silvMat);
  ring.rotation.x = Math.PI / 2; g.add(ring);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 10), darkMat);
  knob.rotation.z = Math.PI / 2; knob.position.set(0.12, 0, 0); g.add(knob);
  const boxW = 0.82, boxH = 0.82, boxD = 0.32;
  [
    { pos: [0, boxH/2, -boxD/2], rot: [0.25,0,0], size: [boxW,0.012,boxD] },
    { pos: [0,-boxH/2, -boxD/2], rot: [-0.25,0,0], size: [boxW,0.012,boxD] },
    { pos: [ boxW/2,0, -boxD/2], rot: [0,0,0.25], size: [0.012,boxH,boxD] },
    { pos: [-boxW/2,0, -boxD/2], rot: [0,0,-0.25], size: [0.012,boxH,boxD] },
  ].forEach(({ pos, rot, size }) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide }));
    p.position.set(...pos); p.rotation.set(...rot); g.add(p);
  });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(boxW+0.04, boxH+0.04, 0.06), darkMat);
  frame.position.z = -boxD; g.add(frame);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([x,y]) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.055,0.055,0.07), silvMat);
    c.position.set(x*boxW/2, y*boxH/2, -boxD); g.add(c);
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(boxW-0.06, boxH-0.06), emissiveMat(colorHex, 1.2));
  face.name = 'emissive'; face.position.z = -boxD - 0.032; face.rotation.y = Math.PI; g.add(face);
  for (let i = -1; i <= 1; i++) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(boxW-0.08,0.01,0.006), darkMat);
    h.position.set(0, i*0.22, -boxD-0.028); g.add(h);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.01,boxH-0.08,0.006), darkMat);
    v.position.set(i*0.22, 0, -boxD-0.028); g.add(v);
  }
  g.rotation.x = 0.18;
  return g;
}

// ─── PHOTOGRAPHER CHARACTER (GLB) ────────────────────────────────────────────

new GLTFLoader().load('/models/Michelle.glb', gltf => {
  const model = gltf.scene;
  model.scale.setScalar(1.08);
  model.position.set(5.5, 0, 5.5);
  model.rotation.y = Math.PI + 0.9; // turned to face subjects from the side
  model.traverse(c => {
    c.userData.isPhotographer = true;
    if (c.isMesh) { c.castShadow = true; c.receiveShadow = false; }
  });
  scene.add(model);
  if (gltf.animations?.length) {
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(gltf.animations[gltf.animations.length - 1]).play();
    scene.userData.mixer = mixer;
  }
});

// ─── DEAD CODE REMOVED ───────────────────────────────────────────────────────
// (old code-built figure kept here only to satisfy Edit tool — deleted below)

function buildPhotographer() {
  const group = new THREE.Group();

  const skinMat  = new THREE.MeshStandardMaterial({ color: '#c68642', roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: '#2c2c3a', roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: '#1a1a2a', roughness: 0.9 });
  const hairMat  = new THREE.MeshStandardMaterial({ color: '#1a0f00', roughness: 1 });
  const shoeMat  = new THREE.MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.85 });

  // Legs
  [-0.12, 0.12].forEach(x => {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.52, 10), pantsMat);
    upper.position.set(x, 0.5, 0); group.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.48, 10), pantsMat);
    lower.position.set(x, 0.06, 0.04); lower.rotation.x = 0.12; group.add(lower);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.22), shoeMat);
    shoe.position.set(x, -0.18, 0.06); group.add(shoe);
  });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.22), shirtMat);
  torso.position.set(0, 1.14, 0); group.add(torso);

  // Waist taper
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.12, 12), shirtMat);
  waist.position.set(0, 0.82, 0); group.add(waist);

  // Left arm — reaching forward to camera
  const lShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), shirtMat);
  lShoulder.position.set(-0.26, 1.3, 0); group.add(lShoulder);
  const lUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 10), shirtMat);
  lUpper.rotation.z = 0.5; lUpper.rotation.x = 0.6;
  lUpper.position.set(-0.34, 1.18, -0.14); group.add(lUpper);
  const lLower = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.3, 10), shirtMat);
  lLower.rotation.z = 0.3; lLower.rotation.x = 1.1;
  lLower.position.set(-0.41, 1.0, -0.34); group.add(lLower);
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 10), skinMat);
  lHand.position.set(-0.44, 0.88, -0.52); group.add(lHand);

  // Right arm — mirror, reaching to shutter
  const rShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), shirtMat);
  rShoulder.position.set(0.26, 1.3, 0); group.add(rShoulder);
  const rUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 10), shirtMat);
  rUpper.rotation.z = -0.5; rUpper.rotation.x = 0.6;
  rUpper.position.set(0.34, 1.18, -0.14); group.add(rUpper);
  const rLower = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.3, 10), shirtMat);
  rLower.rotation.z = -0.3; rLower.rotation.x = 1.1;
  rLower.position.set(0.41, 1.0, -0.34); group.add(rLower);
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 10), skinMat);
  rHand.position.set(0.44, 0.88, -0.52); group.add(rHand);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.14, 10), skinMat);
  neck.position.set(0, 1.46, 0); group.add(neck);

  // Head — tilted slightly forward (looking through viewfinder)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.66, -0.04);
  headGroup.rotation.x = 0.28;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), skinMat);
  headGroup.add(head);

  // Hair
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
  hairTop.rotation.x = -0.1;
  headGroup.add(hairTop);

  // Ear nubs
  [-1, 1].forEach(s => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), skinMat);
    ear.position.set(s * 0.14, 0, 0); headGroup.add(ear);
  });

  // Nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), skinMat);
  nose.position.set(0, -0.02, 0.135); headGroup.add(nose);

  group.add(headGroup);

  // Position photographer behind camera
  group.position.set(0, 0, 5.5);
  group.rotation.y = Math.PI; // face scene

  // Not selectable
  group.traverse(c => { c.userData.isPhotographer = true; if (c.isMesh) c.castShadow = true; });

  // This function body is no longer called — GLB version above is used instead
}

// ─── CAMERA ON TRIPOD ────────────────────────────────────────────────────────

function buildCameraRig() {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#111111', metalness: 0.5, roughness: 0.4 });
  const lensMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', metalness: 0.7, roughness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#223355', metalness: 0.2, roughness: 0.05, envMapIntensity: 2 });
  const rubbery = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.95 });

  // Tripod legs (3)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const piv = new THREE.Group(); piv.rotation.y = a;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.72, 8), darkMat);
    leg.rotation.z = Math.PI / 2; leg.position.x = 0.36; piv.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), rubbMat);
    foot.position.x = 0.72; piv.add(foot);
    group.add(piv);
  }

  // Center column
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.0, 10), darkMat);
  col.position.y = 0.5; group.add(col);

  // Pan head
  const panHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.12), silvMat);
  panHead.position.y = 1.04; group.add(panHead);

  // Handle
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), darkMat);
  handle.rotation.z = Math.PI / 2; handle.position.set(0.22, 1.04, 0); group.add(handle);

  // ── Camera body ──
  const camGroup = new THREE.Group();
  camGroup.position.y = 1.16;
  camGroup.rotation.y = Math.PI; // faces photographer

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.09), bodyMat);
  camGroup.add(body);

  // Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.09), rubbery);
  grip.position.set(0.115, -0.01, 0); camGroup.add(grip);

  // Viewfinder hump
  const vf = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.07), bodyMat);
  vf.position.set(-0.02, 0.085, 0); camGroup.add(vf);

  // Shutter button
  const shutter = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.015, 10), silvMat);
  shutter.position.set(0.082, 0.074, -0.02); camGroup.add(shutter);

  // Hot shoe
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.025), silvMat);
  shoe.position.set(-0.02, 0.072, 0); camGroup.add(shoe);

  // Lens barrel (points toward subject — -Z of camGroup, which is +Z of scene after rotation)
  const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.055, 0.1, 22), lensMat);
  barrel1.rotation.x = Math.PI / 2; barrel1.position.z = -0.1; camGroup.add(barrel1);
  const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.14, 22), lensMat);
  barrel2.rotation.x = Math.PI / 2; barrel2.position.z = -0.19; camGroup.add(barrel2);
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.006, 8, 22), silvMat);
  lensRing.position.z = -0.27; camGroup.add(lensRing);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), glassMat);
  glass.position.z = -0.273; camGroup.add(glass);

  // Strap lugs
  [-1, 1].forEach(s => {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.028, 0.018), silvMat);
    lug.position.set(s * 0.1, 0.06, 0.03); camGroup.add(lug);
  });

  group.add(camGroup);

  group.position.set(5.5, 0, 5.8);
  group.rotation.y = -Math.PI * 0.48; // face toward scene centre
  group.traverse(c => { c.userData.isCameraRig = true; if (c.isMesh) c.castShadow = true; });
  scene.add(group);
}

buildCameraRig();

// ─── LIGHTING PHYSICS ────────────────────────────────────────────────────────

// Kelvin → linear RGB (Tanner Helland approximation)
function kelvinToColor(K) {
  K = Math.max(1000, Math.min(40000, K)) / 100;
  let r, g, b;
  r = K <= 66 ? 255 : 329.698727446 * Math.pow(K - 60, -0.1332047592);
  if (K <= 66) g = 99.4708025861 * Math.log(K) - 161.1195681661;
  else         g = 288.1221695283 * Math.pow(K - 60, -0.0755148492);
  b = K >= 66 ? 255 : (K <= 19 ? 0 : 138.5177312231 * Math.log(K - 10) - 305.0447927307);
  const clamp = v => Math.max(0, Math.min(255, v));
  return new THREE.Color(clamp(r)/255, clamp(g)/255, clamp(b)/255);
}

// Intensity 0–100 → Three.js light intensity
// Point/spot use decay=2 (ISL) so need high base to reach subject at 3-5 m
// Directional has no falloff — much lower raw value needed
function mapIntensity(val100, type) {
  return type === 'directional'
    ? (val100 / 100) * 1.5
    : (val100 / 100) * 12;
}

// Shadow softness from source size and distance to scene center
function computeSoftness(entry) {
  const lightPos = getLightWorldPos(entry);
  const dist = Math.max(0.5, lightPos.distanceTo(new THREE.Vector3(0, 1, 0)));
  return entry.props.size / dist;
}

// Role presets — apply physics-based defaults per role
const ROLE_PRESETS = {
  key:        { intensity: 75, colorTemp: 5600, size: 0.5, beamAngle: 35, shadowStrength: 1.0 },
  fill:       { intensity: 30, colorTemp: 5500, size: 1.5, beamAngle: 60, shadowStrength: 0.2 },
  rim:        { intensity: 55, colorTemp: 6200, size: 0.3, beamAngle: 25, shadowStrength: 0.8 },
  hair:       { intensity: 45, colorTemp: 5800, size: 0.2, beamAngle: 15, shadowStrength: 0.6 },
  background: { intensity: 40, colorTemp: 4800, size: 1.0, beamAngle: 70, shadowStrength: 0.1 },
  practical:  { intensity: 20, colorTemp: 2700, size: 0.4, beamAngle: 45, shadowStrength: 0.3 },
};

// Apply role positioning suggestions (relative to scene center)
const ROLE_POSITIONS = {
  key:        { x: -2.5, z:  3.0 },
  fill:       { x:  2.5, z:  2.5 },
  rim:        { x:  0.5, z: -3.5 },
  hair:       { x:  0.0, z: -2.0 },
  background: { x:  0.0, z: -5.0 },
  practical:  { x:  2.0, z:  1.0 },
};

function applyLightPhysics(entry) {
  const p = entry.props;

  // Inverse Square Law: decay=2 in Three.js = 1/r² falloff automatically
  if (entry.light.isPointLight || entry.light.isSpotLight) entry.light.decay = 2;

  // Intensity mapped 0–100 (directional uses separate scale — no falloff)
  entry.light.intensity = mapIntensity(p.intensity, entry.type);

  // Color temperature → RGB
  const col = kelvinToColor(p.colorTemp);
  entry.light.color.copy(col);
  const em = entry.headMesh.getObjectByName('emissive');
  if (em) { em.material.color.copy(col); em.material.emissive.copy(col); }
  const cone = entry.headMesh.getObjectByName('volCone');
  if (cone) cone.material.color.copy(col);

  // Beam angle (spots)
  if (entry.type === 'spot') {
    entry.light.angle    = (p.beamAngle / 2) * (Math.PI / 180);
    entry.light.penumbra = 0.3 + (p.size * 0.15); // bigger source = softer edge
  }

  // Shadow softness from source size / distance (Inverse Square softness approx)
  const softness = computeSoftness(entry);
  const radius   = Math.min(20, Math.max(1, softness * 18));
  entry.light.shadow.radius = radius;

  // Shadow strength (bias tweak)
  const bias = -0.0005 - (p.shadowStrength ?? 1) * 0.0005;
  entry.light.shadow.bias = bias;
}

// ─── LIGHT MANAGER ───────────────────────────────────────────────────────────

let lightSeq = 0;
const lights = [];
const LABEL  = { point: 'Flash Head', spot: 'PAR Spot', directional: 'Softbox' };
const POLE_H = { point: 2.05, spot: 2.55, directional: 2.25 };

function addLight(type, cfg = {}) {
  const id   = ++lightSeq;
  const role = cfg.role ?? 'key';
  const preset = { ...ROLE_PRESETS[role], ...(cfg.props ?? {}) };

  // Override with legacy cfg shortcuts if provided
  if (cfg.intensity !== undefined) preset.intensity = cfg.intensity * 8.33; // back-compat
  if (cfg.colorTemp !== undefined) preset.colorTemp = cfg.colorTemp;

  const initColor = kelvinToColor(preset.colorTemp);
  let light;

  if (type === 'point') {
    light = new THREE.PointLight(initColor, mapIntensity(preset.intensity, 'point'), 30);
    light.decay = 2;
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
  } else if (type === 'spot') {
    light = new THREE.SpotLight(initColor, mapIntensity(preset.intensity, 'spot'));
    light.decay = 2;
    light.angle    = (preset.beamAngle / 2) * (Math.PI / 180);
    light.penumbra = 0.35;
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.target.position.set(0, 0, 0);
    scene.add(light.target);
  } else if (type === 'directional') {
    light = new THREE.DirectionalLight(initColor, mapIntensity(preset.intensity, 'directional'));
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left:-6, right:6, top:6, bottom:-6, near:0.5, far:30 });
    light.target.position.set(0, 0, 0);
    scene.add(light.target);
  }

  scene.add(light);

  const group = new THREE.Group();
  const poleH = cfg.poleH ?? POLE_H[type];
  buildStand(poleH, group);

  let headMesh;
  if (type === 'point')     headMesh = buildFlashHead('#' + initColor.getHexString());
  else if (type === 'spot') headMesh = buildParSpot('#' + initColor.getHexString());
  else                      headMesh = buildSoftbox('#' + initColor.getHexString());

  headMesh.position.y = poleH;
  group.add(headMesh);
  group.userData.headMesh = headMesh;
  group.userData.poleH    = poleH;

  // Position from role or explicit cfg
  const rPos = ROLE_POSITIONS[role];
  group.position.set(cfg.x ?? rPos.x, 0, cfg.z ?? rPos.z);
  group.traverse(c => { if (c.isMesh) c.userData.lightId = id; });
  scene.add(group);

  const entry = {
    id, type, light, group, headMesh, enabled: true, role,
    props: { ...preset, poleHeight: poleH, tiltY: 1.0 },
  };
  lights.push(entry);
  applyLightPhysics(entry);
  window.dispatchEvent(new CustomEvent('studio:lightAdded', { detail: { role, type } }));
  return entry;
}

function getLightWorldPos(entry) {
  const v = new THREE.Vector3();
  entry.headMesh.getWorldPosition(v);
  const offsets = {
    point:       new THREE.Vector3(0, 0, 0.22),
    spot:        new THREE.Vector3(0, -0.22, 0),
    directional: new THREE.Vector3(0, 0, -0.36),
  };
  const off = offsets[entry.type].clone().applyQuaternion(entry.headMesh.getWorldQuaternion(new THREE.Quaternion()));
  return v.add(off);
}

function removeLight(id) {
  const i = lights.findIndex(l => l.id === id);
  if (i < 0) return;
  const { light, group } = lights[i];
  if (transform.object === group) { transform.detach(); clearSelection(); }
  group.traverse(c => { if (c.isMesh) { c.geometry?.dispose(); c.material?.dispose?.(); } });
  scene.remove(light, group);
  if (light.target) scene.remove(light.target);
  lights.splice(i, 1);
}

function toggleLight(id) {
  const e = lights.find(l => l.id === id);
  if (!e) return;
  e.enabled = !e.enabled;
  e.light.visible = e.enabled;
  const em   = e.headMesh.getObjectByName('emissive');
  const cone = e.headMesh.getObjectByName('volCone');
  if (em)   em.material.emissiveIntensity = e.enabled ? emissiveDefault(e.type) : 0;
  if (cone) cone.visible = e.enabled;
  return e.enabled;
}

function emissiveDefault(type) {
  return type === 'directional' ? 1.2 : type === 'spot' ? 5 : 4;
}

// ─── LIGHT RATIO HELPER ──────────────────────────────────────────────────────

function getLightRatio() {
  const key  = lights.find(l => l.role === 'key');
  const fill = lights.find(l => l.role === 'fill');
  if (!key || !fill) return null;
  const ratio = key.props.intensity / Math.max(1, fill.props.intensity);
  return ratio.toFixed(1) + ':1';
}

// ─── OBJECT MANAGER ──────────────────────────────────────────────────────────

let objSeq = 0;
const objects = [];
const GEOS = {
  sphere:   () => new THREE.SphereGeometry(0.5, 48, 48),
  box:      () => new THREE.BoxGeometry(1, 1, 1),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1.2, 48),
  cone:     () => new THREE.ConeGeometry(0.5, 1.2, 48),
  torus:    () => new THREE.TorusGeometry(0.4, 0.15, 24, 100),
};

function addObject(shape) {
  if (!GEOS[shape]) return;
  const mat  = new THREE.MeshStandardMaterial({ color: '#c0c0c0', roughness: 0.45, metalness: 0.05, envMapIntensity: 1 });
  const mesh = new THREE.Mesh(GEOS[shape](), mat);
  mesh.position.set((Math.random()-0.5)*3, shape==='torus'?0.7:0.62, (Math.random()-0.5)*2);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.isObject = true;
  mesh.userData.id = ++objSeq;
  scene.add(mesh);
  objects.push(mesh);
  return mesh;
}

function deleteObject(mesh) {
  const i = objects.indexOf(mesh);
  if (i < 0) return;
  scene.remove(mesh);
  mesh.geometry.dispose(); mesh.material.dispose();
  objects.splice(i, 1);
}

// ─── SELECTION & PANELS ──────────────────────────────────────────────────────

let selObj   = null;
let selLight = null;

const lightPanel  = document.getElementById('light-panel');
const objectPanel = document.getElementById('object-panel');

const ROLE_COLORS = {
  key:        '#FFD166',
  fill:       '#6EC6F5',
  rim:        '#FF6B9D',
  hair:       '#7ECAC9',
  background: '#B69CF5',
  practical:  '#FF9947',
};

const ROLE_DISPLAY_NAMES = {
  key:        'Key Light',
  fill:       'Fill Light',
  rim:        'Back Light',
  hair:       'Hair Light',
  background: 'BG Light',
  practical:  'Practical',
};

const ROLE_DESCS = {
  key:        'Primary source of illumination. Defines the shape, texture and cast shadows on the subject.',
  fill:       'Softens key-light shadows. Controls the contrast ratio and tonal range of the scene.',
  rim:        'Fired from behind the subject to create edge separation and depth from the background.',
  hair:       'Top or back light for hair separation. Adds sheen, shimmer and three-dimensional depth.',
  background: 'Lights the backdrop independently from the subject to control atmosphere and depth.',
  practical:  'A light source visible in frame — lamp, neon, candle. Sets mood, era and realism.',
};

// ── Slider pct fill helper ────────────────────────────────────────────────────
function syncPct(el) {
  const min = parseFloat(el.min ?? 0), max = parseFloat(el.max ?? 1), val = parseFloat(el.value);
  el.style.setProperty('--pct', ((val - min) / (max - min) * 100).toFixed(1) + '%');
}

// ── Build per-role dynamic controls ──────────────────────────────────────────
function makeCtrl({ id, label, min, max, step, value, unit = '', extra = '' }) {
  const pct = ((value - min) / (max - min) * 100).toFixed(1);
  return `
    <div class="ctrl-block">
      <div class="ctrl-header">
        <label for="${id}">${label}</label>
        <span class="ctrl-val" id="${id}-val">${value}${unit}</span>
      </div>
      ${extra}
      <input type="range" class="slider" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="--pct:${pct}%">
    </div>`;
}

function buildLightBody(entry) {
  const p      = entry.props;
  const isSpot = entry.type === 'spot';
  const kPct   = ((p.colorTemp - 1000) / 9000 * 100).toFixed(1);
  const hPct   = ((p.poleHeight - 0.5) / 4.5 * 100).toFixed(1);
  const tPct   = (p.tiltY / 3 * 100).toFixed(1);

  const kelvinCtrl = `
    <div class="ctrl-block">
      <div class="ctrl-header">
        <label for="lp-temp">Color Temp</label>
        <span class="ctrl-val" id="lp-temp-val">${p.colorTemp}K</span>
      </div>
      <div class="kelvin-strip"></div>
      <input type="range" class="slider" id="lp-temp" min="1000" max="10000" step="100" value="${p.colorTemp}" style="--pct:${kPct}%">
    </div>`;

  const currentMode = transform.mode ?? 'translate';

  return `
    <div class="lp-modes">
      <button class="mode-btn${currentMode === 'translate' ? ' active' : ''}" data-mode="translate">Move</button>
      <button class="mode-btn${currentMode === 'rotate'    ? ' active' : ''}" data-mode="rotate">Rotate</button>
      <button class="mode-btn${currentMode === 'scale'     ? ' active' : ''}" data-mode="scale">Scale</button>
    </div>
    ${makeCtrl({ id:'lp-intensity', label:'Intensity',   min:0,    max:100, step:1,    value:p.intensity,            unit:'' })}
    ${kelvinCtrl}
    ${makeCtrl({ id:'lp-height',    label:'Height',      min:0.5,  max:5,   step:0.05, value:p.poleHeight.toFixed(2), unit:'m' })}
    ${makeCtrl({ id:'lp-tilt',      label:'Aim Height',  min:0,    max:3,   step:0.05, value:p.tiltY.toFixed(2),      unit:'m' })}
    ${makeCtrl({ id:'lp-size',      label:'Source Size', min:0.05, max:3,   step:0.05, value:p.size,                  unit:'m' })}
    ${isSpot ? makeCtrl({ id:'lp-beam', label:'Beam Angle', min:5, max:90, step:1, value:p.beamAngle ?? 35, unit:'°' }) : ''}
  `;
}

// ── Open / close panels ───────────────────────────────────────────────────────
function openLightPanel(entry) {
  const color = ROLE_COLORS[entry.role] || '#7c6ef5';

  lightPanel.style.setProperty('--lt-color', color);
  document.getElementById('lp-accent-bar').style.background = color;
  document.getElementById('lp-dot').style.background        = color;
  document.getElementById('lp-dot').style.boxShadow         = `0 0 8px ${color}`;
  document.getElementById('lp-name').textContent            = ROLE_DISPLAY_NAMES[entry.role] || entry.role;
  document.getElementById('lp-role-badge').textContent      = LABEL[entry.type];
  document.getElementById('lp-desc').textContent            = ROLE_DESCS[entry.role] || '';

  document.getElementById('lp-body').innerHTML = buildLightBody(entry);
  wireLightSliders(entry);

  document.getElementById('lp-toggle').textContent = entry.enabled ? 'Turn OFF' : 'Turn ON';
  updatePhysicsReadout(entry);

  lightPanel.querySelectorAll('.slider').forEach(syncPct);
  lightPanel.classList.add('lp-open');
}

function closeLightPanel()  { lightPanel.classList.remove('lp-open'); }
function openObjectPanel()  { objectPanel.classList.add('op-open'); }
function closeObjectPanel() { objectPanel.classList.remove('op-open'); }

// ── Wire dynamically built light sliders ─────────────────────────────────────
function wireLightSliders() {
  const bind = (id, apply) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', e => {
      if (!selLight) return;
      apply(e.target.value);
      syncPct(e.target);
      applyLightPhysics(selLight);
      updatePhysicsReadout(selLight);
    });
  };

  bind('lp-intensity', v => {
    selLight.props.intensity = parseFloat(v);
    const vEl = document.getElementById('lp-intensity-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(0);
  });
  bind('lp-temp', v => {
    selLight.props.colorTemp = parseInt(v);
    const vEl = document.getElementById('lp-temp-val');
    if (vEl) vEl.textContent = v + 'K';
  });
  bind('lp-size', v => {
    selLight.props.size = parseFloat(v);
    const vEl = document.getElementById('lp-size-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(2) + 'm';
  });
  bind('lp-beam', v => {
    selLight.props.beamAngle = parseInt(v);
    const vEl = document.getElementById('lp-beam-val');
    if (vEl) vEl.textContent = v + '°';
  });
  bind('lp-height', v => {
    selLight.props.poleHeight = parseFloat(v);
    selLight.headMesh.position.y = parseFloat(v);
    const vEl = document.getElementById('lp-height-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(2) + 'm';
  });
  bind('lp-tilt', v => {
    selLight.props.tiltY = parseFloat(v);
    const vEl = document.getElementById('lp-tilt-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(2) + 'm';
  });

  // Mode buttons (dynamically inserted into lp-body)
  document.querySelectorAll('#lp-body .mode-btn').forEach(b =>
    b.addEventListener('click', () => {
      setMode(b.dataset.mode);
      document.querySelectorAll('#lp-body .mode-btn').forEach(mb =>
        mb.classList.toggle('active', mb.dataset.mode === b.dataset.mode));
    })
  );
}

const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();
let   didMove   = false;

canvas.addEventListener('pointerdown', () => { didMove = false; });
canvas.addEventListener('pointermove', () => { didMove = true; });
canvas.addEventListener('pointerup', e => {
  if (e.button !== 0 || transform.dragging || didMove) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
  mouse.y = ((e.clientY - rect.top)  / rect.height) * -2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // 1. Subject objects
  const oh = raycaster.intersectObjects(objects, false);
  if (oh.length) { selectObj(oh[0].object); return; }

  // 2. Light stands
  const gizmoMeshes = [];
  lights.forEach(l => l.group.traverse(c => { if (c.isMesh) gizmoMeshes.push(c); }));
  const lh = raycaster.intersectObjects(gizmoMeshes, false);
  if (lh.length) {
    const id    = lh[0].object.userData.lightId;
    const entry = lights.find(l => l.id === id);
    if (entry) { selectLight(entry); return; }
  }

  clearSelection();
});

function selectObj(mesh) {
  clearSelection();
  selObj = mesh;
  mesh.material.emissive.set('#1a1a1a');
  mesh.material.emissiveIntensity = 1;
  transform.attach(mesh);
  setMode('translate');
  document.getElementById('obj-color').value     = '#' + mesh.material.color.getHexString();
  document.getElementById('obj-roughness').value = mesh.material.roughness;
  document.getElementById('obj-metalness').value = mesh.material.metalness;
  syncR('obj-roughness'); syncR('obj-metalness');
  openObjectPanel();
}

function selectLight(entry) {
  clearSelection();
  selLight = entry;
  const em = entry.headMesh.getObjectByName('emissive');
  if (em) em.material.emissiveIntensity = emissiveDefault(entry.type) * 1.6;
  transform.attach(entry.group);
  setMode('translate');
  openLightPanel(entry);
}

function updatePhysicsReadout(entry) {
  if (!entry) return;
  const softness = computeSoftness(entry);
  const isSoft   = softness > 0.15;
  document.getElementById('phys-shadow').textContent   = isSoft ? 'Soft' : 'Hard';
  document.getElementById('phys-softness').textContent = softness.toFixed(2);
  document.getElementById('phys-falloff').textContent  = 'Inv. Square (1/r²)';
  const ratio = getLightRatio();
  document.getElementById('phys-ratio').textContent    = ratio ?? (entry.role === 'key' ? 'No fill set' : '—');
}

function clearSelection() {
  if (selObj) { selObj.material.emissiveIntensity = 0; selObj = null; }
  if (selLight) {
    const em = selLight.headMesh.getObjectByName('emissive');
    if (em && selLight.enabled) em.material.emissiveIntensity = emissiveDefault(selLight.type);
    selLight = null;
  }
  transform.detach();
  closeLightPanel();
  closeObjectPanel();
}

function deleteSelected() {
  if (selObj)   { transform.detach(); deleteObject(selObj); selObj = null; closeObjectPanel(); }
  if (selLight) { const id = selLight.id; clearSelection(); removeLight(id); }
}

function setMode(mode) {
  transform.setMode(mode);
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}

function syncR(id) {
  const el = document.getElementById(id), v = el.nextElementSibling;
  if (v?.classList.contains('rval')) v.textContent = parseFloat(el.value).toFixed(2);
}

// ─── KEYBOARD ────────────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'g') setMode('translate');
  if (e.key === 'r') setMode('rotate');
  if (e.key === 's') setMode('scale');
  if (e.key === 'Escape')                          clearSelection();
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
});

// ─── CAMERA PRESETS ──────────────────────────────────────────────────────────

const VIEWS = { front:[0,2.5,9], side:[9,2.5,0], top:[0,11,0.01], quarter:[5,4,6] };
function setCameraView(name) {
  const p = VIEWS[name]; if (!p) return;
  camera.position.set(...p); orbit.target.set(0,1.2,0); orbit.update();
}

// ─── SCREENSHOT ──────────────────────────────────────────────────────────────

function captureFrame() {
  const th = transform.getHelper();
  const wasVis = th.visible; th.visible = false;
  composer.render();
  const url = canvas.toDataURL('image/png');
  th.visible = wasVis;
  return url;
}

function takeScreenshot() {
  const dialog = document.getElementById('screenshot-dialog');
  dialog.classList.remove('hidden');
  const input = document.getElementById('student-name');
  input.value = '';
  requestAnimationFrame(() => input.focus());
}

document.getElementById('sd-cancel').addEventListener('click', () => {
  document.getElementById('screenshot-dialog').classList.add('hidden');
});

document.getElementById('sd-save').addEventListener('click', () => {
  const name    = document.getElementById('student-name').value.trim();
  const url     = captureFrame();
  const filename = name
    ? `${name.replace(/\s+/g, '_')}_LightingStudio.png`
    : `LightingStudio_${Date.now()}.png`;
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  document.getElementById('screenshot-dialog').classList.add('hidden');
  const sr = document.getElementById('sr-announce');
  if (sr) sr.textContent = `Screenshot saved as ${filename}`;
});

document.getElementById('student-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('sd-save').click();
  if (e.key === 'Escape') document.getElementById('sd-cancel').click();
});

// ─── UI EVENTS ───────────────────────────────────────────────────────────────

// Toolbar: 6 role light buttons
const ROLE_TYPE_MAP = { key:'spot', fill:'point', rim:'directional', hair:'spot', background:'point', practical:'point' };
document.querySelectorAll('[data-role]').forEach(b =>
  b.addEventListener('click', () => {
    const entry = addLight(ROLE_TYPE_MAP[b.dataset.role] || 'point', { role: b.dataset.role });
    selectLight(entry);
  })
);

// Toolbar: object + view buttons
document.querySelectorAll('[data-add-object]').forEach(b =>
  b.addEventListener('click', () => addObject(b.dataset.addObject)));

document.querySelectorAll('[data-view]').forEach(b =>
  b.addEventListener('click', () => setCameraView(b.dataset.view)));

// Light panel static buttons
document.getElementById('lp-close').addEventListener('click', clearSelection);
document.getElementById('lp-return').addEventListener('click', clearSelection);

document.getElementById('lp-toggle').addEventListener('click', () => {
  if (!selLight) return;
  const on = toggleLight(selLight.id);
  document.getElementById('lp-toggle').textContent = on ? 'Turn OFF' : 'Turn ON';
});

document.getElementById('lp-delete').addEventListener('click', () => {
  if (!selLight) return;
  const id = selLight.id; clearSelection(); removeLight(id);
});

// Object panel
document.getElementById('op-close').addEventListener('click', clearSelection);

document.querySelectorAll('.mode-btn').forEach(b =>
  b.addEventListener('click', () => setMode(b.dataset.mode)));

document.getElementById('delete-selected').addEventListener('click', deleteSelected);

document.getElementById('obj-color').addEventListener('input', e => {
  if (selObj) selObj.material.color.set(e.target.value);
});
document.getElementById('obj-roughness').addEventListener('input', e => {
  if (selObj) { selObj.material.roughness = parseFloat(e.target.value); syncR('obj-roughness'); }
});
document.getElementById('obj-metalness').addEventListener('input', e => {
  if (selObj) { selObj.material.metalness = parseFloat(e.target.value); syncR('obj-metalness'); }
});

// HUD sliders
document.getElementById('exposure').addEventListener('input', e => {
  renderer.toneMappingExposure = parseFloat(e.target.value);
  const s = e.target.nextElementSibling; if (s) s.textContent = parseFloat(e.target.value).toFixed(2);
  syncPct(e.target);
});
document.getElementById('ambient-intensity').addEventListener('input', e => {
  ambient.intensity = parseFloat(e.target.value);
  const s = e.target.nextElementSibling; if (s) s.textContent = parseFloat(e.target.value).toFixed(2);
  syncPct(e.target);
});
document.getElementById('bloom-strength').addEventListener('input', e => {
  bloomPass.strength = parseFloat(e.target.value);
  const s = e.target.nextElementSibling; if (s) s.textContent = parseFloat(e.target.value).toFixed(2);
  syncPct(e.target);
});

document.getElementById('screenshot-btn').addEventListener('click', takeScreenshot);

// Init pct fill on HUD sliders
document.querySelectorAll('#hud input[type=range]').forEach(syncPct);

// ─── INIT LIGHTS ─────────────────────────────────────────────────────────────

// Start with key light only — student builds up the setup
addLight('spot', { role: 'key' });

const initSphere = addObject('sphere');
if (initSphere) initSphere.position.set(-0.3, 0.62, 0);
const initBox = addObject('box');
if (initBox) initBox.position.set(0.8, 0.5, 0.4);

// ─── RESIZE ──────────────────────────────────────────────────────────────────

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ─── RENDER LOOP ─────────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  const delta = clock.getDelta();
  if (scene.userData.mixer) scene.userData.mixer.update(delta);

  // Sync THREE.Light position + run physics each frame
  lights.forEach(entry => {
    // Floor clamp — stand base cannot go below ground
    if (entry.group.position.y < 0) entry.group.position.y = 0;

    const pos = getLightWorldPos(entry);
    entry.light.position.copy(pos);

    // Shadow softness updates as light moves (ISL softness)
    const softness = computeSoftness(entry);
    entry.light.shadow.radius = Math.min(20, Math.max(1, softness * 18));

    // Apply tilt aim — target Y is user-controlled; X/Z locked to scene center
    if (entry.type === 'spot' || entry.type === 'directional') {
      entry.light.target.position.set(0, entry.props.tiltY ?? 1.0, 0);
      entry.light.target.updateMatrixWorld();
    }
  });

  composer.render();
}

animate();

// ─── WELCOME & TUTORIAL ──────────────────────────────────────────────────────
initWelcome();
