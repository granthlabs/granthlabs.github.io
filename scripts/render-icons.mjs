/**
 * Rasterise favicon.svg into the PNG sizes browsers still ask for.
 *
 *     node scripts/render-icons.mjs
 *
 * Generated rather than hand-drawn so the PNGs cannot drift from the SVG — the
 * usual failure being a favicon updated in one format and not the other, which
 * nobody notices because each browser only fetches one of them.
 *
 * Uses the Playwright browser already installed for the test suites rather than
 * adding an image library for two files.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'docs/public/favicon.svg');
const svg = readFileSync(SRC, 'utf8');

const SIZES = [
  { file: 'favicon-32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();
for (const { file, size } of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // The SVG is inlined rather than loaded from disk so there is no chance of
  // rendering a stale copy from the build output.
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    { waitUntil: 'load' }
  );
  const buf = await page.screenshot({ omitBackground: true });
  writeFileSync(join(ROOT, 'docs/public', file), buf);
  console.log(`${file.padEnd(22)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
  await page.close();
}
await browser.close();

/**
 * A minimal .ico wrapping the 32px PNG.
 *
 * The ICO container permits a PNG payload, which every browser that still asks
 * for favicon.ico understands — so this is a 22-byte header rather than a BMP
 * encoder. Written by hand because pulling in an image library to emit one
 * header would be the larger dependency.
 */
const png32 = readFileSync(join(ROOT, 'docs/public/favicon-32.png'));
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);            // reserved
header.writeUInt16LE(1, 2);            // type: icon
header.writeUInt16LE(1, 4);            // one image
header.writeUInt8(32, 6);              // width
header.writeUInt8(32, 7);              // height
header.writeUInt8(0, 8);               // palette: none
header.writeUInt8(0, 9);               // reserved
header.writeUInt16LE(1, 10);           // colour planes
header.writeUInt16LE(32, 12);          // bits per pixel
header.writeUInt32LE(png32.length, 14);
header.writeUInt32LE(22, 18);          // payload offset
writeFileSync(join(ROOT, 'docs/public/favicon.ico'), Buffer.concat([header, png32]));
console.log(`favicon.ico           wraps the 32px PNG  ${((22 + png32.length) / 1024).toFixed(1)} kB`);
