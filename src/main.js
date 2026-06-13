import * as THREE from 'three';
import gsap from 'gsap';
import { projects, describe, filterTags } from './data.js';
import { initAudio, playTick, duckMusic, unduckMusic } from './audio.js';
import { initLeadForm } from './leadform.js';
import { initPages, isPageOpen } from './pages.js';
import { initNavPill } from './navpill.js';
import { initVR } from './vr.js';

// ============================================================
// Constants
// ============================================================
// The gallery is a flat, uniform grid of cards that wraps seamlessly on
// both axes — the sphere-like look comes entirely from a fisheye post
// pass (barrel distortion + edge blur), the way phantom.land does it.
const COLS = 12;
const ROWS = 12;
const TILE_W = 3.2;
const TILE_H = 2.875; // matches the 1024×920 card texture ratio
const GAP = 0; // tiles butt up against each other — one solid plane
const STEP_X = TILE_W + GAP;
const STEP_Y = TILE_H + GAP;
const WRAP_W = COLS * STEP_X;
const WRAP_H = ROWS * STEP_Y;

const CAM_Z = 11.0;
const FOV = 50;
const ZOOM_Z = 4.4; // dolly distance when a card opens

// The FOV is vertical, so a fixed CAM_Z keeps a constant number of ROWS
// in view — on narrow/portrait screens that leaves barely one giant
// column visible. Push the camera back until a minimum grid WIDTH fits.
const MIN_VISIBLE_W = STEP_X * 3.4;

function restZ() {
  const aspect = window.innerWidth / window.innerHeight;
  const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  return Math.max(CAM_Z, MIN_VISIBLE_W / (2 * halfTan * aspect));
}

// keep the card's apparent size during the open-zoom consistent too
function zoomZ() {
  return ZOOM_Z * (restZ() / CAM_Z);
}

const LENS_K = 0.11; // barrel distortion strength
const LENS_BLUR = 0.014; // edge blur radius (uv units)
const LENS_DIM = 0.32; // edge darkening

const LERP = 0.075; // lenis-style easing factor
const THROW = 14; // inertia multiplier (frames of velocity)

// mouse parallax — cursor left → grid drifts right
const PARA_X = 0.5; // world units at screen edge
const PARA_Y = 0.36;
const PARA_LERP = 0.045;

const TEX_W = 1024;
const TEX_H = 920;

// grid hairline — a card is ~400 screen px wide, so 4 texture px ≈ 1.5 px
const GRID_LINE = 4;
const GRID_LINE_COLOR = 'rgba(255, 255, 255, 0.32)';

// ============================================================
// Scene setup
// ============================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const DPR = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
// view = camera rest position; parallax is added on top each frame so
// gsap can tween view during the open/close zoom without fighting it
const view = { x: 0, y: 0, z: restZ() };
camera.position.set(view.x, view.y, view.z);

// ============================================================
// Fisheye lens post pass — scene renders into a target, then a
// fullscreen quad warps it: center magnified, edges compressed
// and blurred, so the flat grid reads as the inside of a sphere.
// ============================================================
const lens = {
  k: { value: LENS_K },
  blur: { value: LENS_BLUR },
  dim: { value: LENS_DIM },
  aspect: { value: window.innerWidth / window.innerHeight },
};

function makeRenderTarget() {
  return new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * DPR),
    Math.floor(window.innerHeight * DPR),
    { samples: 4 }
  );
}
let sceneRT = makeRenderTarget();

