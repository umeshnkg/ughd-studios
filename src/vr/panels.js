import * as THREE from 'three';
import QRCode from 'qrcode';
import { makeCanvasPanel, wrapText, paintGlass } from './text.js';
import { ABOUT, STATS, CONTACT, CONTACT_URL } from './content.js';

// ============================================================
// Content built as modal panels (shown via modal.js): About (story +
// what-we-do + studios + stats) and Contact (details + QR). Built on
// demand and cached so the QR is only generated once.
// ============================================================

let aboutGroup = null;
let contactGroup = null;

// About: a single tall readable board
export function buildAbout() {
  if (aboutGroup) return { group: aboutGroup, w: 2.6, h: 2.6 * (1100 / 900) };
  const panel = makeCanvasPanel(2.6, 900, 1100, (ctx, w, h) => {
    paintGlass(ctx, w, h, 28);
    let y = 70;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#4cc9ff';
    ctx.font = '700 28px "Space Mono", monospace';
    ctx.fillText('— ABOUT UGHD®', 48, y); y += 50;
    ctx.fillStyle = '#fff';
    ctx.font = '500 36px "Space Grotesk", sans-serif';
    y = wrapText(ctx, ABOUT.story, 48, y, w - 96, 46) + 26;

    ctx.fillStyle = '#4cc9ff';
    ctx.font = '700 28px "Space Mono", monospace';
    ctx.fillText('— WHAT WE DO', 48, y); y += 46;
    for (const d of ABOUT.disciplines) {
      ctx.fillStyle = '#fff';
      ctx.font = '600 32px "Space Grotesk", sans-serif';
      ctx.fillText(d.name, 48, y); y += 38;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '400 26px "Space Grotesk", sans-serif';
      y = wrapText(ctx, d.body, 48, y, w - 96, 32) + 16;
    }

    // stats row
    y += 10;
    ctx.fillStyle = '#4cc9ff';
    ctx.font = '700 28px "Space Mono", monospace';
    ctx.fillText('— BY THE NUMBERS', 48, y); y += 54;
    ctx.fillStyle = '#fff';
    let x = 48;
    for (const s of STATS) {
      ctx.font = '700 44px "Space Grotesk", sans-serif';
      ctx.fillText(s.big, x, y);
      ctx.fillStyle = '#4cc9ff';
      ctx.font = '400 20px "Space Mono", monospace';
      ctx.fillText(s.label, x, y + 30);
      ctx.fillStyle = '#fff';
      x += ctx.measureText(s.big).width + 90;
    }
    y += 70;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '400 24px "Space Mono", monospace';
    wrapText(ctx, ABOUT.partners, 48, y, w - 96, 32);
  });
  aboutGroup = new THREE.Group();
  aboutGroup.add(panel);
  return { group: aboutGroup, w: 2.6, h: 2.6 * (1100 / 900) };
}

// Contact: details + a scannable QR to the lead form
export function buildContact() {
  if (contactGroup) return { group: contactGroup, w: 1.9, h: 1.9 * (1080 / 760) };
  const QR_PX = 380;
  const panel = makeCanvasPanel(1.9, 760, 1080, (ctx, w, h) => {
    paintGlass(ctx, w, h, 28);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '700 66px "Space Grotesk", sans-serif';
    ctx.fillText(CONTACT.title, w / 2, 100);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '400 28px "Space Grotesk", sans-serif';
    wrapText(ctx, CONTACT.sub, w / 2, 160, w - 140, 36);
    ctx.fillStyle = '#fff';
    ctx.fillRect((w - QR_PX) / 2 - 16, 230, QR_PX + 32, QR_PX + 32);
    ctx.fillStyle = '#4cc9ff';
    ctx.font = '700 32px "Space Mono", monospace';
    ctx.fillText(CONTACT.email, w / 2, 230 + QR_PX + 92);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '400 28px "Space Mono", monospace';
    ctx.fillText(CONTACT.phone, w / 2, 230 + QR_PX + 140);
  });
  contactGroup = new THREE.Group();
  contactGroup.add(panel);

  QRCode.toCanvas(document.createElement('canvas'), CONTACT_URL, {
    margin: 1, width: QR_PX, color: { dark: '#000000', light: '#ffffff' },
  }).then((qr) => {
    panel.userData.ctx.drawImage(qr, (760 - QR_PX) / 2, 246, QR_PX, QR_PX);
    panel.userData.tex.needsUpdate = true;
  }).catch(() => {});

  return { group: contactGroup, w: 1.9, h: 1.9 * (1080 / 760) };
}
