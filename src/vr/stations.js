import * as THREE from 'three';
import QRCode from 'qrcode';
import { makeCanvasPanel, wrapText, paintGlass } from './text.js';
import { ABOUT, STATS, CONTACT, CONTACT_URL } from './content.js';

// ============================================================
// Content stations: About, Stats and Contact — readable canvas-text
// panels arranged as small curved walls around the ring, each with a
// teleport pad + sign. Contact carries a QR that opens the real lead
// form on a phone (no VR typing).
// ============================================================

const DIST = 5.5; // panel distance from room centre
const PAD_DIST = 2.8;

export function createStations({ scene, baseAngles }) {
  const group = new THREE.Group();
  const pads = [];

  pads.push(buildAbout(group, baseAngles.about));
  pads.push(buildStats(group, baseAngles.stats));
  pads.push(buildContact(group, baseAngles.contact));

  scene.add(group);
  return { group, pads };
}

// place a panel mesh on the arc at an angular offset, facing centre
function place(group, mesh, baseAngle, offset, y) {
  const a = baseAngle + offset;
  mesh.position.set(Math.sin(a) * DIST, y, -Math.cos(a) * DIST);
  mesh.lookAt(0, y, 0);
  group.add(mesh);
}

function sign(group, baseAngle, label, y) {
  const s = makeCanvasPanel(2.4, 1024, 150, (ctx, w, h) => {
    ctx.fillStyle = '#fff';
    ctx.font = '700 84px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, 70);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = '#4cc9ff';
    ctx.fillRect(w / 2 - tw / 2, 122, tw, 5);
  });
  place(group, s, baseAngle, 0, y);
}

function padFor(baseAngle, label) {
  const dir = new THREE.Vector3(Math.sin(baseAngle), 0, -Math.cos(baseAngle));
  return { position: dir.multiplyScalar(PAD_DIST), label };
}

function buildAbout(group, baseAngle) {
  const y = 1.6;
  // panel 1 — story
  const p1 = makeCanvasPanel(1.6, 760, 900, (ctx, w, h) => {
    paintGlass(ctx, w, h);
    ctx.fillStyle = '#4cc9ff';
    ctx.font = '700 30px "Space Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('— ABOUT', 48, 70);
    ctx.fillStyle = '#fff';
    ctx.font = '500 42px "Space Grotesk", sans-serif';
    wrapText(ctx, ABOUT.story, 48, 150, w - 96, 56);
  });
  // panel 2 — what we do
  const p2 = makeCanvasPanel(1.6, 760, 900, (ctx, w, h) => {
    paintGlass(ctx, w, h);
    ctx.fillStyle = '#4cc9ff';
    ctx.font = '700 30px "Space Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('— WHAT WE DO', 48, 70);
    let yy = 150;
    for (const d of ABOUT.disciplines) {
      ctx.fillStyle = '#fff';
      ctx.font = '600 44px "Space Grotesk", sans-serif';
      ctx.fillText(d.name, 48, yy);
      yy += 50;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '400 30px "Space Grotesk", sans-serif';
      yy = wrapText(ctx, d.body, 48, yy, w - 96, 38) + 22;
    }
  });
  // panel 3 — studios + partners
  const p3 = makeCanvasPanel(1.6, 760, 900, (ctx, w, h) => {
    paintGlass(ctx, w, h);
    ctx.fillStyle = '#4cc9ff';
    ctx.font = '700 30px "Space Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('— STUDIOS', 48, 70);
    let yy = 140;
    for (const s of ABOUT.studios) {
      ctx.fillStyle = '#fff';
      ctx.font = '600 34px "Space Grotesk", sans-serif';
      ctx.fillText(s.name, 48, yy);
      yy += 44;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '400 28px "Space Grotesk", sans-serif';
      yy = wrapText(ctx, s.addr, 48, yy, w - 96, 34) + 24;
    }
    ctx.fillStyle = '#4cc9ff';
    ctx.font = '700 30px "Space Mono", monospace';
    ctx.fillText('— PARTNERS', 48, yy + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '400 28px "Space Grotesk", sans-serif';
    wrapText(ctx, ABOUT.partners, 48, yy + 56, w - 96, 36);
  });

  const off = 0.33;
  place(group, p1, baseAngle, -off, y);
  place(group, p2, baseAngle, 0, y);
  place(group, p3, baseAngle, off, y);
  sign(group, baseAngle, 'ABOUT', y + 1.25);
  return padFor(baseAngle, 'ABOUT');
}

function buildStats(group, baseAngle) {
  const y = 1.75;
  const panel = makeCanvasPanel(3.4, 1400, 560, (ctx, w, h) => {
    paintGlass(ctx, w, h, 32);
    const n = STATS.length;
    const colW = w / n;
    ctx.textAlign = 'center';
    STATS.forEach((s, i) => {
      const cx = colW * (i + 0.5);
      ctx.fillStyle = '#fff';
      ctx.font = '700 96px "Space Grotesk", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(s.big, cx, h / 2 + 10);
      ctx.fillStyle = '#4cc9ff';
      ctx.font = '700 32px "Space Mono", monospace';
      ctx.fillText(s.label, cx, h / 2 + 70);
      if (i < n - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(colW * (i + 1), 80);
        ctx.lineTo(colW * (i + 1), h - 80);
        ctx.stroke();
      }
    });
  });
  place(group, panel, baseAngle, 0, y);
  sign(group, baseAngle, 'BY THE NUMBERS', y + 1.35);
  return padFor(baseAngle, 'STATS');
}

function buildContact(group, baseAngle) {
  const y = 1.5;
  const QR_PX = 360;
  const panel = makeCanvasPanel(1.8, 760, 1040, (ctx, w, h) => {
    paintGlass(ctx, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '700 72px "Space Grotesk", sans-serif';
    ctx.fillText(CONTACT.title, w / 2, 110);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '400 30px "Space Grotesk", sans-serif';
    wrapText(ctx, CONTACT.sub, w / 2, 170, w - 140, 38);
    // white QR holder
    const qx = (w - QR_PX) / 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(qx - 16, 240, QR_PX + 32, QR_PX + 32);
    // contact lines
    ctx.fillStyle = '#4cc9ff';
    ctx.font = '700 34px "Space Mono", monospace';
    ctx.fillText(CONTACT.email, w / 2, 240 + QR_PX + 90);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '400 30px "Space Mono", monospace';
    ctx.fillText(CONTACT.phone, w / 2, 240 + QR_PX + 140);
  });
  place(group, panel, baseAngle, 0, y);
  sign(group, baseAngle, 'CONTACT', y + 1.55);

  // generate the QR async, then composite it into the panel
  QRCode.toCanvas(document.createElement('canvas'), CONTACT_URL, {
    margin: 1, width: QR_PX, color: { dark: '#000000', light: '#ffffff' },
  }).then((qrCanvas) => {
    const ctx = panel.userData.ctx;
    ctx.drawImage(qrCanvas, (760 - QR_PX) / 2, 256, QR_PX, QR_PX);
    panel.userData.tex.needsUpdate = true;
  }).catch(() => {});

  return padFor(baseAngle, 'CONTACT');
}
