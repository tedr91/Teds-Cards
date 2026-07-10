# Ted's Room Card

`type: custom:ted-room-card`

A room dashboard in a single card: a **status strip** at the top (temperature,
occupancy, brightness, volume, …) over an optional **room photo**, followed by
reorderable **sections** of embedded [Light](./light-card.md),
[Cover](./cover-card.md), [Button](./button-card.md), [Camera](./camera-card.md),
and [Spacer](./spacer-card.md) cards.

---

## Minimal example

```yaml
type: custom:ted-room-card
area: kitchen
```

## With a status strip and a button section

```yaml
type: custom:ted-room-card
area: living_room
show_header_icon: true
status_items:
  - { type: temperature }
  - { type: occupancy }
sections:
  - title: Lights
    show_title: true
    buttons:
      - { type: custom:ted-light-card, entity: light.lounge }
      - { type: custom:ted-light-card, entity: light.lamp }
```

---

## Configuration

### Room & header

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `area` | string | | The HA area this card represents (title default + entity auto-pull). |
| `name` | string | *(area name)* | Title override. |
| `icon` | string | | Header icon (when `show_header_icon`). |
| `show_header_icon` | boolean | false | Show the header icon. |
| `header_icon_style` | `standard` \| `watermark` | `standard` | Icon style when shown. |
| `header_icon_size` | number (px) | | Icon size override. |
| `show_header_name` | boolean | true | Show the name. |
| `header_name_size` | number (px) | | Name size override. |
| `header_divider` | boolean | false | Divider line under the header. |
| `header_align` | `top` \| `middle` \| `bottom` | `top` | Vertical alignment of the header in the status strip. |
| `header_h_align` | `left` \| `center` \| `right` | `left` | Horizontal alignment of the header. |

### Watermark icon (when `header_icon_style: watermark`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `icon_transparency` | number (0–100) | 0 | Glyph transparency. |
| `icon_bg_transparency` | number (0–100) | 80 | Icon background transparency. |
| `icon_color` / `icon_bg_color` | color | | Glyph / background color overrides. |

### Status strip

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `status_items` | array | | Items in the top strip. Types: `temperature`, `occupancy`, `brightness`, `volume`, `led`, `spacer` (each with its own sub-config). |
| `status_align` | `top` \| `middle` \| `bottom` | `top` | Vertical alignment of the status items. |
| `status_icon_size` | number (px) | 16 | Status icon size. |

### Photo

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_photo` | boolean | true | Show the room photo behind the UI. |
| `photo_source` | `bundled` \| `custom` \| `camera` | `bundled` | Where the photo comes from. |
| `photo` | string | `auto` | Bundled photo key, or `auto` to match the room name. |
| `photo_url` | string | | Custom photo path/URL (source `custom`). |
| `photo_camera_entity` | string | | Camera used as the photo (source `camera`). |
| `photo_camera_view` | `auto` \| `live` | `auto` | Camera view mode. |
| `photo_camera_fit` | `cover` \| `contain` | `cover` | Camera fit mode. |
| `photo_placement` | `top` \| `below_header` \| `fill` | `top` | Where the photo sits. |
| `photo_height` | number (px) | *(natural)* | Cropped height (top / below_header). |
| `photo_align` | `top` \| `center` \| `bottom` | `center` | Vertical focal point when cropped. |
| `shift_buttons_down` | boolean | true | Pad the body so buttons sit below a `top` photo. |
| `photo_edge_gradient` | array | *(per placement)* | Edges to darken with a legibility scrim (`top`/`left`/`right`/`bottom`). |
| `photo_opacity` | number (0–100) | 100 | Photo opacity. |
| `photo_state_entity` | string \| string[] | | Entity/entities whose on/off state drives the photo treatment. |
| `photo_off_grayscale` | boolean | false | Greyscale the photo while the state entity is off. |
| `photo_off_opacity` | number (0–100) | 25 | Photo opacity while off. |

### Sections

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `sections` | array | | Button sections below the status strip (see below). |
| `section_layout` | `stacked` \| `tabbed` | `stacked` | Vertical stack vs. tabbed sections. |

Each section:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | | Section heading. |
| `icon` | string | | Icon in the section's tab (tabbed layout). |
| `show_title` | boolean | false | Show the section title. |
| `title_align` | `left` \| `center` \| `right` | `left` | Title alignment. |
| `max_rows` | number | 0 | Max 5-wide rows before a "…" overflow button (0 = unlimited). |
| `buttons` | array | **required** | Embedded Ted card configs (Button / Cover / Light / Camera / Spacer). |

Each embedded button may add sizing hints `ted_button_width` / `ted_button_height`
(`half` \| `normal` \| `2x` \| `3x` \| `4x` \| `full`; default `normal`) to span
multiple cells in the 5-column grid.

### Appearance

`theme`, `background`, `transparency`, `blur`, `brushed` — see
[Appearance & theming](./README.md#appearance--theming-shared).
