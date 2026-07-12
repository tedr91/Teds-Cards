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
  # Five fixed positional sections, in order: Left, Mid-Left, Center, Mid-Right, Right.
  - items: []                         # 0 Left
  - items: []                         # 1 Mid-Left
  - items:                            # 2 Center
      - { name: Home, icon: mdi:home, tap_action: { action: navigate, navigation_path: /lovelace/home } }
  - items: []                         # 3 Mid-Right
  - items: []                         # 4 Right
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

### Backend integration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `backend_integration` | boolean | false | Opt into Ted's Cards Backend behaviours: auto-return-home on idle, welcome-view redirect to the device's home, and `tap_navigate` on status items. |

### Sections

`sections` is a list of **exactly five fixed, positional sections**, in bar order:
**Left**, **Mid-Left**, **Center**, **Mid-Right**, **Right** (index 0–4). A section's
position is fixed by its index — there is no `placement`. On a vertical (left/right) bar,
`align` left/right read as up/down.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `align` | `left` \| `center` \| `right` | per section | Content alignment. Fixed for Left (left), Center (center), Right (right); adjustable for Mid-Left (default left) and Mid-Right (default right), where it also controls which way the section leans. |
| `visible` | boolean | true | Whether the section is shown. |
| `overflow` | boolean | true | Auto-collapse items that don't fit into a chevron overflow popup. |
| `priority` | number (1–5) | Left/Right 1, Center 3, Mid-Left/Mid-Right 5 | Auto-collapse priority — higher collapses first when the bar runs out of room (disabled when `overflow` is off). |
| `items` | array | | Ordered mix of nav buttons and status items. |
| `buttons` | array | | Legacy buttons-only list (used when `items` is unset). |

**Nav buttons** are [Button Card](./button-card.md) configs plus optional
`nav_button_size` (`normal` \| `wide`), `visible` (boolean), and `visibility`
(a list of conditions).

**Status items** (brightness, volume, sensors, notifications bell, LED, time/date,
weather, alarms/timers) can also appear in a section — see the
[Notification System](./notification-system.md) for the backend-driven ones.

### Per-device settings

When the [Settings](./settings-card.md) system is present, the **Navbar** settings
group (`navbar_auto_hide`, `navbar_auto_hide_delay`, `navbar_float`,
`navbar_position`, `navbar_size`) can override the card's YAML per device — the
card's YAML still wins where it explicitly sets a value (so a view can force a
layout). These are also editable straight from the long-press menu.
