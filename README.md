# Ted's Cards

A collection of custom Lovelace cards for [Home Assistant](https://www.home-assistant.io/), inspired by [Mushroom Cards](https://github.com/piitaya/lovelace-mushroom).

> **Status:** early development. Currently includes a single card (`ted-light-card`); more are planned.

## Cards

| Card | Type | Description |
| --- | --- | --- |
| Light Card | `custom:ted-light-card` | Light tile with click-to-dim halves and a brightness hint bar. |

## Installation

### HACS (recommended)

1. Open HACS in Home Assistant.
2. Go to **Frontend** → menu (⋮) → **Custom repositories**.
3. Add `https://github.com/tedr91/HA-Teds-Cards` with category **Dashboard**.
4. Search for **Ted's Cards** and install.
5. Refresh your browser.

### Manual

1. Download `ted-cards.js` from the [latest release](https://github.com/tedr91/HA-Teds-Cards/releases/latest).
2. Copy it to `<config>/www/community/ted-cards/ted-cards.js`.
3. Add the resource to your dashboard:
   - **Settings** → **Dashboards** → ⋮ → **Resources** → **Add resource**
   - URL: `/local/community/ted-cards/ted-cards.js`
   - Type: **JavaScript Module**
4. Refresh your browser.

## Usage

### Light Card

A compact light tile split into two clickable halves by a subtle divider. Supports `light`
entities only. Brightness is shown as a thin vertical hint bar on the card's left edge.

**Interactions**

| Action | Top half | Bottom half |
| --- | --- | --- |
| Single click | If off, turn on; if on, increase brightness to the next 5% | Decrease brightness to the next 5% (off below the lowest step) |
| Double click | Set to 100% brightness | Turn off |

Minimal config:

```yaml
type: custom:ted-light-card
entity: light.living_room
```

All options:

```yaml
type: custom:ted-light-card
entity: light.living_room
name: Living Room          # optional, defaults to entity friendly name
icon: mdi:floor-lamp       # optional, defaults to entity icon
theme: ted-style           # optional, visual styling: ted-style (default) | ha
```

`theme` (optional) — **Visual styling**, selectable in the editor's **Visual** section:
- `ted-style` (default): a self-contained "Ted's Home Theater" look (Windows 11 Fluent / Mica-dark) that looks the same regardless of your Home Assistant theme.
- `ha`: follow the active Home Assistant theme (surfaces, text, and accent color).

Brightness is shown as a thin vertical hint bar pinned to the card's left edge (it fills bottom→up with the light's brightness; it is not interactive). `brightness_color` (optional, in the **Visual** section) sets its color when the light is on:
- `theme` (default): the theme accent color.
- `light`: the light's current color (its `rgb_color`), falling back to a warm tone.
- `other`: a custom color — set `brightness_color_custom` to an `[r, g, b]` array (chosen via the editor's color picker).

## Development

```sh
npm install
npm run build      # produces dist/ted-cards.js
npm run watch      # rebuild on change (with sourcemaps)
npm run typecheck  # tsc --noEmit
```

To test against a running Home Assistant instance, copy `dist/ted-cards.js` into `<config>/www/` and add it as a Lovelace resource (type: JavaScript Module).

## Releasing

The GitHub Actions workflow at `.github/workflows/release.yml` automatically builds `ted-cards.js` and attaches it to any GitHub Release. Bump the version in `package.json`, push a `vX.Y.Z` tag, and publish a release — HACS will pick up the new asset.

## License

[MIT](./LICENSE)
