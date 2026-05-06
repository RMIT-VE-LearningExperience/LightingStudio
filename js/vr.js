// ─── VR MODULE ────────────────────────────────────────────────────────────────
// WebXR immersive-vr for Pico / Quest / any 6DOF headset.
// Enter VR → see the studio at 1:1 scale → grab light stands, tap menu buttons.
//
// Network note: WebXR requires HTTPS. Use the production build on GitHub Pages,
// or run: npx vite --host   then access http://<your-ip>:5174 on the headset
// after enabling "Allow non-HTTPS" in Pico browser flags.

import * as pc from 'playcanvas';

// ─── Public init ──────────────────────────────────────────────────────────────

export function initVR(app, cameraEntity, getState) {
  if (!app.xr.supported) return;

  const vrBtn = document.getElementById('vr-btn');

  // Show button when immersive-vr is available on this device
  function updateBtn() {
    if (!vrBtn) return;
    vrBtn.style.display = app.xr.isAvailable(pc.XRTYPE_VR) ? 'flex' : 'none';
  }
  updateBtn();
  // Re-check when availability changes (async query result arrives)
  app.xr.on('available', () => updateBtn());

  vrBtn?.addEventListener('click', () => {
    if (app.xr.active) {
      app.xr.end();
    } else {
      app.xr.start(cameraEntity.camera, pc.XRTYPE_VR, pc.XRSPACE_LOCALFLOOR, {
        optionalFeatures: ['hand-tracking'],
      });
    }
  });

  // ─── Session lifecycle ─────────────────────────────────────────────────────

  app.xr.on('start', () => {
    if (vrBtn) vrBtn.textContent = 'Exit VR';
    onVRStart();
  });

  app.xr.on('end', () => {
    if (vrBtn) { vrBtn.textContent = 'VR'; vrBtn.style.display = 'flex'; }
    onVREnd();
  });

  app.xr.on('error', err => console.warn('[VR] error:', err?.message ?? err));

  // ─── VR state ─────────────────────────────────────────────────────────────

  const ctrlData = new Map();   // XrInputSource → { rayEnt, wasSelecting }
  const menuBtns = [];
  let menuEnt    = null;
  let grabbed    = null;        // { inputSource, entry, offset: pc.Vec3 }

  // ─── Controller add / remove ──────────────────────────────────────────────

  app.xr.input.on('add', inputSource => {
    const rayEnt = buildRay();
    ctrlData.set(inputSource, { rayEnt, wasSelecting: false });
  });

  app.xr.input.on('remove', inputSource => {
    const d = ctrlData.get(inputSource);
    if (d) { d.rayEnt.destroy(); ctrlData.delete(inputSource); }
    if (grabbed?.inputSource === inputSource) grabbed = null;
  });

  // ─── Session start: build floating menu ───────────────────────────────────

  function onVRStart() {
    menuEnt = new pc.Entity('vr-menu');
    // Float the panel 1m in front of the studio's centre, at eye level
    menuEnt.setLocalPosition(0, 1.5, 1.8);
    app.root.addChild(menuEnt);

    // Panel backing
    addBox(menuEnt, [0, 0, 0], [0.72, 0.56, 0.025], panelMat());

    // Buttons: [label, color rgb, action-id, col, row]
    const BTNS = [
      ['WARM',   [0.90, 0.42, 0.10], 'warm',   -0.17,  0.16],
      ['COOL',   [0.28, 0.52, 1.00], 'cool',    0.17,  0.16],
      ['BRIGHT', [1.00, 0.95, 0.50], 'bright', -0.17,  0.02],
      ['DIM',    [0.45, 0.45, 0.55], 'dim',     0.17,  0.02],
      ['ON/OFF', [0.80, 0.20, 0.20], 'toggle', -0.17, -0.13],
      ['MOVE\nMENU', [0.30, 0.60, 0.30], 'move', 0.17, -0.13],
    ];

    menuBtns.length = 0;
    BTNS.forEach(([, rgb, id, cx, cy]) => {
      const m = new pc.StandardMaterial();
      m.diffuse.set(...rgb); m.emissive.set(...rgb.map(v => v * 0.25));
      m.emissiveIntensity = 1; m.update();
      const btn = addBox(menuEnt, [cx, cy, 0.02], [0.28, 0.10, 0.025], m);
      menuBtns.push({ entity: btn, id });
    });
  }

  function onVREnd() {
    menuEnt?.destroy(); menuEnt = null;
    menuBtns.length = 0;
    ctrlData.forEach(d => d.rayEnt.destroy());
    ctrlData.clear();
    grabbed = null;
  }

  // ─── Update loop ──────────────────────────────────────────────────────────

  app.on('update', () => {
    if (!app.xr.active) return;
    const { lights, applyLightPhysics, EQUIP_DEFS } = getState();

    for (const [inputSource, ctrl] of ctrlData) {
      const origin = inputSource.getOrigin();
      const dir    = inputSource.getDirection();
      if (!origin || !dir) continue;

      positionRay(ctrl.rayEnt, origin, dir);

      const ray      = new pc.Ray(origin, dir);
      const pressing = inputSource.selecting;

      if (pressing && !ctrl.wasSelecting) {
        // ── trigger just pressed ──────────────────────────────────────────
        const btnHit = hitMenuBtn(ray);
        if (btnHit) {
          doAction(btnHit, lights, applyLightPhysics, EQUIP_DEFS);
        } else {
          const lightHit = hitLight(ray, lights);
          if (lightHit) {
            const gripPos = inputSource.getPosition();
            if (gripPos) {
              const gp = lightHit.group.getPosition();
              grabbed = {
                inputSource,
                entry: lightHit,
                offset: new pc.Vec3(gp.x - gripPos.x, 0, gp.z - gripPos.z),
              };
            }
          }
        }
      }

      if (!pressing && grabbed?.inputSource === inputSource) {
        grabbed = null;
      }

      // ── move grabbed light ────────────────────────────────────────────
      if (grabbed?.inputSource === inputSource) {
        const gripPos = inputSource.getPosition();
        if (gripPos) {
          grabbed.entry.group.setPosition(
            gripPos.x + grabbed.offset.x,
            0,
            gripPos.z + grabbed.offset.z,
          );
        }
      }

      ctrl.wasSelecting = pressing;
    }
  });

  // ─── Ray helpers ──────────────────────────────────────────────────────────

  function buildRay() {
    const e = new pc.Entity('ctrl-ray');
    e.addComponent('render', { type: 'box' });
    const m = new pc.StandardMaterial();
    m.emissive.set(1, 1, 1); m.emissiveIntensity = 3;
    m.diffuse.set(0, 0, 0); m.update();
    e.render.meshInstances[0].material = m;
    e.render.castShadows = false;
    e.setLocalScale(0.004, 0.004, 1.2);
    app.root.addChild(e);
    return e;
  }

  function positionRay(rayEnt, origin, dir) {
    const RAY_LEN = 1.2;
    const mid = new pc.Vec3(
      origin.x + dir.x * RAY_LEN * 0.5,
      origin.y + dir.y * RAY_LEN * 0.5,
      origin.z + dir.z * RAY_LEN * 0.5,
    );
    rayEnt.setPosition(mid);
    // lookAt aligns +Z toward target — box long axis is Z → ray points correctly
    rayEnt.lookAt(new pc.Vec3(origin.x + dir.x, origin.y + dir.y, origin.z + dir.z));
  }

  // ─── Hit testing ──────────────────────────────────────────────────────────

  function hitMenuBtn(ray) {
    const hit = new pc.Vec3();
    for (const btn of menuBtns) {
      const wpos = btn.entity.getPosition();
      const s    = btn.entity.getLocalScale();
      const bb   = new pc.BoundingBox(wpos, new pc.Vec3(s.x * 0.5, s.y * 0.5, s.z * 0.5));
      if (bb.intersectsRay(ray, hit)) return btn;
    }
    return null;
  }

  function hitLight(ray, lights) {
    const hit = new pc.Vec3();
    let best = null, bestD = Infinity;
    for (const entry of lights) {
      const gp = entry.group.getPosition();
      // Tall hitbox covering the stand + head area
      const center = new pc.Vec3(gp.x, 1.25, gp.z);
      const half   = new pc.Vec3(0.35, 1.25, 0.35);
      const bb     = new pc.BoundingBox(center, half);
      if (bb.intersectsRay(ray, hit)) {
        const d = new pc.Vec3().sub2(hit, ray.origin).length();
        if (d < bestD) { bestD = d; best = entry; }
      }
    }
    return best;
  }

  // ─── Menu actions ─────────────────────────────────────────────────────────

  function doAction(btn, lights, applyLightPhysics, EQUIP_DEFS) {
    const entry = lights[0];
    if (!entry && btn.id !== 'move') return;

    if (btn.id === 'move') {
      // Reposition menu panel in front of headset
      const camPos = cameraEntity.getPosition();
      const camFwd = new pc.Vec3();
      cameraEntity.getWorldTransform().transformVector(new pc.Vec3(0, 0, -1), camFwd);
      camFwd.y = 0; camFwd.normalize();
      menuEnt?.setPosition(
        camPos.x + camFwd.x * 1.2,
        1.5,
        camPos.z + camFwd.z * 1.2,
      );
      return;
    }

    const p   = entry.props;
    const def = EQUIP_DEFS[entry.equipType];

    if (btn.id === 'warm')   p.colorTemp = Math.max((def.minTemp ?? 2700), p.colorTemp - 800);
    if (btn.id === 'cool')   p.colorTemp = Math.min((def.maxTemp ?? 6500), p.colorTemp + 800);
    if (btn.id === 'bright') p.watts = Math.min(def.maxW, Math.round(p.watts * 1.35));
    if (btn.id === 'dim')    p.watts = Math.max(def.minW, Math.round(p.watts * 0.75));
    if (btn.id === 'toggle') {
      entry.enabled = !entry.enabled;
      entry.lightEntity.light.enabled = entry.enabled;
    }

    if (btn.id !== 'toggle') applyLightPhysics(entry);
  }

  // ─── Primitive helpers ────────────────────────────────────────────────────

  function addBox(parent, pos, scale, mat) {
    const e = new pc.Entity();
    e.addComponent('render', { type: 'box' });
    e.render.meshInstances[0].material = mat;
    e.render.castShadows = false;
    e.setLocalPosition(...pos);
    e.setLocalScale(...scale);
    parent.addChild(e);
    return e;
  }

  function panelMat() {
    const m = new pc.StandardMaterial();
    m.diffuse.set(0.10, 0.10, 0.14);
    m.emissive.set(0.04, 0.04, 0.06);
    m.emissiveIntensity = 1; m.update();
    return m;
  }
}
