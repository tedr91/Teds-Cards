// @ts-check
/**
 * Build the photo-based logos from the real profile picture.
 *   node scripts/gen-logo2.mjs
 *
 * Pipeline: RMBG-1.4 background removal → stylized treatments → circle badges.
 * Outputs:
 *   images/_logo-work/  cutout + silhouette/duotone/poster/halftone (references)
 *   images/logo2/       halftone circle badge  (logo-512/256/128/64.png + icon.png)
 *   images/logo3/       poster  circle badge  (logo-512/256/128/64.png + icon.png)
 * First run downloads the RMBG-1.4 model (~44 MB). Pure-JS jimp (sharp is blocked here).
 */
import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";
import Jimp from "jimp";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "images/TedR_Pumpkin.jpg");
const WORK = resolve(ROOT, "images/_logo-work");
const N = 512, INNER = 452;
await mkdir(WORK, { recursive: true });

const lerp = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// ---------- 1. background removal ----------
console.log("loading RMBG-1.4 (first run downloads the model)…");
const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", { config: { model_type: "custom" } });
const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
  config: {
    do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
    image_mean: [0.5, 0.5, 0.5], feature_extractor_type: "ImageFeatureExtractor",
    image_std: [1, 1, 1], resample: 2, size: { width: 1024, height: 1024 },
  },
});
console.log("removing background…");
const image = await RawImage.read(SRC);
const { pixel_values } = await processor(image);
const outT = await model({ input: pixel_values });
const maskTensor = outT.output ?? outT[Object.keys(outT)[0]];
const W = Number(image.width), H = Number(image.height);
const mask = await RawImage.fromTensor(maskTensor[0].mul(255).to("uint8")).resize(W, H);

// ---------- 2. cutout, trim, center in NxN ----------
const photo = await Jimp.read(SRC);
photo.resize(W, H);
for (let i = 0; i < W * H; i++) photo.bitmap.data[i * 4 + 3] = mask.data[i];
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
  if (photo.bitmap.data[(y * W + x) * 4 + 3] > 16) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
const subj = photo.clone().crop(minX, minY, maxX - minX + 1, maxY - minY + 1);
subj.scaleToFit(INNER, INNER);
const cutout = new Jimp(N, N, 0x00000000);
cutout.composite(subj, Math.round((N - subj.bitmap.width) / 2), Math.round((N - subj.bitmap.height) / 2));
await cutout.writeAsync(join(WORK, "cutout.png"));
const px = cutout.bitmap.data;

