import * as pc from '../libs/playcanvas.mjs';
import { initVR } from './vr.js';

// ─── APPLICATION ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const app = new pc.Application(canvas, {
  mouse:    new pc.Mouse(canvas),
  keyboard: new pc.Keyboard(window),
  graphicsDeviceOptions: { antialias: true, preserveDrawingBuffer: true },
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

// Enable area lights
app.scene.lighting.areaLightsEnabled = true;
app.scene.toneMapping     = pc.TONEMAP_ACES;
app.scene.gammaCorrection = pc.GAMMA_SRGB;
app.scene.ambientLight    = new pc.Color(0.22, 0.22, 0.26);
app.scene.exposure        = 1.3;

// Calibration: maps real lm → visually correct intensity in PlayCanvas
const PHYS_SCALE = 0.0005;

app.start();

// ─── CAMERA ───────────────────────────────────────────────────────────────────

const cameraEntity = new pc.Entity('camera');
cameraEntity.addComponent('camera', {
  clearColor: new pc.Color(0.031, 0.031, 0.031),
  fov:        45,
  nearClip:   0.1,
  farClip:    100,
});
app.root.addChild(cameraEntity);

// Orbit state
let orbitTheta   = 0;
let orbitPhi     = 0.28;
let orbitDist    = 8;
const orbitTarget = new pc.Vec3(0, 1.2, 0);
let orbitDragging = false, orbitLastX = 0, orbitLastY = 0;

function updateCamera() {
  const x = orbitTarget.x + orbitDist * Math.sin(orbitTheta) * Math.cos(orbitPhi);
  const y = orbitTarget.y + orbitDist * Math.sin(orbitPhi);
  const z = orbitTarget.z + orbitDist * Math.cos(orbitTheta) * Math.cos(orbitPhi);
  cameraEntity.setPosition(x, Math.max(0.15, y), z);
  cameraEntity.lookAt(orbitTarget);
}
updateCamera();

function setCameraView(name) {
  const V = { front:[0,0.28,9], side:[1.571,0.28,9], top:[0,1.56,11], quarter:[0.785,0.45,7] };
  const v = V[name]; if (!v) return;
  [orbitTheta, orbitPhi, orbitDist] = v;
  updateCamera();
}

// ─── SHARED MATERIALS ─────────────────────────────────────────────────────────

function stdMat(r, g, b, metalness = 0, gloss = 0.5) {
  const m = new pc.StandardMaterial();
  m.diffuse.set(r, g, b);
  m.metalness = metalness;
  m.gloss     = gloss;
  m.update();
  return m;
}

function makeEmissiveMat(col, intensity) {
  const m = new pc.StandardMaterial();
  m.emissive.copy(col);
  m.emissiveIntensity = intensity;
  m.diffuse.set(0, 0, 0);
  m.update();
  return m;
}

const darkMat  = stdMat(0.03, 0.03, 0.03, 0.00, 0.06);  // matte black housing
const silvMat  = stdMat(0.80, 0.80, 0.80, 0.97, 0.88);  // brushed chrome
const rubbMat  = stdMat(0.03, 0.03, 0.03, 0.00, 0.02);  // rubber feet
const fabMat   = stdMat(0.95, 0.95, 0.95, 0.00, 0.05);  // white diffusion fabric

// ─── STUDIO ROOM ──────────────────────────────────────────────────────────────

const floorMat    = stdMat(0.46, 0.44, 0.42, 0.0, 0.52);  // polished concrete
const wallMat     = stdMat(0.90, 0.90, 0.88, 0.0, 0.06);  // studio white
const ceilMat     = stdMat(0.78, 0.78, 0.76, 0.0, 0.04);  // off-white ceiling
const cycMat      = stdMat(0.97, 0.97, 0.96, 0.0, 0.10);  // white seamless cyc
const gridRailMat = stdMat(0.08, 0.08, 0.10, 0.85, 0.70); // black anodised rail

function addRoom() {
  function plane(name, mat, px, py, pz, rx, ry, rz, sx, sz) {
    const e = new pc.Entity(name);
    e.addComponent('render', { type: 'plane' });
    e.render.meshInstances[0].material = mat;
    e.render.castShadows    = false;
    e.render.receiveShadows = true;
    e.setLocalPosition(px, py, pz);
    e.setLocalEulerAngles(rx, ry, rz);
    e.setLocalScale(sx, 1, sz);
    e.tags.add('studio');
    app.root.addChild(e);
  }

  plane('floor',     floorMat,  0, 0,   0,    0,   0, 0, 16, 14);
  plane('backwall',  cycMat,    0, 3.5, -6,   90,   0, 0, 16,  7);
  plane('leftwall',  wallMat,  -8, 3.5,  0,   90, -90, 0, 14,  7);
  plane('rightwall', wallMat,   8, 3.5,  0,   90,  90, 0, 14,  7);
  plane('ceiling',   ceilMat,   0, 7,    0,  180,   0, 0, 16, 14);

  // Smooth cyclorama sweep: 5 graduated planes from floor to back wall
  plane('cyc0', cycMat,  0, 0.04, -4.50,   8, 0, 0, 16, 1.0);
  plane('cyc1', cycMat,  0, 0.20, -4.90,  22, 0, 0, 16, 1.1);
  plane('cyc2', cycMat,  0, 0.55, -5.28,  40, 0, 0, 16, 1.2);
  plane('cyc3', cycMat,  0, 1.10, -5.62,  58, 0, 0, 16, 1.3);
  plane('cyc4', cycMat,  0, 1.88, -5.88,  74, 0, 0, 16, 1.3);
}
addRoom();

// Ceiling lighting grid — horizontal rails running front-to-back and side-to-side
function addCeilingGrid() {
  const railY = 6.92;
  const railW = 0.045, railH = 0.055;

  // Front-to-back rails (running along Z axis)
  for (const xPos of [-5, -2.5, 0, 2.5, 5]) {
    const e = new pc.Entity('rail-z');
    e.addComponent('render', { type: 'box' });
    e.render.meshInstances[0].material = gridRailMat;
    e.render.castShadows = true;
    e.render.receiveShadows = false;
    e.setLocalPosition(xPos, railY, -1);
    e.setLocalScale(railW, railH, 12);
    e.tags.add('studio');
    app.root.addChild(e);
  }

  // Side-to-side rails (running along X axis)
  for (const zPos of [-4, -1.5, 1, 3.5]) {
    const e = new pc.Entity('rail-x');
    e.addComponent('render', { type: 'box' });
    e.render.meshInstances[0].material = gridRailMat;
    e.render.castShadows = true;
    e.render.receiveShadows = false;
    e.setLocalPosition(0, railY, zPos);
    e.setLocalScale(14, railH, railW);
    e.tags.add('studio');
    app.root.addChild(e);
  }
}
addCeilingGrid();

// Dim fill light so scene isn't completely black with no studio lights
const fillLight = new pc.Entity('fill');
fillLight.addComponent('light', {
  type:        'directional',
  color:       new pc.Color(0.78, 0.84, 1.0),
  intensity:   0.80,
  castShadows: false,
});
fillLight.setLocalEulerAngles(-50, 30, 0);
app.root.addChild(fillLight);

// ─── PRIMITIVE PART HELPER ────────────────────────────────────────────────────

function part(type, parent, mat, pos, rot, scale, name) {
  const e = new pc.Entity(name || type);
  e.addComponent('render', { type });
  e.render.meshInstances[0].material = mat;
  e.render.castShadows    = true;
  e.render.receiveShadows = false;
  if (pos)   e.setLocalPosition(...pos);
  if (rot)   e.setLocalEulerAngles(...rot);
  if (scale) e.setLocalScale(...scale);
  parent.addChild(e);
  return e;
}

// ─── TRIPOD STAND ─────────────────────────────────────────────────────────────

