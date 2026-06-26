// @ts-check
/**
 * Regenerate the README showcase image and per-card preview images.
 *
 * This reproduces the original ad-hoc method that produced `images/showcase.png`:
 * render the built cards (`dist/ted-cards.js`) in headless Chromium against a small
 * HTML harness, then take an *element* screenshot of the card row. The PNG dimensions
 * (≈1098×198 for the showcase) come from the natural rendered size of the element, not
 * from a hard-coded clip.
 *
 *   npm run build            # produce dist/ted-cards.js (required first)
 *   npm run screenshots      # writes images/showcase.png + images/cards/<card>.png
 *
 * Env:
 *   SCREENSHOT_SCALE   deviceScaleFactor (default 1 → faithful 1098×198; use 2 for retina)
 *   SCREENSHOT_PORT    static-server port (default 8777)
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.SCREENSHOT_PORT ?? 8777);
const SCALE = Number(process.env.SCREENSHOT_SCALE ?? 1);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".map": "application/json",
};

/** A shared mock `hass` object; per-card entity states are merged in per shot. */
function hassLiteral(states) {
  return `{
    states: ${JSON.stringify(states)},
    callService: () => {},
    callWS: async () => ({}),
    localize: (k) => k,
    language: "en",
    locale: { language: "en" },
    formatEntityState: (s) => s.state,
    themes: {},
  }`;
}

/**
 * Build the harness HTML. Cards are appended to `#wrap`; the body paints the same dark
 * gradient used for the original showcase so the element screenshot has a nice backdrop.
 * A stub `<ha-icon>` (defined before the bundle loads) fetches the real MDI glyph from a
 * CDN so icons render in the screenshot.
 */
