import * as THREE from 'three';
import { OrbitControls }             from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls }         from 'three/examples/jsm/controls/TransformControls.js';
import { HDRLoader }                 from 'three/examples/jsm/loaders/HDRLoader.js';
import { RectAreaLightUniformsLib }  from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer }            from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }                from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass }                from 'three/examples/jsm/postprocessing/OutputPass.js';
import { initWelcome }               from './tutorial.js';

RectAreaLightUniformsLib.init();

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
composer.addPass(new OutputPass());

// ─── TRANSFORM CONTROLS ──────────────────────────────────────────────────────

const transform = new TransformControls(camera, renderer.domElement);
transform.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });
transform.setMode('translate');
// Helper not added to scene — gizmo stays hidden

// ─── HDR ENVIRONMENT ─────────────────────────────────────────────────────────

let envTexture = null;
new HDRLoader().load('/hdr/studio_small_02.hdr', texture => {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  envTexture = pmrem.fromEquirectangular(texture).texture;
  scene.environment = envTexture;
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

const ambient = new THREE.AmbientLight('#ffffff', 0.03);
scene.add(ambient);
const hemi = new THREE.HemisphereLight('#e8eeff', '#d4c8a8', 0.05);
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

function buildFresnel(colorHex) {
  const g = new THREE.Group();
  // Yoke arms
  const yokeL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.022, 0.022), silvMat);
  const yokeR = yokeL.clone();
  yokeL.position.set(-0.13, 0, 0); yokeR.position.set(0.13, 0, 0); g.add(yokeL, yokeR);
  // Cylindrical body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.30, 20), darkMat);
  body.rotation.x = Math.PI / 2; body.position.z = -0.01; g.add(body);
  [-0.05, 0.10].forEach(z => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.007, 8, 22), silvMat);
    ring.position.z = z; g.add(ring);
  });
  // Barn doors (4 flaps)
  const barnMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', metalness: 0.5, roughness: 0.5 });
  [0.09, -0.09].forEach(y => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.007, 0.13), barnMat);
    d.position.set(0, y, 0.17); g.add(d);
  });
  [0.10, -0.10].forEach(x => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.22, 0.13), barnMat);
    d.position.set(x, 0, 0.17); g.add(d);
  });
  // Fresnel glass lens
  const lensMat = new THREE.MeshPhysicalMaterial({ color: '#c8d8e8', transparent: true, opacity: 0.38, roughness: 0.05, transmission: 0.6 });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.010, 24), lensMat);
  lens.rotation.x = Math.PI / 2; lens.position.z = 0.16; g.add(lens);
  for (let i = 1; i <= 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(i * 0.018, 0.0022, 6, 22),
      new THREE.MeshStandardMaterial({ color: '#999', roughness: 0.2 }));
    ring.position.z = 0.163; g.add(ring);
  }
  // Tungsten bulb behind lens
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.030, 14, 14), emissiveMat(colorHex, 5));
  bulb.name = 'emissive'; bulb.position.z = 0.06; g.add(bulb);
  g.rotation.x = 0.25;
  return g;
}

function buildOctabox(colorHex) {
  const g = new THREE.Group();
  // Center mount ring
  const mount = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.014, 10, 12), silvMat);
  mount.rotation.x = Math.PI / 2; g.add(mount);
  // 8 side fabric panels
  const fabricMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const a   = (i / 8) * Math.PI * 2;
    const mid = (i / 8 + 1 / 16) * Math.PI * 2;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.60), fabricMat);
    panel.position.set(Math.cos(a) * 0.52, Math.sin(a) * 0.52, -0.30);
    // Face the panel inward
    const axis = new THREE.Vector3(Math.sin(mid), -Math.cos(mid), 0).normalize();
    panel.setRotationFromAxisAngle(axis, 0.55);
    panel.rotation.z = a;
    g.add(panel);
  }
  // Front octagonal frame ring
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.018, 8, 8), darkMat);
  frame.position.z = -0.62; g.add(frame);
  // Inner diffusion disc
  const diff = new THREE.Mesh(new THREE.CircleGeometry(0.68, 8),
    new THREE.MeshStandardMaterial({ color: '#eeeeee', roughness: 0.65 }));
  diff.position.z = -0.52; g.add(diff);
  // Emissive face
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.66, 8), emissiveMat(colorHex, 1.0));
  face.name = 'emissive'; face.position.z = -0.61; face.rotation.y = Math.PI; g.add(face);
  g.rotation.x = 0.18;
  return g;
}

