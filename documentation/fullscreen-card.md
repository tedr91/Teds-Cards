# Ted's Fullscreen Card

`type: custom:ted-fullscreen-card`

A container that houses a **single** card (Music, Camera, Calendar, …) and lets you
toggle it between a normal card and a **full-screen** overlay with a small circular
icon in the top-right corner.

- **Normal** — a standard card with a circular *expand* icon
  (`fluent:arrow-maximize-20-regular`) in the top-right corner.
- **Full-screen** — the housed card fills the dashboard content area, with a circular
  *minimize* icon (`fluent:arrow-minimize-20-regular`) that **restores** it back to
  normal (it doesn't hide the card).

The overlay is drawn in the browser's top layer, so it escapes any clipped or
transformed dashboard layout and correctly clears the navbar, header and device
safe-areas.

---

## Minimal example

```yaml
type: custom:ted-fullscreen-card
card:
  type: custom:ted-music-card
```

Start maximized, and fill the grid cell in the normal state:

```yaml
type: custom:ted-fullscreen-card
start_maximized: true
fill: true
card:
  type: custom:ted-camera-card
```

---

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `card` | card config | | The single Lovelace card this container houses. |
| `theme` | `ha` \| `ted-style` | `ha` | Surface theme for the wrapper. |
| `show_toggle` | boolean | true | Show the corner expand/collapse button. |
| `start_maximized` | boolean | false | Start full-screen when there is no saved state. |
| `fill` | boolean | false | Fill the grid cell in the normal (non-maximized) state. |
| `expand_icon` | string | `fluent:arrow-maximize-20-regular` | Override the "expand" corner icon. |
| `minimize_icon` | string | `fluent:arrow-minimize-20-regular` | Override the "minimize/restore" corner icon. |
| `background`, `transparency`, `blur`, `brushed`, `shadow`, `scale` | | | Appearance (general) — see [Appearance & theming](./README.md#appearance--theming-shared). When any of `background` / `transparency` / `blur` / `brushed` is set, the card paints its own frosted surface behind the housed card (otherwise it stays a transparent passthrough). |
| `backend_integration` | boolean | false | **YAML-only.** Opt in to the Ted's Cards backend (save state + smarter sizing — see below). |
| `state_key` | string | | **YAML-only.** Identifies this card when saving its maximized state. Required for the state to persist. |
| `empty_title`, `empty_message` | string | | Text shown when no `card` is configured. |

> Any Lovelace card works inside it — not just Ted's Cards. The card is created on
> demand and cached; toggling full-screen moves the same card element between the
> normal slot and the overlay (it is never rebuilt).

---

## Backend integration (optional)

With `backend_integration: true` the card uses the Ted's Cards backend to unlock:

- **Saved state** — the normal/maximized state is remembered per device and restored
  on reload. This requires a **`state_key`** so each card is identified; without one
  the state stays in memory only.
- **Smarter full-screen sizing** — the overlay is aware of the navbar's **position**
  and **auto-hide** setting. It reserves space for a fixed navbar on its edge, but when
  the navbar is set to auto-hide it sizes fully under the collapsed pill. The overlay is
  also capped to this device's known screen size.

```yaml
type: custom:ted-fullscreen-card
backend_integration: true
state_key: music-view-player
card:
  type: custom:ted-music-card
```

Without the backend, full-screen still clears a bottom/top navbar and the safe-areas
(via the reserved-space CSS variables the navbar publishes); side-navbar avoidance and
saved state require `backend_integration`.
