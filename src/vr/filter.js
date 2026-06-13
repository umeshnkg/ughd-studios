import * as THREE from 'three';
import { filterTags } from '../data.js';
import { ACCENT, COMPANION_DIST, COMPANION_DOWN, COMPANION_SIDE, COMPANION_LAG } from './constants.js';
import { makeCanvasPanel, roundRectPath } from './text.js';

// ============================================================
// Filter companion: a small, unobtrusive icon that trails your gaze
// with lag (like a little follower). Point + trigger toggles a tag
// menu (mirrors the site's filterTags); picking a tag filters the
// sphere. While the menu is open the companion freezes so the pills
// are easy to point at.
// ============================================================

const PILL_W = 0.36;
const PILL_H = 0.092;
const PILL_GAP = 0.016;

export function createFilter({ scene, camera, sphere }) {
  // flatten to the main tags (keep the menu readable in VR)
  const tags = filterTags.map((t) => t.label);

  // ----- companion -----
  const companion = makeCanvasPanel(0.16, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(8,10,14,0.85)';
    ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4cc9ff'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
    // funnel / filter glyph
    ctx.beginPath();
    ctx.moveTo(38, 42); ctx.lineTo(90, 42); ctx.lineTo(70, 70); ctx.lineTo(70, 92); ctx.lineTo(58, 84); ctx.lineTo(58, 70); ctx.closePath();
    ctx.stroke();
  });
  companion.userData.companion = true;
  companion.renderOrder = 5;
  companion.material.depthTest = false;
  scene.add(companion);

  // ----- menu (hidden until opened) -----
  const menu = new THREE.Group();
  menu.visible = false;
  scene.add(menu);
  const pills = [];
  tags.forEach((tag, i) => {
    const pill = makePill(tag);
    pill.position.set(0, ((tags.length - 1) / 2 - i) * (PILL_H + PILL_GAP), 0);
    pill.userData.tag = tag;
    pill.userData.pill = true;
    menu.add(pill);
    pills.push(pill);
  });

  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const target = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let menuOpen = false;
  let activeTag = 'ALL';
  highlight();

  function highlight() {
    for (const p of pills) {
      const on = p.userData.tag === activeTag;
      p.material.color.setHex(on ? ACCENT : 0xffffff);
    }
  }

  return {
    companion,
    isMenuOpen: () => menuOpen,
    pillTargets: () => (menuOpen ? pills : []),

    toggle() {
      menuOpen = !menuOpen;
      menu.visible = menuOpen;
      if (menuOpen) {
        // anchor the menu beside the companion, facing the viewer
        menu.position.copy(companion.position);
        camera.getWorldPosition(camPos);
        menu.lookAt(camPos);
        menu.translateX(-0.34); // sit to the left of the icon
      }
    },

    selectPill(mesh) {
      if (!mesh || !mesh.userData.pill) return;
      activeTag = mesh.userData.tag;
      highlight();
      sphere.applyFilter(activeTag);
    },

    update() {
      if (menuOpen) return; // frozen while choosing
      camera.getWorldPosition(camPos);
      camera.getWorldDirection(camDir);
      right.crossVectors(camDir, up).normalize();
      target.copy(camPos)
        .addScaledVector(camDir, COMPANION_DIST)
        .addScaledVector(right, COMPANION_SIDE)
        .addScaledVector(up, -COMPANION_DOWN);
      companion.position.lerp(target, COMPANION_LAG); // lag = trailing drag
      companion.lookAt(camPos);
    },
  };
}

function makePill(label) {
  const mesh = makeCanvasPanel(PILL_W, 360, 92, (ctx, w, h) => {
    roundRectPath(ctx, 4, 4, w - 8, h - 8, 40);
    ctx.fillStyle = 'rgba(8,10,14,0.9)';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(76,201,255,0.6)'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '600 40px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2);
  });
  mesh.material.depthTest = false;
  mesh.renderOrder = 6;
  return mesh;
}
