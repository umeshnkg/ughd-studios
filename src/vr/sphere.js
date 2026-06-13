import * as THREE from 'three';
import gsap from 'gsap';
import { EYE_Y, SPHERE_RADIUS, SPHERE_TILES, SPHERE_TILE_SCALE,
         SPHERE_ROT_SPEED, SPHERE_TILT, ACCENT, HOVER_SCALE, HOVER_DUR } from './constants.js';

// ============================================================
// The work browser: tiles spread evenly over a sphere around the
// viewer (Fibonacci distribution), the whole thing slowly auto-
// rotating. Look around to browse; grip to pause. Tiles reuse the
// loaded project textures, repeating to fill the sphere.
//   tiltGroup (fixed tilt) → spinGroup (auto-rotates) → tiles + rim
// ============================================================

const TILE_W = 3.2 * SPHERE_TILE_SCALE;
const TILE_H = 2.875 * SPHERE_TILE_SCALE;

export function createSphere({ scene, projectArt, tileGeometry, makeCardMaterial }) {
  const tiltGroup = new THREE.Group();
  tiltGroup.position.y = EYE_Y;
  tiltGroup.rotation.z = SPHERE_TILT;
  const spin = new THREE.Group();
  tiltGroup.add(spin);

  const tiles = [];

  // shared cyan glow rim that slides behind the hovered tile
  const rim = new THREE.Mesh(
    new THREE.PlaneGeometry(TILE_W * 1.16, TILE_H * 1.18),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  rim.visible = false;
  spin.add(rim);

  // deal shuffled project art across the tiles, repeating to fill
  const deal = [];
  while (deal.length < SPHERE_TILES) {
    const copy = projectArt.map((_, i) => i);
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    deal.push(...copy);
  }

  // Fibonacci sphere — even spacing, no clumping at the poles
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < SPHERE_TILES; i++) {
    const art = projectArt[deal[i]];
    const y = 1 - (i / (SPHERE_TILES - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const pos = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r)
      .multiplyScalar(SPHERE_RADIUS);
    const uSat = { value: 1 };
    const mat = makeCardMaterial(art.tex, uSat);
    const mesh = new THREE.Mesh(tileGeometry, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(SPHERE_TILE_SCALE);
    mesh.lookAt(0, 0, 0); // face the sphere centre (the viewer)
    mesh.userData.project = art.p;
    mesh.userData.baseScale = SPHERE_TILE_SCALE;
    mesh.userData.uSat = uSat;
    mesh.userData.basePos = pos.clone();
    mesh.userData.baseQuat = mesh.quaternion.clone();
    spin.add(mesh);
    tiles.push(mesh);
  }

  scene.add(tiltGroup);

  let hovered = null;
  let paused = false;
  let lastT = performance.now() / 1000;

  function moveRimTo(mesh) {
    rim.position.copy(mesh.userData.basePos);
    rim.quaternion.copy(mesh.userData.baseQuat);
    rim.translateZ(-0.03);
    rim.visible = true;
  }

  function setHover(mesh) {
    const next = mesh && tiles.includes(mesh) ? mesh : null;
    if (next === hovered) return false;
    const base = SPHERE_TILE_SCALE;
    if (hovered) gsap.to(hovered.scale, { x: base, y: base, z: base, duration: HOVER_DUR, ease: 'power2.out' });
    hovered = next;
    if (hovered) {
      const s = base * HOVER_SCALE;
      gsap.to(hovered.scale, { x: s, y: s, z: s, duration: HOVER_DUR, ease: 'power2.out' });
      moveRimTo(hovered);
      gsap.killTweensOf(rim.material);
      gsap.to(rim.material, { opacity: 0.85, duration: HOVER_DUR, ease: 'power2.out' });
    } else {
      gsap.killTweensOf(rim.material);
      gsap.to(rim.material, { opacity: 0, duration: HOVER_DUR, onComplete: () => { if (!hovered) rim.visible = false; } });
    }
    return true;
  }

  // mirror the site's tag matching (src/main.js applyFilter)
  function matches(p, tag) {
    if (tag === 'ALL') return true;
    return p.tags.some((t) => t.includes(tag));
  }

  return {
    group: tiltGroup,
    tiles,
    setHover,
    clearHover: () => setHover(null),
    get hovered() { return hovered; },
    setPaused(v) { paused = v; },

    update(t) {
      const dt = Math.min(t - lastT, 0.1);
      lastT = t;
      if (!paused) spin.rotation.y += SPHERE_ROT_SPEED * dt;
    },

    // desaturate + dim non-matching tiles; matching stay full (like the site)
    applyFilter(tag) {
      for (const m of tiles) {
        const ok = matches(m.userData.project, tag);
        gsap.killTweensOf(m.userData.uSat);
        gsap.to(m.userData.uSat, { value: ok ? 1 : 0, duration: 0.5, ease: 'power2.out' });
        gsap.killTweensOf(m.material);
        gsap.to(m.material, { opacity: ok ? 1 : 0.22, duration: 0.5, ease: 'power2.out' });
        m.userData.filtered = !ok;
      }
    },

    playIntro() {
      for (const m of tiles) { m.scale.setScalar(0.0001); m.material.opacity = 0; }
      gsap.to(tiles.map((m) => m.scale), {
        x: SPHERE_TILE_SCALE, y: SPHERE_TILE_SCALE, z: SPHERE_TILE_SCALE,
        duration: 1.0, ease: 'power3.out', stagger: { each: 0.006, from: 'random' },
      });
      gsap.to(tiles.map((m) => m.material), {
        opacity: 1, duration: 1.0, ease: 'power2.out', stagger: { each: 0.006, from: 'random' },
      });
    },
  };
}
