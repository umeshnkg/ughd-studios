import * as THREE from 'three';
import { makeCanvasPanel } from './text.js';

// ============================================================
// Demo theater: the showreel screen shown inside a modal (darkened
// world). Plays /reels/showreel.mp4 with sound on open, stops on
// close. Branded poster fallback if the asset is missing.
// ============================================================

const SHOWREEL_URL = '/reels/showreel.mp4';
const W = 2.9;
const H = W * 9 / 16;

export function createTheater({ duckMusic, unduckMusic }) {
  const group = new THREE.Group();

  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 0.12, H + 0.12),
    new THREE.MeshBasicMaterial({ color: 0x05070b })
  );
  group.add(frame);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  screen.position.z = 0.01;
  group.add(screen);

  // mute/unmute toggle in the screen's bottom-right corner
  const muteCv = document.createElement('canvas');
  muteCv.width = muteCv.height = 128;
  const muteCtx = muteCv.getContext('2d');
  const muteTex = new THREE.CanvasTexture(muteCv);
  const muteBtn = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ map: muteTex, transparent: true })
  );
  muteBtn.position.set(W / 2 - 0.18, -H / 2 + 0.18, 0.02);
  muteBtn.userData.hoverable = true;
  muteBtn.userData.baseScale = 1;
  group.add(muteBtn);
  function drawMute() {
    const c = muteCtx;
    c.clearRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(8,10,14,0.9)';
    c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4cc9ff';
    c.beginPath(); c.moveTo(44, 52); c.lineTo(58, 52); c.lineTo(72, 40); c.lineTo(72, 88); c.lineTo(58, 76); c.lineTo(44, 76); c.closePath(); c.fill();
    c.strokeStyle = '#4cc9ff'; c.lineWidth = 6; c.lineCap = 'round';
    if (video.muted) { // slash
      c.beginPath(); c.moveTo(80, 44); c.lineTo(100, 84); c.stroke();
    } else { // sound waves
      c.beginPath(); c.arc(80, 64, 12, -0.6, 0.6); c.stroke();
      c.beginPath(); c.arc(80, 64, 22, -0.6, 0.6); c.stroke();
    }
    muteTex.needsUpdate = true;
  }

  const video = document.createElement('video');
  video.src = SHOWREEL_URL;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.style.display = 'none';
  document.body.appendChild(video);

  let usingVideo = false;
  video.addEventListener('loadeddata', () => {
    const tex = new THREE.VideoTexture(video);
    screen.material.map = tex;
    screen.material.color.setHex(0xffffff);
    screen.material.needsUpdate = true;
    usingVideo = true;
  });
  video.addEventListener('error', () => {
    const poster = makeCanvasPanel(W, 1280, 720, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a0e14'); g.addColorStop(1, '#05070b');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 96px "Space Grotesk", sans-serif';
      ctx.fillText('UGHD® SHOWREEL', w / 2, h / 2);
    });
    screen.material.map = poster.material.map;
    screen.material.color.setHex(0xffffff);
    screen.material.needsUpdate = true;
  });

  muteBtn.userData.action = () => {
    video.muted = !video.muted;
    if (video.muted) unduckMusic?.(); else duckMusic?.();
    drawMute();
  };
  drawMute();

  return {
    group, w: W, h: H,
    targets: [muteBtn],
    play() {
      video.currentTime = 0;
      video.muted = false;
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
      drawMute();
      if (usingVideo) duckMusic?.();
    },
    stop() {
      video.pause();
      unduckMusic?.();
    },
  };
}
