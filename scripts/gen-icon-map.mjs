/**
 * Generate a visual preview of the icon mapping "databases" so gaps are obvious.
 *
 * Reads the SINGLE SOURCE OF TRUTH — src/shared/icon-registry.ts — and emits
 * previews/icon-map.html:
 *   - DB "A": the supported icon packs (ICON_PACKS).
 *   - DB "B": the semantic icon map (SEMANTIC_ICONS) as a grid, one row per key,
 *     one column per pack, with EMPTY cells flagged as gaps + a per-pack gap tally.
 *
 * The MDI column renders the real glyph via the MDI web-font CDN (mdi is required
 * on every entry); other packs show the mapped name (or a highlighted gap).
 *
 * Run: `node scripts/gen-icon-map.mjs`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryPath = join(__dirname, "..", "src", "shared", "icon-registry.ts");
const outPath = join(__dirname, "..", "previews", "icon-map.html");

const src = readFileSync(registryPath, "utf8");

/** Strip `// line comments` so the literals can be eval'd as plain JS. */
const stripComments = (s) => s.replace(/\/\/[^\n]*$/gm, "");

/** Extract a balanced `[...]` / `{...}` literal assigned after a marker.
 *  Searches from the `=` so a type annotation like `readonly IconPack[]` (which
 *  contains its own brackets) isn't mistaken for the literal. */
function extractLiteral(text, marker, open, close) {
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  const eq = text.indexOf("=", start);
  const from = text.indexOf(open, eq);
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(from, i + 1);
  }
  throw new Error(`unbalanced literal after ${marker}`);
}

// eslint-disable-next-line no-eval
const evalLiteral = (lit) => eval(`(${stripComments(lit)})`);

const ICON_PACKS = evalLiteral(extractLiteral(src, "export const ICON_PACKS", "[", "]"));
const SEMANTIC_ICONS = evalLiteral(extractLiteral(src, "export const SEMANTIC_ICONS", "{", "}"));

const keys = Object.keys(SEMANTIC_ICONS).sort();

// Column display order requested for the preview (distinct from the resolver's
// priority order in ICON_PACKS). MDI last as the guaranteed fallback.
const DISPLAY_PREFIXES = [
  "fluent",
  "streamline-ultimate-color",
  "streamline-freehand-color",
  "pepicons-print",
  "mdi",
];
const packs = DISPLAY_PREFIXES.map((pre) => ICON_PACKS.find((p) => p.prefix === pre)).filter(
  Boolean,
);

// Per-pack gap tally (mdi is required, so never a gap).
const gapCount = Object.fromEntries(packs.map((p) => [p.prefix, 0]));
for (const key of keys) {
  for (const p of packs) {
    if (!SEMANTIC_ICONS[key][p.prefix]) gapCount[p.prefix]++;
  }
}

