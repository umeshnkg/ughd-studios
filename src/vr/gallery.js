import * as THREE from 'three';
import gsap from 'gsap';
import { EYE_Y, WALL_DIST, PAD_DIST, PANEL_SCALE, ZONES,
         ACCENT, HOVER_SCALE, HOVER_DUR, BOB_AMP, BOB_SPEED,
         BAND_CENTER, FLOOR_CLEAR, MAX_ROWS, ROW_TARGET } from './constants.js';

// ============================================================
// The gallery hall: work split into zones (one curved wall each,
// grouped by project source), arranged radially around a central
// spawn. Panels reuse the loaded project textures.
//
// Feel: smooth gsap hover (scale + a shared cyan glow rim), a tiny
// idle breathing bob, and an arrival "materialize" wave on entry.
// ============================================================

const TILE_W = 3.2;
const TILE_H = 2.875;
const PANEL_W = TILE_W * PANEL_SCALE;
const PANEL_H = TILE_H * PANEL_SCALE;
const H_GAP = 1.14;
const V_GAP = 1.08;

export function createGallery({ scene, projectArt, tileGeometry, makeCardMaterial, angleOffset = 0 }) {
  const group = new THREE.Group();
  const panels = [];
  const pads = [{ position: new THREE.Vector3(0, 0, 0), label: 'CENTRE' }];

  // one shared additive glow that slides behind whichever panel is hovered
  const rim = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W * 1.16, PANEL_H * 1.18),
    new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  rim.visible = false;
  group.add(rim);

  // bucket loaded art by source, in zone order
  const byZone = ZONES.map(() => []);
  for (const art of projectArt) {
    let zi = ZONES.findIndex((z) => z.source === art.p.source);
    if (zi < 0) zi = 0;
    byZone[zi].push(art);
  }

  ZONES.forEach((zone, zi) => {
    const items = byZone[zi];
    if (!items.length) return;
    const baseAngle = angleOffset + (zi * 2 * Math.PI) / ZONES.length;
    const dir = new THREE.Vector3(Math.sin(baseAngle), 0, -Math.cos(baseAngle));

    // prefer wide walls with few rows so nothing stacks too tall; the arc
    // just curves further for big zones
    const rows = Math.min(MAX_ROWS, Math.ceil(items.length / ROW_TARGET));
    const cols = Math.ceil(items.length / rows);
    const hStep = (PANEL_W * H_GAP) / WALL_DIST;
    const vStep = PANEL_H * V_GAP;
    // centre the stack in the comfortable band, but push it up if needed so
    // the lowest row's bottom edge clears the floor
    const stackHalf = ((rows - 1) / 2) * vStep;
    const centerY = Math.max(BAND_CENTER, FLOOR_CLEAR + PANEL_H / 2 + stackHalf);

    items.forEach((art, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const a = baseAngle + (col - (cols - 1) / 2) * hStep;
      const y = centerY + ((rows - 1) / 2 - row) * vStep;
      const mat = makeCardMaterial(art.tex, { value: 1 });
      const mesh = new THREE.Mesh(tileGeometry, mat);
      mesh.position.set(Math.sin(a) * WALL_DIST, y, -Math.cos(a) * WALL_DIST);
      mesh.scale.setScalar(PANEL_SCALE);
      mesh.lookAt(0, y, 0);
      mesh.userData.project = art.p;
      mesh.userData.baseScale = PANEL_SCALE;
      mesh.userData.basePos = mesh.position.clone();
      mesh.userData.phase = Math.random() * Math.PI * 2;
      group.add(mesh);
      panels.push(mesh);
    });

    const topY = centerY + ((rows - 1) / 2) * vStep + vStep * 0.7;
    const sign = makeSign(zone.label);
    sign.position.set(Math.sin(baseAngle) * WALL_DIST, topY, -Math.cos(baseAngle) * WALL_DIST);
    sign.lookAt(0, topY, 0);
    group.add(sign);

    pads.push({ position: dir.clone().multiplyScalar(PAD_DIST), label: zone.label });
  });

  scene.add(group);

  let hovered = null;

  function moveRimTo(mesh) {
    rim.position.copy(mesh.userData.basePos);
    rim.quaternion.copy(mesh.quaternion);
    rim.translateZ(-0.03); // tuck just behind the panel
    rim.visible = true;
  }

  function setHover(mesh) {
    const next = mesh && panels.includes(mesh) ? mesh : null;
    if (next === hovered) return false;
    const base = PANEL_SCALE;
    if (hovered) gsap.to(hovered.scale, { x: base, y: base, z: base, duration: HOVER_DUR, ease: 'power2.out' });
    hovered = next;
    if (hovered) {
      const s = base * HOVER_SCALE;
      gsap.to(hovered.scale, { x: s, y: s, z: s, duration: HOVER_DUR, ease: 'power2.out' });
      moveRimTo(hovered);
      gsap.killTweensOf(rim.material);
      gsap.to(rim.material, { opacity: 0.85, duration: HOVER_DUR, ease: 'power2.out' });
    } else {
      gsap.killTweensOf(rim.material);
      gsap.to(rim.material, { opacity: 0, duration: HOVER_DUR, ease: 'power2.out',
        onComplete: () => { if (!hovered) rim.visible = false; } });
    }
    return true;
  }

  return {
    group,
    panels,
    pads,
    setHover,
    clearHover: () => setHover(null),
    get hovered() { return hovered; },

    // gentle idle breathing — tiny vertical bob, scale left to the hover tween
    update(t) {
      for (const p of panels) {
        p.position.y = p.userData.basePos.y + Math.sin(t * BOB_SPEED + p.userData.phase) * BOB_AMP;
      }
    },

    // panels you look at "wake" (brighten); the rest sit a touch dimmer, so
    // the wall comes alive as your gaze sweeps across it. Uses material
    // colour (multiplies the texture) — independent of hover/dim/scale.
    updateGaze(camPos, camDir) {
      for (const p of panels) {
        const dx = p.position.x - camPos.x, dy = p.position.y - camPos.y, dz = p.position.z - camPos.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const d = (dx * camDir.x + dy * camDir.y + dz * camDir.z) / len;
        const wake = Math.max(0, Math.min(1, (d - 0.9) / 0.09)); // narrow cone
        const g = 0.8 + 0.2 * wake;
        const c = p.material.color;
        c.r += (g - c.r) * 0.12; c.g += (g - c.g) * 0.12; c.b += (g - c.b) * 0.12;
      }
    },

    // arrival: panels materialize in a staggered wave
    playIntro() {
      for (const p of panels) { p.scale.setScalar(0.0001); p.material.opacity = 0; }
      gsap.to(panels.map((p) => p.scale), {
        x: PANEL_SCALE, y: PANEL_SCALE, z: PANEL_SCALE,
        duration: 0.9, ease: 'power3.out', stagger: { each: 0.018, from: 'random' },
      });
      gsap.to(panels.map((p) => p.material), {
        opacity: 1, duration: 0.9, ease: 'power2.out', stagger: { each: 0.018, from: 'random' },
      });
    },

    // dim to a backdrop (focus open) instead of hard-hiding the room
    dim(on) {
      gsap.to(panels.map((p) => p.material), {
        opacity: on ? 0.12 : 1, duration: 0.4, ease: 'power2.out',
      });
      gsap.to(rim.material, { opacity: 0, duration: 0.2 });
    },

    setVisible(v) { group.visible = v; },
  };
}

function makeSign(text) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 160;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 1024, 160);
  ctx.fillStyle = '#fff';
  ctx.font = '700 84px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 80);
  // thin cyan accent underline
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = '#4cc9ff';
  ctx.fillRect(512 - tw / 2, 132, tw, 5);
  const tex = new THREE.CanvasTexture(cv);
  const w = 2.6;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, w * (160 / 1024)),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
}
