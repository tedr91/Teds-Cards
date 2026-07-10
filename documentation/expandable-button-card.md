# Ted's Expandable Button Card

`type: custom:ted-expandable-button-card`

A button that, on tap, opens a popup of child buttons — which may themselves be
expandable (nested popups). Great for grouping related controls behind one tile
(e.g. a "Scenes" or "Debug" menu).

The trigger button supports **all [Button Card](./button-card.md) options**
(icon, name, colors, appearance, actions, etc.). The options below are added on top.

---

## Minimal example

```yaml
type: custom:ted-expandable-button-card
name: Scenes
icon: mdi:palette
items:
  - type: custom:ted-button-card
    name: Movie
    icon: mdi:movie
    tap_action: { action: call-service, service: scene.turn_on, target: { entity_id: scene.movie } }
  - type: custom:ted-button-card
    name: Bright
    icon: mdi:brightness-7
    tap_action: { action: call-service, service: scene.turn_on, target: { entity_id: scene.bright } }
```

---

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | array | | Child buttons shown in the popup. Each item is a [Button Card](./button-card.md) config **or** another Expandable Button Card (for nested popups). |
| `popup_layout` | `grid` \| `list` | `grid` | Popup arrangement: `grid` (square tiles) or `list` (single vertical list). |
| `popup_max_columns` | number | *(no limit)* | Max columns in grid layout. Unset = one row sized to the button count. Ignored for `list`. |
| `popup_title` | string | | Optional heading at the top of the popup. |
| `flip_icon` | boolean | true | Flip the trigger icon (e.g. a chevron) 180° while the popup is open. |

Plus every [Button Card](./button-card.md) option for the trigger tile itself.

> The popup uses the browser's native popover, so it opens above the dashboard and
> light-dismisses when you tap outside.
