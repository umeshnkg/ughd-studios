import * as THREE from 'three';
import gsap from 'gsap';
import { EYE_Y, SPHERE_RADIUS, SPHERE_TILES, SPHERE_TILE_SCALE,
         SPHERE_ROT_SPEED, SPHERE_TILT, SPHERE_RADIUS_JITTER, FILTER_CLOSE,
         ACCENT, HOVER_SCALE, HOVER_DUR } from './constants.js';

// ============================================================
// The work browser: tiles spread over a sphere around the viewer
// (Fibonacci distribution, slight per-tile radial jitter so corners
// don't clash), slowly auto-rotating. Choosing a filter re-arranges
// the sphere: matching cards pulse into a closer cluster in front of
// your gaze, the rest spread evenly across the globe.
//   tiltGroup (near-level) → spin (auto-rotates) → tiles + rim
// ============================================================

const TILE_W = 3.2 * SPHERE_TILE_SCALE;
const TILE_H = 2.875 * SPHERE_TILE_SCALE;
const ZAXIS = new THREE.Vector3(0, 0, 1);

export function createSphere({ scene, projectArt, tileGeometry, makeCardMaterial }) {
  const tiltGroup = new THREE.Group();
  tiltGroup.position.y = EYE_Y;
  tiltGroup.rotation.z = SPHERE_TILT;
  const spin = new THREE.Group();
  tiltGroup.add(spin);

  const tiles = [];
  // fixed slots (direction + jittered radius + inward-facing quaternion)
  const slots = [];

  const rim = new THREE.Mesh(
    new THREE.PlaneGeometry(TILE_W * 1.16, TILE_H * 1.18),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  rim.visible = false;
  spin.add(rim);

  // deal shuffled project art across tiles, repeating to fill
  const deal = [];
  while (deal.length < SPHERE_TILES) {
    const copy = projectArt.map((_, i) => i);
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    deal.push(...copy);
  }

  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < SPHERE_TILES; i++) {
    const art = projectArt[deal[i]];
    const yy = 1 - (i / (SPHERE_TILES - 1)) * 2;
    const r = Math.sqrt(1 - yy * yy);
    const theta = golden * i;
    const dir = new THREE.Vector3(Math.cos(theta) * r, yy, Math.sin(theta) * r).normalize();
    // ±jitter so neighbouring corners sit at different depths
    const jitter = 1 + (Math.random() * 2 - 1) * SPHERE_RADIUS_JITTER;
    const radius = SPHERE_RADIUS * jitter;
    // face the sphere centre, computed in local space (independent of tilt)
    const quat = new THREE.Quaternion().setFromUnitVectors(ZAXIS, dir.clone().negate());
    slots.push({ dir, radius, pos: dir.clone().multiplyScalar(radius), quat });

    const uSat = { value: 1 };
    const mat = makeCardMaterial(art.tex, uSat);
    const mesh = new THREE.Mesh(tileGeometry, mat);
    mesh.position.copy(slots[i].pos);
    mesh.quaternion.copy(quat);
    mesh.scale.setScalar(SPHERE_TILE_SCALE);
    mesh.userData.project = art.p;
    mesh.userData.baseScale = SPHERE_TILE_SCALE;
    mesh.userData.uSat = uSat;
    mesh.userData.homeSlot = i;
    spin.add(mesh);
    tiles.push(mesh);
  }

  scene.add(tiltGroup);

  let hovered = null;
  let paused = false;
  let filterActive = false;
  let lastT = performance.now() / 1000;

  function moveRimTo(mesh) {
    rim.position.copy(mesh.position);
    rim.quaternion.copy(mesh.quaternion);
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
  const matches = (p, tag) => tag === 'ALL' || p.tags.some((t) => t.includes(tag));

  // assign each tile a target slot + radius, then pulse (fade → move → fade)
  function rearrange(assignTargets) {
    const targets = assignTargets(); // [{tile, pos, quat, sat, opacity}]
    const mats = tiles.map((m) => m.material);
    gsap.killTweensOf(mats);
    gsap.timeline()
      .to(mats, { opacity: 0, duration: 0.22, ease: 'power2.in' })
      .add(() => {
        for (const t of targets) {
          t.tile.position.copy(t.pos);
          t.tile.quaternion.copy(t.quat);
          t.tile.userData.uSat.value = t.sat;
          t.tile.userData.filtered = t.opacity < 1;
        }
        if (hovered) { hovered.scale.setScalar(SPHERE_TILE_SCALE); hovered = null; rim.visible = false; }
      })
      .add(() => {
        for (const t of targets) gsap.to(t.tile.material, { opacity: t.opacity, duration: 0.42, ease: 'power2.out' });
      });
  }

  return {
    group: tiltGroup,
    spin,
    tiles,
    setHover,
    clearHover: () => setHover(null),
    get hovered() { return hovered; },
    setPaused(v) { paused = v; },
    isFilterActive: () => filterActive,

    update(t) {
      const dt = Math.min(t - lastT, 0.1);
      lastT = t;
      if (!paused && !filterActive) spin.rotation.y += SPHERE_ROT_SPEED * dt;
    },

    // tag === 'ALL' restores the even sphere + resumes spin; otherwise
    // cluster matches in front (closer) and spread the rest evenly
    applyFilter(tag, frontDirWorld) {
      if (tag === 'ALL') {
        filterActive = false;
        rearrange(() => tiles.map((tile) => {
          const s = slots[tile.userData.homeSlot];
          return { tile, pos: s.pos, quat: s.quat, sat: 1, opacity: 1 };
        }));
        return;
      }
      filterActive = true;
      // front direction in spin-local space
      const q = new THREE.Quaternion(); spin.getWorldQuaternion(q); q.invert();
      const front = frontDirWorld.clone().applyQuaternion(q).normalize();
      // rank slots by closeness to the front direction
      const order = slots.map((s, i) => ({ i, a: s.dir.angleTo(front) }))
        .sort((x, y) => x.a - y.a).map((o) => o.i);
      const matched = [], rest = [];
      for (const tile of tiles) (matches(tile.userData.project, tag) ? matched : rest).push(tile);

      rearrange(() => {
        const out = [];
        matched.forEach((tile, k) => {
          const s = slots[order[k]];
          out.push({ tile, pos: s.dir.clone().multiplyScalar(s.radius * FILTER_CLOSE), quat: s.quat, sat: 1, opacity: 1 });
        });
        rest.forEach((tile, k) => {
          const s = slots[order[matched.length + k]];
          out.push({ tile, pos: s.pos, quat: s.quat, sat: 0, opacity: 0.22 });
        });
        return out;
      });
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
