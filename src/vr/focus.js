import * as THREE from 'three';
import gsap from 'gsap';
import { EYE_Y, FOCUS_DUR } from './constants.js';

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
  const mats = [panel.material]; // tweened together for fade in/out

  // caption strip
  const CAP_H = 210;
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = CAP_H;
  const cctx = cv.getContext('2d');
  const captionTex = new THREE.CanvasTexture(cv);
  const caption = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3 * (CAP_H / 1024)),
    new THREE.MeshBasicMaterial({ map: captionTex, transparent: true })
  );
  group.add(caption);
  mats.push(caption.material);
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
  let inspecting = false;

  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  function layout(aspect) {
    const w = 3;
    const h = w / aspect;
    panel.geometry.dispose();
    panel.geometry = new THREE.PlaneGeometry(w, h);
    const ch = w * (CAP_H / 1024);
    caption.position.y = -h / 2 - ch / 2 - 0.05;
  }

  function paintCaption(p) {
    cctx.clearRect(0, 0, 1024, CAP_H);
    cctx.fillStyle = 'rgba(0,0,0,0.72)';
    cctx.fillRect(0, 0, 1024, CAP_H);
    cctx.textBaseline = 'middle';
    cctx.textAlign = 'left';
    cctx.fillStyle = '#fff';
    cctx.font = '600 58px "Space Grotesk", sans-serif';
    cctx.fillText(p.title || '', 40, 56);
    cctx.fillStyle = 'rgba(255,255,255,0.6)';
    cctx.font = '400 32px "Space Mono", monospace';
    const sub = [p.client, p.year].filter(Boolean).join('  ·  ');
    cctx.fillText(sub.toUpperCase(), 40, 112);
    if (p.tags && p.tags.length) {
      cctx.fillStyle = '#4cc9ff';
      cctx.font = '400 26px "Space Mono", monospace';
      cctx.fillText(p.tags.join('  ·  '), 40, 165);
    }
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
    // reset any prior inspect transform
    inspecting = false;
    panel.position.set(0, 0, 0);
    panel.rotation.set(0, 0, 0);
    panel.scale.setScalar(1);

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

    // place where the viewer looks, level (no pitch) so it's comfortable;
    // ease in slightly from further away so it "arrives" toward them
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    camDir.y = 0; camDir.normalize();
    const dest = camPos.clone().add(camDir.clone().multiplyScalar(2.8)).setY(EYE_Y);
    const start = camPos.clone().add(camDir.clone().multiplyScalar(3.5)).setY(EYE_Y);
    group.position.copy(start);
    group.lookAt(camPos.x, EYE_Y, camPos.z);

    group.visible = true;
    gsap.killTweensOf(group.scale);
    gsap.killTweensOf(group.position);
    gsap.killTweensOf(mats);
    group.scale.setScalar(0.85);
    for (const m of mats) m.opacity = 0;
    gsap.to(group.scale, { x: 1, y: 1, z: 1, duration: FOCUS_DUR, ease: 'power3.out' });
    gsap.to(group.position, { x: dest.x, y: dest.y, z: dest.z, duration: FOCUS_DUR, ease: 'power3.out' });
    gsap.to(mats, { opacity: 1, duration: FOCUS_DUR * 0.7, ease: 'power2.out' });
  }

  function dismiss() {
    if (!group.visible) return;
    gsap.killTweensOf(group.scale);
    gsap.killTweensOf(mats);
    gsap.to(group.scale, { x: 0.85, y: 0.85, z: 0.85, duration: FOCUS_DUR * 0.7, ease: 'power2.in' });
    gsap.to(mats, {
      opacity: 0, duration: FOCUS_DUR * 0.7, ease: 'power2.in',
      onComplete: () => { group.visible = false; stopVideo(); },
    });
  }

  return {
    open,
    dismiss,
    isOpen: () => group.visible,
    panel, // exposed for grab-to-inspect
    // slow Ken Burns drift on a still (no-video) focus so it isn't dead
    update(t) {
      if (!group.visible || playing || inspecting) return;
      const k = 1.03 + 0.03 * Math.sin(t * 0.4);
      panel.scale.setScalar(k);
      panel.position.x = Math.sin(t * 0.22) * 0.05;
      panel.position.y = Math.cos(t * 0.17) * 0.04;
    },
    // grab-to-inspect: index drives this from the grip while focused
    setInspect(v) {
      inspecting = v;
      if (!v) { panel.position.set(0, 0, 0); panel.rotation.set(0, 0, 0); panel.scale.setScalar(1); }
    },
    inspectFrom(controller) {
      if (!inspecting) return;
      // tumble the panel to match the controller's orientation
      panel.quaternion.copy(controller.quaternion);
    },
  };
}
