import * as THREE from 'three';
import { ACCENT } from './constants.js';
import { makeCanvasPanel } from './text.js';

// ============================================================
// Control orbs: glowing labelled spheres floating around the front of
// the stage — Demo Reel · About · Contact · Exit. Point + trigger to
// activate. Replaces the wrist menu (which was hard to press).
// ============================================================

const R = 1.55; // distance from centre (just past the stage edge)
const Y = 1.15; // chest height, easy to point at
const ORB_R = 0.075;

export function createOrbs({ scene, actions }) {
  const group = new THREE.Group();
  const meshes = [];

  const defs = [
    { label: 'DEMO REEL', action: actions.demo, deg: -54 },
    { label: 'ABOUT', action: actions.about, deg: -18 },
    { label: 'CONTACT', action: actions.contact, deg: 18 },
    { label: 'EXIT', action: actions.exit, deg: 54 },
  ];

  defs.forEach((d) => {
    const a = (d.deg * Math.PI) / 180;
    const pos = new THREE.Vector3(Math.sin(a) * R, Y, -Math.cos(a) * R);

    // solid core (the raycast target)
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(ORB_R, 24, 16),
      new THREE.MeshBasicMaterial({ color: ACCENT })
    );
    core.position.copy(pos);
    core.userData.action = d.action;
    core.userData.orb = true;
    core.userData.baseScale = 1;
    core.userData.phase = Math.random() * Math.PI * 2;

    // additive halo
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(ORB_R * 1.7, 24, 16),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    core.add(halo);

    // label below
    const label = makeCanvasPanel(0.42, 320, 80, (ctx, w, h) => {
      ctx.fillStyle = '#fff';
      ctx.font = '700 44px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.label, w / 2, h / 2);
    });
    label.position.set(pos.x, pos.y - 0.18, pos.z);
    label.lookAt(0, pos.y - 0.18, 0);

    group.add(core);
    group.add(label);
    meshes.push(core);
  });

  scene.add(group);

  let hovered = null;
  return {
    group,
    meshes,
    setHover(mesh) {
      if (mesh === hovered) return;
      if (hovered) hovered.scale.setScalar(1);
      hovered = meshes.includes(mesh) ? mesh : null;
      if (hovered) hovered.scale.setScalar(1.35);
    },
    update(t) {
      for (const m of meshes) {
        // gentle bob + glow pulse
        const base = m.userData.basePosY ?? (m.userData.basePosY = m.position.y);
        m.position.y = base + Math.sin(t * 0.8 + m.userData.phase) * 0.015;
        m.children[0].material.opacity = 0.2 + 0.12 * Math.sin(t * 1.6 + m.userData.phase);
      }
    },
  };
}
