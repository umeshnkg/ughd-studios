// Screenshots the careers page (standalone) and the SPA card flow
// (gallery -> Careers via bottom nav) into /tmp/ughd-careers-shots.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/.cache/chrome-for-testing/chrome/mac_arm-149.0.7827.115/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const OUT = '/tmp/ughd-careers-shots';
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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- standalone careers page ----
await page.goto('http://localhost:5180/careers.html', { waitUntil: 'networkidle0', timeout: 30000 });
await sleep(1800);
await page.screenshot({ path: `${OUT}/1-careers-top.png` });

await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.28 }));
await sleep(1400);
await page.screenshot({ path: `${OUT}/2-careers-values.png` });

await page.evaluate(() => document.getElementById('open-roles').scrollIntoView());
await sleep(1400);
await page.screenshot({ path: `${OUT}/3-careers-roles.png` });

await page.evaluate(() => document.getElementById('role-motion-graphics').scrollIntoView());
await sleep(1400);
await page.screenshot({ path: `${OUT}/4-careers-job.png` });

await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
await sleep(1400);
await page.screenshot({ path: `${OUT}/5-careers-footer.png` });

// ---- SPA flow: gallery -> Careers card -> About swap -> back to work ----
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(
  () => !document.getElementById('loader') || getComputedStyle(document.getElementById('loader')).display === 'none',
  { timeout: 20000 }
).catch(() => errors.push('loader never finished'));
await sleep(2500);

await page.click('[data-spa="careers"]');
await sleep(2200);
await page.screenshot({ path: `${OUT}/6-spa-careers-card.png` });

// scroll inside the card
await page.evaluate(() => {
  const s = document.getElementById('pageCardScroll');
  s.scrollTop = s.scrollHeight * 0.45;
});
await sleep(1400);
await page.screenshot({ path: `${OUT}/7-spa-careers-scrolled.png` });

// swap to About while the card is open
await page.click('[data-spa="about"]');
await sleep(1600);
await page.screenshot({ path: `${OUT}/8-spa-swap-about.png` });

// back to Work — card slides away
await page.click('[data-spa="work"]');
await sleep(1600);
await page.screenshot({ path: `${OUT}/9-spa-back-to-work.png` });

console.log('url after flow:', page.url());
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
