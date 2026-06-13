import * as THREE from 'three';
import { filterTags } from '../data.js';
import { ACCENT, COMPANION_DIST, COMPANION_DOWN, COMPANION_SIDE, COMPANION_LAG } from './constants.js';
import { makeCanvasPanel, roundRectPath } from './text.js';

// ============================================================
// Filter companion: a small glowing "living blob" that trails your
// gaze with lag (breathing/wobbling so it reads as a creature, not an
// icon). Point + trigger toggles a tag menu (mirrors filterTags);
// picking a tag re-arranges the sphere. Frozen while the menu is open.
// ============================================================

const PILL_W = 0.4;
const PILL_H = 0.1;
const PILL_GAP = 0.018;

export function createFilter({ scene, camera, sphere }) {
  const tags = filterTags.map((t) => t.label);

  // ----- living-blob companion -----
  const companion = new THREE.Group();

  // soft core
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 24, 20),
    new THREE.MeshBasicMaterial({ color: 0xddf4ff })
  );
  companion.add(core);
  // raycast proxy (bigger invisible sphere so it's easy to point at);
  // hovering it scales the whole blob via hoverTarget
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  proxy.userData.companion = true;
  proxy.userData.hoverable = true;
  proxy.userData.baseScale = 1;
  proxy.userData.hoverTarget = companion;
  companion.add(proxy);
  // layered additive glow halos that pulse — the "alive" feel
  const halos = [0.09, 0.14, 0.2].map((r, i) => {
    const h = new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 16),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true,
        opacity: 0.22 - i * 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    companion.add(h);
    return h;
  });
  companion.renderOrder = 5;
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
    pill.userData.hoverable = true;
    pill.userData.baseScale = 1;
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
    for (const p of pills) p.material.color.setHex(p.userData.tag === activeTag ? ACCENT : 0xffffff);
  }

  return {
    companion,
    hitProxy: proxy,
    isMenuOpen: () => menuOpen,
    pillTargets: () => (menuOpen ? pills : []),

    toggle() {
      menuOpen = !menuOpen;
      menu.visible = menuOpen;
      if (menuOpen) {
        menu.position.copy(companion.position);
        camera.getWorldPosition(camPos);
        menu.lookAt(camPos);
        menu.translateX(-0.4);
      }
    },

    selectPill(mesh) {
      if (!mesh || !mesh.userData.pill) return;
      activeTag = mesh.userData.tag;
      highlight();
      camera.getWorldDirection(camDir);
      sphere.applyFilter(activeTag, camDir.clone()); // pass gaze so matches cluster in front
    },

    update(t) {
      // breathing + wobble so it reads as alive
      const pulse = 1 + 0.12 * Math.sin(t * 2.2);
      core.scale.setScalar(pulse);
      halos.forEach((h, i) => {
        h.scale.setScalar(pulse * (1 + 0.05 * Math.sin(t * (1.5 + i * 0.6) + i)));
        h.material.opacity = (0.22 - i * 0.05) * (0.7 + 0.3 * Math.sin(t * 2.2 + i));
      });
      if (menuOpen) return; // frozen while choosing
      camera.getWorldPosition(camPos);
      camera.getWorldDirection(camDir);
      right.crossVectors(camDir, up).normalize();
      target.copy(camPos)
        .addScaledVector(camDir, COMPANION_DIST)
        .addScaledVector(right, COMPANION_SIDE)
        .addScaledVector(up, -COMPANION_DOWN);
      // organic drift on top of the gaze target
      target.x += Math.sin(t * 0.9) * 0.02;
      target.y += Math.sin(t * 1.3) * 0.02;
      companion.position.lerp(target, COMPANION_LAG);
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