function buildLedPanel(colorHex) {
  const g = new THREE.Group();
  // Yoke arms
  const yokeL = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.020, 0.020), silvMat);
  const yokeR = yokeL.clone();
  yokeL.position.set(-0.09, 0, 0); yokeR.position.set(0.09, 0, 0); g.add(yokeL, yokeR);
  // Thin panel body
  const panW = 0.58, panH = 0.28, panD = 0.042;
  const panBody = new THREE.Mesh(new THREE.BoxGeometry(panW, panH, panD), darkMat);
  panBody.position.z = -0.02; g.add(panBody);
  // Aluminium frame
  const frameMat = new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.9, roughness: 0.2 });
  [
    [0,           panH/2+0.008, 0, panW+0.02, 0.016, panD+0.01],
    [0,          -panH/2-0.008, 0, panW+0.02, 0.016, panD+0.01],
    [ panW/2+0.008, 0,          0, 0.016, panH,       panD+0.01],
    [-panW/2-0.008, 0,          0, 0.016, panH,       panD+0.01],
  ].forEach(([x, y, z, w, h, d]) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    f.position.set(x, y, z); g.add(f);
  });
  // LED grid (5×10 individual emitters)
  const ledMat = emissiveMat(colorHex, 2.5);
  const rows = 5, cols = 10;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.026, 0.006), ledMat);
    led.position.set(
      -panW/2 + 0.035 + c * (panW - 0.04) / (cols - 1),
      -panH/2 + 0.025 + r * (panH - 0.04) / (rows - 1),
      0.012
    );
    g.add(led);
  }
  // Overall emissive face for soft glow
  const face = new THREE.Mesh(new THREE.PlaneGeometry(panW - 0.04, panH - 0.04), emissiveMat(colorHex, 1.0));
  face.name = 'emissive'; face.position.z = 0.026; g.add(face);
  g.rotation.x = 0.15;
  return g;
}


// ─── LIGHTING PHYSICS ────────────────────────────────────────────────────────

// ─── PHYSICAL LIGHT MATH ────────────────────────────────────────────────────

// Luminous efficacy (lm/W) per lamp technology
const LM_PER_W = { tungsten: 14, hmi: 85, flash: 22, led: 100 };

// Scene calibration: maps real-world candela → Three.js display units.
// Calibrated so a Fresnel spot at default settings looks correctly exposed
// at toneMappingExposure 0.75.
const PHYS_SCALE = 0.001;

// CIE 1931 Planckian locus (Kim et al. 2002) → linear sRGB
// Far more accurate than Tanner Helland at warm (tungsten 3200K) and cool extremes.
function kelvinToColor(K) {
  K = Math.max(1000, Math.min(15000, K));

  // Step 1: K → CIE xy chromaticity via Planckian locus approximation
  let x;
  if (K <= 4000) {
    x = -0.2661239e9/(K*K*K) - 0.2343580e6/(K*K) + 0.8776956e3/K + 0.179910;
  } else {
    x = -3.0258469e9/(K*K*K) + 2.1070379e6/(K*K) + 0.2226347e3/K + 0.240390;
  }
  let y;
  if (K <= 2222) {
    y = -1.1063814*x*x*x - 1.34811020*x*x + 2.18555832*x - 0.20219683;
  } else if (K <= 4000) {
    y = -0.9549476*x*x*x - 1.37418593*x*x + 2.09137015*x - 0.16748867;
  } else {
    y = 3.0817580*x*x*x - 5.87338670*x*x + 3.75112997*x - 0.37001483;
  }

  // Step 2: CIE xy → XYZ (normalise Y = 1)
  const Y = 1.0, X = (Y / y) * x, Z = (Y / y) * (1 - x - y);

  // Step 3: XYZ → linear sRGB (D65 matrix, IEC 61966-2-1)
  let r =  3.2404542*X - 1.5371385*Y - 0.4985314*Z;
  let g = -0.9692660*X + 1.8760108*Y + 0.0415560*Z;
  let b =  0.0556434*X - 0.2040259*Y + 1.0572252*Z;

  // Clamp negatives, normalise to brightest channel (preserve hue, not luminance)
  r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  const m = Math.max(r, g, b, 1e-6);
  return new THREE.Color(r/m, g/m, b/m);
}

