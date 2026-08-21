# Ted's Music Card

`type: custom:ted-music-card`

A self-contained Music Assistant player UI for the **current device**. It drives the
media player chosen for this device in **Settings → Sounds** — so one shared dashboard
shows the right player on each device — and renders its own now-playing player with
**Media / Queue / Recent / Lyrics** tabs.

The **Media** tab browses your Music Assistant library as **artwork tiles** (or a
list): Playlists, Albums, Artists, and Favorites, plus a Recently-played row. Tap any
item to play it on the resolved player.

If the device's media player is a physical speaker rather than its Music Assistant
entity, the card tries to find the matching Music Assistant player automatically.

---

## Requirements

Install these once (all via HACS) before using the Music view:

1. **Music Assistant** — the [Music Assistant](https://www.music-assistant.io/)
   add-on/server and its Home Assistant integration, with at least one player.
2. **`mass_queue`** — the [`mass_queue`](https://github.com/droans/mass_queue) custom
   integration (add a config entry for your Music Assistant server). Powers the
   **Queue**, **Recent**, and **Lyrics** tabs; without it only the Media tab shows.
3. **Ted's Dashboard System** (`teds_dashboard_system`) — needed for the per-device
   **Settings → Sounds → Music player** (this card's default source).

---

## Minimal example

Drive the player from this device's Settings player (the recommended setup):

```yaml
type: custom:ted-music-card
dashboard_integration: true
```

## Fixed player (no per-device Settings)

```yaml
type: custom:ted-music-card
entity: media_player.kitchen_music_assistant
```

## Media tab

The Media tab browses your Music Assistant library and plays items on the resolved
player. It offers four filters — **Playlists**, **Albums**, **Artists**, and
**Favorites** (favorited playlists) — plus a **Recently played** row across playlists
and albums. Tap any item to play it (replacing the queue).

Choose how items are presented with `media_layout`:

- **`tiles` (default)** — a responsive artwork grid.
- **`list`** — compact rows with a small thumbnail.

A toggle in the tab's header switches tiles/list at runtime; `media_layout` sets the
starting layout.

```yaml
type: custom:ted-music-card
dashboard_integration: true
media_layout: tiles
```

---

## Mini player

Set `mode: mini` for a compact bar that adapts to the space it's given:

- **Width.** When the card is wide, all transport controls (shuffle, previous,
  play/pause, next, repeat) are inline. As it narrows, the extra controls fold away
  — first leaving just **Play/Pause**, then none. Anything not shown inline (plus
  Media, Queue, Volume, and Party Mode) lives in the action menu.
- **Tap for the menu.** Tapping anywhere on the bar (outside the transport buttons)
  opens the action menu. It flies up from the bar, or down when the card sits near
  the top of the screen.
- **Height.** In a one-row card everything sits on a single line. When the card is
  two rows tall (or an auto-height card ends up tall enough), the controls drop to a
  row below the title/artist for more breathing room.
- **Now playing.** While audio is playing, an animated equalizer shows at the right
  of the bar (in the controls row, or the title row when the controls are stacked).

The thumbnail auto-sizes to the card height in every case.

```yaml
type: custom:ted-music-card
dashboard_integration: true
mode: mini
```

---

## How the player is chosen

1. **`entity`** on the card (if set) — always wins.
2. Otherwise, when `dashboard_integration: true`, this device's
   **Settings → Sounds → Music player**, falling back to the
   **System sounds player**, then the device's own registered player.
3. The resolved entity is then mapped to a **Music Assistant** player:
   - If it's already a Music Assistant `media_player`, it's used as-is.
   - Otherwise (a physical speaker) and `auto_resolve_mass_player` is on, the card
     looks for a Music Assistant player on the **same device**, then — when nothing is
     configured for this device — the best player in the **same room**, then one with a
     **matching name**. Room preference goes HomePod → Sonos → Chromecast → AirPlay →
     DLNA, and a stereo pair's combined player is chosen over its left/right channels
     so playback is never mono.
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
| `dashboard_integration` | boolean | `false` | YAML-only. When `true`, the player comes from this device's Ted's Cards Settings (Music player, then System sounds player, then the device's own player) instead of `entity`. |
| `entity` | string | | A `media_player.*` entity. Used when `dashboard_integration` is off; overrides the Settings value when set. |
| `mode` | `full` \| `mini` | `full` | `full` = the now-playing player with Media/Queue/Recent/Lyrics tabs; `mini` = a compact bar that adapts its controls and layout to the card size. |
| `media_layout` | `tiles` \| `list` | `tiles` | How the Media tab presents library items — artwork tiles or rows. A header toggle overrides it at runtime. |
| `auto_resolve_mass_player` | boolean | `true` | If the player isn't a Music Assistant entity, find its Music Assistant match at runtime (by device, then name). |
| `background_mode` | `blur` \| `none` | `blur` | Player surface: `blur` = frosted album art; `none` = the active theme surface. |
| `lock_target_device` | boolean | `false` | Make the "cast to" chip a static label (no device-switching flyout). |
| `apply_music_volume` | boolean | `true` | When playback first starts, set the player to this device's **Music volume** setting (Settings → Sounds → Music). Set `false` to leave the volume untouched. |
| `empty_title` / `empty_message` | string | | Override the "no player configured" empty state. |
| `unmatched_title` / `unmatched_message` | string | | Override the "no Music Assistant match" state. |
| `settings_path` | string | `[root]/settings?tab=sounds&scope=device` | Where the state buttons navigate. `[root]` is your dashboard root. |
| `mass_setup_path` | string | auto-detected | Where the unmatched state's **Music Assistant** button navigates. By default the card finds the Music Assistant panel automatically; set this to override it. The button is hidden if no panel is found. |
| `party_url` | string | `http://<hostname>:8095` | Base URL of the Music Assistant server for the mini player's **Party Mode!** action. |
| `party_view_path` | string | `webview` | Dashboard view the Party page opens in (the Ted Web View page). |
| `theme` | `ted-style` \| `ha` | | See [Appearance & theming](./README.md#appearance--theming-shared). |
