# Ted's Remote Card

`type: custom:ted-remote-card`

A remote-control card for **Apple TV** and **Kaleidescape** devices. Sends
`remote.send_command` calls and (optionally) reflects a media player's state for
play/pause and power decisions.

---

## Minimal example

```yaml
type: custom:ted-remote-card
remote_entity: remote.living_room_apple_tv
```

## Apple TV with a media player + quick-launch apps

```yaml
type: custom:ted-remote-card
remote_entity: remote.apple_tv
media_player_entity: media_player.apple_tv
name: Apple TV
app_launch_1: Netflix
app_launch_2: Disney+
app_launch_3: YouTube
```

---

## Configuration

### Device

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `remote_entity` | string | **required** | The `remote.*` entity that receives commands. |
| `device_family` | `apple-tv` \| `kaleidescape` | *(auto)* | Auto-detected from the remote's integration when omitted. |
| `media_player_entity` | string | | Optional `media_player.*` — drives state display and play/pause + power. |
| `kaleidescape_home` | string | | Kaleidescape only: destination the Home button navigates to (a remote alias). |

### Header & appearance

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | | Card display name. |
| `theme` | `manufacturer` \| `ted-style` \| `ha` | | `manufacturer` = Firemote-style; `ted-style` = self-contained; `ha` = follow HA theme. |
| `show_icon` | boolean | true | Show the device icon/logo. |
| `icon_scale` | number (%) | | Icon size scale. |
| `show_name` | boolean | true | Show the card name. |
| `name_scale` | number (%) | | Name size scale. |
| `scale` | number (%) | | Overall card scale. |
| `show_status_indicator` | boolean | false | On/off/playing status dot in the header. |
| `background`, `transparency`, `blur`, `brushed` | | | See [Appearance & theming](./README.md#appearance--theming-shared). |

### Apple TV quick-launch apps

| Option | Type | Description |
| --- | --- | --- |
| `app_launch_1` … `app_launch_6` | string | Quick-launch app button names (media_player source names). Apple TV only. |

> Supports the `apple_tv` integration and the `kaleidescape_strato` custom
> integration. Directional buttons support hold-to-repeat and double-click.
