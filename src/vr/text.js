import * as THREE from 'three';

// ============================================================
// Shared canvas → textured-plane helpers for in-world text (zone
// signs, About / Stats / Contact panels, captions). Keeps all the
// readable-text rendering in one place.
// ============================================================

// Build a plane of the given world width whose height matches the canvas
// aspect; drawFn paints the canvas (already cleared). Returns the mesh.
export function makeCanvasPanel(worldWidth, pxW, pxH, drawFn) {
  const cv = document.createElement('canvas');
  cv.width = pxW;
  cv.height = pxH;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, pxW, pxH);
  drawFn(ctx, pxW, pxH);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldWidth * (pxH / pxW)),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  mesh.userData.canvas = cv;
  mesh.userData.ctx = ctx;
  mesh.userData.tex = tex;
  return mesh;
}

// Word-wrap; returns the y after the last line drawn.
export function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A dark glass backing used behind most panels.
export function paintGlass(ctx, w, h, r = 28) {
  roundRectPath(ctx, 0, 0, w, h, r);
  ctx.fillStyle = 'rgba(8,10,14,0.82)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(76,201,255,0.5)'; // cyan accent edge
  ctx.stroke();
}
