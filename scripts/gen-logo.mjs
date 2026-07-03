// @ts-check
/**
 * Rasterize images/logo/logo.svg into transparent PNGs at several sizes.
 *
 *   node scripts/gen-logo.mjs
 *
 * Requires the Playwright chromium browser (npm run screenshots:install).
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SVG_PATH = resolve(ROOT, "images/logo/logo.svg");
const OUT_DIR = resolve(ROOT, "images/logo");
const SIZES = [512, 256, 128, 64];

const svg = await readFile(SVG_PATH, "utf8");

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:transparent}
      svg{display:block;width:${size}px;height:${size}px}
    </style></head><body>${svg}</body></html>`;
    await page.setContent(html, { waitUntil: "networkidle" });
    const el = await page.$("svg");
    if (!el) throw new Error("svg element not found");
    const out = resolve(OUT_DIR, `logo-${size}.png`);
    await el.screenshot({ path: out, omitBackground: true });
    await page.close();
    console.log(`wrote ${out}`);
  }
  // HACS / README icon = 256px copy
  await copyFile(resolve(OUT_DIR, "logo-256.png"), resolve(OUT_DIR, "icon.png"));
  console.log(`wrote ${resolve(OUT_DIR, "icon.png")}`);
} finally {
  await browser.close();
}
