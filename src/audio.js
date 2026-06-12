// ============================================================
// Shared audio engine — used by the gallery and the about page.
//   • background music: auto-starts (politely), quiet by default
//   • duck/unduck: fast fade-out when a video starts playing
//   • scroll wash: hi-pass + hall reverb that creeps in near footers
//   • UI sounds: hover tick + iOS-ish click for every button press
// ============================================================
import gsap from 'gsap';

const MUSIC_VOL = 0.18;
const STORAGE_KEY = 'ughd_bgmusic';

// Background music preference persists across sessions; defaults OFF
let bgMusicOn = localStorage.getItem(STORAGE_KEY) === 'true';
let ctx = null;
let nodes = null; // { duck, hp, dry, wet, music }
let washTarget = 0;
let wash = 0;

const bgMusic = document.createElement('audio');
bgMusic.loop = true;
bgMusic.style.display = 'none';
bgMusic.innerHTML = `
  <source src="/UGHD%20Studios%20Lounge%20Music.webm" type="audio/webm">
  <source src="/UGHD%20Studios%20Lounge%20Music.mp3" type="audio/mpeg">
`;
document.body.appendChild(bgMusic);

// celestial-hall impulse response: stereo noise with a short pre-delay,
// a slow fade-in bloom (the reverb swells instead of slapping back) and
// a one-pole low-pass that closes along the tail so it decays smooth,
// not hissy. Energy-normalized so tweaking length keeps the wet level.
function makeImpulse(c, seconds = 5.2, decay = 2.4) {
  const rate = c.sampleRate;
  const len = Math.floor(rate * seconds);
  const preDelay = Math.floor(rate * 0.02);
  const bloom = Math.floor(rate * 0.13);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let energy = 0;
    for (let i = preDelay; i < len; i++) {
      const t = (i - preDelay) / (len - preDelay);
      const a = 0.5 - 0.42 * t; // low-pass opens bright, darkens with the tail
      lp += ((Math.random() * 2 - 1) - lp) * a;
      const env =
        Math.pow(Math.min((i - preDelay) / bloom, 1), 1.5) *
        Math.pow(1 - t, decay);
      d[i] = lp * env;
      energy += d[i] * d[i];
    }
    const norm = Math.sqrt((0.13 * rate) / energy);
    for (let i = preDelay; i < len; i++) d[i] *= norm;
  }
  return buf;
}

// music → duck → highpass → [dry, chorus → (direct + echo) → convolver
// → wet] → master → out. The chorus is a slow LFO-wobbled micro-delay
// (a few cents of pitch drift — poor man's shimmer); the echo adds
// discrete outer-space repeats feeding the hall.
function ensureCtx() {
  if (ctx) return ctx;
  ctx = new AudioContext();

  const src = ctx.createMediaElementSource(bgMusic);
  const duck = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 10;
  hp.Q.value = 0.8;
  const dry = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0;
  const music = ctx.createGain();
  music.gain.value = MUSIC_VOL;

  const chorus = ctx.createDelay(0.05);
  chorus.delayTime.value = 0.012;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.004;
  lfo.connect(lfoDepth);
  lfoDepth.connect(chorus.delayTime);
  lfo.start();

  // echo is a quiet send, not a parallel copy: repeats enter the hall
  // well below the direct signal, and a low-pass inside the feedback
  // loop darkens each pass so the train fades into the wash instead of
  // cluttering it
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.45;
  const echoSend = ctx.createGain();
  echoSend.gain.value = 0.3;
  const echoFb = ctx.createGain();
  echoFb.gain.value = 0.25;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 2400;
  echo.connect(echoFb);
  echoFb.connect(echoLp);
  echoLp.connect(echo);

  src.connect(duck);
  duck.connect(hp);
  hp.connect(dry);
  dry.connect(music);
  hp.connect(chorus);
  chorus.connect(conv); // first bloom arrives immediately…
  chorus.connect(echoSend);
  echoSend.connect(echo);
  echo.connect(conv); // …then soft repeats keep re-exciting the hall
  conv.connect(wet);
  wet.connect(music);
  music.connect(ctx.destination);

  nodes = { duck, hp, dry, wet, music };
  return ctx;
}

function tryPlay() {
  if (!bgMusicOn) return;
  ensureCtx().resume().catch(() => {});
  bgMusic.play().catch(() => {});
}

// ---- scroll wash: 0 = clean, 1 = fully hi-passed + drowned in hall ----
export function setWash(v) {
  washTarget = Math.min(Math.max(v, 0), 1);
}