const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMaterial = new THREE.ShaderMaterial({
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tDiffuse: { value: sceneRT.texture },
    uK: lens.k,
    uBlur: lens.blur,
    uDim: lens.dim,
    uAspect: lens.aspect,
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uK;
    uniform float uBlur;
    uniform float uDim;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      p.x *= uAspect;
      float rc2 = 1.0 + uAspect * uAspect; // corner radius², keeps corners pinned
      float r2 = dot(p, p);
      vec2 q = p * (1.0 + uK * r2) / (1.0 + uK * rc2);
      float rim = smoothstep(0.42, 1.0, sqrt(r2 / rc2));
      q.x /= uAspect;
      vec2 suv = q * 0.5 + 0.5;

      // golden-angle spiral disc blur — taps spread across the whole
      // radius (not one ring), so the falloff is smooth instead of
      // stacking ghost copies of the image. The spiral is rotated by a
      // per-pixel noise angle (interleaved gradient noise) so the few
      // taps dither into fine grain rather than structured ghosting.
      float rad = uBlur * rim;
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float rot = ign * 6.2831853;
      vec3 col = texture2D(tDiffuse, suv).rgb;
      float total = 1.0;
      for (int i = 0; i < 24; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 24.0);
        float ang = fi * 2.39996323 + rot;
        vec2 offs = vec2(cos(ang), sin(ang)) * r * rad;
        float w = 1.0 - r * 0.45; // gaussian-ish: center taps weigh more
        col += texture2D(tDiffuse, suv + offs).rgb * w;
        total += w;
      }
      col /= total;

      col *= 1.0 - uDim * rim;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

// The lens magnifies the screen center by (1 + k·rc²); pointer math and
// drag speed both need the same mapping to stay accurate under the warp.
function lensZoom() {
  const a = lens.aspect.value;
  return 1 + lens.k.value * (1 + a * a);
}

// screen NDC → scene NDC as seen through the lens (mirror of the shader)
function distortPointer(x, y, out) {
  const a = lens.aspect.value;
  const px = x * a;
  const r2 = px * px + y * y;
  const f = (1 + lens.k.value * r2) / lensZoom();
  out.set((px * f) / a, y * f);
  return out;
}

function worldPerPixel() {
  const visibleW =
    2 * view.z * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camera.aspect;
  return visibleW / window.innerWidth / lensZoom();
}

// ============================================================
// Card texture painting
// ============================================================
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// haze: { alpha, t } — blurred artwork drifting behind the card
function paintCard(ctx, p, img, blur, haze) {
  ctx.clearRect(0, 0, TEX_W, TEX_H);

  // card background + hairline border
  ctx.fillStyle = '#070707';
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  if (blur && haze && haze.alpha > 0.003) {
    const t = haze.t;
    const scale = 1.3 + 0.09 * Math.sin(t * 0.55);
    const ox = Math.sin(t * 0.38) * 46;
    const oy = Math.cos(t * 0.29) * 34;
    const w = TEX_W * scale;
    const h = TEX_H * scale;
    ctx.globalAlpha = haze.alpha;
    ctx.drawImage(blur, (TEX_W - w) / 2 + ox, (TEX_H - h) / 2 + oy, w, h);
    // soft scrims so the type stays readable over the haze
    const grad = ctx.createLinearGradient(0, 0, 0, TEX_H);
    grad.addColorStop(0, `rgba(0,0,0,${0.38 * haze.alpha})`);
    grad.addColorStop(0.25, 'rgba(0,0,0,0)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${0.38 * haze.alpha})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
  }

  const PAD = 44;

  // artwork — cover-fit into centered box
  const boxW = 730;
  const boxH = 502;
  const bx = (TEX_W - boxW) / 2;
  const by = (TEX_H - boxH) / 2 - 10;
  if (img) {
    const s = Math.max(boxW / img.width, boxH / img.height);
    const sw = boxW / s;
    const sh = boxH / s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, boxW, boxH);
    ctx.clip();
    ctx.drawImage(
      img,
      (img.width - sw) / 2,
      (img.height - sh) / 2,
      sw,
      sh,
      bx,
      by,
      boxW,
      boxH
    );
    ctx.restore();
  } else {
    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by, boxW, boxH);
  }

  // client name — top left
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 40px "Space Grotesk", sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(p.client, PAD, PAD - 4);

  // title — top right (mono, small caps)
  ctx.fillStyle = '#d9d9d9';
  ctx.font = '24px "Space Mono", monospace';
  ctx.textAlign = 'right';
  let title = p.title;
  while (ctx.measureText(title).width > TEX_W * 0.46 && title.length > 8) {
    title = title.slice(0, -2);
  }
  if (title !== p.title) title += '…';
  ctx.fillText(title, TEX_W - PAD, PAD + 6);

  // tag pills — bottom left
  ctx.font = '22px "Space Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let tx = PAD;
  const ty = TEX_H - PAD - 26;
  for (const tag of p.tags) {
    const tw = ctx.measureText(tag).width;
    roundedRect(ctx, tx, ty - 26, tw + 40, 52, 26);
    ctx.fillStyle = 'rgba(20,20,20,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#e6e6e6';
    ctx.fillText(tag, tx + 20, ty + 2);
    tx += tw + 40 + 14;
  }

  // year — bottom right
  ctx.fillStyle = '#d9d9d9';
  ctx.font = '26px "Space Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(String(p.year), TEX_W - PAD, ty + 2);

  // grid hairline on right + bottom edges only — neighbours supply the
  // other two sides, so the seams read as one line, never doubled
  ctx.fillStyle = GRID_LINE_COLOR;
  ctx.fillRect(TEX_W - GRID_LINE, 0, GRID_LINE, TEX_H);
  ctx.fillRect(0, TEX_H - GRID_LINE, TEX_W, GRID_LINE);
}

