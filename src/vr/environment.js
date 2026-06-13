import * as THREE from 'three';

// ============================================================
// Branded VR environment — the "set" the gallery hall sits in.
//   • dark floor with a homepage-style grid + radial fade
//   • a faint horizon glow ring so the void reads as a room
//   • slow drifting dust particles for depth
//   • a floating UGHD logo over the spawn
// All faked with textures/additive blending — no real-time lights or
// shadows, to stay cheap on the Quest GPU.
// ============================================================

const FLOOR_RADIUS = 12;
const LOGO_URL = '/UGHD-Studios-logo-white.webp';

export function createEnvironment(scene) {
  const group = new THREE.Group();

  // ----- floor: grid texture on a disc, dark with a soft centre glow -----
  const floorTex = makeGridTexture();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(FLOOR_RADIUS, 64),
    new THREE.MeshBasicMaterial({ map: floorTex, transparent: true })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  floor.name = 'vr-floor';
  group.add(floor);

  // ----- horizon glow: a thin additive ring at floor level -----
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(FLOOR_RADIUS - 2.4, FLOOR_RADIUS, 64),
    new THREE.MeshBasicMaterial({
      map: makeRadialGlowTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  group.add(glow);

  // ----- dust particles -----
  const PARTICLES = 400;
  const positions = new Float32Array(PARTICLES * 3);
  for (let i = 0; i < PARTICLES; i++) {
    positions[i * 3] = (Math.random() - 0.5) * FLOOR_RADIUS * 2;
    positions[i * 3 + 1] = Math.random() * 4.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * FLOOR_RADIUS * 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.02,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
  );
  group.add(dust);

  // ----- floating UGHD logo over the spawn -----
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4 * 0.32),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 })
  );
  logo.position.set(0, 3.4, -3);
  group.add(logo);
  new THREE.TextureLoader().load(LOGO_URL, (t) => {
    logo.material.map = t;
    logo.material.needsUpdate = true;
    // keep the plane at the logo's real aspect ratio
    const ar = t.image.width / t.image.height;
    logo.geometry.dispose();
    logo.geometry = new THREE.PlaneGeometry(2.4, 2.4 / ar);
  });

  scene.add(group);

  const pos = dust.geometry.getAttribute('position');
  return {
    group,
    floor, // exposed so teleport can raycast against it
    update() {
      // gentle upward drift, wrapping at the ceiling
      for (let i = 0; i < PARTICLES; i++) {
        let y = pos.getY(i) + 0.0015;
        if (y > 4.5) y = 0;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      logo.rotation.y = Math.sin(performance.now() / 4000) * 0.15;
    },
  };
}

function makeGridTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  // grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  const step = S / 24;
  for (let i = 0; i <= 24; i++) {
    const p = i * step;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
  }
  // radial fade so the grid dissolves toward the edge + glows at centre
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.1)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  // punch a soft centre highlight back in
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

function makeRadialGlowTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(120,140,255,0.0)');
  g.addColorStop(0.7, 'rgba(120,140,255,0.10)');
  g.addColorStop(1, 'rgba(120,140,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}
