// @ts-check
/**
 * Halftone variant explorer: reuses images/_logo-work/cutout.png (no ML rerun).
 * Builds circle badges for two crops (tight head / full) across several dot sizes.
 *   node scripts/gen-halftone-variants.mjs
 * Writes images/_logo-work/variants/halftone_<crop>_s<S>.png
 */
import Jimp from "jimp";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = resolve(ROOT, "images/_logo-work");
const OUT = resolve(WORK, "variants");
const N = 512, INNER = 452;
await mkdir(OUT, { recursive: true });

const lerp = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const inCircle = (x, y, cx, cy, r) => { const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r; };
const DOT = [76, 134, 214], BG_TOP = [238, 245, 253], BG_BOT = [214, 230, 247], RING = [176, 201, 232];

const cutout = await Jimp.read(join(WORK, "cutout.png"));

/** reframe cutout by fraction f of bbox height (top-anchored square). f>=1 = full subject. */
function reframe(f) {
  const d = cutout.bitmap.data;
  let minX = N, minY = N, maxX = 0, maxY = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    if (d[(y * N + x) * 4 + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  let cx, cy, cw, ch;
  if (f < 1) {
    const size = Math.round(bh * f);
    cw = ch = size;
    cx = Math.round((minX + maxX) / 2 - size / 2);
    cy = minY; // top of cap
  } else {
    cx = minX; cy = minY; cw = bw; ch = bh;
  }
  cx = Math.max(0, cx); cy = Math.max(0, cy);
  cw = Math.min(N - cx, cw); ch = Math.min(N - cy, ch);
  const sub = cutout.clone().crop(cx, cy, cw, ch);
  sub.scaleToFit(INNER, INNER);
  const c = new Jimp(N, N, 0x00000000);
  c.composite(sub, Math.round((N - sub.bitmap.width) / 2), Math.round((N - sub.bitmap.height) / 2));
  return c;
}

/** halftone treatment from a framed cutout at cell spacing S */
function halftone(framed, S) {
  const px = framed.bitmap.data;
  const img = new Jimp(N, N, 0x00000000), o = img.bitmap.data;
  const R = S * 0.62, at = (x, y) => (y * N + x) * 4;
  for (let cy = S / 2; cy < N; cy += S) for (let cx = S / 2; cx < N; cx += S) {
    const ix = Math.round(cx), iy = Math.round(cy);
    if (ix >= N || iy >= N || px[at(ix, iy) + 3] < 128) continue;
    const t = lum(px[at(ix, iy)], px[at(ix, iy) + 1], px[at(ix, iy) + 2]) / 255;
    const rad = (1 - t) * R; if (rad < 0.5) continue;
    const r2 = rad * rad, cr = Math.ceil(rad);
    for (let dy = -cr; dy <= cr; dy++) for (let dx = -cr; dx <= cr; dx++) {
      const xx = ix + dx, yy = iy + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N || dx * dx + dy * dy > r2 || px[at(xx, yy) + 3] < 60) continue;
      const j = at(xx, yy); o[j] = DOT[0]; o[j + 1] = DOT[1]; o[j + 2] = DOT[2]; o[j + 3] = 255;
    }
  }
  return img;
}

function badge(treatment) {
  const cx = 256, cy = 256, R = 236;
  const coin = new Jimp(N, N, 0x00000000), c = coin.bitmap.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inCircle(x, y, cx, cy, R)) continue;
    const j = (y * N + x) * 4, col = lerp(BG_TOP, BG_BOT, y / N);
    c[j] = col[0]; c[j + 1] = col[1]; c[j + 2] = col[2]; c[j + 3] = 255;
  }
  coin.composite(treatment, 0, 0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const j = (y * N + x) * 4, dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > R) c[j + 3] = 0;
    else if (d >= R - 5) { c[j] = RING[0]; c[j + 1] = RING[1]; c[j + 2] = RING[2]; c[j + 3] = 255; }
  }
  const shadow = new Jimp(N, N, 0x00000000), sh = shadow.bitmap.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inCircle(x, y, cx, cy + 6, R)) sh[(y * N + x) * 4 + 3] = 115;
  shadow.blur(12);
  const final = new Jimp(N, N, 0x00000000);
  final.composite(shadow, 0, 0); final.composite(coin, 0, 0);
  return final;
}

// crop sweep at S=9 (between tight ~0.62 and full 1.0)
const S = 9;
for (const f of [0.70, 0.78, 0.86, 0.94]) {
  const framed = reframe(f);
  const tag = String(Math.round(f * 100));
  await badge(halftone(framed, S)).writeAsync(join(OUT, `halftone_crop${tag}_s${S}.png`));
  console.log(`wrote halftone_crop${tag}_s${S}.png`);
}
console.log("done");
