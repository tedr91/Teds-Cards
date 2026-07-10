# Ted's Status Card

`type: custom:ted-status-card`

An at-a-glance, read-only panel of **this device's** dependency, backend and
browser-registration status. Handy on a welcome/setup view to confirm everything is
installed and connected.

> YAML-only — this card isn't offered in the "Add card" picker.

---

## Example

```yaml
type: custom:ted-status-card
theme: ted-style
title: System status
```

---

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `ted-style` \| `ha` | `ted-style` | Visual theme. |
| `title` | string | | Optional heading shown above the status rows. |

---

## What it shows

- **Dependencies / integrations:** HACS, Ted's Cards, Browser Mod, Layout Card,
  Card-mod (or UIX), Custom Icons, Daylight Calendar, Kiosk Mode, and whether a
  weather entity is present. Each row reports **ok**, **missing**, or **unknown**.
- **Backend:** connection state + installed version (reads `sensor.teds_requirements`).
- **This browser:** its Browser Mod registration id (read client-side from
  `window.browser_mod.browserID`).

Hover or tap a row for a detailed tooltip.
