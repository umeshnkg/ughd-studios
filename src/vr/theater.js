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

  return {
    group, w: W, h: H,
    play() {
      video.currentTime = 0;
      video.muted = false;
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
      if (usingVideo) duckMusic?.();
    },
    stop() {
      video.pause();
      unduckMusic?.();
    },
  };
}
