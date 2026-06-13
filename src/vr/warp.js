import * as THREE from 'three';
import { WARP_IN_DUR, WARP_OUT_DUR } from './constants.js';

// ============================================================
// Lightweight "star tunnel" transition for entering/leaving VR — a
// single Points cloud rushing past the viewer plus a dark backdrop
// that fades the world in (enter) or out (exit). Child of the camera
// so it's always head-locked. One cloud, reused both directions.
// ============================================================

const COUNT = 700;
const FAR = 60;

export function createWarp({ camera }) {
  const group = new THREE.Group();
  group.visible = false;
  camera.add(group);

  // dark backdrop shell (hides/reveals the world)
  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x02040a, side: THREE.BackSide,
      transparent: true, opacity: 1, depthWrite: false })
  );
  backdrop.renderOrder = 0;
  group.add(backdrop);

  // star tunnel
  const pos = new Float32Array(COUNT * 3);
  const spd = new Float32Array(COUNT);
  function seed(i) {
    const a = Math.random() * Math.PI * 2;
    const rad = 0.4 + Math.random() * 7;
    pos[i * 3] = Math.cos(a) * rad;
    pos[i * 3 + 1] = Math.sin(a) * rad;
    pos[i * 3 + 2] = -2 - Math.random() * FAR; // ahead of the camera
    spd[i] = 18 + Math.random() * 26;
  }
  for (let i = 0; i < COUNT; i++) seed(i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xcfe8ff, size: 0.13, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  stars.renderOrder = 1;
  group.add(stars);

  let mode = null; // 'in' | 'out'
  let t0 = 0, dur = 1, onDone = null, last = 0;
  const attr = geo.getAttribute('position');

  return {
    group,
    playIn(cb) { start('in', WARP_IN_DUR, cb); },
    playOut(cb) { start('out', WARP_OUT_DUR, cb); },
    update(now) {
      if (!mode) return;
      const dt = Math.min(now - last, 0.05); last = now;
      const p = Math.min((now - t0) / dur, 1);
      // speed: enter decelerates, exit accelerates
      const f = mode === 'in' ? (1 - p) : (0.3 + p);
      for (let i = 0; i < COUNT; i++) {
        let z = attr.getZ(i) + spd[i] * f * dt;
        if (z > 1) { seed(i); z = attr.getZ(i); } else attr.setZ(i, z);
      }
      attr.needsUpdate = true;
      backdrop.material.opacity = mode === 'in' ? (1 - p) : p;
      stars.material.opacity = mode === 'in' ? (0.95 * (1 - p * 0.7)) : 0.95;
      if (p >= 1) { mode = null; group.visible = false; const cb = onDone; onDone = null; cb && cb(); }
    },
  };

  function start(m, d, cb) {
    mode = m; dur = d; onDone = cb;
    t0 = last = performance.now() / 1000;
    for (let i = 0; i < COUNT; i++) seed(i);
    group.visible = true;
    backdrop.material.opacity = m === 'in' ? 1 : 0;
  }
}