// Where each semantic key's icon appears in Ted's Dashboard System (key tooltip).
const KEY_DESCRIPTIONS = {
  account: "Status card — logged-in Home Assistant user row.",
  device: "Status card — this device's name / area row.",
  location: "Device area / location indicators.",
  server: "Status card — Ted's Dashboard System (backend) row.",
  requirements: "Status card — dependency requirements row.",
  web: "Status card — Browser Mod registration row.",
  weather: "Weather view + navbar weather status item.",
  "weather-night": "Settings — Automatic Night Mode.",
  speaker: "Status card — system sounds player row.",
  music: "Music view / player.",
  "music-off": "Music card — no player / empty state.",
  settings: "Settings view + category tab icon.",
  thermostat: "Climate view / thermostats.",
  camera: "Cameras view.",
  calendar: "Calendar (month) view.",
  "calendar-off": "Calendar card — not-installed / empty state.",
  cake: "Calendar — birthday day badges.",
  home: "Welcome / Home view (navbar launcher).",
  "home-handheld": "Home view for handheld phones.",
  "home-wallpanel-h": "Home view for landscape wall panels.",
  "home-wallpanel-v": "Home view for portrait wall panels.",
  "alarms-timers": "Alarms & Timers view.",
  announce: "Announce view.",
  "assist-response": "Assist Response view.",
  "calendar-week": "Calendar (week) view.",
  notifications: "Notifications view.",
  photos: "Photos view.",
  "check-circle": "Status card — OK status glyph.",
  "alert-circle": "Status card — warning status glyph.",
  "error-circle": "Status card — error / missing status glyph.",
  "help-circle": "Status card — unknown status glyph.",
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const headTop = packs
  .map((p) => {
    const isMdi = p.prefix === "mdi";
    return `<th colspan="2">
      <div class="pk-name">${esc(p.name)}</div>
      <div class="pk-prefix">${esc(p.prefix)}</div>
      <div class="pk-meta">${isMdi ? "core · " : ""}${gapCount[p.prefix]} gap${gapCount[p.prefix] === 1 ? "" : "s"}</div>
    </th>`;
  })
  .join("");
const headSub = packs
  .map(() => `<th class="sub sub-light">light</th><th class="sub sub-dark">dark</th>`)
  .join("");

const rows = keys
  .map((key) => {
    const spec = SEMANTIC_ICONS[key];
    const cells = packs
      .map((p) => {
        const name = spec[p.prefix];
        if (!name) return `<td class="gap" colspan="2" title="no ${esc(p.name)} mapping">—</td>`;
        const ic = `<iconify-icon class="ic" icon="${esc(p.prefix)}:${esc(name)}" title="${esc(p.prefix)}:${esc(name)}"></iconify-icon>`;
        return `<td class="cell cell-light">${ic}</td><td class="cell cell-dark">${ic}</td>`;
      })
      .join("");
    const desc = KEY_DESCRIPTIONS[key] ?? "";
    return `<tr><th class="key"${desc ? ` title="${esc(desc)}"` : ""}>${esc(key)}</th>${cells}</tr>`;
  })
  .join("\n");

const packTable = ICON_PACKS.map(
  (p, i) =>
    `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td><code>${esc(p.prefix)}</code></td><td>${gapCount[p.prefix]}</td></tr>`,
).join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ted's Cards — Icon Map</title>
<script src="https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js"></script>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font: 14px/1.4 system-ui, sans-serif; background: #12141a; color: #e7e9ee; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #9aa0ad; margin: 0 0 20px; }
  h2 { margin: 28px 0 10px; font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #9aa0ad; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #2a2e39; padding: 7px 10px; text-align: left; vertical-align: middle; }
  thead th { background: #1b1e27; }
  thead tr:first-child th { position: sticky; top: 0; z-index: 2; }
  .pk-name { font-weight: 600; }
  .pk-prefix { font: 11px monospace; color: #8b93a7; }
  .pk-meta { font-size: 11px; color: #6f7787; margin-top: 2px; }
  th.sub { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; padding: 3px 6px; text-align: center; color: #6f7787; }
  th.sub-light { border-bottom: 2px solid #cfd6e6; }
  th.sub-dark { border-bottom: 2px solid #3a3f4d; }
  th.key { font-family: monospace; font-weight: 600; color: #cdd3e0; white-space: nowrap; background: #171a22; position: sticky; left: 0; z-index: 1; cursor: help; }
  code { font: 12px/1 ui-monospace, monospace; color: #b7c6ff; }
  td.cell { text-align: center; }
  td.cell-light { background: #ffffff; }
  td.cell-light .ic { color: #1c1e26; }
  td.cell-dark { background: #14161c; }
  td.cell-dark .ic { color: #e9ecf2; }
  td.gap { background: #2a1417; color: #d9737f; text-align: center; font-weight: 700; }
  .ic { font-size: 24px; vertical-align: middle; }
  td.rowgaps { text-align: center; color: #6f7787; }
  td.rowgaps.warn { color: #e0a458; font-weight: 700; }
  .packs td { padding: 6px 12px; }
  .legend { margin: 10px 0 0; color: #9aa0ad; font-size: 12px; }
  .legend b { color: #d9737f; }
  .note { margin-top: 6px; color: #6f7787; font-size: 12px; }
</style>
</head>
<body>
  <h1>Ted's Cards — Icon Map</h1>
  <p class="sub">Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} from <code>src/shared/icon-registry.ts</code> · ${keys.length} semantic keys × ${packs.length} packs</p>

  <h2>DB A — Icon packs</h2>
  <table class="packs">
    <thead><tr><th>Priority</th><th>Name</th><th>Prefix</th><th>Missing mappings</th></tr></thead>
    <tbody>${packTable}</tbody>
  </table>

  <h2>DB B — Semantic icon map</h2>
  <table>
    <thead>
      <tr><th class="key" rowspan="2">key</th>${headTop}</tr>
      <tr>${headSub}</tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <p class="legend"><b>—</b> = gap (no mapping for that pack → resolver falls through to the next installed pack, ultimately MDI).</p>
  <p class="note">Icons render live via <a href="https://iconify.design/">Iconify</a> (needs internet). Hover any icon to see its name; the color packs (Streamline) render in their own colors. Regenerate with <code>node scripts/gen-icon-map.mjs</code>.</p>
</body>
</html>
`;

writeFileSync(outPath, html, "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Keys: ${keys.length}`);
for (const p of packs) console.log(`  ${p.prefix}: ${gapCount[p.prefix]} gap(s)`);
