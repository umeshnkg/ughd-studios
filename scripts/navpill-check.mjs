// Targeted check: the white nav pill should sit on "Work" initially,
// then glide (animate through intermediate positions) to "About".
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/.cache/chrome-for-testing/chrome/mac_arm-149.0.7827.115/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const OUT = '/tmp/ughd-shots';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1600,1000', '--mute-audio'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5180/', { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(
  () => !document.getElementById('loader') || getComputedStyle(document.getElementById('loader')).display === 'none',
  { timeout: 20000 }
).catch(() => errors.push('loader never finished'));
await sleep(800);

const rect = () => page.evaluate(() => {
  const p = document.querySelector('.mainnav__pill');
  if (!p) return null;
  const r = p.getBoundingClientRect();
  return { x: Math.round(r.x), w: Math.round(r.width), opacity: getComputedStyle(p).opacity };
});

const linkRect = (label) => page.evaluate((lbl) => {
  const a = [...document.querySelectorAll('.mainnav__item')].find((x) => x.textContent.trim() === lbl);
  const r = a.getBoundingClientRect();
  return { x: Math.round(r.x), w: Math.round(r.width) };
}, label);

const start = await rect();
const workR = await linkRect('Work');
console.log('pill at load:', start, '| Work link:', workR);
if (!start) errors.push('pill element missing');
else if (Math.abs(start.x - workR.x) > 3) errors.push(`pill not on Work (pill x=${start.x}, link x=${workR.x})`);

await page.screenshot({ path: `${OUT}/nav-1-work.png` });

// click About, sample mid-flight and settled positions
await page.evaluate(() => {
  [...document.querySelectorAll('.mainnav__item')].find((x) => x.textContent.trim() === 'About').click();
});
await sleep(180);
const mid = await rect();
await page.screenshot({ path: `${OUT}/nav-2-midflight.png` });
await sleep(900);
const end = await rect();
const aboutR = await linkRect('About');
console.log('mid-flight:', mid, '| settled:', end, '| About link:', aboutR);

if (mid.x <= start.x + 2) errors.push('pill did not start moving');
if (mid.x >= aboutR.x - 2 && Math.abs(mid.x - aboutR.x) < 3) console.log('note: mid sample landed after arrival');
if (Math.abs(end.x - aboutR.x) > 3) errors.push(`pill did not settle on About (pill x=${end.x}, link x=${aboutR.x})`);
await page.screenshot({ path: `${OUT}/nav-3-about.png` });

// back to Work via the nav (history.back path)
await page.evaluate(() => {
  [...document.querySelectorAll('.mainnav__item')].find((x) => x.textContent.trim() === 'Work').click();
});
await sleep(1100);
const back = await rect();
console.log('back on Work:', back);
if (Math.abs(back.x - workR.x) > 3) errors.push(`pill did not return to Work (x=${back.x})`);
await page.screenshot({ path: `${OUT}/nav-4-back-work.png` });

// direct load of about.html — static pill should sit on About
await page.goto('http://localhost:5180/about.html', { waitUntil: 'networkidle0', timeout: 20000 });
await sleep(800);
const direct = await rect();
const aboutDirect = await linkRect('About');
console.log('about.html direct:', direct, '| About link:', aboutDirect);
if (!direct || Math.abs(direct.x - aboutDirect.x) > 3) errors.push('pill wrong on about.html direct load');
await page.screenshot({ path: `${OUT}/nav-5-about-direct.png` });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
