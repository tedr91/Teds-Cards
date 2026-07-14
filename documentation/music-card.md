# Ted's Music Card

`type: custom:ted-music-card`

A Music Assistant player UI for the **current device**. It wraps the third-party
[**Music Assistant Player Card**](https://github.com/droans/mass-player-card)
(`custom:mass-player-card`) and feeds it the media player chosen for this device in
**Settings → Sounds** — so one shared dashboard shows the right player on each device.

If the device's media player is a physical speaker rather than its Music Assistant
entity, the card tries to find the matching Music Assistant player automatically.

---

## Requirements

This card renders `custom:mass-player-card`, which has its own dependencies. Install
these once (all via HACS) before using the Music view:

1. **Music Assistant** — the [Music Assistant](https://www.music-assistant.io/)
   add-on/server and its Home Assistant integration, with at least one player.
2. **Music Assistant Queue Actions** — the
   [`mass_queue`](https://github.com/droans/mass_queue) custom integration
   (**required** by the player card). Install it and add a config entry for your
   Music Assistant server.
3. **Music Assistant Player Card** — the
   [`mass-player-card`](https://github.com/droans/mass-player-card) Lovelace card
   (HACS → Frontend). This provides the `custom:mass-player-card` element.
4. **Ted's Cards Backend** (`teds_cards_backend`) — needed for the per-device
   **Settings → Sounds → Music player** (this card's default source).

> If `custom:mass-player-card` isn't installed, the Music view shows an "unknown
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

## Passing options to the player card

Anything in `mass_config` is merged into the embedded `mass-player-card`:

```yaml
type: custom:ted-music-card
player_source: settings
mass_config:
  default_section: media_browser
  expressive_scheme: vibrant
  queue:
    enabled: true
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
| `mass_config` | map | | Extra options merged into the embedded `mass-player-card` (see its [docs](https://github.com/droans/mass-player-card#configuration)). `type` and `entities` are managed by this card. |
| `fill` | boolean | `false` | Off (default) sizes the player to its content, centered in the view. On stretches it to fill the whole area (sets the player card's `panel`). |
| `empty_title` / `empty_message` | string | | Override the "no player configured" empty state. |
| `unmatched_title` / `unmatched_message` | string | | Override the "no Music Assistant match" state. |
| `settings_path` | string | `[root]/settings?tab=sounds&scope=device` | Where the state buttons navigate. `[root]` is your dashboard root. |
| `mass_setup_path` | string | auto-detected | Where the unmatched state's **Music Assistant** button navigates. By default the card finds the Music Assistant panel automatically; set this to override it. The button is hidden if no panel is found. |
| `theme` | `ted-style` \| `ha` | | See [Appearance & theming](./README.md#appearance--theming-shared). |

The card has no visible surface of its own — the Music Assistant Player Card brings
its own styling — so most appearance options don't apply here.
