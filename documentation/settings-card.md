# Ted's Settings Card

`type: custom:ted-settings-card`

Global and per-device settings for the Ted's Cards system. Settings drive things
like the notification/alarm/timer sounds and volumes, the media player used for
playback, dashboard navigation paths, and the navbar's per-device behaviour.

> **Requires the [Ted's Cards Backend](https://github.com/tedr91/Teds-Cards-Backend)
> integration** — it reads/writes `sensor.teds_settings`.

---

## Minimal example

```yaml
type: custom:ted-settings-card
```

## Just the Timers group, on the This-device tab

```yaml
type: custom:ted-settings-card
sections: [Timers]
show_global: false
```

---

## Scopes: Global vs. This device

- **Global** settings apply to every device.
- **This device** settings override Global for the current browser/device only.

You can either let each card show its own Global/This-device tabs (`scope: tabs`,
the default), or drive several cards from **one shared switch**:

```yaml
# The single toggle
- type: custom:ted-settings-card
  variant: scope-toggle
# Cards that follow it
- type: custom:ted-settings-card
  sections: [Notifications]
  scope: shared
  show_header: false
```

---

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | `Settings` | Header text. |
| `sections` | string[] | *(all)* | Render only these setting groups (e.g. `["Timers"]`). |
| `show_global` | boolean | true | Show the Global tab. |
| `show_device` | boolean | true | Show the This-device tab. |
| `show_header` | boolean | true | Show the card header (icon + title). |
| `scope` | `tabs` \| `shared` | `tabs` | `tabs` = own Global/This-device tabs; `shared` = follow a `variant: scope-toggle` card. |
| `variant` | `settings` \| `scope-toggle` | `settings` | `settings` renders the fields; `scope-toggle` renders only the Global/This-device switch. |
| `theme`, `background`, `transparency`, `blur`, `brushed`, `shadow` | | | See [Appearance & theming](./README.md#appearance--theming-shared). |

Setting groups include **Timers**, **Alarms**, **Notifications**, **Media**,
**Navbar**, **General**, and **Navigation**. Non-admins can view Global settings
read-only; the This-device scope stays editable.