function buildStand(poleH, group) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const pivot = new pc.Entity('leg-pivot');
    pivot.setLocalEulerAngles(0, a * 180 / Math.PI, 0);
    part('cylinder', pivot, darkMat, [0.28, 0.07, 0], [0, 0, 90], [0.022, 0.56, 0.022]);
    part('sphere',   pivot, rubbMat, [0.56, 0.07, 0], null,       [0.040, 0.040, 0.040]);
    group.addChild(pivot);
  }
  const loH = poleH * 0.55, upH = poleH * 0.44;
  part('cylinder', group, silvMat, [0, 0.02, 0], null, [0.064, 0.04, 0.064]);
  part('cylinder', group, darkMat, [0, 0.04 + loH / 2, 0], null, [0.042, loH, 0.042]);
  part('cylinder', group, silvMat, [0, 0.04 + loH + 0.019, 0], null, [0.056, 0.038, 0.056]);
  part('cylinder', group, silvMat, [0, 0.04 + loH + 0.038 + upH / 2, 0], null, [0.026, upH, 0.026]);
  part('cylinder', group, silvMat, [0, poleH + 0.025, 0], null, [0.040, 0.050, 0.040]);
}

// ─── YOKE HELPER ──────────────────────────────────────────────────────────────
// Round tube yoke arms with tilt-lock knob discs at each end.
// armY = local Y for the arm pair; span = distance from centre to arm midpoint.

function addYoke(g, armY, span) {
  const y = armY ?? 0;
  const s = span ?? 0.16;
  // Tube arms (cylinder long-axis is Y; rotate [0,0,90] → long-axis becomes X)
  part('cylinder', g, darkMat, [-s, y, 0], [0, 0, 90], [0.034, s * 2, 0.034]);
  part('cylinder', g, darkMat, [ s, y, 0], [0, 0, 90], [0.034, s * 2, 0.034]);
  // Tilt-lock knob discs at outer ends
  part('cylinder', g, silvMat, [-(s * 2), y, 0], [0, 0, 90], [0.050, 0.022, 0.050]);
  part('cylinder', g, silvMat, [ (s * 2), y, 0], [0, 0, 90], [0.050, 0.022, 0.050]);
}

// ─── EQUIPMENT HEADS ──────────────────────────────────────────────────────────

function buildFlashHead(col) {
  const g = new pc.Entity('flashhead');

  addYoke(g, 0, 0.17);

  // Main barrel body — wider than before (real monolight is a substantial cylinder)
  part('cylinder', g, darkMat, [0, 0, 0.01], [90, 0, 0], [0.18, 0.22, 0.18]);

  // Ventilation band near rear
  part('cylinder', g, darkMat, [0, 0, -0.06], [90, 0, 0], [0.196, 0.030, 0.196]);

  // Front housing rim ring (silver trim)
  part('cylinder', g, silvMat, [0, 0, 0.115], [90, 0, 0], [0.22, 0.016, 0.22]);

  // Reflector bowl — wide & shallow (monolight style, warm chrome)
  part('cone', g, stdMat(0.92, 0.88, 0.78, 0.99, 0.95), [0, 0, 0.175], [-90, 0, 0], [0.44, 0.10, 0.44]);

  // Inner reflector dish (deeper warm gold)
  part('cone', g, stdMat(0.96, 0.94, 0.86, 0.99, 0.94), [0, 0, 0.155], [-90, 0, 0], [0.22, 0.07, 0.22]);

  // Flash tube ring — emissive (colour temp updates target this)
  part('cylinder', g, makeEmissiveMat(col, 5), [0, 0, 0.192], [90, 0, 0], [0.050, 0.012, 0.050], 'emissive');

  // Sync + power ports on rear housing
  part('cylinder', g, silvMat, [ 0.06, -0.04, -0.10], [90, 0, 0], [0.020, 0.018, 0.020]);
  part('cylinder', g, silvMat, [-0.04, -0.04, -0.10], [90, 0, 0], [0.020, 0.018, 0.020]);

  return g;
}

function buildFresnel(col) {
  const g = new pc.Entity('fresnel');

  addYoke(g, 0, 0.17);

  // Main housing cylinder
  part('cylinder', g, darkMat, [0, 0, -0.01], [90, 0, 0], [0.20, 0.32, 0.20]);

  // Front housing rim ring
  part('cylinder', g, silvMat, [0, 0, 0.150], [90, 0, 0], [0.24, 0.016, 0.24]);

  // Fresnel lens (semi-transparent, layered rings for stepped glass look)
  const lensMat = stdMat(0.78, 0.85, 0.90, 0, 0.95);
  lensMat.blendType  = pc.BLEND_NORMAL;
  lensMat.opacity    = 0.45;
  lensMat.depthWrite = false;
  lensMat.update();
  part('cylinder', g, lensMat, [0, 0, 0.156], [90, 0, 0], [0.178, 0.010, 0.178]);
  part('cylinder', g, lensMat, [0, 0, 0.160], [90, 0, 0], [0.122, 0.007, 0.122]);
  part('cylinder', g, lensMat, [0, 0, 0.163], [90, 0, 0], [0.068, 0.005, 0.068]);

  // Modelling bulb
  part('sphere', g, makeEmissiveMat(col, 5), [0, 0, 0.06], null, [0.060, 0.060, 0.060], 'emissive');

  // Barn doors — flat flaps angled open ~28° so they look functional, not like walls
  part('box', g, darkMat, [0,  0.130, 0.265], [-28, 0,   0], [0.22, 0.008, 0.19]);  // top
  part('box', g, darkMat, [0, -0.130, 0.265], [ 28, 0,   0], [0.22, 0.008, 0.19]);  // bottom
  part('box', g, darkMat, [-0.125, 0, 0.265], [  0, 0,  28], [0.008, 0.22, 0.19]);  // left
  part('box', g, darkMat, [ 0.125, 0, 0.265], [  0, 0, -28], [0.008, 0.22, 0.19]);  // right

  // Hinge pins at barn door roots (4 corners)
  part('cylinder', g, silvMat, [-0.098,  0.100, 0.163], null, [0.012, 0.042, 0.012]);
  part('cylinder', g, silvMat, [ 0.098,  0.100, 0.163], null, [0.012, 0.042, 0.012]);
  part('cylinder', g, silvMat, [-0.098, -0.100, 0.163], null, [0.012, 0.042, 0.012]);
  part('cylinder', g, silvMat, [ 0.098, -0.100, 0.163], null, [0.012, 0.042, 0.012]);

  // Carry handle on top of housing
  part('cylinder', g, darkMat, [0, 0.128, -0.04], [0, 0, 90], [0.022, 0.14, 0.022]);
  part('sphere',   g, darkMat, [-0.070, 0.128, -0.04], null, [0.026, 0.026, 0.026]);
  part('sphere',   g, darkMat, [ 0.070, 0.128, -0.04], null, [0.026, 0.026, 0.026]);

  return g;
}

function buildParSpot(col) {
  const g = new pc.Entity('parcan');

  // Yoke at body centre of gravity (real PAR cans yoke at balance point)
  addYoke(g, -0.12, 0.16);

  // Main cylindrical housing — wider, more PAR-can proportioned
  part('cylinder', g, darkMat, [0, -0.14, 0], null, [0.24, 0.26, 0.24]);

  // Top mounting cap
  part('cylinder', g, darkMat, [0, 0.005, 0], null, [0.25, 0.018, 0.25]);

  // Front opening rim ring
  part('cylinder', g, silvMat, [0, -0.278, 0], null, [0.26, 0.018, 0.26]);

  // Parabolic reflector bowl (wide, polished chrome)
  part('cone', g, stdMat(0.88, 0.88, 0.86, 0.99, 0.96), [0, -0.292, 0], [180, 0, 0], [0.52, 0.25, 0.52]);

  // PAR lamp (emissive sphere inside reflector)
  part('sphere', g, makeEmissiveMat(col, 6), [0, -0.20, 0], null, [0.062, 0.062, 0.062], 'emissive');

  // Gel frame retaining tabs at front rim (4 corners)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    part('box', g, silvMat,
      [Math.cos(a) * 0.138, -0.296, Math.sin(a) * 0.138],
      null, [0.022, 0.022, 0.016]);
  }

  return g;
}

