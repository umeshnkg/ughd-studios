import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initAudio, setWash } from './audio.js';
import { initLeadForm } from './leadform.js';
import { initNavPill } from './navpill.js';

gsap.registerPlugin(ScrollTrigger);

// ---- chrome: clocks (sound toggle + click SFX live in audio.js) ----
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

initAudio();
initLeadForm();
initNavPill();

// ---- music wash: starts 2.6 viewport-heights before the bottom, only
// reaching max when the page is almost fully scrolled out
function updateWash() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  const vh = window.innerHeight;
  const start = max - 2.6 * vh;
  const end = max - 0.25 * vh;
  setWash(max > 0 ? (window.scrollY - start) / (end - start) : 0);
}
window.addEventListener('scroll', updateWash, { passive: true });
window.addEventListener('resize', updateWash);
updateWash();

// ---- scroll reveals ----
document.querySelectorAll('.reveal').forEach((el) => {
  gsap.fromTo(
    el,
    { opacity: 0, y: 46 },
    {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    }
  );
});

// hero comes in immediately
gsap.fromTo(
  '.careers-hero .reveal',
  { opacity: 0, y: 40 },
  { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.12, delay: 0.15 }
);
