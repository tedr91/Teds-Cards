// @ts-check
/**
 * Rasterize images/logo4/logo.svg (the "TED over CARDS" wordmark) into PNGs.
 *   node scripts/gen-logo4.mjs
 * Outputs in images/logo4/:
 *   logo-1024.png,        logo-512.png          transparent (light-theme colors)
 *   logo-ondark-1024.png, logo-ondark-512.png   transparent (lighter rule/CARDS for dark themes)
 *   logo-light.png,       logo-dark.png         padded on light/dark backgrounds (1024w)
 * Requires the Playwright chromium browser (npm run screenshots:install).
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "images/logo4");
const svgLight = await readFile(join(DIR, "logo.svg"), "utf8");
// dark-theme variant: lift the charcoal rule + gray CARDS so they read on dark backgrounds
const svgDark = svgLight.replace(/#363b43/g, "#7c8590").replace(/#8a929c/g, "#b9c0c9");
const AR = 190 / 360;

const browser = await chromium.launch();
async function transparent(svg, W, name) {
  const page = await browser.newPage({ viewport: { width: W, height: Math.round(W * AR) }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${W}px;height:auto}</style>${svg}`,
    { waitUntil: "networkidle" });
  const el = await page.$("svg");
  if (!el) throw new Error("svg not found");
  await el.screenshot({ path: join(DIR, name), omitBackground: true });
  await page.close();
  console.log("wrote", name);
}
async function padded(svg, bg, name) {
  const W = 1024, P = 90, inner = W - 2 * P;
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}#c{display:inline-block;background:${bg};padding:${P}px}svg{display:block;width:${inner}px;height:auto}</style><div id="c">${svg}</div>`,
    { waitUntil: "networkidle" });
  const el = await page.$("#c");
  if (!el) throw new Error("container not found");
  await el.screenshot({ path: join(DIR, name) });
  await page.close();
  console.log("wrote", name);
}
try {
  await transparent(svgLight, 1024, "logo-1024.png");
  await transparent(svgLight, 512, "logo-512.png");
  await transparent(svgDark, 1024, "logo-ondark-1024.png");
  await transparent(svgDark, 512, "logo-ondark-512.png");
  await padded(svgLight, "#eef1f5", "logo-light.png");
  await padded(svgDark, "#14161a", "logo-dark.png");
} finally {
  await browser.close();
}
console.log("done → images/logo4/");
