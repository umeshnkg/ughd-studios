// Checks: (1) opening the filter panel doesn't move the main nav,
// (2) the panel entrance animation actually plays (mid-flight transform),
// (3) LYRIC VIDEO subcategories unfurl via transition instead of popping.
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

const navRect = () => page.evaluate(() => {
  const r = document.querySelector('.mainnav').getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y) };
});

// 1+2: open panel, sample nav position and panel transform mid-animation
const navBefore = await navRect();
await page.click('#filterBtn');
await sleep(100);
const midPanel = await page.evaluate(() => {
  const p = document.getElementById('filterPanel');
  const cs = getComputedStyle(p);
  return { display: cs.display, transform: cs.transform, opacity: cs.opacity };
});
await page.screenshot({ path: `${OUT}/f-1-panel-midflight.png` });
const navAfter = await navRect();
await sleep(600);
await page.screenshot({ path: `${OUT}/f-2-panel-open.png` });

console.log('nav before:', navBefore, '| nav after open:', navAfter);
console.log('panel @100ms:', midPanel);
if (navBefore.x !== navAfter.x || navBefore.y !== navAfter.y)
  errors.push(`nav moved when panel opened (${JSON.stringify(navBefore)} -> ${JSON.stringify(navAfter)})`);
if (midPanel.transform === 'none' && midPanel.opacity === '1')
  errors.push('panel entrance animation did not play (already settled at 100ms)');

// 3: open LYRIC VIDEO subcategories, sample max-height mid-transition
const subState = () => page.evaluate(() => {
  const sp = document.querySelector('.filter-subpanel');
  const cs = getComputedStyle(sp);
  return { maxHeight: cs.maxHeight, opacity: cs.opacity, visibility: cs.visibility, height: sp.getBoundingClientRect().height };
});
const subBefore = await subState();
await page.$$eval('#filterPanel button', (btns) => {
  btns.find((x) => x.textContent === 'LYRIC VIDEO').click();
});
await sleep(120);
const subMid = await subState();
await page.screenshot({ path: `${OUT}/f-3-sub-midflight.png` });
await sleep(600);
const subEnd = await subState();
await page.screenshot({ path: `${OUT}/f-4-sub-open.png` });

console.log('sub closed:', subBefore);
console.log('sub @120ms:', subMid, '| settled:', subEnd);
if (subBefore.height !== 0) errors.push('subpanel visible while closed');
if (subBefore.visibility !== 'hidden') errors.push('closed subpanel not visibility:hidden');
if (!(subMid.height > 0 && subMid.height < subEnd.height))
  errors.push(`subpanel did not unfurl gradually (mid=${subMid.height}, end=${subEnd.height})`);
if (subEnd.visibility !== 'visible' || subEnd.opacity !== '1')
  errors.push('subpanel did not fully reveal');

// close subpanel again — should collapse smoothly, not pop
await page.$$eval('#filterPanel button', (btns) => {
  btns.find((x) => x.textContent === 'LYRIC VIDEO').click();
});
await sleep(120);
const subClosing = await subState();
await sleep(600);
const subClosed = await subState();
console.log('sub closing @120ms:', subClosing, '| closed:', subClosed);
if (!(subClosing.height > 0 && subClosing.height < subEnd.height))
  errors.push('subpanel close did not animate');
if (subClosed.height !== 0) errors.push('subpanel did not fully close');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
