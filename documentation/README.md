# Ted's Cards — Documentation

A collection of custom Lovelace cards for Home Assistant. Each card is a
`custom:ted-*-card` element you add to a dashboard in YAML (or via the "Add card"
picker, where most have a visual editor).

## Card reference

| Card | Type | What it's for |
| --- | --- | --- |
| [Button](./button-card.md) | `custom:ted-button-card` | A label/button with an entity, icon and tap/hold actions. |
| [Expandable Button](./expandable-button-card.md) | `custom:ted-expandable-button-card` | A button that opens a popup of child buttons. |
| [Light](./light-card.md) | `custom:ted-light-card` | Tap-to-toggle + dual-zone brightness control for a light. |
| [Cover](./cover-card.md) | `custom:ted-cover-card` | Tap-to-control card for blinds, shades, garage doors. |
| [Camera](./camera-card.md) | `custom:ted-camera-card` | One or more camera feeds (thumbnail or live). |
| [Remote](./remote-card.md) | `custom:ted-remote-card` | Remote control for Apple TV / Kaleidescape. |
| [Clock / Weather](./clock-weather-card.md) | `custom:ted-clock-weather-card` | A large clock with date and current weather. |
| [Room](./room-card.md) | `custom:ted-room-card` | Room dashboard: status strip + sections of light/cover/button cards. |
| [Navbar](./navbar-card.md) | `custom:ted-navbar-card` | A navigation bar pinned to a screen edge. |
| [Tab](./tab-card.md) | `custom:ted-tab-card` | A tabbed container holding any cards, one per tab. |
| [Spacer](./spacer-card.md) | `custom:ted-spacer-card` | A transparent, fixed-size spacer (for Room Card layouts). |
| [Status](./status-card.md) | `custom:ted-status-card` | At-a-glance dependency / backend / browser status. |
| [Settings](./settings-card.md) | `custom:ted-settings-card` | Global + per-device settings (needs the backend). |
| [Alarm](./alarm-card.md) | `custom:ted-alarm-card` | Add/view/enable alarms (needs the backend). |
| [Timer](./timer-card.md) | `custom:ted-timer-card` | Start/view/cancel countdown timers (needs the backend). |
| [MessageBox](./messagebox-card.md) | `custom:ted-messagebox-card` | A dismissible message banner (no backend). |
| [Notification](./notification-card.md) | `custom:ted-notification-card` | Backend-driven notification list + toasts. |

See also the [Notification System](./notification-system.md) overview for how the
backend-driven alerts (notifications, alarms, timers) fit together.

## Backend-dependent cards

These cards need the **Ted's Cards Backend** integration
(`teds_cards_backend`) installed: **Settings**, **Alarm**, **Timer**,
**Notification** (and any card using per-device settings, e.g. Camera's
`cameras_source: settings`). The others work standalone.

---

## Appearance & theming (shared)

Most cards share the same appearance options. Where a card's reference lists these,
they behave as described here.

| Option | Type | Description |
| --- | --- | --- |
| `theme` | `ted-style` \| `ha` | `ted-style` (usually the default) is a self-contained look. `ha` follows the active Home Assistant theme (so translucent themes like Mica/glass frost correctly). |
| `background` | string | Card background color override — a theme color name (e.g. `primary`, `light-grey`) or a CSS color (`#rrggbb`, `rgb(...)`, `var(--x)`). |
| `transparency` | number (0–100) | Background transparency override, in percent. |
| `blur` | number (0–100) | Backdrop-blur override, in percent (frosts whatever is behind the card). |
| `brushed` | boolean | Adds a subtle brushed-metal sheen overlay. |
| `shadow` | boolean | Toggles the card's drop shadow. |
| `scale` | number (%) | Overall card scale, where supported (e.g. `50`–`200`). |

### Colors

Anywhere a color is accepted you may use a **theme color name** (`primary`,
`accent`, `red`, `light-grey`, …) or any **CSS color** (`#3b82f6`, `rgb(59,130,246)`,
`hsl(...)`, `var(--my-var)`).

### Icons

Icon fields take an MDI name (`mdi:home`) or any installed icon set
(e.g. `streamline-ultimate-color:home-chimney-2`). Some cards accept a **fallback
map** so an icon resolves to the first installed set:

```yaml
icon:
  streamline-ultimate-color: home-chimney-2
  mdi: home
```

### Actions

Action fields (`tap_action`, `hold_action`, `double_tap_action`) use Home
Assistant's standard [action config](https://www.home-assistant.io/dashboards/actions/)
(`toggle`, `more-info`, `navigate`, `call-service` / `perform-action`, `url`, `none`),
plus a few Ted extensions used by some cards:

| Action | Description |
| --- | --- |
| `navigate-dashboard` | Navigate to a dashboard-path **setting** (e.g. `dashboard: home_dashboard`), resolved per-device via the backend. |
| `view-assist-navigate` | Navigate through the View Assist integration (`view: home`). |
| `view-assist-hold` | Toggle the View Assist device's hold mode. |
| `set-setting` | Write a Ted's Cards setting (`scope: device`\|`global`, `setting:`, `value:`). |
