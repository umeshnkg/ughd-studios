import * as THREE from 'three';
import { WARP_IN_DUR, WARP_OUT_DUR } from './constants.js';

// ============================================================
// "Star tunnel" transition for entering/leaving VR. Stars are drawn as
// STREAKS (line segments that stretch with speed) — the cheap stand-in
// for motion blur — over a dark backdrop, with smooth eased fades so it
// glides in/out instead of popping. One LineSegments cloud, reused both
// directions. Child of the camera, so it's head-locked.
// ============================================================

const COUNT = 600;
const FAR = 60;
const STREAK_K = 0.06; // streak length per unit speed

const smooth = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
};

export function createWarp({ camera }) {
  const group = new THREE.Group();
  group.visible = false;
  camera.add(group);

  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x02040a, side: THREE.BackSide,
      transparent: true, opacity: 1, depthWrite: false })
  );
  backdrop.renderOrder = 0;
  group.add(backdrop);

  // streaks: 2 vertices per star (head + tail)
  const verts = new Float32Array(COUNT * 6);
  const ang = new Float32Array(COUNT);
  const rad = new Float32Array(COUNT);
  const z = new Float32Array(COUNT);
  const spd = new Float32Array(COUNT);
  function seed(i) {
    ang[i] = Math.random() * Math.PI * 2;
    rad[i] = 0.4 + Math.random() * 7;
    z[i] = -2 - Math.random() * FAR;
    spd[i] = 20 + Math.random() * 30;
  }
  for (let i = 0; i < COUNT; i++) seed(i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xcfe8ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  streaks.renderOrder = 1;
  group.add(streaks);

  let mode = null; // 'in' | 'out'
  let t0 = 0, dur = 1, onDone = null, last = 0;

  function writeStreaks(f) {
    for (let i = 0; i < COUNT; i++) {
      const x = Math.cos(ang[i]) * rad[i];
      const y = Math.sin(ang[i]) * rad[i];
      const len = Math.min(spd[i] * f * STREAK_K, 6);
      const o = i * 6;
      verts[o] = x; verts[o + 1] = y; verts[o + 2] = z[i];            // head
      verts[o + 3] = x; verts[o + 4] = y; verts[o + 5] = z[i] - len;  // tail
    }
    geo.getAttribute('position').needsUpdate = true;
  }

  return {
    group,
    playIn(cb) { start('in', WARP_IN_DUR, cb); },
    playOut(cb) { start('out', WARP_OUT_DUR, cb); },
    update(now) {
      if (!mode) return;
      const dt = Math.min(now - last, 0.05); last = now;
      const p = Math.min((now - t0) / dur, 1);
      // speed: enter decelerates to a stop, exit accelerates away
      const f = mode === 'in' ? Math.pow(1 - p, 1.5) : (0.2 + p * 1.6);
      for (let i = 0; i < COUNT; i++) {
        z[i] += spd[i] * f * dt;
        if (z[i] > 1) { seed(i); }
      }
      writeStreaks(f);
      // smooth fades — backdrop reveals/hides the world, streaks ease in/out
      backdrop.material.opacity = mode === 'in' ? 1 - smooth(0.15, 0.95, p) : smooth(0.1, 1, p);
      streaks.material.opacity = mode === 'in'
        ? smooth(0, 0.12, p) * (1 - smooth(0.8, 1, p))
        : smooth(0, 0.18, p);
      if (p >= 1) { mode = null; group.visible = false; const cb = onDone; onDone = null; cb && cb(); }
    },
  };

  function start(m, d, cb) {
    mode = m; dur = d; onDone = cb;
    t0 = last = performance.now() / 1000;
    for (let i = 0; i < COUNT; i++) seed(i);
    group.visible = true;
    backdrop.material.opacity = m === 'in' ? 1 : 0;
    streaks.material.opacity = 0;
  }
}