function buildSoftbox(col) {
  const g = new pc.Entity('softbox');

  // Speed ring — prominent silver disc
  part('cylinder', g, silvMat, [0, 0, 0],     [90, 0, 0], [0.30, 0.022, 0.30]);
  part('cylinder', g, darkMat, [0, 0, 0.014], [90, 0, 0], [0.14, 0.036, 0.14]);

  // Side panels: each goes from speedring edge (r≈0.14, z=0) to front face edge (r=0.38, z=-0.352)
  // Centre of each panel: (0, ±0.26, -0.176); slope angle ≈ 34° gives exact back/front coordinates.
  part('box', g, fabMat, [0,  0.260, -0.176], [ 34, 0,   0], [0.76, 0.012, 0.427]);  // top
  part('box', g, fabMat, [0, -0.260, -0.176], [-34, 0,   0], [0.76, 0.012, 0.427]);  // bottom
  part('box', g, fabMat, [-0.260, 0, -0.176], [  0, 34,  0], [0.012, 0.76, 0.427]);  // left
  part('box', g, fabMat, [ 0.260, 0, -0.176], [  0, -34, 0], [0.012, 0.76, 0.427]);  // right

  // Black outer frame around front diffuser
  part('box', g, darkMat, [0, 0, -0.345], null, [0.86, 0.86, 0.030]);

  // Inner baffle (second diffusion layer inside the box)
  part('plane', g, fabMat, [0, 0, -0.318], [90, 0, 0], [0.58, 1, 0.58]);

  // Front diffusion panel (emissive)
  part('plane', g, makeEmissiveMat(col, 1.2), [0, 0, -0.352], [90, 0, 0], [0.76, 1, 0.76], 'emissive');

  return g;
}

function buildOctabox(col) {
  const g = new pc.Entity('octabox');

  // Speed ring
  part('cylinder', g, silvMat, [0, 0, 0],     [90, 0, 0], [0.30, 0.022, 0.30]);
  part('cylinder', g, darkMat, [0, 0, 0.014], [90, 0, 0], [0.14, 0.036, 0.14]);

  // Outer body — single cone tapering from speedring (z=0, r≈0) to front face (z=-0.62, r=0.72)
  // Cone tip at z=0, base at z=-0.62; after Rx(90°) local +Y maps to world +Z.
  part('cone', g, darkMat, [0, 0, -0.31], [90, 0, 0], [1.44, 0.62, 1.44]);

  // Front outer rim ring
  part('cylinder', g, silvMat, [0, 0, -0.624], [90, 0, 0], [1.48, 0.016, 1.48]);

  // Inner baffle diffuser
  part('plane', g, fabMat, [0, 0, -0.600], [90, 0, 0], [1.08, 1, 1.08]);

  // Front diffusion panel (emissive)
  part('plane', g, makeEmissiveMat(col, 1.0), [0, 0, -0.610], [90, 0, 0], [1.32, 1, 1.32], 'emissive');

  return g;
}

function buildLedPanel(col) {
  const g = new pc.Entity('ledpanel');

  addYoke(g, 0, 0.18);

  // Main housing body
  part('box', g, darkMat, [0, 0, -0.02], null, [0.58, 0.28, 0.042]);

  // Aluminium frame rails (4 sides)
  const fMat = stdMat(0.72, 0.72, 0.72, 0.94, 0.86);
  part('box', g, fMat, [0,  0.148, 0], null, [0.60, 0.016, 0.054]);
  part('box', g, fMat, [0, -0.148, 0], null, [0.60, 0.016, 0.054]);
  part('box', g, fMat, [ 0.298, 0, 0], null, [0.016, 0.28, 0.054]);
  part('box', g, fMat, [-0.298, 0, 0], null, [0.016, 0.28, 0.054]);

  // LED chip grid (5 rows × 10 columns)
  const ledMat = makeEmissiveMat(col, 2.5);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) {
    part('box', g, ledMat,
      [-0.245 + c * 0.054, -0.10 + r * 0.050, 0.013], null, [0.036, 0.026, 0.006]);
  }

  // Front diffuser panel (emissive — colour temp updates target this)
  part('plane', g, makeEmissiveMat(col, 1.0), [0, 0, 0.026], [90, 0, 0], [0.54, 1, 0.24], 'emissive');

  // Rear fan / vent detail
  part('cylinder', g, darkMat, [0.18, 0.05, -0.046], [90, 0, 0], [0.072, 0.012, 0.072]);
  part('cylinder', g, darkMat, [0.18, 0.05, -0.046], [90, 0, 0], [0.042, 0.016, 0.042]);

  // Rear carry handle bar
  part('cylinder', g, darkMat, [0, 0.175, -0.038], [0, 0, 90], [0.022, 0.22, 0.022]);
  part('sphere',   g, darkMat, [-0.11, 0.175, -0.038], null, [0.026, 0.026, 0.026]);
  part('sphere',   g, darkMat, [ 0.11, 0.175, -0.038], null, [0.026, 0.026, 0.026]);

  return g;
}

// ─── PHYSICAL LIGHT MATH ──────────────────────────────────────────────────────

const LM_PER_W = { tungsten: 14, hmi: 85, flash: 22, led: 100 };

function kelvinToColor(K) {
  K = Math.max(1000, Math.min(15000, K));
  let x;
  if (K <= 4000) x = -0.2661239e9/(K*K*K) - 0.2343580e6/(K*K) + 0.8776956e3/K + 0.179910;
  else           x = -3.0258469e9/(K*K*K) + 2.1070379e6/(K*K) + 0.2226347e3/K + 0.240390;
  let y;
  if      (K <= 2222) y = -1.1063814*x*x*x - 1.34811020*x*x + 2.18555832*x - 0.20219683;
  else if (K <= 4000) y = -0.9549476*x*x*x - 1.37418593*x*x + 2.09137015*x - 0.16748867;
  else                y =  3.0817580*x*x*x - 5.87338670*x*x + 3.75112997*x - 0.37001483;
  const Y = 1.0, X = (Y / y) * x, Z = (Y / y) * (1 - x - y);
  let r =  3.2404542*X - 1.5371385*Y - 0.4985314*Z;
  let g = -0.9692660*X + 1.8760108*Y + 0.0415560*Z;
  let b =  0.0556434*X - 0.2040259*Y + 1.0572252*Z;
  r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  const m = Math.max(r, g, b, 1e-6);
  return new pc.Color(r/m, g/m, b/m);
}

function computeIntensity(watts, equipType, beamAngleDeg) {
  const def = EQUIP_DEFS[equipType];
  const lm  = watts * LM_PER_W[def.lampType];
  if (def.lightType === 'point') return (lm * 0.7 / (2 * Math.PI)) * PHYS_SCALE;
  if (def.lightType === 'spot') {
    const half = (beamAngleDeg / 2) * (Math.PI / 180);
    return (lm / (2 * Math.PI * (1 - Math.cos(half)))) * PHYS_SCALE;
  }
  if (def.lightType === 'rect') return (lm / (def.srcW * def.srcH * Math.PI)) * PHYS_SCALE * 80;
  return 1;
}

// ─── EQUIPMENT DEFINITIONS ────────────────────────────────────────────────────

const EQUIP_DEFS = {
  monolight: { label:'Monolight',    lightType:'point', lampType:'flash',    poleH:2.0, defaultW:400, minW:100, maxW:800,  colorTemp:5600 },
  fresnel:   { label:'Fresnel Spot', lightType:'spot',  lampType:'tungsten', poleH:2.5, defaultW:650, minW:150, maxW:2000, colorTemp:3200, beamAngle:20, minBeam:10, maxBeam:50, penumbra:0.12 },
  parcan:    { label:'PAR Can',      lightType:'spot',  lampType:'tungsten', poleH:2.4, defaultW:575, minW:300, maxW:1000, colorTemp:3200, beamAngle:12, minBeam:5,  maxBeam:40, penumbra:0.03 },
  softbox:   { label:'Softbox',      lightType:'rect',  lampType:'flash',    poleH:2.0, defaultW:400, minW:100, maxW:800,  colorTemp:5500, srcW:0.9, srcH:1.2 },
  octabox:   { label:'Octabox',      lightType:'rect',  lampType:'flash',    poleH:2.0, defaultW:600, minW:100, maxW:800,  colorTemp:5500, srcW:1.5, srcH:1.5 },
  ledpanel:  { label:'LED Panel',    lightType:'rect',  lampType:'led',      poleH:2.2, defaultW:200, minW:50,  maxW:500,  colorTemp:5600, minTemp:2700, maxTemp:6500, srcW:0.6, srcH:0.3 },
};

const ROLE_EQUIP_MAP = {
  key:'fresnel', fill:'softbox', rim:'parcan',
  hair:'monolight', background:'ledpanel', practical:'monolight',
};

