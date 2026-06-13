// Generate optimized thumbnail variants for the gallery.
//
// The gallery draws each thumbnail into a fixed 1024×920 canvas texture
// (730×502 artwork box), so the source never needs to exceed ~1280px — the
// texture, not the source, is the sharpness ceiling. We therefore re-encode
// to modern formats at native width (capped at FULL_W) and add a smaller
// `@sm` tier for mobile / slow connections. Originals stay as the universal
// <img> fallback.
//
// Output: public/thumbs/opt/<slug>.{avif,webp} and <slug>@sm.{avif,webp}
// Idempotent — skips a variant whose mtime is newer than its source.
//
// Run: npm run optimize:images   (also runs automatically on prebuild)

import { readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'public', 'thumbs');
const OUT_DIR = join(SRC_DIR, 'opt');

const FULL_W = 1280; // never upscale past the source; texture caps usefulness here
const SM_W = 640; // mobile / Save-Data tier

// Portfolio quality. AVIF sits ~10pts below the equivalent WebP/JPEG number.
const TIERS = [
  { suffix: '', width: FULL_W, avifQ: 62, webpQ: 80 },
  { suffix: '@sm', width: SM_W, avifQ: 50, webpQ: 70 },
];

const SOURCE_RE = /\.(jpe?g|png|webp)$/i;

async function isStale(outPath, srcMtimeMs) {
  if (!existsSync(outPath)) return true;
  const { mtimeMs } = await stat(outPath);
  return mtimeMs < srcMtimeMs;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(SRC_DIR)).filter((f) => SOURCE_RE.test(f));

  let written = 0;
  let skipped = 0;
  const flagged = [];

  for (const file of files) {
    const srcPath = join(SRC_DIR, file);
    const { name: slug } = parse(file);
    const { mtimeMs: srcMtime } = await stat(srcPath);
    const meta = await sharp(srcPath).metadata();

    // Sources under the artwork box (730px) are upscaled into it and read a
    // touch soft — flag them so they can be re-exported at higher res later.
    if (meta.width < 730) flagged.push(`${file} (${meta.width}×${meta.height})`);

    for (const tier of TIERS) {
      // Only resize down; never enlarge beyond the native width.
      const targetW = Math.min(tier.width, meta.width);
      const base = join(OUT_DIR, `${slug}${tier.suffix}`);

      const jobs = [
        { ext: 'avif', opts: { quality: tier.avifQ, effort: 4, chromaSubsampling: '4:2:0' } },
        { ext: 'webp', opts: { quality: tier.webpQ, effort: 5 } },
      ];

      for (const { ext, opts } of jobs) {
        const outPath = `${base}.${ext}`;
        if (!(await isStale(outPath, srcMtime))) {
          skipped++;
          continue;
        }
        await sharp(srcPath)
          .resize({ width: targetW, withoutEnlargement: true })
          [ext](opts)
          .toFile(outPath);
        written++;
      }
    }
  }

  console.log(`optimize-images: ${written} written, ${skipped} up-to-date, ${files.length} sources`);
  if (flagged.length) {
    console.log(`\n  ⚠ low-res sources (<730px, soft in the gallery — consider re-exporting):`);
    for (const f of flagged) console.log(`    - ${f}`);
  }
}

run().catch((err) => {
  console.error('optimize-images failed:', err);
  process.exit(1);
});
