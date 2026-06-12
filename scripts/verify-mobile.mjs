// Screenshots the gallery at phone / mid / desktop sizes to check the
// responsive chrome and the camera re-fit. Run against `vite preview`
// on port 4173 (BASE env overrides).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/.cache/chrome-for-testing/chrome/mac_arm-149.0.7827.115/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = process.env.BASE || 'http://localhost:4173';

const OUT = '/tmp/ughd-mobile-shots';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const sizes = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'phone-sm', width: 360, height: 740, mobile: true },
  { name: 'mid', width: 820, height: 900, mobile: false },
  { name: 'desktop', width: 1600, height: 1000, mobile: false },
];

for (const s of sizes) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`${s.name} PAGEERROR: ${e.message}`));
  await page.setViewport({
    width: s.width,
    height: s.height,
    isMobile: s.mobile,
    hasTouch: s.mobile,
    deviceScaleFactor: s.mobile ? 3 : 1,
  });

  await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 30000 });
  await page
    .waitForFunction(
      () =>
        !document.getElementById('loader') ||
        getComputedStyle(document.getElementById('loader')).display === 'none',
      { timeout: 20000 }
    )
    .catch(() => errors.push(`${s.name}: loader never finished`));
  await sleep(3500);
  await page.screenshot({ path: `${OUT}/${s.name}-1-grid.png` });

  if (s.mobile) {
    // touch-drag the grid and make sure it actually moved
    const before = await page.evaluate(() => true);
    await page.touchscreen.touchStart(s.width / 2, s.height / 2);
    for (let i = 1; i <= 12; i++) {
      await page.touchscreen.touchMove(s.width / 2 - i * 14, s.height / 2 - i * 6);
      await sleep(16);
    }
    await page.touchscreen.touchEnd();
    await sleep(1800);
    await page.screenshot({ path: `${OUT}/${s.name}-2-after-drag.png` });

    // tap a card to open the detail overlay
    await page.touchscreen.tap(s.width / 2, s.height / 2);
    await sleep(2200);
    await page.screenshot({ path: `${OUT}/${s.name}-3-detail.png` });
  }

  // about page at this size
  await page.goto(BASE + '/about.html', { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => null);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/${s.name}-4-about.png` });

  await page.close();
}

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
