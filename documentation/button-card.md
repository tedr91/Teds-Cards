# Ted's Button Card

`type: custom:ted-button-card`

A label or button with an optional entity, icon, and tap / hold / double-tap
actions. The building block behind many other Ted cards (navbar buttons, room
buttons, expandable menus).

---

## Minimal example

```yaml
type: custom:ted-button-card
name: Button
```

## Entity button with actions

```yaml
type: custom:ted-button-card
entity: light.kitchen
name: Kitchen
icon: mdi:ceiling-light
tap_action: { action: toggle }
hold_action: { action: more-info }
```

When `tap_action` is omitted it defaults to `toggle` for toggleable domains,
otherwise `more-info` (matching Home Assistant's built-in button).

---

## Configuration

### Content

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | | A Home Assistant entity ID (optional — the card also works as a plain label/button). |
| `name` | string | | Button label. |
| `icon` | string \| map | | MDI icon (`mdi:bed`) or a per-set [fallback map](./README.md#icons). |

### Elements & layout

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_icon` | boolean | true | Show the icon. |
| `show_name` | boolean | true | Show the name. |
| `show_state` | boolean | *(entity-dependent)* | Show the entity state. |
| `icon_scale` | number (%) | | Icon size scale. |
| `name_scale` | number (%) | | Name size scale. |
| `state_scale` | number (%) | | State size scale. |
| `element_order` | array | `["icon","name","state"]` | Order the icon / name / state are laid out in. |
| `orientation` | `vertical` \| `horizontal` | `vertical` | Layout direction of the elements. |
| `width` | number (px) | 100 | Fixed width when not a direct Sections-grid item. |
| `height` | number (px) | 120 | Fixed height when not a direct Sections-grid item. |

### Colors & appearance

| Option | Type | Description |
| --- | --- | --- |
| `icon_color` / `name_color` / `state_color` | color | Per-element color overrides. |
| `background` | color | Base card background (all states). |
| `background_on` | color | Background when the entity is on/active (overrides base). |
| `theme`, `transparency`, `blur`, `brushed`, `shadow` | | See [Appearance & theming](./README.md#appearance--theming-shared). |
| `neumorphic` | boolean | Raised tile when idle, pressed when the entity is active. Default `false`. |

### Badge

A small numeric badge driven by an entity's state (`badge:`):

| Field | Type | Description |
| --- | --- | --- |
| `entity` | string | Entity whose state (or attribute) is counted. |
| `color` / `text_color` | color | Badge fill / text color. |
| `show_when_zero` | boolean | Show the badge even at 0. |
| `count_attribute` | string | Count items in this list attribute instead of the state. |
| `area_scoped` | boolean | Only count items matching this device's area. |

### Highlight

Recolor the button based on an entity's state (`highlight:`):

| Field | Type | Description |
| --- | --- | --- |
| `entity` | string | Entity evaluated by the rules. |
| `count_attribute` | string | Evaluate the count of a list attribute. |
| `area_scoped` | boolean | Scope the count to this device's area. |
| `rules` | array | List of rules (below), evaluated in order. |

Each rule: `operator` (`is`, `is_not`, `>`, `>=`, `<`, `<=`), `value`,
`background_color`, `icon_color`, and `halt` (stop at the first match).

### Actions

| Option | Type | Description |
| --- | --- | --- |
| `tap_action` | action | On tap. Defaults to `toggle`/`more-info`. |
| `hold_action` | action | On long-press. |
| `double_tap_action` | action | On double-tap. |

See [Actions](./README.md#actions) for supported action types (including the Ted
extensions `navigate-dashboard`, `view-assist-navigate`, `view-assist-hold`).