// small, heavily blurred copy of the artwork for the hover haze
function makeBlurCanvas(img) {
  const bc = document.createElement('canvas');
  bc.width = 128;
  bc.height = 115;
  const bctx = bc.getContext('2d');
  const s = Math.max(bc.width / img.width, bc.height / img.height);
  const sw = img.width * s;
  const sh = img.height * s;
  bctx.filter = 'blur(9px)';
  // overdraw past the edges so the blur has no transparent fringe
  bctx.drawImage(img, (bc.width - sw) / 2 - 12, (bc.height - sh) / 2 - 12, sw + 24, sh + 24);
  return bc;
}

// ============================================================
// Build the cards
// Tiles outnumber projects ~4×, so the grid is filled by dealing
// shuffled copies of the catalogue. Duplicates share one canvas
// texture per project, so memory doesn't grow with the tile count.
// ============================================================
const cards = []; // card objects, one per grid tile
const projectArt = []; // shared per-project { p, ctx, tex, img, blur }
let homeDeal = []; // projectArt index per tile, the unfiltered layout
const group = new THREE.Group();
scene.add(group);

const tileGeometry = new THREE.PlaneGeometry(TILE_W, TILE_H);

let texturesLoaded = 0;
const totalTextures = projects.length;
const loaderPct = document.getElementById('loaderPct');

function bumpLoader() {
  texturesLoaded++;
  loaderPct.textContent =
    Math.round((texturesLoaded / totalTextures) * 100) + '%';
  if (texturesLoaded === totalTextures) onReady();
}