const ROLE_PRESETS = {
  key:        { watts:650, colorTemp:3200, beamAngle:20 },
  fill:       { watts:400, colorTemp:5500 },
  rim:        { watts:575, colorTemp:3200, beamAngle:12 },
  hair:       { watts:200, colorTemp:5600 },
  background: { watts:200, colorTemp:5600 },
  practical:  { watts:100, colorTemp:2700 },
};

const ROLE_POSITIONS = {
  key:        { x:-2.5, z: 3.0 },
  fill:       { x: 2.5, z: 2.5 },
  rim:        { x: 0.5, z:-3.5 },
  hair:       { x: 0.0, z:-2.0 },
  background: { x: 0.0, z:-5.0 },
  practical:  { x: 2.0, z: 1.0 },
};

// ─── TRAVERSE HELPER ──────────────────────────────────────────────────────────

function traverseEntity(entity, fn) {
  fn(entity);
  for (const child of entity.children) traverseEntity(child, fn);
}

function disableShadowCast(entity) {
  traverseEntity(entity, e => { if (e.render) e.render.castShadows = false; });
}

function findNamed(root, name) {
  if (root.name === name && root.render) return root;
  for (const child of root.children) {
    const f = findNamed(child, name);
    if (f) return f;
  }
  return null;
}

// ─── LIGHT MANAGER ────────────────────────────────────────────────────────────

let lightSeq = 0;
const lights = [];

function getLightWorldPos(entry) {
  return entry.headEntity.getPosition().clone();
}

function computeSoftness(entry) {
  const def  = EQUIP_DEFS[entry.equipType];
  const dist = Math.max(0.5, getLightWorldPos(entry).distance(new pc.Vec3(0, 1, 0)));
  const size = def.lightType === 'rect' ? Math.max(def.srcW, def.srcH) : (def.penumbra ? def.penumbra * 2 : 0.4);
  return size / dist;
}

function emissiveDefault(equipType) {
  const def = EQUIP_DEFS[equipType];
  if (!def) return 1;
  if (def.lightType === 'rect') return 1.2;
  if (def.lightType === 'spot') return 5;
  return 4;
}

function applyLightPhysics(entry) {
  const p   = entry.props;
  const def = EQUIP_DEFS[entry.equipType];
  const col = kelvinToColor(p.colorTemp);

  entry.lightEntity.light.color     = col.clone();
  entry.lightEntity.light.intensity = computeIntensity(p.watts, entry.equipType, p.beamAngle);

  const em = findNamed(entry.headEntity, 'emissive');
  if (em) {
    const mat = em.render.meshInstances[0].material;
    mat.emissive.copy(col);
    mat.update();
  }

  if (entry.lightType === 'spot') {
    entry.lightEntity.light.outerConeAngle = p.beamAngle / 2;
    entry.lightEntity.light.innerConeAngle = (p.beamAngle / 2) * (1 - (def.penumbra ?? 0.15));
  }
}

function addLight(equipType, cfg = {}) {
  const id    = ++lightSeq;
  const role  = cfg.role ?? 'key';
  const def   = EQUIP_DEFS[equipType];
  if (!def) return null;

  const preset    = ROLE_PRESETS[role] ?? {};
  const watts     = cfg.watts     ?? preset.watts     ?? def.defaultW;
  const colorTemp = cfg.colorTemp ?? preset.colorTemp ?? def.colorTemp;
  const beamAngle = cfg.beamAngle ?? preset.beamAngle ?? def.beamAngle ?? 35;
  const poleH     = def.poleH;
  const initColor = kelvinToColor(colorTemp);

  // Group at floor level
  const group = new pc.Entity('lg-' + id);
  const rPos  = ROLE_POSITIONS[role] ?? { x: 0, z: 0 };
  group.setLocalPosition(cfg.x ?? rPos.x, 0, cfg.z ?? rPos.z);
  app.root.addChild(group);
  buildStand(poleH, group);

  // Head model at top of pole
  let headEntity;
  if      (equipType === 'fresnel')  headEntity = buildFresnel(initColor);
  else if (equipType === 'parcan')   headEntity = buildParSpot(initColor);
  else if (equipType === 'softbox')  headEntity = buildSoftbox(initColor);
  else if (equipType === 'octabox')  headEntity = buildOctabox(initColor);
  else if (equipType === 'ledpanel') headEntity = buildLedPanel(initColor);
  else                               headEntity = buildFlashHead(initColor);
  headEntity.setLocalPosition(0, poleH, 0);
  disableShadowCast(headEntity);
  group.addChild(headEntity);

  // Light entity (separate from group for independent positioning)
  const lightEntity = new pc.Entity('light-' + id);
  const lightCfg = {
    color:     initColor.clone(),
    intensity: 1,
  };

  if (def.lightType === 'point') {
    lightCfg.type             = 'point';
    lightCfg.range            = 30;
    lightCfg.falloffMode      = pc.LIGHTFALLOFF_INVERSESQUARED;
    lightCfg.castShadows      = true;
    lightCfg.shadowResolution = 512;
    lightCfg.shadowType       = pc.SHADOW_PCF3_32F;
    lightCfg.shadowBias       = 0.05;
    lightCfg.normalOffsetBias = 0.05;
  } else if (def.lightType === 'spot') {
    lightCfg.type             = 'spot';
    lightCfg.range            = 30;
    lightCfg.innerConeAngle   = (beamAngle / 2) * 0.75;
    lightCfg.outerConeAngle   = beamAngle / 2;
    lightCfg.falloffMode      = pc.LIGHTFALLOFF_INVERSESQUARED;
    lightCfg.castShadows      = true;
    lightCfg.shadowResolution = 512;
    lightCfg.shadowType       = pc.SHADOW_PCF3_32F;
    lightCfg.shadowBias       = 0.05;
    lightCfg.normalOffsetBias = 0.05;
  } else if (def.lightType === 'rect') {
    lightCfg.type         = 'area';
    lightCfg.shape        = pc.LIGHTSHAPE_RECT;
    lightCfg.affectDynamic = true;
    // Area size set via entity scale (width × height)
  }

  lightEntity.addComponent('light', lightCfg);
  // For rect lights, scale controls physical size
  if (def.lightType === 'rect') {
    lightEntity.setLocalScale(def.srcW, def.srcH, 1);
  }
  app.root.addChild(lightEntity);

  const entry = {
    id, equipType, lightType: def.lightType,
    lightEntity, group, headEntity, enabled: true, role,
    props: { watts, colorTemp, beamAngle, poleHeight: poleH, tiltY: 1.0, panAngle: 0 },
  };
  lights.push(entry);
  applyLightPhysics(entry);
  window.dispatchEvent(new CustomEvent('studio:lightAdded', { detail: { role, equipType } }));
  updateSetupGuide();
  return entry;
}

function removeLight(id) {
  const i = lights.findIndex(l => l.id === id);
  if (i < 0) return;
  const { lightEntity, group } = lights[i];
  if (selLight?.group === group) clearSelection();
  group.destroy();
  lightEntity.destroy();
  lights.splice(i, 1);
  updateSetupGuide();
}

function toggleLight(id) {
  const e = lights.find(l => l.id === id);
  if (!e) return;
  e.enabled = !e.enabled;
  e.lightEntity.light.enabled = e.enabled;
  const em = findNamed(e.headEntity, 'emissive');
  if (em) {
    em.render.meshInstances[0].material.emissiveIntensity = e.enabled ? emissiveDefault(e.equipType) : 0;
    em.render.meshInstances[0].material.update();
  }
  return e.enabled;
}

function getLightRatio() {
  const key  = lights.find(l => l.role === 'key');
  const fill = lights.find(l => l.role === 'fill');
  if (!key || !fill) return null;
  return (key.props.watts / Math.max(1, fill.props.watts)).toFixed(1) + ':1';
}

// ─── OBJECT MANAGER ───────────────────────────────────────────────────────────

let objSeq = 0;
const objects = [];

