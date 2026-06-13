import * as THREE from 'three';
import { EYE_Y } from './constants.js';

// ============================================================
// Focus view: selecting a panel flies a large copy in front of the
// viewer. If the project has a hosted MP4 (p.video) it plays as a
// VideoTexture with sound (ducking the background music); otherwise
// it shows the high-res artwork. A title/client caption sits below.
// Trigger again to dismiss.
// ============================================================

export function createFocus({ scene, camera, duckMusic, unduckMusic }) {
  const group = new THREE.Group();
  group.visible = false;

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3 * (920 / 1024)),
    new THREE.MeshBasicMaterial({ transparent: true })
  );
  group.add(panel);

  // caption strip
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 180;
  const cctx = cv.getContext('2d');
  const captionTex = new THREE.CanvasTexture(cv);
  const caption = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3 * (180 / 1024)),
    new THREE.MeshBasicMaterial({ map: captionTex, transparent: true })
  );
  group.add(caption);
  scene.add(group);

  // one reusable <video> for playback
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.loop = true;
  video.preload = 'auto';
  video.style.display = 'none';
  document.body.appendChild(video);
  let videoTex = null;
  let playing = false;

  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  function layout(aspect) {
    const w = 3;
    const h = w / aspect;
    panel.geometry.dispose();
    panel.geometry = new THREE.PlaneGeometry(w, h);
    const ch = w * (180 / 1024);
    caption.position.y = -h / 2 - ch / 2 - 0.05;
  }

  function paintCaption(p) {
    cctx.clearRect(0, 0, 1024, 180);
    cctx.fillStyle = 'rgba(0,0,0,0.72)';
    cctx.fillRect(0, 0, 1024, 180);
    cctx.textBaseline = 'middle';
    cctx.textAlign = 'left';
    cctx.fillStyle = '#fff';
    cctx.font = '600 60px "Space Grotesk", sans-serif';
    cctx.fillText(p.title || '', 40, 68);
    cctx.fillStyle = 'rgba(255,255,255,0.6)';
    cctx.font = '400 34px "Space Mono", monospace';
    const sub = [p.client, p.year].filter(Boolean).join('  ·  ');
    cctx.fillText(sub.toUpperCase(), 40, 132);
    captionTex.needsUpdate = true;
  }

  function stopVideo() {
    if (!playing) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (videoTex) { videoTex.dispose(); videoTex = null; }
    playing = false;
    unduckMusic?.();
  }

  function open(mesh) {
    const p = mesh.userData.project;
    paintCaption(p);

    if (p.video) {
      layout(16 / 9);
      video.src = p.video;
      videoTex = new THREE.VideoTexture(video);
      panel.material.map = videoTex;
      panel.material.needsUpdate = true;
      duckMusic?.();
      // select is a user gesture, so sound-on autoplay is allowed;
      // fall back to muted if the browser still refuses
      video.muted = false;
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
      playing = true;
    } else {
      layout(1024 / 920);
      panel.material.map = mesh.material.map;
      panel.material.needsUpdate = true;
    }

    // place where the viewer looks, level (no pitch) so it's comfortable
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    camDir.y = 0; camDir.normalize();
    group.position.copy(camPos).add(camDir.multiplyScalar(2.8));
    group.position.y = EYE_Y;
    group.lookAt(camPos.x, EYE_Y, camPos.z);

    group.visible = true;
    let t = 0;
    group.scale.setScalar(0.6);
    const grow = () => {
      t += 0.12;
      const k = Math.min(t, 1);
      group.scale.setScalar(0.6 + 0.4 * (1 - (1 - k) * (1 - k)));
      if (k < 1 && group.visible) requestAnimationFrame(grow);
    };
    grow();
  }

  function dismiss() {
    group.visible = false;
    stopVideo();
  }

  return {
    open,
    dismiss,
    isOpen: () => group.visible,
  };
}
