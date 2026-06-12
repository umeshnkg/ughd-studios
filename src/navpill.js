// ============================================================
// Sliding nav pill — the white "active" highlight is one element
// that glides between Work / About / Careers instead of each link
// painting its own background. A MutationObserver follows is-active
// changes, so pages.js (SPA) needs no hook; about/careers direct
// loads just get a static pill on their active link.
// ============================================================

let nav, pill;

function place(animate) {
  const active = nav.querySelector('.mainnav__item.is-active');
  if (!active) {
    pill.style.opacity = '0';
    return;
  }
  if (!animate) pill.classList.add('is-snapped');
  pill.style.opacity = '1';
  pill.style.top = `${active.offsetTop}px`;
  pill.style.height = `${active.offsetHeight}px`;
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.transform = `translateX(${active.offsetLeft}px)`;
  if (!animate) {
    void pill.offsetWidth; // flush styles so the jump isn't transitioned
    pill.classList.remove('is-snapped');
  }
}

export function initNavPill() {
  nav = document.querySelector('.mainnav');
  if (!nav || pill) return;
  pill = document.createElement('span');
  pill.className = 'mainnav__pill';
  pill.setAttribute('aria-hidden', 'true');
  nav.prepend(pill);
  place(false);

  window.addEventListener('resize', () => place(false));
  document.fonts?.ready.then(() => place(false)); // widths shift once Space Grotesk lands
  new MutationObserver((muts) => {
    // ignore our own is-snapped toggles or every snap re-fires the observer
    if (muts.some((m) => m.target !== pill)) place(true);
  }).observe(nav, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
}
