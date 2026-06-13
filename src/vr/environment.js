import * as THREE from 'three';
import { ACCENT, STAGE_RADIUS } from './constants.js';

// ============================================================
// Environment: a circular stage platform floating in a starfield void.
// You stand on the stage; the sphere of work rotates around you. All
// faked with unlit materials / points — no real-time lights.
// ============================================================

const LOGO_URL = '/UGHD-Studios-logo-white.webp';

export function createEnvironment(scene) {
  const group = new THREE.Group();

  // ----- the stage you stand on -----
  const stage = new THREE.Mesh(
    new THREE.CircleGeometry(STAGE_RADIUS, 64),
    new THREE.MeshBasicMaterial({ map: makeStageTexture(), transparent: true })
  );
  stage.rotation.x = -Math.PI / 2;
  stage.position.y = 0.01;
  group.add(stage);

  // glowing rim ring around the stage edge
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(STAGE_RADIUS - 0.05, STAGE_RADIUS + 0.06, 64),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.02;
  group.add(rim);

  // ----- starfield void -----
  const STARS = 1200;
  const sp = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    // shell of stars well outside the work sphere
    const r = 18 + Math.random() * 30;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
    sp[i * 3 + 1] = r * Math.cos(ph);
    sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.08, transparent: true, opacity: 0.8, depthWrite: false,
  }));
  group.add(stars);

  // ----- faint drifting dust near the stage for depth -----
  const DUST = 300;
  const dp = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 12;
    dp[i * 3 + 1] = Math.random() * 5;
    dp[i * 3 + 2] = (Math.random() - 0.5) * 12;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xcfeeff, size: 0.02, transparent: true, opacity: 0.3, depthWrite: false,
  }));
  group.add(dust);

  // ----- floating UGHD logo above the stage -----
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.8 * 0.32),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 })
  );
  logo.position.set(0, 3.2, -3);
  group.add(logo);
  new THREE.TextureLoader().load(LOGO_URL, (t) => {
    logo.material.map = t;
    logo.material.needsUpdate = true;
    const ar = t.image.width / t.image.height;
    logo.geometry.dispose();
    logo.geometry = new THREE.PlaneGeometry(1.8, 1.8 / ar);
  });

  scene.add(group);

  const dpos = dust.geometry.getAttribute('position');
  return {
    group,
    update() {
      // gentle dust drift
      for (let i = 0; i < DUST; i++) {
        let y = dpos.getY(i) + 0.0015;
        if (y > 5) y = 0;
        dpos.setY(i, y);
      }
      dpos.needsUpdate = true;
      stars.rotation.y += 0.0002; // barely-there parallax
      logo.rotation.y = Math.sin(performance.now() / 4000) * 0.12;
      rim.material.opacity = 0.45 + 0.2 * Math.sin(performance.now() / 2400);
    },
  };
}

function makeStageTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  // dark glassy disc with a soft cyan centre glow + concentric rings
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(20,30,42,0.95)');
  g.addColorStop(0.7, 'rgba(8,12,18,0.9)');
  g.addColorStop(1, 'rgba(4,6,10,0.6)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(76,201,255,0.25)';
  ctx.lineWidth = 2;
  for (let r = S / 8; r < S / 2; r += S / 8) {
    ctx.beginPath(); ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2); ctx.stroke();
  }
  return new THREE.CanvasTexture(cv);
}