// Watts + equipment type → Three.js light intensity
// Point/Spot: returns candela (cd). RectArea: returns nit (cd/m²).
// ISL (1/r²) is handled automatically by Three.js with decay = 2.
function computeIntensity(watts, equipType, beamAngleDeg) {
  const def = EQUIP_DEFS[equipType];
  const lm  = watts * LM_PER_W[def.lampType];
  if (def.lightType === 'point') {
    // Dish reflector directs ~70% into forward hemisphere
    return (lm * 0.7 / (2 * Math.PI)) * PHYS_SCALE;
  }
  if (def.lightType === 'spot') {
    const half = (beamAngleDeg / 2) * (Math.PI / 180);
    const sr   = 2 * Math.PI * (1 - Math.cos(half));
    return (lm / sr) * PHYS_SCALE;
  }
  if (def.lightType === 'rect') {
    // Lambertian emitter: L = Φ / (A × π)
    return (lm / (def.srcW * def.srcH * Math.PI)) * PHYS_SCALE;
  }
  return 1;
}

// ─── EQUIPMENT DEFINITIONS ───────────────────────────────────────────────────

const EQUIP_DEFS = {
  monolight: { label:'Monolight',    lightType:'point', lampType:'flash',    poleH:2.0, defaultW:400, minW:100, maxW:800,  colorTemp:5600                                       },
  fresnel:   { label:'Fresnel Spot', lightType:'spot',  lampType:'tungsten', poleH:2.5, defaultW:650, minW:150, maxW:2000, colorTemp:3200, beamAngle:20, minBeam:10, maxBeam:50, penumbra:0.12 },
  parcan:    { label:'PAR Can',      lightType:'spot',  lampType:'tungsten', poleH:2.4, defaultW:575, minW:300, maxW:1000, colorTemp:3200, beamAngle:12, minBeam:5,  maxBeam:40, penumbra:0.03 },
  softbox:   { label:'Softbox',      lightType:'rect',  lampType:'flash',    poleH:2.0, defaultW:400, minW:100, maxW:800,  colorTemp:5500, srcW:0.9, srcH:1.2 },
  octabox:   { label:'Octabox',      lightType:'rect',  lampType:'flash',    poleH:2.0, defaultW:600, minW:100, maxW:800,  colorTemp:5500, srcW:1.5, srcH:1.5 },
  ledpanel:  { label:'LED Panel',    lightType:'rect',  lampType:'led',      poleH:2.2, defaultW:200, minW:50,  maxW:500,  colorTemp:5600, minTemp:2700, maxTemp:6500, srcW:0.6, srcH:0.3 },
};

// Role → equipment type
const ROLE_EQUIP_MAP = {
  key:        'fresnel',
  fill:       'softbox',
  rim:        'parcan',
  hair:       'monolight',
  background: 'ledpanel',
  practical:  'monolight',
};

// Role defaults (watts override, colorTemp override)
const ROLE_PRESETS = {
  key:        { watts: 650, colorTemp: 3200, beamAngle: 20 },
  fill:       { watts: 400, colorTemp: 5500 },
  rim:        { watts: 575, colorTemp: 3200, beamAngle: 12 },
  hair:       { watts: 200, colorTemp: 5600 },
  background: { watts: 200, colorTemp: 5600 },
  practical:  { watts: 100, colorTemp: 2700 },
};

const ROLE_POSITIONS = {
  key:        { x: -2.5, z:  3.0 },
  fill:       { x:  2.5, z:  2.5 },
  rim:        { x:  0.5, z: -3.5 },
  hair:       { x:  0.0, z: -2.0 },
  background: { x:  0.0, z: -5.0 },
  practical:  { x:  2.0, z:  1.0 },
};

function computeSoftness(entry) {
  const def  = EQUIP_DEFS[entry.equipType];
  const dist = Math.max(0.5, getLightWorldPos(entry).distanceTo(new THREE.Vector3(0, 1, 0)));
  const size = def.lightType === 'rect' ? Math.max(def.srcW, def.srcH) : (def.penumbra ? def.penumbra * 2 : 0.4);
  return size / dist;
}

