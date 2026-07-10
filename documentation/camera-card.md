# Ted's Camera Card

`type: custom:ted-camera-card`

Show one or more camera feeds — auto thumbnails or live streams — in a single card,
similar to Home Assistant's picture-glance. Supports several multi-camera layouts.

---

## Minimal example

```yaml
type: custom:ted-camera-card
cameras:
  - entity: camera.front_door
```

## Quad grid, live streams, with captions

```yaml
type: custom:ted-camera-card
layout: quad
show_name: true
cameras:
  - { entity: camera.front_door, name: Front, camera_view: live }
  - { entity: camera.driveway, name: Driveway }
  - { entity: camera.backyard, name: Backyard }
  - { entity: camera.garage, name: Garage }
```

---

## Configuration

### Cameras

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `cameras` | array | | The cameras shown (omit when `cameras_source: settings`). |
| `cameras_source` | `config` \| `settings` | `config` | `config` uses `cameras`; `settings` uses this device's per-device Cameras list from Ted's Cards settings (needs the backend). |

Each entry in `cameras`:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | **required** | A `camera.*` entity. |
| `name` | string | | Friendly-name override. |
| `camera_view` | `auto` \| `live` | `auto` | Periodic thumbnail vs. continuous stream. |
| `enabled` | boolean | true | Show/hide this camera. |

### Layout

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `layout` | `single` \| `dual` \| `quad` \| `big-small` \| `auto` | `single` | Feed arrangement (`auto` = responsive grid for all cameras). |
| `big_small_position` | `right` \| `bottom` | `right` | Small-feed strip placement in `big-small`. |
| `big_small_width` | number (%) | 25 | Portion of the card used by the small-feed strip. |
| `fit_mode` | `cover` \| `contain` | `cover` | How each feed fills its box. |
| `aspect_ratio` | string | | Fixed aspect ratio (e.g. `16:9`). Ignored in a grid with set rows. |
| `width` / `height` | number (px) | | Manual size (outside the Sections grid). |
| `fill` | boolean | | Fill the parent instead of a fixed size (ignores width/height). |

### Captions & appearance

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_name` | boolean | false | Caption overlay at the bottom of each feed. |
| `name_size` | number (px) | 14 | Caption font size. |
| `theme`, `background`, `transparency`, `blur`, `brushed` | | | See [Appearance & theming](./README.md#appearance--theming-shared). |

### Empty state (settings mode)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `empty_title` | string | | Title shown when no cameras are available. |
| `empty_message` | string | | Message body. |
| `settings_path` | string | `[root]/settings?tab=cameras` | Where the empty-state "Settings" button navigates (`[root]` = dashboard root). |

### Actions

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `tap_action` | action | more-info | Action on tap. |
| `double_tap_action` | action | | Action on double-tap. |

> Long-press a feed to temporarily make it primary or switch its view (session-only).