function addObject(shape) {
  const types = { sphere:'sphere', box:'box', cylinder:'cylinder', cone:'cone', torus:'torus' };
  if (!types[shape]) return;
  const mat = stdMat(0.68, 0.66, 0.64, 0.0, 0.38);
  const e   = new pc.Entity('obj-' + shape);
  e.addComponent('render', { type: types[shape] });
  e.render.meshInstances[0].material = mat;
  e.render.castShadows    = true;
  e.render.receiveShadows = true;
  e.setLocalPosition((Math.random()-0.5)*3, 0, (Math.random()-0.5)*2);
  e.tags.add('object');
  e._objId = ++objSeq;
  app.root.addChild(e);
  // Snap to floor: place center at halfExtent height so bottom face touches Y=0
  const aabb0 = getEntityAABB(e);
  if (aabb0 && aabb0.halfExtents.y > 0) {
    const lp = e.getLocalPosition();
    e.setLocalPosition(lp.x, aabb0.halfExtents.y, lp.z);
  }
  objects.push(e);
  return e;
}

function deleteObject(entity) {
  const i = objects.indexOf(entity);
  if (i < 0) return;
  entity.destroy();
  objects.splice(i, 1);
}

// ─── SELECTION ────────────────────────────────────────────────────────────────

let selObj   = null;
let selLight = null;

const lightPanel  = document.getElementById('light-panel');
const objectPanel = document.getElementById('object-panel');

function getEntityAABB(entity) {
  const aabb  = new pc.BoundingBox();
  let first = true;
  traverseEntity(entity, e => {
    if (!e.render) return;
    e.render.meshInstances.forEach(mi => {
      if (first) { aabb.copy(mi.aabb); first = false; }
      else         aabb.add(mi.aabb);
    });
  });
  return aabb;
}

function screenRaycast(sx, sy) {
  const near = new pc.Vec3(), far = new pc.Vec3();
  cameraEntity.camera.screenToWorld(sx, sy, 0.1, near);
  cameraEntity.camera.screenToWorld(sx, sy, 100, far);
  const dir = new pc.Vec3().sub2(far, near).normalize();
  const ray = new pc.Ray(near, dir);

  let closest = null, closestDist = Infinity;

  objects.forEach(obj => {
    const aabb = getEntityAABB(obj);
    const hit  = new pc.Vec3();
    if (aabb.intersectsRay(ray, hit)) {
      const d = near.distance(hit);
      if (d < closestDist) { closestDist = d; closest = { entity: obj, type: 'object' }; }
    }
  });

  lights.forEach(entry => {
    const aabb = getEntityAABB(entry.group);
    const hit  = new pc.Vec3();
    if (aabb.intersectsRay(ray, hit)) {
      const d = near.distance(hit);
      if (d < closestDist) { closestDist = d; closest = { entry, type: 'light' }; }
    }
  });

  return closest;
}

// ─── PANEL HELPERS ────────────────────────────────────────────────────────────

const ROLE_COLORS = {
  key:'#FFD166', fill:'#6EC6F5', rim:'#FF6B9D',
  hair:'#7ECAC9', background:'#B69CF5', practical:'#FF9947',
};
const ROLE_DISPLAY_NAMES = {
  key:'Key Light', fill:'Fill Light', rim:'Back Light',
  hair:'Hair Light', background:'BG Light', practical:'Practical',
};
const ROLE_DESCS = {
  key:        'Primary source. Defines shape, texture and cast shadows.',
  fill:       'Softens key-light shadows. Controls the contrast ratio.',
  rim:        'Edge separation and depth from behind the subject.',
  hair:       'Top or back light for hair sheen and separation.',
  background: 'Lights backdrop independently from the subject.',
  practical:  'A light source visible in frame — sets mood and realism.',
};

function syncPct(el) {
  const min = parseFloat(el.min ?? 0), max = parseFloat(el.max ?? 1), val = parseFloat(el.value);
  el.style.setProperty('--pct', ((val - min) / (max - min) * 100).toFixed(1) + '%');
}

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
  const minT   = def.minTemp ?? 1000, maxT = def.maxTemp ?? 10000;
  const kPct   = ((p.colorTemp - minT) / (maxT - minT) * 100).toFixed(1);
  const gx     = entry.group.getLocalPosition().x.toFixed(1);
  const gz     = entry.group.getLocalPosition().z.toFixed(1);

  const kCtrl = `
    <div class="ctrl-block">
      <div class="ctrl-header"><label for="lp-temp">Color Temp</label>
        <span class="ctrl-val" id="lp-temp-val">${p.colorTemp}K</span></div>
      <div class="kelvin-strip"></div>
      <input type="range" class="slider" id="lp-temp" min="${minT}" max="${maxT}" step="100" value="${p.colorTemp}" style="--pct:${kPct}%">
    </div>`;

  return `
    <div class="ctrl-section-label">Position</div>
    ${makeCtrl({ id:'lp-pos-x', label:'Left / Right', min:-7, max:7,   step:0.1,  value:gx,                      unit:'m' })}
    ${makeCtrl({ id:'lp-pos-z', label:'Fore / Back',  min:-6, max:6,   step:0.1,  value:gz,                      unit:'m' })}
    <div class="ctrl-section-label">Light</div>
    ${makeCtrl({ id:'lp-watts', label:'Power',        min:def.minW, max:def.maxW, step:10, value:p.watts,         unit:'W' })}
    ${kCtrl}
    ${makeCtrl({ id:'lp-height', label:'Height',      min:0.5, max:5,  step:0.05, value:p.poleHeight.toFixed(2), unit:'m' })}
    ${makeCtrl({ id:'lp-tilt',   label:'Aim Height',  min:0,   max:3,  step:0.05, value:p.tiltY.toFixed(2),      unit:'m' })}
    ${makeCtrl({ id:'lp-pan',    label:'Pan',         min:-180, max:180, step:1,  value:(p.panAngle??0).toFixed(0), unit:'°' })}
    ${isSpot ? makeCtrl({ id:'lp-beam', label:'Beam Angle', min:def.minBeam??5, max:def.maxBeam??90, step:1, value:p.beamAngle??def.beamAngle??20, unit:'°' }) : ''}
  `;
}

function openLightPanel(entry) {
  const color = ROLE_COLORS[entry.role] || '#7c6ef5';
  lightPanel.style.setProperty('--lt-color', color);
  document.getElementById('lp-accent-bar').style.background = color;
  document.getElementById('lp-dot').style.background        = color;
  document.getElementById('lp-dot').style.boxShadow         = `0 0 8px ${color}`;
  document.getElementById('lp-name').textContent            = ROLE_DISPLAY_NAMES[entry.role] || entry.role;
  document.getElementById('lp-role-badge').textContent      = EQUIP_DEFS[entry.equipType].label;
  document.getElementById('lp-desc').textContent            = ROLE_DESCS[entry.role] || '';
  document.getElementById('lp-body').innerHTML              = buildLightBody(entry);
  wireLightSliders();
  document.getElementById('lp-toggle').textContent = entry.enabled ? 'Turn OFF' : 'Turn ON';
  updatePhysicsReadout(entry);
  lightPanel.querySelectorAll('.slider').forEach(syncPct);
  lightPanel.classList.add('lp-open');
}

