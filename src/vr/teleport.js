import * as THREE from 'three';
import { ACCENT } from './constants.js';

// ============================================================
// Comfort-first locomotion:
//   • push the LEFT thumbstick forward → a teleport ray + reticle
//     appears; release to jump (with a quick fade-to-black blink).
//   • flick the LEFT thumbstick left/right → 30° snap turn.
//   • glowing pads mark the ideal viewing spot for each zone; aiming
//     near one snaps the reticle to it.
// The rig (camera's parent) is what actually moves, so the headset
// pose stays untouched — no smooth motion, no nausea.
// ============================================================

const SNAP_ANGLE = THREE.MathUtils.degToRad(30);
const PAD_SNAP_DIST = 1.3;
const FLOOR_LIMIT = 11; // keep teleports inside the floor disc

export function createTeleport({ leftController, getLeftSource, rig, floorMesh, pads, blink, scene, onTeleport }) {
  const raycaster = new THREE.Raycaster();
  const tmpMatrix = new THREE.Matrix4();
  const hitPoint = new THREE.Vector3();
  let aiming = false;
  let validTarget = null;
  let turnLatched = false;

  // ----- teleport pads on the floor -----
  const padMeshes = pads.map((p) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 32),
      new THREE.MeshBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(p.position).setY(0.02);
    scene.add(ring);
    return ring;
  });

  // ----- aiming ray + reticle -----
  const rayLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.8 })
  );
  rayLine.visible = false;
  scene.add(rayLine);

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.4, 32),
    new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;
  scene.add(reticle);

  function readStick() {
    const src = getLeftSource?.();
    const gp = src?.gamepad;
    if (!gp) return { x: 0, y: 0 };
    const ax = gp.axes;
    // Quest Touch: thumbstick is axes[2]/[3]; fall back to [0]/[1]
    const x = Math.abs(ax[2] ?? 0) > Math.abs(ax[0] ?? 0) ? ax[2] : ax[0] ?? 0;
    const y = Math.abs(ax[3] ?? 0) > Math.abs(ax[1] ?? 0) ? ax[3] : ax[1] ?? 0;
    return { x: x ?? 0, y: y ?? 0 };
  }

  function aim() {
    tmpMatrix.identity().extractRotation(leftController.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(leftController.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);
    const hits = raycaster.intersectObject(floorMesh, false);
    if (!hits.length) { validTarget = null; reticle.visible = false; return; }
    hitPoint.copy(hits[0].point);

    // snap to the nearest pad if close
    let snapped = null, best = PAD_SNAP_DIST;
    for (const p of pads) {
      const d = Math.hypot(p.position.x - hitPoint.x, p.position.z - hitPoint.z);
      if (d < best) { best = d; snapped = p; }
    }
    if (snapped) hitPoint.copy(snapped.position);
    if (Math.hypot(hitPoint.x, hitPoint.z) > FLOOR_LIMIT) { validTarget = null; reticle.visible = false; return; }

    validTarget = hitPoint.clone();
    reticle.position.copy(hitPoint).setY(0.03);
    reticle.visible = true;

    // draw the ray from controller to the hit point
    const o = raycaster.ray.origin;
    rayLine.geometry.setFromPoints([o.clone(), hitPoint.clone()]);
    rayLine.position.set(0, 0, 0);
    rayLine.visible = true;
  }

  function endAim() {
    rayLine.visible = false;
    reticle.visible = false;
    if (!validTarget) return;
    const dest = validTarget.clone();
    blink(() => {
      rig.position.x = dest.x;
      rig.position.z = dest.z;
      onTeleport?.();
    });
    validTarget = null;
  }

  return {
    setVisible(v) {
      for (const m of padMeshes) m.visible = v;
      if (!v) { rayLine.visible = false; reticle.visible = false; aiming = false; }
    },
    update(enabled) {
      if (!enabled) return;

      // pads breathe so they read as live targets
      const pulse = 0.28 + 0.12 * Math.sin(performance.now() / 600);
      for (const m of padMeshes) if (m.visible) m.material.opacity = pulse;
      if (reticle.visible) {
        const s = 1 + 0.08 * Math.sin(performance.now() / 220);
        reticle.scale.setScalar(s);
      }

      const { x, y } = readStick();

      // snap turn (latched so one flick = one turn)
      if (Math.abs(x) > 0.7 && !turnLatched) {
        rig.rotation.y -= Math.sign(x) * SNAP_ANGLE;
        turnLatched = true;
      } else if (Math.abs(x) < 0.3) {
        turnLatched = false;
      }

      // teleport aim/commit
      if (y < -0.6) { aiming = true; aim(); }
      else if (aiming) { aiming = false; endAim(); }
    },
  };
}
