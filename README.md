# Ted's Cards

A collection of custom Lovelace cards for [Home Assistant](https://www.home-assistant.io/), inspired by [Mushroom Cards](https://github.com/piitaya/lovelace-mushroom).

> **Status:** early development. Currently includes a single card (`ted-light-card`); more are planned.

## Cards

| Card | Type | Description |
| --- | --- | --- |
| Light Card | `custom:ted-light-card` | Tap-to-toggle card for a light (or any toggleable entity). |

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
tap_action:                # optional, defaults to toggle
  action: toggle
hold_action:               # optional
  action: more-info
double_tap_action:         # optional
  action: none
```

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