/** reframe cutout by fraction f of bbox height (top-anchored square). f>=1 = full subject. */
function reframe(f) {
  const d = cutout.bitmap.data;
  let minX = N, minY = N, maxX = 0, maxY = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    if (d[(y * N + x) * 4 + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  let cx, cy, cw, ch;
  if (f < 1) { const size = Math.round(bh * f); cw = ch = size; cx = Math.round((minX + maxX) / 2 - size / 2); cy = minY; }
  else { cx = minX; cy = minY; cw = bw; ch = bh; }
  cx = Math.max(0, cx); cy = Math.max(0, cy); cw = Math.min(N - cx, cw); ch = Math.min(N - cy, ch);
  const sub = cutout.clone().crop(cx, cy, cw, ch);
  sub.scaleToFit(INNER, INNER);
  const c = new Jimp(N, N, 0x00000000);
  c.composite(sub, Math.round((N - sub.bitmap.width) / 2), Math.round((N - sub.bitmap.height) / 2));
  return c;
}

// ---------- 3. treatments (references) ----------
const BLUE = [90, 151, 221], PURPLE = [138, 95, 208];
const DUO_DARK = [37, 45, 110], DUO_LIGHT = [223, 234, 252];
const POSTER = [[30, 39, 87], [66, 89, 176], [106, 160, 224], [223, 234, 252]];
const DOT = [76, 134, 214];

function makeTreatment(srcPx, kind, S = 11) {
  const img = new Jimp(N, N, 0x00000000);
  const o = img.bitmap.data;
  if (kind === "halftone") {
    const R = S * 0.62, at = (x, y) => (y * N + x) * 4;
    for (let cy = S / 2; cy < N; cy += S) for (let cx = S / 2; cx < N; cx += S) {
      const ix = Math.round(cx), iy = Math.round(cy);
      if (ix >= N || iy >= N || srcPx[at(ix, iy) + 3] < 128) continue;
      const t = lum(srcPx[at(ix, iy)], srcPx[at(ix, iy) + 1], srcPx[at(ix, iy) + 2]) / 255;
      const rad = (1 - t) * R; if (rad < 0.5) continue;
      const r2 = rad * rad, cr = Math.ceil(rad);
      for (let dy = -cr; dy <= cr; dy++) for (let dx = -cr; dx <= cr; dx++) {
        const xx = ix + dx, yy = iy + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N || dx * dx + dy * dy > r2 || srcPx[at(xx, yy) + 3] < 60) continue;
        const j = at(xx, yy); o[j] = DOT[0]; o[j + 1] = DOT[1]; o[j + 2] = DOT[2]; o[j + 3] = 255;
      }
    }
  } else {
    for (let i = 0; i < N * N; i++) {
      const a = srcPx[i * 4 + 3]; if (a <= 8) continue;
      const t = lum(srcPx[i * 4], srcPx[i * 4 + 1], srcPx[i * 4 + 2]) / 255;
      let c;
      if (kind === "silhouette") c = lerp(BLUE, PURPLE, ((i % N) + Math.floor(i / N)) / (2 * N));
      else if (kind === "duotone") c = lerp(DUO_DARK, DUO_LIGHT, t);
      else c = POSTER[Math.min(POSTER.length - 1, Math.floor(t * POSTER.length))]; // poster
      o[i * 4] = c[0]; o[i * 4 + 1] = c[1]; o[i * 4 + 2] = c[2]; o[i * 4 + 3] = a;
    }
  }
  return img;
}
const halftone = makeTreatment(reframe(0.78).bitmap.data, "halftone", 9);
const poster = makeTreatment(px, "poster");
for (const k of ["silhouette", "duotone"]) await makeTreatment(px, k).writeAsync(join(WORK, `${k}.png`));
await halftone.writeAsync(join(WORK, "halftone.png"));
await poster.writeAsync(join(WORK, "poster.png"));

// ---------- 4. circle badge builder ----------
const BG_TOP = [238, 245, 253], BG_BOT = [214, 230, 247], RING = [176, 201, 232];
const inCircle = (x, y, cx, cy, r) => { const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r; };

/** @param {Jimp} treatment 512 RGBA subject on transparent */
function makeBadge(treatment, { scale = 1.12, dy = 18, dx = 0 } = {}) {
  const cx = 256, cy = 256, R = 236;
  const coin = new Jimp(N, N, 0x00000000);
  const c = coin.bitmap.data;
  // gradient bg inside circle
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inCircle(x, y, cx, cy, R)) continue;
    const j = (y * N + x) * 4, col = lerp(BG_TOP, BG_BOT, y / N);
    c[j] = col[0]; c[j + 1] = col[1]; c[j + 2] = col[2]; c[j + 3] = 255;
  }
  // subject avatar
  const s = treatment.clone(); s.scale(scale);
  coin.composite(s, Math.round(cx - s.bitmap.width / 2 + dx), Math.round(cy - s.bitmap.height / 2 + dy));
  // clip to circle + draw ring
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const j = (y * N + x) * 4, ddx = x - cx, ddy = y - cy, d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d > R) { c[j + 3] = 0; }
    else if (d >= R - 5) { c[j] = RING[0]; c[j + 1] = RING[1]; c[j + 2] = RING[2]; c[j + 3] = 255; }
  }
  // soft drop shadow
  const shadow = new Jimp(N, N, 0x00000000);
  const sh = shadow.bitmap.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    if (inCircle(x, y, cx, cy + 6, R)) sh[(y * N + x) * 4 + 3] = 115;
  shadow.blur(12);
  const final = new Jimp(N, N, 0x00000000);
  final.composite(shadow, 0, 0);
  final.composite(coin, 0, 0);
  return final;
}

async function writeSizes(badge, dir) {
  await mkdir(dir, { recursive: true });
  for (const size of [512, 256, 128, 64])
    await badge.clone().resize(size, size).writeAsync(join(dir, `logo-${size}.png`));
  await badge.clone().resize(256, 256).writeAsync(join(dir, "icon.png"));
  console.log("wrote badge set →", dir);
}

await writeSizes(makeBadge(halftone, { scale: 1.0, dy: 0 }), resolve(ROOT, "images/logo2"));
await writeSizes(makeBadge(poster), resolve(ROOT, "images/logo3"));
console.log("done");
