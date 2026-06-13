import * as THREE from 'three';
import { ACCENT } from './constants.js';
import { makeCanvasPanel } from './text.js';

// ============================================================
// Cinema: a large screen at the prime forward station that loops a
// hosted showreel (public/reels/showreel.mp4), muted, as an ambient
// centrepiece. Selecting it unmutes + ducks the music; selecting again
// mutes. If the asset is missing it shows a branded poster so nothing
// breaks before clips exist.
// ============================================================

const SHOWREEL_URL = '/reels/showreel.mp4';
const DIST = 8; // screen distance from room centre
const PAD_DIST = 4.6; // where you stand to watch
const SCREEN_W = 6;
const SCREEN_H = SCREEN_W * 9 / 16;
const CENTER_Y = 2.0;

export function createCinema({ scene, baseAngle, duckMusic, unduckMusic }) {
  const group = new THREE.Group();
  const dir = new THREE.Vector3(Math.sin(baseAngle), 0, -Math.cos(baseAngle));
  const pos = dir.clone().multiplyScalar(DIST).setY(CENTER_Y);

  // dark frame behind the screen
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W + 0.3, SCREEN_H + 0.3),
    new THREE.MeshBasicMaterial({ color: 0x05070b })
  );
  frame.position.copy(pos);
  frame.lookAt(0, CENTER_Y, 0);
  group.add(frame);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  screen.position.copy(pos);
  screen.position.add(dir.clone().multiplyScalar(-0.02)); // just in front of frame
  screen.lookAt(0, CENTER_Y, 0);
  screen.userData.cinema = true; // raycast tag
  group.add(screen);

  // showreel video — muted autoplay loop (allowed without a gesture)
  const video = document.createElement('video');
  video.src = SHOWREEL_URL;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.style.display = 'none';
  document.body.appendChild(video);

  let on = false; // unmuted/active
  let usingVideo = false;

  video.addEventListener('loadeddata', () => {
    const tex = new THREE.VideoTexture(video);
    screen.material.map = tex;
    screen.material.color.setHex(0xffffff);
    screen.material.needsUpdate = true;
    usingVideo = true;
    video.play().catch(() => {});
  });
  video.addEventListener('error', () => {
    // no asset yet → branded poster
    const poster = makePoster();
    screen.material.map = poster.material.map;
    screen.material.color.setHex(0xffffff);
    screen.material.needsUpdate = true;
  });

  // a subtle accent glow ring on the floor under the screen
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.15, 40),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.25,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.copy(pos).setY(0.02);
  group.add(halo);

  scene.add(group);

  return {
    group,
    screen,
    pad: { position: dir.clone().multiplyScalar(PAD_DIST), label: 'CINEMA' },
    // toggle sound (only meaningful once the real video is playing)
    toggle() {
      if (!usingVideo) return;
      on = !on;
      video.muted = !on;
      if (on) { video.play().catch(() => {}); duckMusic?.(); }
      else unduckMusic?.();
    },
    isOn: () => on,
  };
}

function makePoster() {
  return makeCanvasPanel(SCREEN_W, 1280, 720, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0e14');
    g.addColorStop(1, '#05070b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 96px "Space Grotesk", sans-serif';
    ctx.fillText('UGHD® SHOWREEL', w / 2, h / 2 - 30);
    // cyan play triangle
    ctx.fillStyle = '#4cc9ff';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 28, h / 2 + 60);
    ctx.lineTo(w / 2 - 28, h / 2 + 120);
    ctx.lineTo(w / 2 + 32, h / 2 + 90);
    ctx.closePath();
    ctx.fill();
  });
}
