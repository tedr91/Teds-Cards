# Ted's Music Card

`type: custom:ted-music-card`

A Music Assistant player UI for the **current device**. It wraps a third-party media
player card — by default [**Yet Another Media Player**](https://github.com/jianyu-li/yet-another-media-player)
(`custom:yet-another-media-player`, "YAMP"), or optionally the
[**Music Assistant Player Card**](https://github.com/droans/mass-player-card)
(`custom:mass-player-card`) — and feeds it the media player chosen for this device in
**Settings → Sounds** — so one shared dashboard shows the right player on each device.

It can render as a single pane, or as a **side-by-side split** with the now-playing
player on the left and a library/search/queue pane on the right (both driving the
same player), complete with a draggable layout pill for switching split ratios.

If the device's media player is a physical speaker rather than its Music Assistant
entity, the card tries to find the matching Music Assistant player automatically.

---

## Requirements

This card renders a third-party player card, which has its own dependencies. Install
these once (all via HACS) before using the Music view:

1. **Music Assistant** — the [Music Assistant](https://www.music-assistant.io/)
   add-on/server and its Home Assistant integration, with at least one player.
2. **The player card for your engine:**
   - **`engine: yamp` (default)** — [`yet-another-media-player`](https://github.com/jianyu-li/yet-another-media-player)
     (HACS → Frontend). Provides the `custom:yet-another-media-player` element.
   - **`engine: mass`** — [`mass-player-card`](https://github.com/droans/mass-player-card)
     (HACS → Frontend) **plus** the [`mass_queue`](https://github.com/droans/mass_queue)
     custom integration it requires (add a config entry for your Music Assistant server).
3. **Ted's Cards Backend** (`teds_cards_backend`) — needed for the per-device
   **Settings → Sounds → Music player** (this card's default source).

> If the selected engine's card isn't installed, the Music view shows an "unknown
> card" error instead of the player.

---

## Minimal example

Drive the player from this device's Settings player (the recommended setup):

```yaml
type: custom:ted-music-card
player_source: settings
```

## Fixed player (no per-device Settings)

```yaml
type: custom:ted-music-card
player_source: config
entity: media_player.kitchen_music_assistant
```

## Choosing the engine

The player card is selected with `engine`:

- **`yamp` (default)** — renders [Yet Another Media Player](https://github.com/jianyu-li/yet-another-media-player).
  Extra options go in `yamp_config`.
- **`mass`** — renders [Music Assistant Player Card](https://github.com/droans/mass-player-card).
  Extra options go in `mass_config`.

```yaml
type: custom:ted-music-card
player_source: settings
engine: yamp
yamp_config:
  template: large_modern
  match_theme: true
```

`type` and `entities` are always managed by this card; everything else in
`yamp_config` / `mass_config` is merged straight into the embedded card.

---

## Side-by-side split & layout pill

Set `split` to a left-pane width percent to show two panes: the **now-playing
player on the left** and a **library / search / queue pane on the right**, both
driving the same resolved player and kept in sync via HA state.

```yaml
type: custom:ted-music-card
player_source: settings
engine: yamp
fill: true
split: 60          # 60% player (left) + 40% browse (right)
yamp_config:
  template: large_modern
  match_theme: true
left_config:       # merged into the LEFT (player) pane only
  idle_screen: default
right_config:      # merged into the RIGHT (browse) pane only
  template: crisp_clean
```

- **`split`** — one of `100` (single pane, default), `70`, `60`, `50`, `40`, `30`.
- **`left_config` / `right_config`** — engine-specific options merged into just that
  pane. For YAMP the left pane defaults to `card_type: default` (the player) and the
  right pane to `card_type: search` (dedicated browse).
- **Layout pill** — when the card fills its area, a vertical pill sits between the
  panes. **Tap** it for a flyout of split ratios, or **drag** it left/right to resize
  (snaps to the presets; works with touch). Your choice persists per view. Hide it
  with `layout_switcher: false`.
- On narrow screens (< ~700px) the split collapses to the player-only pane.

**Idle image example** (YAMP shows a static image on the left when nothing is
playing):

```yaml
left_config:
  idle_image: /local/my-idle-art.jpg
  show_idle_artwork_when_not_playing: true
```

---

## How the player is chosen

1. **`entity`** on the card (if set) — always wins.
2. Otherwise, when `player_source: settings` (default), this device's
   **Settings → Sounds → Music player**, falling back to the
   **System sounds player**, then the device's own registered player.
3. The resolved entity is then mapped to a **Music Assistant** player:
   - If it's already a Music Assistant `media_player`, it's used as-is.
   - Otherwise (a physical speaker) and `auto_resolve_mass_player` is on, the card
     looks for a Music Assistant player on the **same device**, then one with a
     **matching name**.
   - If no Music Assistant player is found, the card shows a short "No Music
     Assistant player" note with a **Settings** button and a **Music Assistant**
     button. Enabling Music Assistant's **Home Assistant** player provider (so your
     speakers are exposed as Music Assistant players) is the most reliable fix.

Pick this device's **Music Assistant** player directly in Settings for the most
reliable result.

---

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `player_source` | `settings` \| `config` | `settings` | Where the player comes from. `settings` uses the per-device Music player (then the System sounds player, then the device's own player); `config` uses `entity`. |
| `entity` | string | | A `media_player.*` entity. Required for `player_source: config`; overrides the Settings value when set. |
| `auto_resolve_mass_player` | boolean | `true` | If the player isn't a Music Assistant entity, find its Music Assistant match at runtime (by device, then name). |
| `engine` | `yamp` \| `mass` | `yamp` | Which player card renders the resolved player. `yamp` = Yet Another Media Player; `mass` = Music Assistant Player Card. |
| `yamp_config` | map | | Extra options merged into the embedded `yet-another-media-player` (see its [docs](https://github.com/jianyu-li/yet-another-media-player#basic-usage)). Used when `engine: yamp`. `type`/`entities` are managed by this card. |
| `mass_config` | map | | Extra options merged into the embedded `mass-player-card` (see its [docs](https://github.com/droans/mass-player-card#configuration)). Used when `engine: mass`. `type`/`entities` are managed by this card. |
| `split` | `100` \| `70` \| `60` \| `50` \| `40` \| `30` | `100` | Left-pane width percent. `100` = single pane; below that renders player (left) + library/search/queue (right). |
| `left_config` | map | | Options merged into the LEFT (player) pane when `split` < 100 (engine-specific keys). |
| `right_config` | map | | Options merged into the RIGHT (library/search/queue) pane when `split` < 100. |
| `layout_switcher` | boolean | `true` | Show the draggable layout pill (between panes) that switches split ratios. Only shown when the card fills its area. |
| `fill` | boolean | `false` | Off (default) sizes the player to its content, centered in the view. On stretches it to fill the whole area. A split always fills. |
| `apply_music_volume` | boolean | `true` | When playback first starts, set the player to this device's **Music volume** setting (Settings → Sounds → Music). Set `false` to leave the volume untouched. |
| `empty_title` / `empty_message` | string | | Override the "no player configured" empty state. |
| `unmatched_title` / `unmatched_message` | string | | Override the "no Music Assistant match" state. |
| `settings_path` | string | `[root]/settings?tab=sounds&scope=device` | Where the state buttons navigate. `[root]` is your dashboard root. |
| `mass_setup_path` | string | auto-detected | Where the unmatched state's **Music Assistant** button navigates. By default the card finds the Music Assistant panel automatically; set this to override it. The button is hidden if no panel is found. |
| `theme` | `ted-style` \| `ha` | | See [Appearance & theming](./README.md#appearance--theming-shared). |

The card has no visible surface of its own — the embedded player card brings
its own styling — so most appearance options don't apply here.
