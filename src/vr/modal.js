import * as THREE from 'three';
import gsap from 'gsap';
import { EYE_Y, FOCUS_DUR, ACCENT } from './constants.js';

// ============================================================
// Shared modal presenter: darkens the world and shows one content
// group ~2.6 m in front of where you look, with a close (✕) button.
// Used by the demo theater and the About / Contact panels. Pauses the
// sphere's rotation while open (via the onOpen/onClose hooks).
// ============================================================

const DIST = 2.7;

export function createModal({ scene, camera }) {
  // dim shell that rides with the head (radius < work sphere so the
  // tiles behind read as darkened, not gone)
  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(3.0, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide,
      transparent: true, opacity: 0, depthWrite: false })
  );
  backdrop.renderOrder = 1;
  backdrop.visible = false;
  camera.add(backdrop);

  const wrapper = new THREE.Group();
  wrapper.visible = false;
  scene.add(wrapper);

  // close button (✕)
  const closeBtn = makeClose();
  closeBtn.renderOrder = 3;
  wrapper.add(closeBtn);

  let content = null;
  let open = false;
  let onCloseCb = null;
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  return {
    closeButton: closeBtn,
    isOpen: () => open,

    open(group, { w = 2.6, h = 1.6, onClose } = {}) {
      if (content) wrapper.remove(content);
      content = group;
      content.renderOrder = 2;
      wrapper.add(content);
      closeBtn.position.set(w / 2 + 0.18, h / 2 + 0.18, 0.02);
      onCloseCb = onClose;

      camera.getWorldPosition(camPos);
      camera.getWorldDirection(camDir);
      camDir.y = 0; camDir.normalize();
      wrapper.position.copy(camPos).add(camDir.multiplyScalar(DIST)).setY(EYE_Y);
      wrapper.lookAt(camPos.x, EYE_Y, camPos.z);

      open = true;
      wrapper.visible = true;
      backdrop.visible = true;
      gsap.killTweensOf(backdrop.material);
      gsap.to(backdrop.material, { opacity: 0.72, duration: FOCUS_DUR, ease: 'power2.out' });
      wrapper.scale.setScalar(0.9);
      gsap.to(wrapper.scale, { x: 1, y: 1, z: 1, duration: FOCUS_DUR, ease: 'power3.out' });
    },

    close() {
      if (!open) return;
      open = false;
      gsap.killTweensOf(backdrop.material);
      gsap.to(backdrop.material, { opacity: 0, duration: FOCUS_DUR * 0.8, ease: 'power2.in',
        onComplete: () => { backdrop.visible = false; } });
      gsap.to(wrapper.scale, { x: 0.9, y: 0.9, z: 0.9, duration: FOCUS_DUR * 0.8, ease: 'power2.in',
        onComplete: () => {
          wrapper.visible = false;
          if (content) { wrapper.remove(content); content = null; }
          onCloseCb && onCloseCb();
        } });
    },
  };
}

function makeClose() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(8,10,14,0.9)';
  ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4cc9ff'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(44, 44); ctx.lineTo(84, 84); ctx.moveTo(84, 44); ctx.lineTo(44, 84); ctx.stroke();
  const tex = new THREE.CanvasTexture(cv);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  mesh.userData.closeButton = true;
  return mesh;
}
