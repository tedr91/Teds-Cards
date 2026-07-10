# Ted's Cover Card

`type: custom:ted-cover-card`

A tap-to-control card for a cover — blinds, shades, garage doors, awnings, etc.
Separate up / down / icon regions let you open, close, step, stop, or tilt without
opening a dialog. Position-capable covers can remember a favourite open position.

---

## Minimal example

```yaml
type: custom:ted-cover-card
entity: cover.living_room_blinds
```

## With tilt + position memory

```yaml
type: custom:ted-cover-card
entity: cover.office_shade
name: Office
up_tap: open
down_tap: close
up_hold: tilt_open
down_hold: tilt_close
memory_mode: static
memory_value: 60   # remembered 0–100 open %
```

---

## Configuration

### Basics

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | **required** | A `cover.*` entity. |
| `name` | string | *(friendly name)* | Display name. |
| `icon` | string | *(device_class)* | Icon when closed. |
| `icon_open` | string | | Icon when open. |
| `orientation` | `vertical` \| `horizontal` | | Layout orientation. |
| `width` / `height` | number (px) | | Fixed size. |

### Elements

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_name` / `show_icon` / `show_state` | boolean | true | Toggle each element (`show_state` = position %). |
| `name_scale` / `icon_scale` / `state_scale` | number (%) | | Per-element size scale. |
| `element_order` | array | `["name","icon","state"]` | Stacking order of the elements. |
| `show_hint` | boolean | false | Show a subtle interaction hint. |
| `hint_width` | number (px) | | Hint width. |

### Indicator & colors

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_indicator` | boolean | true | Show the indicator bar. |
| `indicator_color` | `theme` \| `other` | `theme` | Source for indicator/icon color. |
| `indicator_color_custom` | `[r,g,b]` | | Custom color when `indicator_color: other`. |
| `indicator_width` | number (px) | | Indicator bar width. |
| `name_color` / `icon_color` / `state_color` | color | | Per-element color applied when the cover is open. |
| `background` | color | | Base background. |
| `background_open` | color | | Background when the cover is open. |
| `rocker` | boolean | false | Rocker-style up/down buttons. |
| `rocker_effect` | boolean | false | Pressed/raised rocker effect. |

Plus [Appearance & theming](./README.md#appearance--theming-shared):
`theme`, `transparency`, `blur`, `brushed`, `shadow`.

### Interactions (per region)

Bind an action to each region + gesture. Values:
`open_step`, `close_step`, `open`, `close`, `toggle`, `stop`,
`tilt_open`, `tilt_close`, `more_info`, `none`.

| Region | Tap | Double-tap | Hold |
| --- | --- | --- | --- |
| Up | `up_tap` | `up_double_tap` | `up_hold` |
| Down | `down_tap` | `down_double_tap` | `down_hold` |
| Icon | `icon_tap` | `icon_double_tap` | `icon_hold` |

> `*_step` moves in 5% increments for fine control; `tilt_*` needs a tilt-capable cover.

### Position memory

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `memory_mode` | `off` \| `static` \| `helper` | `off` | Remembered open position source (position-capable covers). |
| `memory_value` | number (0–100) | | Static position when `memory_mode: static`. |
| `memory_entity` | string | | Helper entity storing the position when `memory_mode: helper`. |