function makeCardTexture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// MeshBasicMaterial with a saturation uniform so filtered-out cards
// can desaturate to black & white without a separate texture
function makeCardMaterial(tex, uSat) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSat = uSat;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSat;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  float cardGray = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(vec3(cardGray), diffuseColor.rgb, uSat);`
      );
  };
  mat.customProgramCacheKey = () => 'ughd-card';
  return mat;
}

function dealProjects(count, pool) {
  const indices = pool ?? projectArt.map((_, i) => i);
  const deal = [];
  while (deal.length < count) {
    const copy = [...indices];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    deal.push(...copy);
  }
  return deal.slice(0, count);
}

function setCardArt(card, art) {
  card.art = art;
  card.project = art.p;
  card.material.map = art.tex;
}

function buildCards() {
  for (const p of projects) {
    const cv = document.createElement('canvas');
    cv.width = TEX_W;
    cv.height = TEX_H;
    const ctx = cv.getContext('2d');
    paintCard(ctx, p, null, null, null);
    projectArt.push({ p, ctx, tex: makeCardTexture(cv), img: null, blur: null });
  }

  homeDeal = dealProjects(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const uSat = { value: 1 };
      const mat = makeCardMaterial(projectArt[homeDeal[i]].tex, uSat);

      const mesh = new THREE.Mesh(tileGeometry, mat);
      group.add(mesh);

      const card = {
        mesh,
        material: mat,
        project: null,
        art: null,
        uSat,
        haze: { alpha: 0, t: 0 },
        hoverUnit: null,
        baseX: c * STEP_X,
        baseY: r * STEP_Y,
        filtered: false,
      };
      setCardArt(card, projectArt[homeDeal[i]]);
      mesh.userData.card = card;
      cards.push(card);
    }
  }

  // one artwork load per project — every duplicate updates for free
  for (const art of projectArt) {
    const img = new Image();
    img.onload = () => {
      art.img = img;
      art.blur = makeBlurCanvas(img);
      paintCard(art.ctx, art.p, img, null, null);
      art.tex.needsUpdate = true;
      bumpLoader();
    };
    img.onerror = bumpLoader;
    img.src = art.p.img;
  }
}

// ============================================================
// Grid scroll state (lenis-style lerp toward target). The grid
// wraps modulo its world size, so scrolling is endless both ways.
// ============================================================
const off = { x: 0, y: 0 };
const target = { x: 0, y: 0 };
const para = { x: 0, y: 0 }; // smoothed mouse parallax

function wrapCoord(v, span) {
  return ((v % span) + span * 1.5) % span - span / 2;
}

// tiles wrap around whatever the camera is looking at, so the grid
// stays seamless even while the view flies into a card
function layoutTiles() {
  const cx = view.x + para.x;
  const cy = view.y + para.y;
  for (const c of cards) {
    c.mesh.position.x = cx + wrapCoord(c.baseX + off.x - cx, WRAP_W);
    c.mesh.position.y = cy + wrapCoord(c.baseY + off.y - cy, WRAP_H);
  }
}

// ============================================================
// Pointer interaction
// ============================================================
const pointer = new THREE.Vector2(10, 10);
const lensPointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let dragging = false;
let downAt = { x: 0, y: 0, t: 0 };
let last = { x: 0, y: 0, t: 0 };
let vel = { x: 0, y: 0 };
let hovered = null; // card object
let detailOpen = false;
let introDone = false;

canvas.addEventListener('pointerdown', (e) => {
  if (detailOpen || !introDone || isPageOpen()) return;
  dragging = true;
  canvas.classList.add('is-dragging');
  canvas.setPointerCapture(e.pointerId);
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  last = { ...downAt };
  vel = { x: 0, y: 0 };
});

canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

  if (!dragging) return;
  const now = performance.now();
  const dx = e.clientX - last.x;
  const dy = e.clientY - last.y;
  const dt = Math.max(now - last.t, 1);
  const wpp = worldPerPixel();

  // grab-the-wall: content follows the pointer on both axes
  target.x += dx * wpp;
  target.y -= dy * wpp;

  vel.x = (dx * wpp) / dt;
  vel.y = (dy * wpp) / dt;
  last = { x: e.clientX, y: e.clientY, t: now };
});

canvas.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  canvas.classList.remove('is-dragging');

  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  const elapsed = performance.now() - downAt.t;

  if (moved < 6 && elapsed < 400) {
    handleTap();
    return;
  }

  // inertia throw
  const sinceMove = performance.now() - last.t;
  if (sinceMove < 60) {
    target.x += vel.x * 16 * THROW;
    target.y -= vel.y * 16 * THROW;
  }
});

window.addEventListener(
  'wheel',
  (e) => {
    if (detailOpen || !introDone || isPageOpen()) return;
    const wpp = worldPerPixel();
    target.x -= e.deltaX * wpp;
    target.y += e.deltaY * wpp;
  },
  { passive: true }
);

// ============================================================
// Hover + tap
// ============================================================
function raycastCard() {
  distortPointer(pointer.x, pointer.y, lensPointer);
  raycaster.setFromCamera(lensPointer, camera);
  const hits = raycaster.intersectObjects(group.children, false);
  return hits.length ? hits[0].object.userData.card : null;
}

// Duplicates share textures, so the animated hover haze is painted
// into one of two dedicated canvases swapped onto the hovered card
// (two, so a fade-out can finish while the next hover fades in).
function makeHoverUnit() {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  return { ctx: cv.getContext('2d'), tex: makeCardTexture(cv), card: null };
}
const hoverUnits = [makeHoverUnit(), makeHoverUnit()];

function releaseHover(unit) {
  if (!unit.card) return;
  const c = unit.card;
  gsap.killTweensOf(c.haze);
  c.haze.alpha = 0;
  c.material.map = c.art.tex; // back to the shared texture
  c.hoverUnit = null;
  unit.card = null;
}

function acquireHover(card) {
  let unit = hoverUnits.find((u) => !u.card);
  if (!unit) unit = hoverUnits.find((u) => u.card !== card) || hoverUnits[0];
  releaseHover(unit);
  unit.card = card;
  card.hoverUnit = unit;
  paintCard(unit.ctx, card.project, card.art.img, card.art.blur, card.haze);
  unit.tex.needsUpdate = true;
  card.material.map = unit.tex;
}

function setHover(card) {
  if (hovered === card) return;
  if (hovered) {
    const off = hovered;
    const unit = off.hoverUnit;
    gsap.to(off.material.color, { r: 1, g: 1, b: 1, duration: 0.35 });
    if (unit) {
      gsap.to(off.haze, {
        alpha: 0,
        duration: 0.45,
        ease: 'power2.out',
        onComplete: () => releaseHover(unit),
      });
    }
  }
  hovered = card;
  if (hovered) {
    gsap.to(hovered.material.color, { r: 1.18, g: 1.18, b: 1.18, duration: 0.25 });
    if (hovered.art.blur) {
      acquireHover(hovered);
      gsap.to(hovered.haze, { alpha: 1, duration: 0.5, ease: 'power2.out' });
    }
    playTick();
  }
  canvas.style.cursor = hovered ? 'pointer' : dragging ? 'grabbing' : 'grab';
}

function handleTap() {
  const card = raycastCard();
  if (card && !card.filtered) openDetail(card);
}

// ============================================================
// Detail overlay
// ============================================================
const detailEl = document.getElementById('detail');
const detailBack = document.getElementById('detailBack');

function openDetail(card) {
  if (detailOpen) return;
  detailOpen = true;
  const p = card.project;

  document.getElementById('detailClient').textContent = p.client;
  document.getElementById('detailTitle').textContent = p.title;
  document.getElementById('detailYear').textContent = p.year;
  document.getElementById('detailTags').innerHTML = p.tags
    .map((t) => `<span>${t}</span>`)
    .join('');
  document.getElementById('detailDesc').textContent = describe(p);

  const media = document.getElementById('detailMedia');
  if (p.youtube) {
    media.innerHTML = `<iframe src="https://www.youtube.com/embed/${p.youtube}?autoplay=1&rel=0" title="${p.title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    media.innerHTML = `<img src="${p.img}" alt="${p.title}" />`;
  }

  detailEl.setAttribute('aria-hidden', 'false');
  detailEl.style.visibility = 'visible';

  // a video is about to autoplay — get the music out of the way fast
  if (p.youtube) duckMusic();

  // fly the camera into the tile while the lens flattens out,
  // then slide the page in
  const tile = card.mesh.position;
  const tl = gsap.timeline();
  tl.to(view, { x: tile.x, y: tile.y, z: zoomZ(), duration: 0.85, ease: 'power3.inOut' }, 0)
    .to(lens.k, { value: 0, duration: 0.85, ease: 'power3.inOut' }, 0)
    .to(lens.blur, { value: 0, duration: 0.85, ease: 'power2.out' }, 0)
    .to(detailEl, { y: 0, duration: 0.9, ease: 'power4.inOut' }, 0.18)
    .from(
      detailEl.querySelectorAll('.detail__bar, .detail__title, .detail__meta, .detail__media, .detail__desc'),
      { y: 48, opacity: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out' },
      0.55
    );
}

