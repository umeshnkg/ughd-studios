// ============================================================
// Lead form — glass modal opened by the "Let's Talk" buttons.
// No backend: submit composes a prefilled email to the studio.
// ============================================================
import gsap from 'gsap';

const ROLES = ['Indie Artist', 'Artist Manager', 'Label', 'Hobbyist', 'Other'];
const BUDGETS = ['<$10K', '$10–20K', '$20K+'];
const TIMELINES = [
  'Immediately (<1 Week)',
  '2–4 Weeks',
  '3–6 Months',
  'Just Exploring Options',
];
const SOURCES = [
  'Referral / Past Client',
  'Google',
  'AI Search',
  'Instagram',
  'TikTok',
  'YouTube',
  'LinkedIn',
  'Other',
];

function pills(name, items, type) {
  return items
    .map(
      (v) => `
      <label class="lead__pill">
        <input type="${type}" name="${name}" value="${v}" />
        <span>${v}</span>
      </label>`
    )
    .join('');
}

const MARKUP = `
  <div class="lead__backdrop" data-lead-close></div>
  <form class="lead__card" novalidate>
    <button class="lead__close" type="button" data-lead-close aria-label="Close">
      <svg viewBox="0 0 14 14" width="14" height="14"><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M2 2l10 10M12 2L2 12"/></svg>
    </button>

    <h2 class="lead__title">Let's Talk</h2>
    <p class="lead__sub">Tell us about your project — we usually reply within 24 hours.</p>

    <label class="lead__field">
      <span>Name *</span>
      <input name="name" type="text" autocomplete="name" required />
    </label>

    <fieldset class="lead__group">
      <legend>Role</legend>
      <div class="lead__pills">${pills('role', ROLES, 'radio')}</div>
    </fieldset>

    <div class="lead__row">
      <label class="lead__field">
        <span>Email *</span>
        <input name="email" type="email" autocomplete="email" required />
      </label>
      <label class="lead__field">
        <span>Phone (optional)</span>
        <input name="phone" type="tel" autocomplete="tel" />
      </label>
    </div>

    <label class="lead__field">
      <span>Message</span>
      <textarea name="message" rows="5" placeholder="What are we making together?"></textarea>
    </label>

    <fieldset class="lead__group">
      <legend>Budget</legend>
      <div class="lead__pills">${pills('budget', BUDGETS, 'radio')}</div>
    </fieldset>

    <fieldset class="lead__group">
      <legend>Timeline</legend>
      <div class="lead__pills">${pills('timeline', TIMELINES, 'radio')}</div>
    </fieldset>

    <fieldset class="lead__group">
      <legend>Where did you hear about me?</legend>
      <div class="lead__pills">${pills('source', SOURCES, 'checkbox')}</div>
    </fieldset>

    <p class="lead__error" aria-live="polite"></p>
    <button class="btn btn--light lead__submit" type="submit">Send Inquiry</button>
  </form>
`;

let modal = null;
let leadOpen = false;

export function isLeadOpen() {
  return leadOpen;
}

function openLead() {
  if (leadOpen) return;
  leadOpen = true;
  document.body.classList.add('lead-open');
  modal.style.visibility = 'visible';
  modal.setAttribute('aria-hidden', 'false');
  const card = modal.querySelector('.lead__card');
  card.scrollTop = 0;
  gsap.fromTo(modal, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' });
  gsap.fromTo(
    card,
    { y: 26, scale: 0.96 },
    { y: 0, scale: 1, duration: 0.55, ease: 'power3.out' }
  );
}

function closeLead() {
  if (!leadOpen) return;
  leadOpen = false;
  document.body.classList.remove('lead-open');
  gsap.to(modal, {
    opacity: 0,
    duration: 0.3,
    ease: 'power2.in',
    onComplete: () => {
      modal.style.visibility = 'hidden';
      modal.setAttribute('aria-hidden', 'true');
    },
  });
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const error = form.querySelector('.lead__error');
  const submit = form.querySelector('.lead__submit');

  const name = (fd.get('name') || '').toString().trim();
  const email = (fd.get('email') || '').toString().trim();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    error.textContent = 'Please add your name and a valid email.';
    return;
  }
  error.textContent = '';

  submit.textContent = 'Sending…';
  submit.disabled = true;

  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        role: fd.get('role') || '',
        phone: (fd.get('phone') || '').toString().trim(),
        budget: fd.get('budget') || '',
        timeline: fd.get('timeline') || '',
        source: fd.getAll('source'),
        message: (fd.get('message') || '').toString().trim(),
      }),
    });

    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || 'Submission failed.');

    submit.textContent = 'Sent!';
    setTimeout(() => {
      submit.textContent = 'Send Inquiry';
      submit.disabled = false;
      closeLead();
    }, 1400);
  } catch {
    error.textContent = 'Something went wrong — please email us at contact@ughdstudios.com';
    submit.textContent = 'Send Inquiry';
    submit.disabled = false;
  }
}

export function initLeadForm() {
  modal = document.createElement('div');
  modal.className = 'lead';
  modal.id = 'lead';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = MARKUP;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-lead-close]').forEach((el) => {
    el.addEventListener('click', closeLead);
  });
  modal.querySelector('form').addEventListener('submit', onSubmit);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && leadOpen) closeLead();
  });

  document.querySelectorAll('.btn--talk').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openLead();
    });
  });
}
