// Drives the gallery in Chrome for Testing via puppeteer-core and
// captures screenshots of each interaction state into /tmp/ughd-shots.
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
  args: ['--window-size=1600,1000', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1600, height: 1000 },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5180/', { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(
  () => !document.getElementById('loader') || getComputedStyle(document.getElementById('loader')).display === 'none',
  { timeout: 20000 }
).catch(() => errors.push('loader never finished'));
await sleep(3000);

await page.screenshot({ path: `${OUT}/1-initial.png` });

// parallax: park cursor at left edge, then right edge
await page.mouse.move(60, 500);
await sleep(1600);
await page.screenshot({ path: `${OUT}/2-parallax-left.png` });
await page.mouse.move(1540, 500);
await sleep(1600);
await page.screenshot({ path: `${OUT}/3-parallax-right.png` });

// drag to orbit + inertia
await page.mouse.move(800, 500);
await page.mouse.down();
for (let i = 0; i < 25; i++) {
  await page.mouse.move(800 - i * 16, 500 - i * 4);
  await sleep(12);
}
await page.mouse.up();
await sleep(2200);
await page.screenshot({ path: `${OUT}/4-after-drag.png` });

// find a point that actually sits on a card (the grid has gaps between
// tiles, so a fixed point can land in a gap depending on drift)
async function findCardPoint() {
  for (const y of [480, 380, 620, 300, 700]) {
    for (const x of [800, 650, 950, 500, 1100]) {
      await page.mouse.move(x, y);
      await sleep(250);
      const cur = await page.evaluate(
        () => document.getElementById('scene').style.cursor
      );
      if (cur === 'pointer') return { x, y };
    }
  }
  return null;
}

let cardPoint = await findCardPoint();
if (!cardPoint) {
  errors.push('no hoverable card found');
  cardPoint = { x: 800, y: 480 };
}

// hover long enough for the haze to bloom + drift
await page.mouse.move(cardPoint.x, cardPoint.y);
await sleep(1800);
await page.screenshot({ path: `${OUT}/5-hover-haze.png` });

// idle drift may have slid a tile gap under the cursor during the haze
// wait — re-probe just before clicking so the tap lands on a card
cardPoint = (await findCardPoint()) || cardPoint;

// click to open detail
await page.mouse.click(cardPoint.x, cardPoint.y, { delay: 40 });
await sleep(2200);
await page.screenshot({ path: `${OUT}/6-detail.png` });

await page.click('#detailBack').catch(() => errors.push('back button not clickable'));
await sleep(1600);

// filter reflow: matched cards should regroup mid-view
await page.click('#filterBtn');
await sleep(300);
const clicked = await page.$$eval('#filterPanel button', (btns) => {
  const b = btns.find((x) => x.textContent === 'ARTWORK');
  if (b) b.click();
  return !!b;
});
if (!clicked) errors.push('ARTWORK filter button missing');
await sleep(2000);
await page.screenshot({ path: `${OUT}/7-filter-reflow.png` });

// back to ALL — cards walk home
await page.$$eval('#filterPanel button', (btns) => {
  btns.find((x) => x.textContent === 'ALL')?.click();
});
await sleep(2200);
await page.screenshot({ path: `${OUT}/8-filter-all.png` });

// about page, if present
const res = await page.goto('http://localhost:5180/about.html', { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => null);
if (res && res.ok()) {
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/9-about-top.png` });
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2 }));
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/10-about-mid.png` });
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/11-about-end.png` });
}

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