function closeLightPanel()  { lightPanel.classList.remove('lp-open'); }
function openObjectPanel()  { objectPanel.classList.add('op-open'); }
function closeObjectPanel() { objectPanel.classList.remove('op-open'); }

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
    selLight.headEntity.setLocalPosition(0, parseFloat(v), 0);
    const vEl = document.getElementById('lp-height-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(2) + 'm';
  });
  bind('lp-tilt', v => {
    selLight.props.tiltY = parseFloat(v);
    const vEl = document.getElementById('lp-tilt-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(2) + 'm';
  });
  bind('lp-pos-x', v => {
    const p = selLight.group.getLocalPosition();
    selLight.group.setLocalPosition(parseFloat(v), p.y, p.z);
    const vEl = document.getElementById('lp-pos-x-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(1) + 'm';
  });
  bind('lp-pos-z', v => {
    const p = selLight.group.getLocalPosition();
    selLight.group.setLocalPosition(p.x, p.y, parseFloat(v));
    const vEl = document.getElementById('lp-pos-z-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(1) + 'm';
  });
  bind('lp-pan', v => {
    selLight.props.panAngle = parseFloat(v);
    selLight.group.setLocalEulerAngles(0, parseFloat(v), 0);
    const vEl = document.getElementById('lp-pan-val');
    if (vEl) vEl.textContent = parseFloat(v).toFixed(0) + '°';
  });
}

function updatePhysicsReadout(entry) {
  if (!entry) return;
  const def      = EQUIP_DEFS[entry.equipType];
  const lm       = Math.round(entry.props.watts * LM_PER_W[def.lampType]);
  const softness = computeSoftness(entry);
  document.getElementById('phys-shadow').textContent   = softness > 0.15 ? 'Soft' : 'Hard';
  document.getElementById('phys-softness').textContent = `${softness.toFixed(2)}  (${lm} lm)`;
  document.getElementById('phys-falloff').textContent  = entry.lightType === 'rect' ? 'Area (Lambertian)' : 'Inv. Square (1/r²)';
  const ratio = getLightRatio();
  document.getElementById('phys-ratio').textContent    = ratio ?? (entry.role === 'key' ? 'No fill set' : '—');
}

// ─── SELECTION STATE ──────────────────────────────────────────────────────────

function selectObj(entity) {
  clearSelection();
  hideAccordion();
  selObj = entity;
  const mat = entity.render.meshInstances[0].material;
  mat.emissive.set(0.1, 0.1, 0.1);
  mat.update();
  const toHex = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  document.getElementById('obj-color').value = '#' + toHex(mat.diffuse.r) + toHex(mat.diffuse.g) + toHex(mat.diffuse.b);
  document.getElementById('obj-roughness').value = (1 - mat.gloss).toFixed(2);
  document.getElementById('obj-metalness').value = mat.metalness.toFixed(2);
  syncR('obj-roughness'); syncR('obj-metalness');
  syncObjSliders();
  openObjectPanel();
}

function selectLight(entry) {
  clearSelection();
  hideAccordion();
  selLight = entry;
  const em = findNamed(entry.headEntity, 'emissive');
  if (em) {
    em.render.meshInstances[0].material.emissiveIntensity = emissiveDefault(entry.equipType) * 1.6;
    em.render.meshInstances[0].material.update();
  }
  openLightPanel(entry);
}

function clearSelection() {
  if (selObj) {
    const mat = selObj.render.meshInstances[0].material;
    mat.emissive.set(0, 0, 0);
    mat.update();
    selObj = null;
  }
  if (selLight) {
    const em = findNamed(selLight.headEntity, 'emissive');
    if (em && selLight.enabled) {
      em.render.meshInstances[0].material.emissiveIntensity = emissiveDefault(selLight.equipType);
      em.render.meshInstances[0].material.update();
    }
    selLight = null;
  }
  freeTransformBox?.classList.add('hidden');
  closeLightPanel();
  closeObjectPanel();
  showAccordion();
}

function deleteSelected() {
  if (selObj)   { deleteObject(selObj); selObj = null; closeObjectPanel(); freeTransformBox?.classList.add('hidden'); }
  if (selLight) { const id = selLight.id; clearSelection(); removeLight(id); }
}

function syncR(id) {
  const el = document.getElementById(id), v = el.nextElementSibling;
  if (v?.classList.contains('rval')) v.textContent = parseFloat(el.value).toFixed(2);
}

// ─── OBJECT PANEL SLIDERS ─────────────────────────────────────────────────────

function syncObjSliders() {
  if (!selObj) return;
  const p = selObj.getLocalPosition();
  const r = selObj.getLocalEulerAngles();
  const s = selObj.getLocalScale();
  const set = (id, val, unit = '') => {
    const el = document.getElementById(id), vEl = document.getElementById(id + '-val');
    if (el) { el.value = val; syncPct(el); }
    if (vEl) vEl.textContent = parseFloat(val).toFixed(id==='obj-rot-y'?0:1) + unit;
  };
  set('obj-pos-x', p.x.toFixed(1), 'm');
  set('obj-pos-y', p.y.toFixed(2), 'm');
  set('obj-pos-z', p.z.toFixed(1), 'm');
  set('obj-rot-y', r.y.toFixed(0),  '°');
  set('obj-scale', s.x.toFixed(2),  '×');
}

function syncLightPosSliders() {
  if (!selLight) return;
  const p  = selLight.group.getLocalPosition();
  const ex = document.getElementById('lp-pos-x');
  const ez = document.getElementById('lp-pos-z');
  if (ex) { ex.value = p.x.toFixed(1); syncPct(ex); const vEl = document.getElementById('lp-pos-x-val'); if (vEl) vEl.textContent = p.x.toFixed(1) + 'm'; }
  if (ez) { ez.value = p.z.toFixed(1); syncPct(ez); const vEl = document.getElementById('lp-pos-z-val'); if (vEl) vEl.textContent = p.z.toFixed(1) + 'm'; }
}

// ─── FREE TRANSFORM BOX ───────────────────────────────────────────────────────

const freeTransformBox = document.getElementById('transform-box');
const ftBbox           = document.getElementById('ft-bbox');
let   ftState          = null;

function getScreenBounds(entity, excludeNames = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

  traverseEntity(entity, e => {
    if (!e.render || excludeNames.includes(e.name)) return;
    e.render.meshInstances.forEach(mi => {
      const aabb = mi.aabb;
      for (let i = 0; i < 8; i++) {
        const corner = new pc.Vec3(
          aabb.center.x + (i&1 ? aabb.halfExtents.x : -aabb.halfExtents.x),
          aabb.center.y + (i&2 ? aabb.halfExtents.y : -aabb.halfExtents.y),
          aabb.center.z + (i&4 ? aabb.halfExtents.z : -aabb.halfExtents.z),
        );
        const sp = new pc.Vec3();
        cameraEntity.camera.worldToScreen(corner, sp);
        if (sp.x < x0) x0 = sp.x; if (sp.x > x1) x1 = sp.x;
        if (sp.y < y0) y0 = sp.y; if (sp.y > y1) y1 = sp.y;
      }
    });
  });

  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0+x1)/2, cy: (y0+y1)/2 };
}

function positionTransformBox() {
  if (!selObj && !selLight) { freeTransformBox.classList.add('hidden'); return; }

  const target = selObj ?? selLight.group;
  const { x, y, w, h } = getScreenBounds(target);
  const PAD = 12;
  ftBbox.style.left   = (x - PAD) + 'px';
  ftBbox.style.top    = (y - PAD) + 'px';
  ftBbox.style.width  = (w + PAD * 2) + 'px';
  ftBbox.style.height = (h + PAD * 2) + 'px';
  ftBbox.classList.toggle('ft-light-mode', !!selLight);
  freeTransformBox.classList.remove('hidden');
}

ftBbox.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (!selObj && !selLight) return;
  e.stopPropagation(); e.preventDefault();

  const cornerEl = e.target.closest('.ft-corner');
  const isRotate = !!e.target.closest('#ft-rot-handle');

  if (cornerEl && selObj) {
    const corner = cornerEl.dataset.corner;
    ftState = {
      type: 'corner',
      origScale: selObj.getLocalScale().x,
      startX: e.clientX, startY: e.clientY,
      outX: corner.includes('e') ? 1 : -1,
      outY: corner.includes('s') ? 1 : -1,
    };
  } else if (isRotate && selLight) {
    const { cx, cy } = getScreenBounds(selLight.group);
    ftState = {
      type: 'rotate-light',
      origRotY: selLight.props.panAngle ?? 0,
      cx, cy,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
    };
  } else if (isRotate && selObj) {
    const { cx, cy } = getScreenBounds(selObj);
    ftState = {
      type: 'rotate',
      origRotY: selObj.getLocalEulerAngles().y,
      cx, cy,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
    };
  } else if (selObj) {
    // Drag to move — unproject at object depth
    const objWorldPos = selObj.getPosition().clone();
    const camPos = cameraEntity.getPosition();
    const depth  = objWorldPos.distance(camPos);
    const origPos = selObj.getLocalPosition().clone();
    const p0World = new pc.Vec3();
    cameraEntity.camera.screenToWorld(e.clientX, e.clientY, depth, p0World);
    ftState = {
      type: 'move',
      depth, origPos, p0World: p0World.clone(),
    };
  } else {
    return; // light selected but not on rotation handle — do nothing
  }

  ftBbox.setPointerCapture(e.pointerId);
  ftBbox.classList.add('ft-grabbing');
  orbitDragging = false;
});