function closeDetail() {
  if (!detailOpen) return;
  unduckMusic();
  const tl = gsap.timeline({
    onComplete: () => {
      detailOpen = false;
      detailEl.style.visibility = 'hidden';
      detailEl.setAttribute('aria-hidden', 'true');
      document.getElementById('detailMedia').innerHTML = '';
    },
  });
  tl.to(detailEl, { y: '100%', duration: 0.8, ease: 'power4.inOut' }, 0)
    .to(view, { x: 0, y: 0, z: restZ(), duration: 0.9, ease: 'power3.inOut' }, 0.1)
    .to(lens.k, { value: LENS_K, duration: 0.9, ease: 'power3.inOut' }, 0.1)
    .to(lens.blur, { value: LENS_BLUR, duration: 0.9, ease: 'power2.in' }, 0.1);
}

detailBack.addEventListener('click', closeDetail);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
});

// set initial transform via gsap so .to(y:0) works
gsap.set(detailEl, { y: '100%' });

// ============================================================
// Filter — nothing moves. The grid ripple-fades in place: matched
// projects reappear on the tiles nearest the current view, full
// colour; every other tile refills with the rest, greyed out.
// ============================================================
const filterBtn = document.getElementById('filterBtn');
const filterPanel = document.getElementById('filterPanel');
let activeFilter = 'ALL';