function applyLightPhysics(entry) {
  const p   = entry.props;
  const def = EQUIP_DEFS[entry.equipType];

  // Color temperature → RGB
  const col = kelvinToColor(p.colorTemp);
  entry.light.color.copy(col);
  const em = entry.headMesh.getObjectByName('emissive');
  if (em) { em.material.color.copy(col); em.material.emissive.copy(col); }
  const cone = entry.headMesh.getObjectByName('volCone');
  if (cone) cone.material.color.copy(col);

  // Physically correct intensity (cd for point/spot, nit for rect)
  entry.light.intensity = computeIntensity(p.watts, entry.equipType, p.beamAngle);

  if (entry.lightType === 'point') {
    entry.light.decay = 2;
  } else if (entry.lightType === 'spot') {
    entry.light.decay    = 2;
    entry.light.angle    = (p.beamAngle / 2) * (Math.PI / 180);
    entry.light.penumbra = def.penumbra ?? 0.15;
    const softness = computeSoftness(entry);
    entry.light.shadow.radius = Math.min(20, Math.max(1, softness * 18));
    entry.light.shadow.bias   = -0.001;
  } else if (entry.lightType === 'rect') {
    entry.light.width  = def.srcW;
    entry.light.height = def.srcH;
  }
}

// ─── LIGHT MANAGER ───────────────────────────────────────────────────────────

let lightSeq = 0;
const lights = [];

function addLight(equipType, cfg = {}) {
  const id   = ++lightSeq;
  const role = cfg.role ?? 'key';
  const def  = EQUIP_DEFS[equipType];
  if (!def) { console.warn('Unknown equipType:', equipType); return null; }

  const preset    = ROLE_PRESETS[role] ?? {};
  const watts     = cfg.watts     ?? preset.watts     ?? def.defaultW;
  const colorTemp = cfg.colorTemp ?? preset.colorTemp ?? def.colorTemp;
  const beamAngle = cfg.beamAngle ?? preset.beamAngle ?? def.beamAngle ?? 35;

  const initColor = kelvinToColor(colorTemp);
  let light;

  if (def.lightType === 'point') {
    light = new THREE.PointLight(initColor, 1, 30);
    light.decay = 2;
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
  } else if (def.lightType === 'spot') {
    light = new THREE.SpotLight(initColor, 1);
    light.decay = 2;
    light.angle    = (beamAngle / 2) * (Math.PI / 180);
    light.penumbra = def.penumbra ?? 0.15;
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.target.position.set(0, 0, 0);
    scene.add(light.target);
  } else if (def.lightType === 'rect') {
    light = new THREE.RectAreaLight(initColor, 1, def.srcW, def.srcH);
  }

  scene.add(light);

  const group = new THREE.Group();
  const poleH = def.poleH;
  buildStand(poleH, group);

  const colHex = '#' + initColor.getHexString();
  let headMesh;
  if      (equipType === 'fresnel')  headMesh = buildFresnel(colHex);
  else if (equipType === 'parcan')   headMesh = buildParSpot(colHex);
  else if (equipType === 'softbox')  headMesh = buildSoftbox(colHex);
  else if (equipType === 'octabox')  headMesh = buildOctabox(colHex);
  else if (equipType === 'ledpanel') headMesh = buildLedPanel(colHex);
  else                               headMesh = buildFlashHead(colHex); // monolight

  headMesh.position.y = poleH;
  group.add(headMesh);
  group.userData.headMesh = headMesh;
  group.userData.poleH    = poleH;

  const rPos = ROLE_POSITIONS[role] ?? { x: 0, z: 0 };
  group.position.set(cfg.x ?? rPos.x, 0, cfg.z ?? rPos.z);
  group.traverse(c => { if (c.isMesh) c.userData.lightId = id; });
  scene.add(group);

  const entry = {
    id, equipType, lightType: def.lightType, light, group, headMesh, enabled: true, role,
    props: { watts, colorTemp, beamAngle, poleHeight: poleH, tiltY: 1.0 },
  };
  lights.push(entry);
  applyLightPhysics(entry);
  window.dispatchEvent(new CustomEvent('studio:lightAdded', { detail: { role, equipType } }));
  return entry;
}

function getLightWorldPos(entry) {
  const v = new THREE.Vector3();
  entry.headMesh.getWorldPosition(v);
  return v;
}

function removeLight(id) {
  const i = lights.findIndex(l => l.id === id);
  if (i < 0) return;
  const { light, group } = lights[i];
  if (selLight?.group === group) { clearSelection(); }
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
  if (em)   em.material.emissiveIntensity = e.enabled ? emissiveDefault(e.equipType) : 0;
  if (cone) cone.visible = e.enabled;
  return e.enabled;
}

function emissiveDefault(equipType) {
  const def = EQUIP_DEFS[equipType];
  if (!def) return 1;
  if (def.lightType === 'rect') return 1.2;
  if (def.lightType === 'spot') return 5;
  return 4;
}

