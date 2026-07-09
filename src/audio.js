// ============================================================
// Shared audio engine — used by the gallery and the about page.
//   • background music: auto-starts (politely), quiet by default
//   • duck/unduck: fast fade-out when a video starts playing
//   • scroll wash: hi-pass + hall reverb that creeps in near footers
//   • UI sounds: hover tick + iOS-ish click for every button press
// ============================================================
import gsap from 'gsap';

const MUSIC_VOL = 0.12;
const STORAGE_KEY = 'ughd_bgmusic';

// Background music preference persists across sessions; defaults ON
// (only an explicit "false" the user saved keeps it off)
let bgMusicOn = localStorage.getItem(STORAGE_KEY) !== 'false';
let ctx = null;
let nodes = null; // { duck, hp, dry, wet, music }
let washTarget = 0;
let wash = 0;

// The work gallery (homepage) gets its own track; every other page
// keeps the lounge music. On direct loads the track is picked at boot;
// the homepage's SPA card overlay also swaps it at runtime via
// switchTrack() (see pages.js) since those navigations never reload.
const WORK_TRACK = 'UGHD%20Studios%20-%20Ambient%20Space%20Sound%20FX';
const LOUNGE_TRACK = 'UGHD%20Studios%20Lounge%20Music';
const isWorkPage = location.pathname === '/' || location.pathname.endsWith('/index.html');
let currentTrack = isWorkPage ? WORK_TRACK : LOUNGE_TRACK;

const bgMusic = document.createElement('audio');
bgMusic.loop = true;
bgMusic.style.display = 'none';
document.body.appendChild(bgMusic);

// (re)point the element at a track (webm with mp3 fallback) and reload
function setBgSource(base) {
  bgMusic.innerHTML = `
    <source src="/${base}.webm" type="audio/webm">
    <source src="/${base}.mp3" type="audio/mpeg">
  `;
  bgMusic.load();
}
setBgSource(currentTrack);

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

// ---- runtime track switching (homepage SPA card open/close) ----
// fade the current track down, swap the source, fade the new one up.
// When music is off / not yet started, just repoint the source so the
// next tryPlay() picks up the right track.
export function switchTrack(base) {
  if (base === currentTrack) return;
  currentTrack = base;

  if (!nodes || !bgMusicOn || bgMusic.paused) {
    setBgSource(base);
    return;
  }

  gsap.killTweensOf(nodes.music.gain);
  gsap.to(nodes.music.gain, {
    value: 0,
    duration: 0.4,
    ease: 'power2.out',
    onComplete: () => {
      setBgSource(base);
      bgMusic.play().catch(() => {});
      gsap.to(nodes.music.gain, { value: MUSIC_VOL, duration: 0.8, ease: 'power2.inOut' });
    },
  });
}

export const playWorkMusic = () => switchTrack(WORK_TRACK);
export const playLoungeMusic = () => switchTrack(LOUNGE_TRACK);

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
  sfx.volume = 0.20;
  sfx.play().catch(() => {});
}

export function playClick() {
  const sfx = new Audio('/Click%20sound%20FX.mp3');
  sfx.volume = 0.48;
  sfx.play().catch(() => {});
}

export function isSoundOn() {
  return bgMusicOn;
}

// ---- immersive (VR) audio ----
// Entering VR is a user gesture, so we can start the ambient track even
// when the saved preference is off. We bypass the bgMusicOn gate in
// tryPlay() directly; because the inactivity/visibility fades are all
// gated by bgMusicOn, none of them fight this while it's off.
export function startAmbient() {
  ensureCtx().resume().catch(() => {});
  gsap.killTweensOf(nodes.music.gain);
  nodes.music.gain.value = MUSIC_VOL;
  bgMusic.play().catch(() => {});
}

export function stopAmbient() {
  // leave it playing if the user actually has sound on for the flat site
  if (!bgMusicOn) bgMusic.pause();
}

// A short synthesized noise sweep — used for teleport / focus cues so we
// don't ship another audio asset. Runs through the existing AudioContext.
export function playWhoosh() {
  const c = ensureCtx();
  c.resume().catch(() => {});
  const now = c.currentTime;
  const dur = 0.5;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.7;
  bp.frequency.setValueAtTime(280, now);
  bp.frequency.exponentialRampToValueAtTime(2200, now + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.12, now + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  noise.connect(bp); bp.connect(g); g.connect(c.destination);
  noise.start(now);
  noise.stop(now + dur);
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

  // navigating to another page kills the audio element mid-note — hold
  // the navigation just long enough for a fast fade so the track doesn't
  // cut off abruptly (each page restarts its own music on load)
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return; // SPA router (pages.js) already took this click
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.getAttribute('href'), location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname) return; // same-page / hash link
    if (!bgMusicOn || bgMusic.paused) return;
    e.preventDefault();
    fadeOutMusic(0.2);
    setTimeout(() => { location.href = url.href; }, 230);
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

  // Hard-pause when the tab/window is hidden — a phone lock or tab switch
  // freezes rAF (so a gain fade would never run) and mobile keeps the
  // <audio> element decoding in the background otherwise. Pausing the
  // element is the only way to truly silence it. On return we resume the
  // AudioContext (iOS suspends it while backgrounded) and fade back in.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      fadedByVisibility = true;
      gsap.killTweensOf(nodes?.music.gain);
      bgMusic.pause();
      if (nodes) nodes.music.gain.value = 0; // return fades up from silence
    } else {
      fadedByVisibility = false;
      if (!fadedByInactivity && bgMusicOn) {
        tryPlay(); // resumes the ctx + element
        fadeInMusic(0.35);
      }
    }
  });

  // fade out after 2 min of no activity, resume on first interaction
  const activityEvents = ['mousemove', 'keydown', 'scroll', 'pointerdown', 'touchstart'];
  activityEvents.forEach(evt => window.addEventListener(evt, resetInactivityTimer, { passive: true }));
  resetInactivityTimer();
}
