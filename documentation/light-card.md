# Ted's Light Card

`type: custom:ted-light-card`

A tap-to-toggle card for a light (or any toggleable entity), with a dual-zone
brightness control: tap/hold the upper region to brighten, the lower region to dim
— no dialog required.

---

## Minimal example

```yaml
type: custom:ted-light-card
entity: light.kitchen
```

## Named, with brightness memory

```yaml
type: custom:ted-light-card
entity: light.lounge
name: Lounge
icon: mdi:floor-lamp
memory_mode: static
memory_value: 180   # recalled 0–255 brightness when turned on
```

---

## Configuration

### Basics

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | **required** | A `light.*` entity (or any toggleable entity). |
| `name` | string | *(friendly name)* | Display name. |
| `icon` | string | *(auto)* | Icon to show. |
| `orientation` | `vertical` \| `horizontal` | | Layout orientation. |
| `width` / `height` | number (px) | | Fixed size (outside a Sections grid). |

### Elements

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_name` / `show_icon` / `show_state` | boolean | true | Toggle each element (`show_state` = brightness %, dimmable lights). |
| `name_scale` / `icon_scale` / `state_scale` | number (%) | | Per-element size scale. |
| `element_order` | array | `["name","icon","state"]` | Vertical order of the elements. |
| `show_hint` | boolean | false | Show a subtle hint about the available interactions. |
| `hint_width` | number (px) | | Hint width. |

### Indicator & colors

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_indicator` | boolean | true | Show the indicator bar. |
| `indicator_color` | `theme` \| `light` \| `other` | `theme` | Source for indicator/icon color when on (`light` = the bulb's own RGB). |
| `indicator_color_custom` | `[r,g,b]` | | Custom color when `indicator_color: other`. |
| `indicator_width` | number (px) | | Indicator bar width. |
| `name_color` / `icon_color` / `state_color` | color | | Per-element color applied when the light is on. |
| `background` | color | | Base background (all states). |
| `background_on` | color | | Background when the light is on. |
| `rocker` | boolean | false | Rocker-style up/down buttons. |
| `rocker_effect` | boolean | false | Pressed/raised effect on the rocker. |

Plus [Appearance & theming](./README.md#appearance--theming-shared):
`theme`, `transparency`, `blur`, `brushed`, `shadow`.

### Interactions (per region)

Bind an action to each region + gesture. Values:
`increase`, `decrease`, `full_on`, `full_off`, `toggle`, `more_info`, `none`.

| Region | Tap | Double-tap | Hold |
| --- | --- | --- | --- |
| Up | `up_tap` | `up_double_tap` | `up_hold` |
| Down | `down_tap` | `down_double_tap` | `down_hold` |
| Icon | `icon_tap` | `icon_double_tap` | `icon_hold` |

> **Hold to ramp** — holding the up/down region smoothly ramps brightness in ~5% steps.

### Brightness memory

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `memory_mode` | `off` \| `static` \| `helper` | `off` | Brightness restored when the light is turned on. |
| `memory_value` | number (0–255) | | Static brightness when `memory_mode: static`. |
| `memory_entity` | string | | Helper entity storing the brightness when `memory_mode: helper`. |
