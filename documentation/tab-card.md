# Ted's Tab Card

`type: custom:ted-tab-card`

A tabbed container that holds any cards — one per tab. The active tab can be
deep-linked with a URL query parameter, so navigation buttons can jump straight to
a tab (e.g. `?tab=timers`).

---

## Minimal example

```yaml
type: custom:ted-tab-card
tabs:
  - label: Alarms
    icon: mdi:alarm
    slug: alarms
    card:
      type: custom:ted-alarm-card
  - label: Timers
    icon: mdi:timer-outline
    slug: timers
    card:
      type: custom:ted-timer-card
```

Deep-link the Timers tab with `.../your-view?tab=timers`.

---

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `tabs` | array | | The tabs (see below). |
| `default_tab` | number | 0 | Zero-based index shown when no URL param matches. |
| `url_param` | string | `tab` | URL query parameter that selects the active tab. |
| `show_tabs` | boolean | true | Show the tab strip (set `false` to drive tabs externally / single tab). |
| `theme`, `background`, `transparency`, `blur`, `brushed`, `shadow`, `scale` | | | See [Appearance & theming](./README.md#appearance--theming-shared). |

Each tab:

| Field | Type | Description |
| --- | --- | --- |
| `label` | string | Tab label in the strip. |
| `icon` | string | Optional mdi icon before the label. |
| `slug` | string | URL-param value that deep-links to this tab. When unset, matched by zero-based index. |
| `card` | card config | Any Lovelace card rendered when the tab is active. |

> Any Lovelace card works inside a tab — not just Ted's Cards. Cards are created on
> demand and cached; switching tabs also updates the URL so the state is shareable.
