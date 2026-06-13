// ============================================================
// Curated copy for the in-VR content stations. Mirrors about.html /
// the footer so the headset experience reads like the whole studio.
// Kept here (not scraped from the DOM at runtime) so it's stable and
// easy to tune for big-text readability. Update alongside about.html.
// ============================================================

export const CONTACT_URL = 'https://ughdstudios.com/';

export const ABOUT = {
  story:
    'UGHD Studios is a creative studio for musicians and record labels. We partner ' +
    'with major labels and independent artists alike, turning songs into visuals — ' +
    'and visuals into audiences — for more than a decade.',
  disciplines: [
    { name: 'Production', body: 'Motion, lyric & animated music videos, 3D, VFX and editing — built to carry official releases worldwide.' },
    { name: 'Design', body: 'Cover artwork, illustration and visual systems that give every record a face before it makes a sound.' },
    { name: 'Marketing', body: 'YouTube & Spotify optimisation, social campaigns and release strategy that reach the right ears.' },
  ],
  studios: [
    { name: 'UGHD® — UNITED STATES', addr: '2035 Sunset Lake Road, Suite B-2, Newark, Delaware 19702' },
    { name: 'UGHD® — SRI LANKA', addr: 'Colombo, Sri Lanka' },
  ],
  partners: 'Sony Music · Warner Records · BMG · VEVO · Spinnin\' · Global · Imagine Dragons · Camila Cabello · 50 Cent · Green Day · Zedd · J.Lo · Krewella',
};

export const STATS = [
  { big: '10+', label: 'YEARS' },
  { big: 'BILLIONS', label: 'OF VIEWS' },
  { big: 'SONY · WARNER · BMG', label: 'TRUSTED BY' },
];

export const CONTACT = {
  title: "LET'S TALK",
  sub: 'Scan to start a project — we usually reply within 24 hours.',
  email: 'contact@ughdstudios.com',
  phone: '+1 606 227 4600',
};
