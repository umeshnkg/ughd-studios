import * as THREE from 'three';
import { EYE_Y, ACCENT } from './constants.js';

// ============================================================
// In-world UI:
//   • a wrist menu on the LEFT controller (Exit VR / Recenter),
//     pressed with the RIGHT-hand pointer + trigger.
//   • a brief onboarding hint panel at the spawn that fades out.
// ============================================================

export function createUI({ scene, leftController, onExit, onRecenter }) {
  // ----- wrist menu -----
  const wrist = new THREE.Group();
  wrist.position.set(0, 0.05, 0.09); // sit just above the back of the hand
  wrist.rotation.x = -Math.PI / 2.6; // tilt the face toward the eyes
  wrist.scale.setScalar(0.9);
  leftController.add(wrist);

  const buttons = [];
  function makeButton(label, action, y) {
    const tex = labelTexture(label);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.04),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    mesh.position.set(0, y, 0);
    mesh.userData.action = action;
    mesh.userData.baseScale = 1;
    wrist.add(mesh);
    buttons.push(mesh);
    return mesh;
  }
  makeButton('EXIT VR', onExit, 0.025);
  makeButton('RECENTER', onRecenter, -0.025);

  let hovered = null;

  // ----- onboarding hint at spawn -----
  const hint = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6 * (300 / 1024)),
    new THREE.MeshBasicMaterial({ map: hintTexture(), transparent: true, opacity: 0 })
  );
  hint.position.set(0, EYE_Y - 0.1, -2);
  scene.add(hint);
  let hintT = 0;

  return {
    buttons,
    setHover(mesh) {
      if (mesh === hovered) return;
      if (hovered) {
        hovered.scale.setScalar(hovered.userData.baseScale);
        hovered.material.color.setHex(0xffffff);
      }
      hovered = buttons.includes(mesh) ? mesh : null;
      if (hovered) {
        hovered.scale.setScalar(1.15);
        hovered.material.color.setHex(ACCENT); // cyan-tint the hovered pill
      }
    },
    trigger(mesh) {
      if (buttons.includes(mesh)) { mesh.userData.action?.(); return true; }
      return false;
    },
    reset() {
      hintT = 0;
      hint.material.opacity = 0;
      hint.visible = true;
    },
    update() {
      // fade hint in, hold, fade out over ~7s
      hintT += 1 / 72;
      const o = hintT < 0.6 ? hintT / 0.6
        : hintT < 6 ? 1
        : hintT < 7 ? 1 - (hintT - 6) : 0;
      hint.material.opacity = Math.max(0, Math.min(1, o));
      if (hintT > 7) hint.visible = false;
    },
  };
}

function labelTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, 4, 4, 248, 88, 14);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = '700 40px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 50);
  return new THREE.CanvasTexture(cv);
}

function hintTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 300;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, 0, 0, 1024, 300, 24);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '700 52px "Space Grotesk", sans-serif';
  ctx.fillText('WELCOME TO UGHD', 512, 64);
  ctx.font = '400 34px "Space Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const lines = [
    'POINT + TRIGGER  ·  open a piece',
    'LEFT STICK FWD  ·  teleport',
    'LEFT STICK L/R  ·  turn',
    'WRIST MENU  ·  exit',
  ];
  lines.forEach((l, i) => ctx.fillText(l, 512, 140 + i * 42));
  return new THREE.CanvasTexture(cv);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