filterTags.forEach((item) => {
  if (item.sub) {
    const group = document.createElement('div');
    group.className = 'filter-group';

    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      const subPanel = group.querySelector('.filter-subpanel');
      const wasOpen = subPanel.classList.contains('is-open');
      filterPanel.querySelectorAll('.filter-subpanel').forEach((p) => p.classList.remove('is-open'));
      applyFilter(item.label, btn);
      if (!wasOpen) subPanel.classList.add('is-open');
    });
    group.appendChild(btn);

    const subPanel = document.createElement('div');
    subPanel.className = 'filter-subpanel';
    item.sub.forEach((subTag) => {
      const sb = document.createElement('button');
      sb.textContent = subTag;
      sb.classList.add('filter-sub');
      sb.addEventListener('click', (e) => {
        e.stopPropagation();
        filterPanel.querySelectorAll('button').forEach((b) => {
          b.classList.remove('is-active');
          b.classList.remove('is-parent-active');
        });
        btn.classList.add('is-parent-active');
        sb.classList.add('is-active');
        applyFilter(subTag, sb, item.label);
      });
      subPanel.appendChild(sb);
    });
    group.appendChild(subPanel);
    filterPanel.appendChild(group);
  } else {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    if (item.label === 'ALL') btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      filterPanel.querySelectorAll('.filter-subpanel').forEach((p) => p.classList.remove('is-open'));
      applyFilter(item.label, btn);
    });
    filterPanel.appendChild(btn);
  }
});

filterBtn.addEventListener('click', () => {
  const isOpening = !filterPanel.classList.contains('is-open');
  filterPanel.classList.toggle('is-open');
  if (isOpening) {
    let i = 0;
    for (const child of filterPanel.children) {
      const btn = child.tagName === 'BUTTON' ? child : child.querySelector(':scope > button');
      if (btn) {
        btn.style.setProperty('--reveal-delay', `${50 + i * 45}ms`);
        i++;
      }
    }
  }
});

function applyFilter(tag, btn, parentTag = null) {
  activeFilter = tag;
  setHover(null);

  if (!parentTag) {
    filterPanel.querySelectorAll('button').forEach((b) => {
      b.classList.remove('is-active');
      b.classList.remove('is-parent-active');
    });
    btn.classList.add('is-active');
  }

  const isAll = tag === 'ALL';
  const matchIdx = [];
  const restIdx = [];
  projectArt.forEach((a, i) => {
    let match;
    if (isAll) {
      match = true;
    } else if (parentTag) {
      match = a.p.tags.includes(parentTag) && a.p.tags.some((t) => t.includes(tag));
    } else {
      match = a.p.tags.some((t) => t.includes(tag));
    }
    if (match) matchIdx.push(i);
    else restIdx.push(i);
  });

  // rank tiles by how close they sit to the view center right now
  const ranked = cards
    .map((c) => ({
      c,
      d: Math.hypot(c.mesh.position.x - view.x, c.mesh.position.y - view.y),
    }))
    .sort((a, b) => a.d - b.d);

  // assignment: matched projects (one each) take the nearest tiles,
  // the rest of the grid refills with non-matching projects
  const fillDeal = isAll
    ? null
    : dealProjects(Math.max(cards.length - matchIdx.length, 0), restIdx.length ? restIdx : matchIdx);

  ranked.forEach(({ c, d }, k) => {
    const cardIndex = cards.indexOf(c);
    let artIdx;
    let isMatch;
    if (isAll) {
      artIdx = homeDeal[cardIndex];
      isMatch = true;
    } else if (k < matchIdx.length) {
      artIdx = matchIdx[k];
      isMatch = true;
    } else {
      artIdx = fillDeal[k - matchIdx.length];
      isMatch = false;
    }
    const art = projectArt[artIdx];
    const delay = Math.min(d * 0.024, 0.55);

    gsap.killTweensOf(c.material);
    if (c.hoverUnit) releaseHover(c.hoverUnit);
    gsap.killTweensOf(c.material.color);
    c.material.color.setRGB(1, 1, 1);

    gsap
      .timeline()
      .to(c.material, { opacity: 0, duration: 0.24, delay, ease: 'power2.in' })
      .add(() => {
        setCardArt(c, art);
        c.filtered = !isMatch;
        gsap.killTweensOf(c.uSat);
        c.uSat.value = isMatch ? 1 : 0;
      })
      .to(c.material, {
        opacity: isMatch ? 1 : 0.4,
        duration: 0.5,
        ease: 'power2.out',
      });
  });
}