// ─── LIGHT RATIO HELPER ──────────────────────────────────────────────────────

function getLightRatio() {
  const key  = lights.find(l => l.role === 'key');
  const fill = lights.find(l => l.role === 'fill');
  if (!key || !fill) return null;
  const ratio = key.props.watts / Math.max(1, fill.props.watts);
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
function makeCtrl({ id, label, min, max, step, value, unit = '' }) {
  const pct = ((value - min) / (max - min) * 100).toFixed(1);
  return `
    <div class="ctrl-block">
      <div class="ctrl-header">
        <label for="${id}">${label}</label>
        <span class="ctrl-val" id="${id}-val">${value}${unit}</span>
      </div>
      <input type="range" class="slider" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="--pct:${pct}%">
    </div>`;
}

function buildLightBody(entry) {
  const p      = entry.props;
  const def    = EQUIP_DEFS[entry.equipType];
  const isSpot = entry.lightType === 'spot';
  const minTemp = def.minTemp ?? 1000;
  const maxTemp = def.maxTemp ?? 10000;
  const kPct    = ((p.colorTemp - minTemp) / (maxTemp - minTemp) * 100).toFixed(1);
  const gx = entry.group.position.x.toFixed(1);
  const gz = entry.group.position.z.toFixed(1);

  const kelvinCtrl = `
    <div class="ctrl-block">
      <div class="ctrl-header">
        <label for="lp-temp">Color Temp</label>
        <span class="ctrl-val" id="lp-temp-val">${p.colorTemp}K</span>
      </div>
      <div class="kelvin-strip"></div>
      <input type="range" class="slider" id="lp-temp" min="${minTemp}" max="${maxTemp}" step="100" value="${p.colorTemp}" style="--pct:${kPct}%">
    </div>`;

  return `
    <div class="ctrl-section-label">Position</div>
    ${makeCtrl({ id:'lp-pos-x', label:'Left / Right', min:-7, max:7,  step:0.1, value:gx, unit:'m' })}
    ${makeCtrl({ id:'lp-pos-z', label:'Fore / Back',  min:-6, max:6,  step:0.1, value:gz, unit:'m' })}
    <div class="ctrl-section-label">Light</div>
    ${makeCtrl({ id:'lp-watts',  label:'Power',      min:def.minW, max:def.maxW, step:10,   value:p.watts,                 unit:'W' })}
    ${kelvinCtrl}
    ${makeCtrl({ id:'lp-height', label:'Height',     min:0.5, max:5,   step:0.05, value:p.poleHeight.toFixed(2), unit:'m' })}
    ${makeCtrl({ id:'lp-tilt',   label:'Aim Height', min:0,   max:3,   step:0.05, value:p.tiltY.toFixed(2),      unit:'m' })}
    ${isSpot ? makeCtrl({ id:'lp-beam', label:'Beam Angle', min:def.minBeam ?? 5, max:def.maxBeam ?? 90, step:1, value:p.beamAngle ?? def.beamAngle ?? 20, unit:'°' }) : ''}
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
  document.getElementById('lp-role-badge').textContent      = EQUIP_DEFS[entry.equipType].label;
  document.getElementById('lp-desc').textContent            = ROLE_DESCS[entry.role] || '';

  document.getElementById('lp-body').innerHTML = buildLightBody(entry);
  wireLightSliders();

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

  bind('lp-watts', v => {
    selLight.props.watts = parseFloat(v);
    const vEl = document.getElementById('lp-watts-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(0) + 'W';
  });
  bind('lp-temp', v => {
    selLight.props.colorTemp = parseInt(v);
    const vEl = document.getElementById('lp-temp-val');
    if (vEl) vEl.textContent = v + 'K';
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

  bind('lp-pos-x', v => {
    selLight.group.position.x = parseFloat(v);
    const vEl = document.getElementById('lp-pos-x-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(1) + 'm';
  });

  bind('lp-pos-z', v => {
    selLight.group.position.z = parseFloat(v);
    const vEl = document.getElementById('lp-pos-z-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(1) + 'm';
  });
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

function syncObjSliders() {
  if (!selObj) return;
  const set = (id, val, unit = '') => {
    const el = document.getElementById(id);
    const vEl = document.getElementById(id + '-val');
    if (el) { el.value = val; syncPct(el); }
    if (vEl) vEl.textContent = parseFloat(val).toFixed(id === 'obj-rot-y' ? 0 : 1) + unit;
  };
  set('obj-pos-x', selObj.position.x.toFixed(1),  'm');
  set('obj-pos-y', selObj.position.y.toFixed(2),  'm');
  set('obj-pos-z', selObj.position.z.toFixed(1),  'm');
  set('obj-rot-y', THREE.MathUtils.radToDeg(selObj.rotation.y).toFixed(0), '°');
  set('obj-scale', selObj.scale.x.toFixed(2), '×');
}

function syncLightPosSliders() {
  if (!selLight) return;
  const ex = document.getElementById('lp-pos-x');
  const ez = document.getElementById('lp-pos-z');
  if (ex) { ex.value = selLight.group.position.x.toFixed(1); syncPct(ex); document.getElementById('lp-pos-x-val').textContent = selLight.group.position.x.toFixed(1) + 'm'; }
  if (ez) { ez.value = selLight.group.position.z.toFixed(1); syncPct(ez); document.getElementById('lp-pos-z-val').textContent = selLight.group.position.z.toFixed(1) + 'm'; }
}

function selectObj(mesh) {
  clearSelection();
  selObj = mesh;
  mesh.material.emissive.set('#1a1a1a');
  mesh.material.emissiveIntensity = 1;
  document.getElementById('obj-color').value     = '#' + mesh.material.color.getHexString();
  document.getElementById('obj-roughness').value = mesh.material.roughness;
  document.getElementById('obj-metalness').value = mesh.material.metalness;
  syncR('obj-roughness'); syncR('obj-metalness');
  syncObjSliders();
  openObjectPanel();
}

function selectLight(entry) {
  clearSelection();
  selLight = entry;
  const em = entry.headMesh.getObjectByName('emissive');
  if (em) em.material.emissiveIntensity = emissiveDefault(entry.equipType) * 1.6;
  openLightPanel(entry);
}

function updatePhysicsReadout(entry) {
  if (!entry) return;
  const def      = EQUIP_DEFS[entry.equipType];
  const lm       = Math.round(entry.props.watts * LM_PER_W[def.lampType]);
  const softness = computeSoftness(entry);
  const isSoft   = softness > 0.15;
  document.getElementById('phys-shadow').textContent   = isSoft ? 'Soft' : 'Hard';
  document.getElementById('phys-softness').textContent = `${softness.toFixed(2)}  (${lm} lm)`;
  document.getElementById('phys-falloff').textContent  = entry.lightType === 'rect' ? 'Area (Lambertian)' : 'Inv. Square (1/r²)';
  const ratio = getLightRatio();
  document.getElementById('phys-ratio').textContent    = ratio ?? (entry.role === 'key' ? 'No fill set' : '—');
}

function clearSelection() {
  if (selObj) { selObj.material.emissiveIntensity = 0; selObj = null; }
  if (selLight) {
    const em = selLight.headMesh.getObjectByName('emissive');
    if (em && selLight.enabled) em.material.emissiveIntensity = emissiveDefault(selLight.equipType);
    selLight = null;
  }
  freeTransformBox?.classList.add('hidden');
  closeLightPanel();
  closeObjectPanel();
}

function deleteSelected() {
  if (selObj)   { deleteObject(selObj); selObj = null; closeObjectPanel(); freeTransformBox?.classList.add('hidden'); }
  if (selLight) { const id = selLight.id; clearSelection(); removeLight(id); }
}


function syncR(id) {
  const el = document.getElementById(id), v = el.nextElementSibling;
  if (v?.classList.contains('rval')) v.textContent = parseFloat(el.value).toFixed(2);
}

// ─── FREE TRANSFORM BOX ──────────────────────────────────────────────────────

const freeTransformBox = document.getElementById('transform-box');
const ftBbox           = document.getElementById('ft-bbox');

let ftState = null;

function getScreenBounds(obj, excludeNames = []) {
  const b3 = new THREE.Box3();
  obj.traverse(child => {
    if (child.isMesh && !excludeNames.includes(child.name)) {
      b3.expandByObject(child);
    }
  });
  if (b3.isEmpty()) b3.setFromObject(obj); // fallback
  const W = canvas.clientWidth, H = canvas.clientHeight;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const v = new THREE.Vector3(
      i & 1 ? b3.max.x : b3.min.x,
      i & 2 ? b3.max.y : b3.min.y,
      i & 4 ? b3.max.z : b3.min.z
    ).project(camera);
    const sx = (v.x *  0.5 + 0.5) * W;
    const sy = (v.y * -0.5 + 0.5) * H;
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
    if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function positionTransformBox() {
  const target = selObj || (selLight ? selLight.group : null);
  if (!target) { freeTransformBox.classList.add('hidden'); return; }

  const { x, y, w, h } = getScreenBounds(target, ['volCone']);
  const PAD = 12;
  ftBbox.style.left   = (x - PAD) + 'px';
  ftBbox.style.top    = (y - PAD) + 'px';
  ftBbox.style.width  = (w + PAD * 2) + 'px';
  ftBbox.style.height = (h + PAD * 2) + 'px';

  const isLight = !!selLight;
  ftBbox.querySelectorAll('.ft-corner').forEach(c => { c.style.display = isLight ? 'none' : ''; });

  freeTransformBox.classList.remove('hidden');
}

ftBbox.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const target = selObj || (selLight ? selLight.group : null);
  if (!target) return;
  e.stopPropagation();
  e.preventDefault();

  const cornerEl = e.target.closest('.ft-corner');
  const isRotate = !!e.target.closest('#ft-rot-handle');

  const rotTarget = selObj || selLight?.group;

  if (cornerEl && selObj) {
    const corner = cornerEl.dataset.corner;
    ftState = {
      type: 'corner',
      origScale: selObj.scale.x,
      startX: e.clientX, startY: e.clientY,
      outX: corner.includes('e') ? 1 : -1,
      outY: corner.includes('s') ? 1 : -1,
    };
  } else if (isRotate && rotTarget) {
    const { cx, cy } = getScreenBounds(target, ['volCone']);
    ftState = {
      type: 'rotate',
      origRotY: rotTarget.rotation.y,
      cx, cy,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
    };
  } else {
    const rect = canvas.getBoundingClientRect();
    const ndcZ = target.position.clone().project(camera).z;
    ftState = {
      type: 'move',
      startX: e.clientX, startY: e.clientY,
      origPos: target.position.clone(),
      ndcZ, rect,
      target,
    };
  }

  ftBbox.setPointerCapture(e.pointerId);
  ftBbox.classList.add('ft-grabbing');
  orbit.enabled = false;
});

ftBbox.addEventListener('pointermove', e => {
  if (!ftState) return;

  if (ftState.type === 'move') {
    const { rect, ndcZ, startX, startY, origPos, target } = ftState;
    const toWorld = (cx, cy) => new THREE.Vector3(
      ((cx - rect.left) / rect.width)  *  2 - 1,
     -((cy - rect.top)  / rect.height) *  2 + 1,
      ndcZ
    ).unproject(camera);
    const p0 = toWorld(startX, startY);
    const p1 = toWorld(e.clientX, e.clientY);
    target.position.x = origPos.x + (p1.x - p0.x);
    target.position.z = origPos.z + (p1.z - p0.z);
    if (selObj)   syncObjSliders();
    if (selLight) syncLightPosSliders();
  } else if (ftState.type === 'corner' && selObj) {
    const dx = e.clientX - ftState.startX, dy = e.clientY - ftState.startY;
    const sign = Math.sign(dx * ftState.outX + dy * ftState.outY) || 1;
    const drag = Math.hypot(dx, dy) * sign;
    const newScale = Math.max(0.1, Math.min(5, ftState.origScale * Math.max(0.05, 1 + drag / 200)));
    selObj.scale.setScalar(newScale);
    const bottom = new THREE.Box3().setFromObject(selObj).min.y;
    if (bottom < 0) selObj.position.y -= bottom;
    syncObjSliders();
  } else if (ftState.type === 'rotate') {
    const rt = selObj || selLight?.group;
    if (!rt) return;
    const angle = Math.atan2(e.clientY - ftState.cy, e.clientX - ftState.cx);
    rt.rotation.y = ftState.origRotY + (angle - ftState.startAngle);
    if (selObj) syncObjSliders();
  }
});

ftBbox.addEventListener('pointerup',     () => { ftState = null; ftBbox.classList.remove('ft-grabbing'); orbit.enabled = true; });
ftBbox.addEventListener('pointercancel', () => { ftState = null; ftBbox.classList.remove('ft-grabbing'); orbit.enabled = true; });

// ─── KEYBOARD ────────────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
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
  freeTransformBox.classList.add('hidden');
  composer.render();
  const url = canvas.toDataURL('image/png');
  if (selObj || selLight) freeTransformBox.classList.remove('hidden');
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

// ── Toolbar panel toggles ─────────────────────────────────────────────────────
const TB_PANELS = {
  'tb-lights-btn':  'tb-lights-panel',
  'tb-objects-btn': 'tb-objects-panel',
  'tb-views-btn':   'tb-views-panel',
};

function closeAllPanels() {
  Object.entries(TB_PANELS).forEach(([btnId, panelId]) => {
    document.getElementById(panelId).classList.add('hidden');
    document.getElementById(btnId).setAttribute('aria-expanded', 'false');
    document.getElementById(btnId).classList.remove('tb-cat-btn--active');
  });
}

Object.entries(TB_PANELS).forEach(([btnId, panelId]) => {
  document.getElementById(btnId).addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = !document.getElementById(panelId).classList.contains('hidden');
    closeAllPanels();
    if (!isOpen) {
      document.getElementById(panelId).classList.remove('hidden');
      document.getElementById(btnId).setAttribute('aria-expanded', 'true');
      document.getElementById(btnId).classList.add('tb-cat-btn--active');
    }
  });
});

document.addEventListener('click', e => {
  if (!e.target.closest('.tb-panel') && !e.target.closest('.tb-cat-btn')) closeAllPanels();
});

// Toolbar: 6 role light buttons
document.querySelectorAll('[data-role]').forEach(b =>
  b.addEventListener('click', () => {
    closeAllPanels();
    const equipType = ROLE_EQUIP_MAP[b.dataset.role] || 'monolight';
    const entry = addLight(equipType, { role: b.dataset.role });
    selectLight(entry);
  })
);

// Toolbar: object + view buttons
document.querySelectorAll('[data-add-object]').forEach(b =>
  b.addEventListener('click', () => { closeAllPanels(); addObject(b.dataset.addObject); }));

document.querySelectorAll('[data-view]').forEach(b =>
  b.addEventListener('click', () => { closeAllPanels(); setCameraView(b.dataset.view); }));

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
document.getElementById('delete-selected').addEventListener('click', deleteSelected);

function bindObjSlider(id, apply) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', e => {
    if (!selObj) return;
    apply(parseFloat(e.target.value));
    syncPct(e.target);
    syncObjSliders();
  });
}

bindObjSlider('obj-pos-x', v => { selObj.position.x = v; });
bindObjSlider('obj-pos-y', v => { selObj.position.y = v; });
bindObjSlider('obj-pos-z', v => { selObj.position.z = v; });
bindObjSlider('obj-rot-y', v => { selObj.rotation.y = THREE.MathUtils.degToRad(v); });
bindObjSlider('obj-scale', v => { selObj.scale.setScalar(v); });

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
let envLightsOn = true;
document.getElementById('studio-lights-btn').addEventListener('click', () => {
  envLightsOn = !envLightsOn;
  ambient.intensity = envLightsOn ? 0.03 : 0;
  hemi.intensity    = envLightsOn ? 0.05 : 0;
  scene.environment = envLightsOn ? envTexture : null;
  const btn = document.getElementById('studio-lights-btn');
  btn.textContent = envLightsOn ? 'Lights ON' : 'Lights OFF';
  btn.setAttribute('aria-pressed', String(envLightsOn));
  btn.classList.toggle('hud-lights-off', !envLightsOn);
});

document.getElementById('screenshot-btn').addEventListener('click', takeScreenshot);

syncPct(document.getElementById('exposure'));

// ─── INIT LIGHTS ─────────────────────────────────────────────────────────────

// Start with key light only — student builds up the setup
addLight('fresnel', { role: 'key' });

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

  // Sync THREE.Light position + orientation each frame
  lights.forEach(entry => {
    // Floor clamp — stand base cannot go below ground
    if (entry.group.position.y < 0) entry.group.position.y = 0;

    const pos = getLightWorldPos(entry);
    entry.light.position.copy(pos);

    // Shadow softness updates as light moves (ISL softness)
    if (entry.lightType !== 'rect') {
      const softness = computeSoftness(entry);
      entry.light.shadow.radius = Math.min(20, Math.max(1, softness * 18));
    }

    // Aim toward tiltY target
    const tiltY = entry.props.tiltY ?? 1.0;
    if (entry.lightType === 'spot') {
      entry.light.target.position.set(0, tiltY, 0);
      entry.light.target.updateMatrixWorld();
    } else if (entry.lightType === 'rect') {
      entry.light.lookAt(0, tiltY, 0);
    }
  });

  positionTransformBox();
  composer.render();
}

animate();

// ─── WELCOME & TUTORIAL ──────────────────────────────────────────────────────
initWelcome();
