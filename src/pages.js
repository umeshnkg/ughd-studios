// ============================================================
// Page-card overlay — "Work" (the gallery) is the permanent home
// page; other pages load into a card that slides up over it. Going
// back / pressing Work just slides the card away — no reload, the
// gallery keeps living underneath.
// ============================================================
import gsap from 'gsap';
import { setWash, playWorkMusic, playLoungeMusic } from './audio.js';
import { isLeadOpen } from './leadform.js';

const PAGES = {
  about: '/about.html',
  careers: '/careers.html',
};

let cardEl, scrollEl, contentEl;
let open = false;
let animating = false;
let navigatingBack = false; // a history.back() is in flight, awaiting popstate
let currentPage = null;
let pending = null; // {action:'open'|'close', page} captured while animating
let currentTl = null; // the in-flight GSAP timeline
const pageCache = {}; // page -> cached <main> element

// release the animating guard and run the most recent intent that arrived
// mid-animation (latest wins) so rapid clicks land on the last page asked for
function settle() {
  animating = false;
  if (!pending) return;
  const p = pending;
  pending = null;
  if (p.action === 'close') closePage();
  else openPage(p.page, true);
}

export function isPageOpen() {
  return open;
}

function setActive(page) {
  document.querySelectorAll('.mainnav__item').forEach((a) => {
    a.classList.toggle('is-active', (a.dataset.spa || '') === page);
  });
}

// scroll-reveal + strip drift for injected content (about.js uses
// ScrollTrigger on window; in here the card itself is the scroller,
// so a scoped IntersectionObserver is simpler)
function initReveals(container) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        gsap.fromTo(
          en.target,
          { opacity: 0, y: 46 },
          { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }
        );
      }
    },
    { root: scrollEl, rootMargin: '0px 0px -10% 0px' }
  );
  container.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  gsap.to(container.querySelectorAll('.strip img'), {
    y: -10,
    duration: 2.4,
    ease: 'sine.inOut',
    stagger: { each: 0.18, yoyo: true, repeat: -1 },
  });
}

// Cloudflare Pages redirects /about.html -> /about (pretty URLs), so
// production history entries use the extensionless form to avoid a 308
// on reload; the Vite dev server only serves the .html paths
function cleanUrl(page) {
  return import.meta.env.PROD ? PAGES[page].replace(/\.html$/, '') : PAGES[page];
}

async function loadPage(page) {
  if (pageCache[page]) return pageCache[page];
  const html = await (await fetch(PAGES[page])).text();
  const main = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('main');
  if (!main) throw new Error(`no <main> in ${PAGES[page]}`);
  pageCache[page] = main;
  return main;
}

// music wash: starts 2.6 viewport-heights before the bottom, only
// reaching max when the page is almost fully scrolled out
function onScroll() {
  if (!open) return;
  const max = scrollEl.scrollHeight - scrollEl.clientHeight;
  const vh = scrollEl.clientHeight;
  const start = max - 2.6 * vh;
  const end = max - 0.25 * vh;
  setWash(max > 0 ? (scrollEl.scrollTop - start) / (end - start) : 0);
}

function showPage(page, main) {
  if (contentEl.firstChild === main) return;
  contentEl.replaceChildren(main);
  scrollEl.scrollTop = 0;
  if (!main.dataset.revealed) {
    main.dataset.revealed = '1';
    initReveals(main);
  }
}

async function openPage(page, push) {
  if (open && currentPage === page && !animating) return;
  if (animating) { pending = { action: 'open', page }; return; }
  animating = true; // guard before await so rapid clicks can't race through
  let main;
  try {
    main = await loadPage(page);
  } catch {
    // fetch/parse failed — fall back to a real navigation instead of
    // leaving the nav stuck behind the animating guard
    animating = false;
    location.href = PAGES[page];
    return;
  }
  // swapping pages while the card is up replaces the entry so "Work"
  // (history.back) always returns straight to the gallery
  if (push && open) history.replaceState({ page }, '', cleanUrl(page));
  else if (push) history.pushState({ page }, '', cleanUrl(page));
  setActive(page);
  currentPage = page;
  playLoungeMusic(); // every non-Work SPA page rides the lounge track

  if (open) {
    // card already up (e.g. About -> Careers): swap content in place, no animation
    showPage(page, main);
    settle();
    return;
  }
  showPage(page, main);
  open = true;
  document.body.classList.add('page-open');
  cardEl.style.visibility = 'visible';
  cardEl.setAttribute('aria-hidden', 'false');
  scrollEl.scrollTop = 0;

  currentTl?.kill();
  currentTl = gsap.timeline({ onComplete: settle })
    .set(scrollEl, { borderTopLeftRadius: 26, borderTopRightRadius: 26 })
    .fromTo(cardEl, { y: '100%' }, { y: 0, duration: 0.9, ease: 'power4.inOut', overwrite: 'auto' })
    .to('#scene', { scale: 0.94, opacity: 0.5, duration: 0.9, ease: 'power4.inOut', overwrite: 'auto' }, 0)
    .to(scrollEl, { borderTopLeftRadius: 0, borderTopRightRadius: 0, duration: 0.3 }, '-=0.1');
}

function closePage() {
  if (animating) { pending = { action: 'close' }; return; }
  if (!open) return;
  animating = true;
  open = false;
  currentPage = null;
  setActive('work');
  setWash(0);
  playWorkMusic(); // back to the gallery → restore the work track

  currentTl?.kill();
  currentTl = gsap.timeline({
    onComplete: () => {
      cardEl.style.visibility = 'hidden';
      cardEl.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('page-open');
      settle();
    },
  })
    .set(scrollEl, { borderTopLeftRadius: 26, borderTopRightRadius: 26 })
    .to(cardEl, { y: '100%', duration: 0.8, ease: 'power4.inOut', overwrite: 'auto' })
    .to('#scene', { scale: 1, opacity: 1, duration: 0.8, ease: 'power4.inOut', overwrite: 'auto' }, 0);
}

export function initPages() {
  cardEl = document.getElementById('pageCard');
  scrollEl = document.getElementById('pageCardScroll');
  contentEl = document.getElementById('pageCardContent');
  if (!cardEl) return;

  document.querySelectorAll('[data-spa]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.dataset.spa === 'work') {
        // history.back() is async: popstate (which clears these guards)
        // lands a tick later. Without the navigatingBack latch a second
        // rapid Work click would fire a second back(), walking past the
        // single SPA entry and the gallery base → full page reload.
        if (open && !navigatingBack && history.state?.page) {
          navigatingBack = true;
          history.back(); // popstate slides the card away
        }
      } else {
        openPage(a.dataset.spa, true);
      }
    });
  });

  window.addEventListener('popstate', () => {
    navigatingBack = false; // the in-flight back() has landed
    const path = location.pathname.replace(/\.html$/, '');
    const page = Object.keys(PAGES).find((p) =>
      path.endsWith(PAGES[p].replace(/\.html$/, ''))
    );
    if (page) openPage(page, false);
    else closePage();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open && !navigatingBack && !isLeadOpen() && history.state?.page) {
      navigatingBack = true;
      history.back();
    }
  });

  scrollEl.addEventListener('scroll', onScroll, { passive: true });
}