ftBbox.addEventListener('pointermove', e => {
  if (!ftState) return;

  if (ftState.type === 'move') {
    const { depth, origPos, p0World } = ftState;
    const p1World = new pc.Vec3();
    cameraEntity.camera.screenToWorld(e.clientX, e.clientY, depth, p1World);
    selObj.setLocalPosition(
      origPos.x + (p1World.x - p0World.x),
      origPos.y,
      origPos.z + (p1World.z - p0World.z),
    );
    syncObjSliders();

  } else if (ftState.type === 'corner') {
    const dx   = e.clientX - ftState.startX, dy = e.clientY - ftState.startY;
    const sign = Math.sign(dx * ftState.outX + dy * ftState.outY) || 1;
    const drag = Math.hypot(dx, dy) * sign;
    const ns   = Math.max(0.1, Math.min(5, ftState.origScale * Math.max(0.05, 1 + drag / 200)));
    selObj.setLocalScale(ns, ns, ns);
    // Floor clamp
    // Always pin bottom to floor regardless of scale direction
    const aabb = getEntityAABB(selObj);
    const bottom = aabb.center.y - aabb.halfExtents.y;
    const lp = selObj.getLocalPosition();
    selObj.setLocalPosition(lp.x, lp.y - bottom, lp.z);
    syncObjSliders();

  } else if (ftState.type === 'rotate') {
    const angle = Math.atan2(e.clientY - ftState.cy, e.clientX - ftState.cx);
    const delta = (angle - ftState.startAngle) * (180 / Math.PI);
    const euler = selObj.getLocalEulerAngles();
    selObj.setLocalEulerAngles(euler.x, ftState.origRotY + delta, euler.z);
    syncObjSliders();

  } else if (ftState.type === 'rotate-light') {
    const angle = Math.atan2(e.clientY - ftState.cy, e.clientX - ftState.cx);
    const newPan = ftState.origRotY + (angle - ftState.startAngle) * (180 / Math.PI);
    selLight.props.panAngle = newPan;
    selLight.group.setLocalEulerAngles(0, newPan, 0);
    const panEl = document.getElementById('lp-pan'), panvEl = document.getElementById('lp-pan-val');
    if (panEl) { panEl.value = newPan.toFixed(0); syncPct(panEl); }
    if (panvEl) panvEl.textContent = newPan.toFixed(0) + '°';
  }
});

ftBbox.addEventListener('pointerup',     () => { ftState = null; ftBbox.classList.remove('ft-grabbing'); });
ftBbox.addEventListener('pointercancel', () => { ftState = null; ftBbox.classList.remove('ft-grabbing'); });

// ─── CANVAS CLICK → SELECTION ─────────────────────────────────────────────────

function rayXZPlane(sx, sy) {
  const near = new pc.Vec3(), far = new pc.Vec3();
  cameraEntity.camera.screenToWorld(sx, sy, 0.1, near);
  cameraEntity.camera.screenToWorld(sx, sy, 100, far);
  const dir = new pc.Vec3().sub2(far, near).normalize();
  if (Math.abs(dir.y) < 0.05) return null; // too shallow — no reliable intersection
  const t = -near.y / dir.y;
  if (t < 0 || t > 80) return null;        // behind camera or too far
  return new pc.Vec3(near.x + dir.x * t, 0, near.z + dir.z * t);
}

let didMove = false, didMoveStartX = 0, didMoveStartY = 0;
let dragLight = null; // { entry, p0, origX, origZ }

canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  didMove = false;
  didMoveStartX = e.clientX; didMoveStartY = e.clientY;
  orbitLastX = e.clientX; orbitLastY = e.clientY;

  if (!e.target.closest('#ft-bbox')) {
    const hit = screenRaycast(e.clientX, e.clientY);
    if (hit?.type === 'light') {
      const p0 = rayXZPlane(e.clientX, e.clientY);
      if (p0) {
        const lp = hit.entry.group.getLocalPosition();
        dragLight = { entry: hit.entry, p0, origX: lp.x, origZ: lp.z };
        if (selLight !== hit.entry) selectLight(hit.entry); // avoid panel rebuild if already selected
        return; // don't orbit while dragging a light
      }
    }
    orbitDragging = true;
  }
});
canvas.addEventListener('pointermove', e => {
  if (Math.hypot(e.clientX - didMoveStartX, e.clientY - didMoveStartY) > 4) didMove = true;

  if (!orbitDragging && !dragLight) {
    const h = screenRaycast(e.clientX, e.clientY);
    canvas.style.cursor = h?.type === 'light' ? 'grab' : 'default';
  }

  if (dragLight) {
    canvas.style.cursor = 'grabbing';
    const p1 = rayXZPlane(e.clientX, e.clientY);
    if (p1) {
      const newX = Math.max(-7, Math.min(7, dragLight.origX + (p1.x - dragLight.p0.x)));
      const newZ = Math.max(-6, Math.min(6, dragLight.origZ + (p1.z - dragLight.p0.z)));
      dragLight.entry.group.setLocalPosition(newX, 0, newZ);
      const xEl = document.getElementById('lp-pos-x'), xvEl = document.getElementById('lp-pos-x-val');
      const zEl = document.getElementById('lp-pos-z'), zvEl = document.getElementById('lp-pos-z-val');
      if (xEl) { xEl.value = newX.toFixed(1); if (xvEl) xvEl.textContent = newX.toFixed(1) + 'm'; syncPct(xEl); }
      if (zEl) { zEl.value = newZ.toFixed(1); if (zvEl) zvEl.textContent = newZ.toFixed(1) + 'm'; syncPct(zEl); }
    }
    return;
  }

  if (!orbitDragging) return;
  orbitTheta -= (e.clientX - orbitLastX) * 0.012;
  const minPhi = Math.asin(Math.max(-0.999, (0.15 - orbitTarget.y) / orbitDist));
  orbitPhi = Math.max(minPhi, Math.min(Math.PI / 2 - 0.02,
               orbitPhi - (e.clientY - orbitLastY) * 0.012));
  orbitLastX  = e.clientX; orbitLastY = e.clientY;
  updateCamera();
});
canvas.addEventListener('pointerup', e => {
  orbitDragging = false;
  canvas.style.cursor = 'default';
  if (dragLight) {
    dragLight = null;
    // Short-circuit: no selection change after a drag
    return;
  }
  if (e.button !== 0 || didMove) return;
  const hit = screenRaycast(e.clientX, e.clientY);
  if (hit?.type === 'object') { selectObj(hit.entity); return; }
  if (hit?.type === 'light')  { selectLight(hit.entry); return; }
  clearSelection();
});
canvas.addEventListener('pointercancel', () => { orbitDragging = false; dragLight = null; canvas.style.cursor = 'default'; });
canvas.addEventListener('wheel', e => {
  orbitDist = Math.max(1, Math.min(30, orbitDist + e.deltaY * 0.01));
  updateCamera();
}, { passive: true });

// ─── KEYBOARD ─────────────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape')                          clearSelection();
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
});

// ─── TOOLBAR PANELS ───────────────────────────────────────────────────────────

const TB_PANELS = {
  'tb-views-btn': 'tb-views-panel',
  'hud-help-btn': 'hud-help-panel',
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
  if (!e.target.closest('.tb-panel') && !e.target.closest('.tb-cat-btn') && !e.target.closest('#hud')) closeAllPanels();
});

// ─── TOOLBAR ACTIONS ──────────────────────────────────────────────────────────

document.querySelectorAll('[data-add-object]').forEach(b =>
  b.addEventListener('click', () => { closeAllPanels(); addObject(b.dataset.addObject); })
);

document.querySelectorAll('[data-view]').forEach(b =>
  b.addEventListener('click', () => { closeAllPanels(); setCameraView(b.dataset.view); })
);

// ─── ACCORDION ────────────────────────────────────────────────────────────────

const accPanel = document.getElementById('acc-panel');

function showAccordion() { accPanel?.classList.remove('acc-hidden'); }
function hideAccordion() { accPanel?.classList.add('acc-hidden'); }

