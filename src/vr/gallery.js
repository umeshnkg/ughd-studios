import * as THREE from 'three';
import { EYE_Y, WALL_DIST, PAD_DIST, PANEL_SCALE, ZONES } from './constants.js';

// ============================================================
// The gallery hall: work split into zones (one curved wall each,
// grouped by project source), arranged radially around a central
// spawn. Each zone gets a teleport pad in front of it and a floating
// sign. Panels reuse the loaded project textures (no new memory).
// ============================================================

const TILE_W = 3.2;
const TILE_H = 2.875;
const PANEL_W = TILE_W * PANEL_SCALE;
const PANEL_H = TILE_H * PANEL_SCALE;
const H_GAP = 1.14; // horizontal spacing factor (angular)
const V_GAP = 1.14; // vertical spacing factor

export function createGallery({ scene, projectArt, tileGeometry, makeCardMaterial }) {
  const group = new THREE.Group();
  const panels = [];
  const pads = [{ position: new THREE.Vector3(0, 0, 0), label: 'CENTRE' }];

  // bucket the loaded art by source, in zone order; anything unmatched
  // falls into the first zone so nothing is lost
  const byZone = ZONES.map(() => []);
  for (const art of projectArt) {
    let zi = ZONES.findIndex((z) => z.source === art.p.source);
    if (zi < 0) zi = 0;
    byZone[zi].push(art);
  }

  ZONES.forEach((zone, zi) => {
    const items = byZone[zi];
    if (!items.length) return;
    const baseAngle = (zi * 2 * Math.PI) / ZONES.length; // 0 = straight ahead (-Z)
    const dir = new THREE.Vector3(Math.sin(baseAngle), 0, -Math.cos(baseAngle));

    const cols = Math.min(7, Math.ceil(Math.sqrt(items.length * 1.6)));
    const rows = Math.ceil(items.length / cols);
    const hStep = (PANEL_W * H_GAP) / WALL_DIST; // angular step between columns
    const vStep = PANEL_H * V_GAP;

    items.forEach((art, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const a = baseAngle + (col - (cols - 1) / 2) * hStep;
      const y = EYE_Y + ((rows - 1) / 2 - row) * vStep;
      const mat = makeCardMaterial(art.tex, { value: 1 });
      const mesh = new THREE.Mesh(tileGeometry, mat);
      mesh.position.set(Math.sin(a) * WALL_DIST, y, -Math.cos(a) * WALL_DIST);
      mesh.scale.setScalar(PANEL_SCALE);
      mesh.lookAt(0, y, 0); // face the room centre
      mesh.userData.project = art.p;
      mesh.userData.baseScale = PANEL_SCALE;
      group.add(mesh);
      panels.push(mesh);
    });

    // zone sign above the top row, centred on the wall
    const topY = EYE_Y + ((rows - 1) / 2 + 1) * vStep;
    const sign = makeSign(zone.label);
    sign.position.set(Math.sin(baseAngle) * WALL_DIST, topY, -Math.cos(baseAngle) * WALL_DIST);
    sign.lookAt(0, topY, 0);
    group.add(sign);

    // viewing pad in front of this wall
    pads.push({
      position: dir.clone().multiplyScalar(PAD_DIST),
      label: zone.label,
    });
  });

  scene.add(group);

  let hovered = null;
  return {
    group,
    panels,
    pads,
    setHover(mesh) {
      if (mesh === hovered) return;
      if (hovered) hovered.scale.setScalar(hovered.userData.baseScale);
      hovered = mesh && panels.includes(mesh) ? mesh : null;
      if (hovered) hovered.scale.setScalar(hovered.userData.baseScale * 1.12);
    },
    clearHover() {
      if (hovered) hovered.scale.setScalar(hovered.userData.baseScale);
      hovered = null;
    },
    get hovered() {
      return hovered;
    },
    setVisible(v) {
      group.visible = v;
    },
  };
}

function makeSign(text) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 160;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 1024, 160);
  ctx.fillStyle = '#fff';
  ctx.font = '700 84px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 90);
  const tex = new THREE.CanvasTexture(cv);
  const w = 2.6;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, w * (160 / 1024)),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
}
