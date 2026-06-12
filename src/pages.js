// ============================================================
// Page-card overlay — "Work" (the gallery) is the permanent home
// page; other pages load into a card that slides up over it. Going
// back / pressing Work just slides the card away — no reload, the
// gallery keeps living underneath.
// ============================================================
import gsap from 'gsap';
import { setWash } from './audio.js';
import { isLeadOpen } from './leadform.js';

const PAGES = {
  about: '/about.html',
  careers: '/careers.html',
};

let cardEl, scrollEl, contentEl;
let open = false;
let animating = false;
let currentPage = null;
const pageCache = {}; // page -> cached <main> element

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
  if (animating) return;
  if (open && currentPage === page) return;
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

  if (open) {
    // card already up (e.g. About -> Careers): swap content in place, no animation
    animating = false;
    showPage(page, main);
    return;
  }
  showPage(page, main);
  open = true;
  document.body.classList.add('page-open');
  cardEl.style.visibility = 'visible';
  cardEl.setAttribute('aria-hidden', 'false');
  scrollEl.scrollTop = 0;

  gsap.timeline({ onComplete: () => (animating = false) })
    .set(scrollEl, { borderTopLeftRadius: 26, borderTopRightRadius: 26 })
    .fromTo(cardEl, { y: '100%' }, { y: 0, duration: 0.9, ease: 'power4.inOut' })
    .to('#scene', { scale: 0.94, opacity: 0.5, duration: 0.9, ease: 'power4.inOut' }, 0)
    .to(scrollEl, { borderTopLeftRadius: 0, borderTopRightRadius: 0, duration: 0.3 }, '-=0.1');
}

function closePage() {
  if (!open) return;
  open = false;
  currentPage = null;
  setActive('work');
  setWash(0);

  gsap.timeline({
    onComplete: () => {
      cardEl.style.visibility = 'hidden';
      cardEl.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('page-open');
    },
  })
    .set(scrollEl, { borderTopLeftRadius: 26, borderTopRightRadius: 26 })
    .to(cardEl, { y: '100%', duration: 0.8, ease: 'power4.inOut' })
    .to('#scene', { scale: 1, opacity: 1, duration: 0.8, ease: 'power4.inOut' }, 0);
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
        if (open) history.back(); // popstate slides the card away
      } else {
        openPage(a.dataset.spa, true);
      }
    });
  });

  window.addEventListener('popstate', () => {
    const path = location.pathname.replace(/\.html$/, '');
    const page = Object.keys(PAGES).find((p) =>
      path.endsWith(PAGES[p].replace(/\.html$/, ''))
    );
    if (page) openPage(page, false);
    else closePage();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open && !isLeadOpen()) history.back();
  });

  scrollEl.addEventListener('scroll', onScroll, { passive: true });
}