document.querySelectorAll('.acc-strip-tab').forEach(trigger => {
  trigger.addEventListener('click', () => {
    const strip  = trigger.closest('.acc-strip');
    const isOpen = strip.classList.contains('acc-open');
    // Close all strips, then open the clicked one if it was closed
    document.querySelectorAll('.acc-strip').forEach(s => {
      s.classList.remove('acc-open');
      s.querySelector('.acc-strip-tab').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      strip.classList.add('acc-open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });
});

const EQUIP_DEFAULT_ROLES = {
  fresnel: 'key', monolight: 'key',
  softbox: 'fill', octabox: 'fill',
  parcan: 'rim', ledpanel: 'fill',
};

document.querySelectorAll('.fix-add').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const equip = btn.dataset.equip;
    const entry = addLight(equip, { role: EQUIP_DEFAULT_ROLES[equip] || 'key' });
    if (entry) selectLight(entry);
  });
});

// ─── SETUP GUIDE ──────────────────────────────────────────────────────────────

function updateSetupGuide() {
  ['key', 'fill', 'rim'].forEach(role => {
    const present = lights.some(l => l.role === role);
    const item    = document.getElementById('guide-' + role);
    const status  = document.getElementById('guide-' + role + '-status');
    if (!item || !status) return;
    item.classList.toggle('present', present);
    status.textContent = present ? 'added' : 'missing';
  });
  const ratio    = getLightRatio();
  const ratioRow = document.getElementById('guide-ratio-row');
  const ratioVal = document.getElementById('guide-ratio-val');
  if (ratioRow && ratioVal) {
    ratioRow.style.display = ratio ? 'flex' : 'none';
    ratioVal.textContent   = ratio ?? '—';
  }
}

// ─── LIGHT PANEL STATIC BUTTONS ───────────────────────────────────────────────

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

// ─── OBJECT PANEL ─────────────────────────────────────────────────────────────

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

bindObjSlider('obj-pos-x', v => { const p = selObj.getLocalPosition(); selObj.setLocalPosition(v, p.y, p.z); });
bindObjSlider('obj-pos-y', v => { const p = selObj.getLocalPosition(); selObj.setLocalPosition(p.x, v, p.z); });
bindObjSlider('obj-pos-z', v => { const p = selObj.getLocalPosition(); selObj.setLocalPosition(p.x, p.y, v); });
bindObjSlider('obj-rot-y', v => { const r = selObj.getLocalEulerAngles(); selObj.setLocalEulerAngles(r.x, v, r.z); });
bindObjSlider('obj-scale', v => { selObj.setLocalScale(v, v, v); });

document.getElementById('obj-color').addEventListener('input', e => {
  if (!selObj) return;
  const mat = selObj.render.meshInstances[0].material;
  const c = new pc.Color();
  c.fromString(e.target.value);
  mat.diffuse.copy(c);
  mat.update();
});
document.getElementById('obj-roughness').addEventListener('input', e => {
  if (!selObj) return;
  const mat = selObj.render.meshInstances[0].material;
  mat.gloss = 1 - parseFloat(e.target.value);
  mat.update();
  syncR('obj-roughness');
});
document.getElementById('obj-metalness').addEventListener('input', e => {
  if (!selObj) return;
  const mat = selObj.render.meshInstances[0].material;
  mat.metalness = parseFloat(e.target.value);
  mat.update();
  syncR('obj-metalness');
});

// ─── HUD ──────────────────────────────────────────────────────────────────────

document.getElementById('exposure').addEventListener('input', e => {
  // Map 0-2 slider to exposure multiplier
  const v = parseFloat(e.target.value);
  fillLight.light.intensity = v * 1.6;
  const s = e.target.nextElementSibling; if (s) s.textContent = v.toFixed(2);
  syncPct(e.target);
});

let envLightsOn = true;
document.getElementById('studio-lights-btn').addEventListener('click', () => {
  envLightsOn = !envLightsOn;
  fillLight.light.enabled = envLightsOn;
  app.scene.ambientLight = envLightsOn ? new pc.Color(0.30, 0.30, 0.35) : new pc.Color(0, 0, 0);
  const btn = document.getElementById('studio-lights-btn');
  btn.textContent = envLightsOn ? 'Lights ON' : 'Lights OFF';
  btn.setAttribute('aria-pressed', String(envLightsOn));
  btn.classList.toggle('hud-lights-off', !envLightsOn);
});

document.getElementById('screenshot-btn').addEventListener('click', takeScreenshot);
const expSlider = document.getElementById('exposure');
fillLight.light.intensity = parseFloat(expSlider.value) * 1.6;
syncPct(expSlider);

// ─── SCREENSHOT ───────────────────────────────────────────────────────────────

function captureFrame() {
  freeTransformBox.classList.add('hidden');
  app.render();
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
  const name     = document.getElementById('student-name').value.trim();
  const url      = captureFrame();
  const filename = name ? `${name.replace(/\s+/g,'_')}_LightingStudio.png` : `LightingStudio_${Date.now()}.png`;
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  document.getElementById('screenshot-dialog').classList.add('hidden');
  const sr = document.getElementById('sr-announce');
  if (sr) sr.textContent = `Screenshot saved as ${filename}`;
});
document.getElementById('student-name').addEventListener('keydown', e => {
  if (e.key === 'Enter')  document.getElementById('sd-save').click();
  if (e.key === 'Escape') document.getElementById('sd-cancel').click();
});

// ─── INIT ─────────────────────────────────────────────────────────────────────

addLight('monolight', { role: 'key' });

const initSphere = addObject('sphere');
if (initSphere) { const p = initSphere.getLocalPosition(); initSphere.setLocalPosition(-0.3, p.y, 0); }
const initBox = addObject('box');
if (initBox) { const p = initBox.getLocalPosition(); initBox.setLocalPosition(0.8, p.y, 0.4); }

// ─── RENDER LOOP ──────────────────────────────────────────────────────────────

app.on('update', () => {
  // Floor clamp for objects
  objects.forEach(obj => {
    const aabb = getEntityAABB(obj);
    if (!aabb || aabb.halfExtents.y <= 0) return;
    const bottom = aabb.center.y - aabb.halfExtents.y;
    if (bottom < -0.001) {
      const lp = obj.getLocalPosition();
      obj.setLocalPosition(lp.x, lp.y - bottom, lp.z);
    }
  });

  // Floor clamp for light groups
  lights.forEach(entry => {
    const lp = entry.group.getLocalPosition();
    if (lp.y < 0) entry.group.setLocalPosition(lp.x, 0, lp.z);

    // Sync light position to head world position
    const headPos = entry.headEntity.getPosition();
    entry.lightEntity.setPosition(headPos);

    // Apply pan rotation to the physical stand
    const panAngle = entry.props.panAngle ?? 0;
    entry.group.setLocalEulerAngles(0, panAngle, 0);

    // Aim toward tiltY target — PC spot/area lights emit along local -Y
    const tiltY  = entry.props.tiltY ?? 1.0;
    const target = new pc.Vec3(0, tiltY, 0);
    const dir    = new pc.Vec3().sub2(target, headPos).normalize();
    const tilt   = Math.acos(Math.max(-1, Math.min(1, -dir.y))) * (180 / Math.PI);
    // Beam horizontal direction follows stand pan — not derived from geometry,
    // so rotating the stand actually rotates the beam.
    const pan    = panAngle;

    if (entry.lightType === 'spot' || entry.lightType === 'rect') {
      entry.lightEntity.setLocalEulerAngles(tilt, pan, 0);
    }

    // Tilt head model to visually match aim direction.
    // Group already handles pan; head only needs the X tilt in group-local space.
    let headRx;
    if (entry.equipType === 'parcan') {
      headRx = -tilt;            // PAR can forward = -Y local (hangs down by default)
    } else if (entry.lightType === 'rect') {
      headRx = tilt - 90;        // softbox/octabox forward = -Z local
    } else {
      headRx = 90 - tilt;        // monolight/fresnel/led forward = +Z local
    }
    entry.headEntity.setLocalEulerAngles(headRx, 0, 0);
  });

  positionTransformBox();
});

// ─── VR ───────────────────────────────────────────────────────────────────────

initVR(app, cameraEntity, () => ({ lights, applyLightPhysics, EQUIP_DEFS }));

// ─── WELCOME SCREEN ───────────────────────────────────────────────────────────

document.getElementById('btn-enter-studio')?.addEventListener('click', () => {
  const ws = document.getElementById('welcome-screen');
  if (!ws) return;
  ws.classList.add('ws-exit');
  setTimeout(() => ws.remove(), 420);
});