function harnessHtml({ cards, padding }) {
  const setup = cards
    .map((c, i) => {
      const frame = c.frame
        ? `card.style.width=${JSON.stringify(c.frame.width ?? "auto")};card.style.height=${JSON.stringify(c.frame.height ?? "auto")};`
        : "";
      return `
      {
        const card = document.createElement(${JSON.stringify(c.tag)});
        card.setConfig(${JSON.stringify({ type: "x", ...c.config })});
        card.hass = ${hassLiteral(c.states)};
        ${frame}
        wrap.appendChild(card);
        cards[${i}] = card;
      }`;
    })
    .join("\n");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>screenshot harness</title>
    <style>
      html, body { margin: 0; }
      body {
        background: radial-gradient(1200px 600px at 30% -10%, #3a4a63 0%, #1d2430 55%, #141923 100%);
        padding: 44px;
        font-family: "Segoe UI", system-ui, sans-serif;
      }
      #wrap { display: flex; gap: 28px; align-items: flex-start; padding: ${padding}px; width: max-content; }
    </style>
  </head>
  <body>
    <div id="wrap"></div>
    <script type="module">
      customElements.define(
        "ha-icon",
        class extends HTMLElement {
          connectedCallback() {
            this.style.display = "inline-block";
            this.style.width = "var(--mdc-icon-size, 24px)";
            this.style.height = "var(--mdc-icon-size, 24px)";
            this.style.lineHeight = "0";
            if (this._icon) this._render(this._icon);
          }
          set icon(v) { this._icon = v; if (this.isConnected) this._render(v); }
          async _render(v) {
            if (!v) return;
            const name = String(v).replace("mdi:", "");
            try {
              const r = await fetch(\`https://cdn.jsdelivr.net/npm/@mdi/svg/svg/\${name}.svg\`);
              if (!r.ok) return;
              this.innerHTML = await r.text();
              const s = this.querySelector("svg");
              if (s) { s.style.width = "100%"; s.style.height = "100%"; s.style.fill = "currentColor"; }
            } catch (e) { /* offline: icon stays blank */ }
          }
        },
      );

      // Minimal loadCardHelpers so the Room Card can embed real ted-* button sub-cards.
      window.loadCardHelpers = async () => ({
        createCardElement(config) {
          const el = document.createElement(String(config.type).replace(/^custom:/, ""));
          el.setConfig(config);
          return el;
        },
      });

      await import("/dist/ted-cards.js");
      const wrap = document.getElementById("wrap");
      const cards = [];
${setup}
      await Promise.all(cards.map((c) => c.updateComplete).filter(Boolean));
      window.__ready = true;
    </script>
  </body>
</html>`;
}

/** Cards rendered side-by-side for the README hero image (faithful to the original). */
const SHOWCASE = {
  out: "images/showcase.png",
  padding: 0,
  cards: [
    {
      tag: "ted-light-card",
      config: { entity: "light.living_room", name: "Living Room", icon: "mdi:floor-lamp", width: 200, height: 132 },
      states: {
        "light.living_room": {
          entity_id: "light.living_room",
          state: "on",
          attributes: { brightness: 153, supported_color_modes: ["brightness"], friendly_name: "Living Room" },
        },
      },
    },
    {
      tag: "ted-cover-card",
      config: { entity: "cover.office_blinds", name: "Office Blinds", width: 200, height: 132 },
      states: {
        "cover.office_blinds": {
          entity_id: "cover.office_blinds",
          state: "open",
          attributes: { current_position: 50, supported_features: 15, device_class: "blind", friendly_name: "Office Blinds" },
        },
      },
    },
    {
      tag: "ted-light-card",
      config: {
        entity: "light.theater",
        name: "Theater",
        icon: "mdi:ceiling-light",
        background_on: "#c8ccd0",
        brushed: true,
        icon_color: "theme",
        width: 200,
        height: 132,
      },
      states: {
        "light.theater": {
          entity_id: "light.theater",
          state: "on",
          attributes: { brightness: 255, supported_color_modes: ["brightness"], friendly_name: "Theater" },
        },
      },
    },
  ],
};

/**
 * Per-card preview images → images/cards/<name>.png. Each entry renders a single card on
 * the gradient backdrop with a little padding. Add more entries (room/remote/clock-weather)
 * with appropriate mock `states` as needed.
 */
const CARDS = [
  {
    name: "light-card",
    padding: 28,
    cards: [
      {
        tag: "ted-light-card",
        config: { entity: "light.living_room", name: "Living Room", icon: "mdi:floor-lamp", width: 200, height: 132 },
        states: {
          "light.living_room": {
            entity_id: "light.living_room",
            state: "on",
            attributes: { brightness: 153, supported_color_modes: ["brightness"], friendly_name: "Living Room" },
          },
        },
      },
    ],
  },
  {
    name: "cover-card",
    padding: 28,
    cards: [
      {
        tag: "ted-cover-card",
        config: { entity: "cover.office_blinds", name: "Office Blinds", width: 200, height: 132 },
        states: {
          "cover.office_blinds": {
            entity_id: "cover.office_blinds",
            state: "open",
            attributes: { current_position: 50, supported_features: 15, device_class: "blind", friendly_name: "Office Blinds" },
          },
        },
      },
    ],
  },
  {
    name: "label-button-card",
    padding: 28,
    cards: [
      {
        tag: "ted-label-button-card",
        frame: { width: "200px", height: "120px" },
        config: { entity: "switch.fireplace", name: "Fireplace", icon: "mdi:fireplace" },
        states: {
          "switch.fireplace": {
            entity_id: "switch.fireplace",
            state: "on",
            attributes: { friendly_name: "Fireplace" },
          },
        },
      },
    ],
  },
  {
    name: "clock-weather-card",
    padding: 28,
    cards: [
      {
        tag: "ted-clock-weather-card",
        frame: { width: "340px", height: "auto" },
        config: { weather_entity: "weather.home", show_weather_icon: true, show_current_temp: true },
        states: {
          "weather.home": {
            entity_id: "weather.home",
            state: "partlycloudy",
            attributes: { temperature: 66, temperature_unit: "\u00b0F", friendly_name: "Home" },
          },
        },
      },
    ],
  },
  {
    name: "remote-card",
    padding: 28,
    cards: [
      {
        tag: "ted-remote-card",
        config: {
          remote_entity: "remote.theater",
          media_player_entity: "media_player.theater",
          device_family: "apple-tv",
          name: "Apple TV",
          show_name: true,
        },
        states: {
          "remote.theater": { entity_id: "remote.theater", state: "on", attributes: { friendly_name: "Apple TV" } },
          "media_player.theater": {
            entity_id: "media_player.theater",
            state: "playing",
            attributes: { friendly_name: "Theater" },
          },
        },
      },
    ],
  },
  {
    name: "room-card",
    padding: 28,
    cards: [
      {
        tag: "ted-room-card",
        frame: { width: "560px", height: "auto" },
        config: {
          area: "living_room",
          name: "Living Room",
          icon: "mdi:sofa",
          show_header_icon: true,
          show_photo: false,
          status_items: [
            { type: "temperature", entity: "sensor.living_room_temperature" },
            { type: "occupancy", entity: "binary_sensor.living_room_motion" },
            { type: "led", entity: "binary_sensor.living_room_window" },
          ],
          sections: [
            {
              buttons: [
                { type: "custom:ted-light-card", entity: "light.living_room", name: "Lamp" },
                { type: "custom:ted-light-card", entity: "light.accent", name: "Accent" },
                { type: "custom:ted-cover-card", entity: "cover.living_room_blinds", name: "Blinds" },
                { type: "custom:ted-label-button-card", entity: "script.movie_night", name: "Movie", icon: "mdi:movie-open" },
                { type: "custom:ted-label-button-card", entity: "switch.fireplace", name: "Fire", icon: "mdi:fireplace" },
              ],
            },
          ],
        },
        states: {
          "sensor.living_room_temperature": {
            entity_id: "sensor.living_room_temperature",
            state: "72",
            attributes: { unit_of_measurement: "\u00b0F", device_class: "temperature", friendly_name: "Temperature" },
          },
          "binary_sensor.living_room_motion": {
            entity_id: "binary_sensor.living_room_motion",
            state: "off",
            attributes: { device_class: "occupancy", friendly_name: "Motion" },
          },
          "binary_sensor.living_room_window": {
            entity_id: "binary_sensor.living_room_window",
            state: "off",
            attributes: { device_class: "window", friendly_name: "Window" },
          },
          "light.living_room": {
            entity_id: "light.living_room",
            state: "on",
            attributes: { brightness: 153, supported_color_modes: ["brightness"], friendly_name: "Lamp" },
          },
          "light.accent": {
            entity_id: "light.accent",
            state: "on",
            attributes: { brightness: 102, supported_color_modes: ["brightness"], friendly_name: "Accent" },
          },
          "cover.living_room_blinds": {
            entity_id: "cover.living_room_blinds",
            state: "open",
            attributes: { current_position: 60, supported_features: 15, device_class: "blind", friendly_name: "Blinds" },
          },
          "script.movie_night": {
            entity_id: "script.movie_night",
            state: "off",
            attributes: { friendly_name: "Movie" },
          },
          "switch.fireplace": {
            entity_id: "switch.fireplace",
            state: "on",
            attributes: { friendly_name: "Fire" },
          },
        },
      },
    ],
  },
];

/** Static file server rooted at the repo, plus in-memory generated harness pages. */
function startServer(pages) {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (pages.has(urlPath)) {
      res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      res.end(pages.get(urlPath));
      return;
    }
    try {
      const data = await readFile(join(ROOT, urlPath));
      res.writeHead(200, { "content-type": MIME[extname(urlPath)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((res) => server.listen(PORT, "127.0.0.1", () => res(server)));
}

function pngSize(buf) {
  return `${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}`;
}

async function shoot(page, pages, { out, padding, cards }) {
  const route = `/__harness_${Math.random().toString(36).slice(2)}.html`;
  pages.set(route, harnessHtml({ cards, padding }));
  await page.goto(ORIGIN + route, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
  await page.waitForTimeout(1500); // let CDN icon SVGs finish loading
  const target = join(ROOT, out);
  await mkdir(dirname(target), { recursive: true });
  const buf = await page.locator("#wrap").screenshot();
  await writeFile(target, buf);
  pages.delete(route);
  console.log(`  ${out.padEnd(34)} ${pngSize(buf)}`);
}

async function main() {
  if (!existsSync(join(ROOT, "dist/ted-cards.js"))) {
    console.error("dist/ted-cards.js not found — run `npm run build` first.");
    process.exit(1);
  }

  const pages = new Map();
  const server = await startServer(pages);
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: SCALE, viewport: { width: 1400, height: 800 } });
  const page = await context.newPage();

  try {
    console.log("Rendering showcase:");
    await shoot(page, pages, SHOWCASE);

    console.log("Rendering per-card previews:");
    for (const card of CARDS) {
      await shoot(page, pages, { out: `images/cards/${card.name}.png`, padding: card.padding, cards: card.cards });
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
