// Captures the homepage and zoomed corner crops to inspect the lens
// edge-blur quality. Usage: node scripts/verify-blur.mjs <label>
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const LABEL = process.argv[2] || 'shot';
const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/.cache/chrome-for-testing/chrome/mac_arm-149.0.7827.115/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const OUT = '/tmp/ughd-blur';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1600,1000', '--mute-audio'],
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 2 },
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
// park the cursor dead center so parallax is neutral and both runs match
await page.mouse.move(800, 500);
await sleep(3500);

await page.screenshot({ path: `${OUT}/${LABEL}-full.png` });
// corner crops, 480x320 each (CSS px; 2x DPR in the file)
const crops = {
  'top-left': { x: 0, y: 0 },
  'top-right': { x: 1120, y: 0 },
  'bottom-left': { x: 0, y: 680 },
  'bottom-right': { x: 1120, y: 680 },
};
for (const [name, c] of Object.entries(crops)) {
  await page.screenshot({
    path: `${OUT}/${LABEL}-${name}.png`,
    clip: { x: c.x, y: c.y, width: 480, height: 320 },
  });
}

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