// ============================================================
// Sound + chrome — shared engine in audio.js, lead form modal,
// and the page-card overlay (About slides up over the gallery)
// ============================================================
initAudio();
initLeadForm();
initPages();
initNavPill();

// ============================================================
// Clocks
// ============================================================
function tickClocks() {
  const fmt = (tz) =>
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(new Date());
  document.getElementById('clock-us').textContent = fmt('America/New_York');
  document.getElementById('clock-lk').textContent = fmt('Asia/Colombo');
}
tickClocks();
setInterval(tickClocks, 30_000);

// ============================================================
// Intro / loader
// ============================================================
let readyFired = false;
function onReady() {
  if (readyFired) return;
  readyFired = true;

  const loader = document.getElementById('loader');
  const tl = gsap.timeline();
  tl.to(loader, { opacity: 0, duration: 0.6, ease: 'power2.out', delay: 0.2 })
    .set(loader, { display: 'none' })
    .fromTo(
      view,
      { z: restZ() * 2.1 },
      { z: restZ(), duration: 1.8, ease: 'power3.inOut' },
      0.2
    )
    .fromTo(
      lens.k,
      { value: LENS_K * 2.4 },
      { value: LENS_K, duration: 1.8, ease: 'power3.inOut' },
      0.2
    )
    .add(() => {
      introDone = true;
    }, 1.2);

  // gentle establishing pan
  gsap.fromTo(
    target,
    { x: -STEP_X * 1.4 },
    { x: 0, duration: 2.2, ease: 'power3.out', delay: 0.2 }
  );
}

// fallback if some image hangs
setTimeout(() => onReady(), 8000);

// ============================================================
// Render loop
// ============================================================
// while a headset session owns the loop (renderer.setAnimationLoop), the
// desktop rAF chain pauses; it resumes when VR exits.
let vrActive = false;

function animate() {
  if (vrActive) return;
  requestAnimationFrame(animate);

  off.x += (target.x - off.x) * LERP;
  off.y += (target.y - off.y) * LERP;

  // parallax: ease toward the cursor-driven offset (away from cursor)
  const paraTargetX = detailOpen ? 0 : pointer.x * PARA_X;
  const paraTargetY = detailOpen ? 0 : -pointer.y * PARA_Y;
  para.x += (paraTargetX - para.x) * PARA_LERP;
  para.y += (paraTargetY - para.y) * PARA_LERP;

  camera.position.set(view.x + para.x, view.y + para.y, view.z);
  layoutTiles();

  // repaint any active hover haze (at most two per frame)
  const now = performance.now() / 1000;
  for (const u of hoverUnits) {
    if (!u.card) continue;
    const c = u.card;
    c.haze.t = now;
    paintCard(u.ctx, c.project, c.art.img, c.art.blur, c.haze);
    u.tex.needsUpdate = true;
  }

  if (!dragging && !detailOpen && introDone && !isPageOpen()) {
    // idle drift
    target.x -= 0.0012;
    const card = raycastCard();
    setHover(card && !card.filtered ? card : null);
  } else if (dragging || isPageOpen()) {
    setHover(null);
  }

  renderer.setRenderTarget(sceneRT);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCamera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  lens.aspect.value = camera.aspect;
  renderer.setSize(window.innerWidth, window.innerHeight);
  sceneRT.dispose();
  sceneRT = makeRenderTarget();
  postMaterial.uniforms.tDiffuse.value = sceneRT.texture;
  // re-fit the rest distance unless a tween owns view.z right now
  if (!detailOpen && introDone && !gsap.isTweening(view)) {
    view.z = restZ();
  }
});

// wait for fonts so canvas labels render with the right typefaces
document.fonts.ready.then(() => {
  buildCards();
  animate();

  // Progressive enhancement: a Quest browser gets an "Enter VR" button.
  // Entering hides the flat grid + post pass and hands the loop to XR.
  initVR({
    renderer,
    scene,
    camera,
    projectArt,
    tileGeometry,
    makeCardMaterial,
    onEnter: () => {
      vrActive = true;
      group.visible = false; // hide the flat wrapping grid
    },
    onExit: () => {
      vrActive = false;
      group.visible = true;
      animate(); // resume the desktop loop + fisheye post pass
    },
  });
});