function washTick() {
  wash += (washTarget - wash) * 0.055;
  if (!nodes) return;
  // ease the response so the wash creeps in and saves its weight for
  // the end of the ramp instead of blooming hard in the first third
  const w = Math.pow(wash, 1.6);
  // 10 Hz (inaudible) → ~1000 Hz, exponential so the thinning feels gradual
  nodes.hp.frequency.value = 10 * Math.pow(100, w);
  nodes.wet.gain.value = w * 1.12;
  // sink the dry signal to 0.45 at full wash — the "drowned in the
  // cathedral" feel comes from dry dropping, not just the hi-pass
  nodes.dry.gain.value = 1 - 0.55 * w;
}

// ---- inactivity / tab-visibility fade ----
const INACTIVE_AFTER_MS = 2 * 60 * 1000;
let inactivityTimer = null;
let fadedByInactivity = false;
let fadedByVisibility = false;

function fadeOutMusic(duration = 0.8) {
  if (!nodes) return;
  gsap.killTweensOf(nodes.music.gain);
  gsap.to(nodes.music.gain, { value: 0, duration, ease: 'power2.out' });
}

function fadeInMusic(duration = 1.5) {
  if (!nodes || !bgMusicOn) return;
  gsap.killTweensOf(nodes.music.gain);
  gsap.to(nodes.music.gain, { value: MUSIC_VOL, duration, ease: 'power2.inOut' });
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (fadedByInactivity) {
    fadedByInactivity = false;
    if (!fadedByVisibility) fadeInMusic();
  }
  inactivityTimer = setTimeout(() => {
    if (!bgMusicOn) return;
    fadedByInactivity = true;
    fadeOutMusic();
  }, INACTIVE_AFTER_MS);
}

// ---- video ducking ----
export function duckMusic() {
  ensureCtx();
  gsap.killTweensOf(nodes.duck.gain);
  gsap.to(nodes.duck.gain, { value: 0, duration: 0.35, ease: 'power2.out' });
}

export function unduckMusic() {
  if (!nodes) return;
  gsap.killTweensOf(nodes.duck.gain);
  gsap.to(nodes.duck.gain, { value: 1, duration: 1.4, ease: 'power2.inOut' });
}

// ---- UI sounds ----
export function playTick() {
  const sfx = new Audio('/Hover%20sound%20fx.mp3');
  sfx.volume = 0.25;
  sfx.play().catch(() => {});
}

export function playClick() {
  const sfx = new Audio('/Click%20sound%20FX.mp3');
  sfx.volume = 0.6;
  sfx.play().catch(() => {});
}

export function isSoundOn() {
  return bgMusicOn;
}

// ---- bootstrap: toggle wiring, autoplay attempts, global click SFX ----
export function initAudio() {
  const toggle = document.getElementById('soundToggle');
  const state = document.getElementById('soundState');

  // Set initial UI to match saved preference (music off by default)
  if (state) state.textContent = bgMusicOn ? 'ON' : 'OFF';
  toggle?.classList.toggle('is-off', !bgMusicOn);

  toggle?.addEventListener('click', () => {
    bgMusicOn = !bgMusicOn;
    localStorage.setItem(STORAGE_KEY, bgMusicOn);
    state.textContent = bgMusicOn ? 'ON' : 'OFF';
    toggle.classList.toggle('is-off', !bgMusicOn);
    if (bgMusicOn) tryPlay();
    else bgMusic.pause();
  });

  // click sound on every button / link press, capture phase so it fires
  // even when the handler swallows the event
  document.addEventListener(
    'click',
    (e) => {
      if (e.target.closest('button, a')) playClick();
    },
    true
  );

  // Only attempt autoplay if the user previously enabled background music
  if (bgMusicOn) {
    tryPlay();
    const kick = () => tryPlay();
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });
  }

  gsap.ticker.add(washTick);

  // fast fade to silence when the tab goes inactive; fast fade back the
  // instant the user returns
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      fadedByVisibility = true;
      fadeOutMusic(0.2);
    } else {
      fadedByVisibility = false;
      if (!fadedByInactivity && bgMusicOn) fadeInMusic(0.35);
    }
  });

  // fade out after 2 min of no activity, resume on first interaction
  const activityEvents = ['mousemove', 'keydown', 'scroll', 'pointerdown', 'touchstart'];
  activityEvents.forEach(evt => window.addEventListener(evt, resetInactivityTimer, { passive: true }));
  resetInactivityTimer();
}
