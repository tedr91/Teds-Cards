# Ted's Navbar Card

`type: custom:ted-navbar-card`

A navigation bar pinned to a screen edge, holding buttons and status items in
left / center / right zones. Supports auto-hide, float, any edge, per-device
settings, and a long-press settings menu.

The bar is `position: fixed`, so a copy included in every view reads as one
continuous navbar.

---

## Minimal example

```yaml
type: custom:ted-navbar-card
sections:
  - placement: center
    align: center
    items:
      - { name: Home, icon: mdi:home, tap_action: { action: navigate, navigation_path: /lovelace/home } }
```

---

## Configuration

### Bar

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `alignment` | `bottom` \| `top` \| `left` \| `right` | `bottom` | Screen edge. Left/right are vertical bars. |
| `bar_type` | `snap` \| `float` | `snap` | `snap` = edge-to-edge; `float` = centered with margins + rounded corners (horizontal only). |
| `size` | number (px) | 48 | Bar thickness; buttons/items size from this. |
| `min_width` / `max_width` | number (px) | | Float-mode width bounds. |
| `theme`, `background`, `transparency`, `blur` | | | See [Appearance & theming](./README.md#appearance--theming-shared). |

### Auto-hide & menu

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `auto_hide` | boolean | false | Collapse the bar into its edge (a small pill remains) until revealed. |
| `auto_hide_delay` | number (s) | 5 | Seconds before an auto-hide bar re-collapses. |
| `hold_menu` | boolean | true | Long-press the bar to open a settings menu (auto-hide / float / position / size, plus custom items, Dashboard Settings, Exit). |
| `menu_items` | array | | Extra custom action rows in the long-press menu (below). |
| `exit_path` | string | `/lovelace` | Where the menu's "Exit" item navigates. |

Each `menu_items` entry: `name` (required), `icon` (mdi), `entity` (optional), and
`tap_action` (a standard [action](./README.md#actions), e.g. `call-service`).

### Backend & View Assist

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `backend_integration` | boolean | false | Opt into Ted's Cards Backend behaviours: auto-return-home on idle, welcome-view redirect to the device's home, and `tap_navigate` on status items. |
| `size_source` | object | | Drive bar thickness from an entity attribute holding a View Assist size (`6vw`/`7vw`/`8vw` → 35/42/50 px). Overrides `size`. |

`size_source` (and a section's `items_source`) is an *EntityAttrSource*:
`entity` (string), `va_device` (boolean — resolve from the device's View Assist
sensor), `attribute` (string, required).

### Sections

`sections` is a list of up to 5 sections:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `placement` | `left` \| `center` \| `right` | `left` | Which zone the section sits in. |
| `align` | `left` \| `center` \| `right` | `center` | Content alignment within the section. |
| `visible` | boolean | true | Whether the section is shown. |
| `overflow` | boolean | true | Collapse items that don't fit into a "…" popup. |
| `items` | array | | Ordered mix of nav buttons and status items. |
| `buttons` | array | | Legacy buttons-only list (used when `items` is unset). |
| `items_source` | object | | Append buttons parsed from a View Assist status-icon/menu attribute. |

**Nav buttons** are [Button Card](./button-card.md) configs plus optional
`nav_button_size` (`normal` \| `wide`), `visible` (boolean), and `visibility`
(a list of HA-style + `view-assist` conditions).

**Status items** (brightness, volume, sensors, notifications bell, LED, time/date,
weather, alarms/timers) can also appear in a section — see the
[Notification System](./notification-system.md) for the backend-driven ones.

### Per-device settings

When the [Settings](./settings-card.md) system is present, the **Navbar** settings
group (`navbar_auto_hide`, `navbar_auto_hide_delay`, `navbar_float`,
`navbar_position`, `navbar_size`) can override the card's YAML per device — the
card's YAML still wins where it explicitly sets a value (so a view can force a
layout). These are also editable straight from the long-press menu.
