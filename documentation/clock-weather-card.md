# Ted's Clock / Weather Card

`type: custom:ted-clock-weather-card`

A large clock with an optional date and current weather. The fonts scale to the
card's width, so it stays crisp from a small tile up to a full wall-panel header.

---

## Minimal example

```yaml
type: custom:ted-clock-weather-card
show_weather: true
weather_entity: weather.forecast_home
```

## Clock + date + weather header

```yaml
type: custom:ted-clock-weather-card
clock_size: extra_large
show_date: true
date_format: standard
show_weather: true
weather_entity: weather.forecast_home
icon_style: fancy
```

---

## Configuration

### Card

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `backend_integration` | boolean | false | Opt into Ted's Cards Backend (YAML-only). When on and no `weather_entity` is set on the card, the entity is sourced from the global **Weather entity** setting (Settings → General; device scope, then global). Off = no backend dependency. |
| `hug_content` | boolean | false | Hug the content height (fonts sized to width) instead of filling the container — lets an `auto`-height grid area size to the clock. |
| `max_height` | string (CSS) | | Cap the card height (e.g. `calc(100dvh * 0.25)`); fonts scale down to fit. |
| `theme`, `background`, `transparency`, `blur`, `brushed`, `shadow` | | | See [Appearance & theming](./README.md#appearance--theming-shared). |

### Clock

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_clock` | boolean | true | Show the clock. |
| `clock_size` | `small` \| `medium` \| `large` \| `extra_large` \| `custom` | `large` | Clock size. |
| `clock_size_custom` | number (px) | | Size when `clock_size: custom`. |
| `clock_offset` | number (0–100) | | Horizontal position (0 = left, 100 = right). |
| `time_format` | `auto` \| `12h` \| `24h` \| `custom` | `auto` | Time format. |
| `time_format_custom` | string | | Token format (`HH H hh h MM mm SS ss AM PM`). |

### Date

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_date` | boolean | false | Show the date. |
| `date_size` | `standard` \| `custom` | `standard` | Date size. |
| `date_size_custom` | number (px) | | Size when `date_size: custom`. |
| `date_format` | `standard` \| `custom` | `standard` | Date format. |
| `date_format_custom` | string | | Token format (`dddd ddd MMMM MMM DD D YYYY YY`). |
| `date_below_clock` | boolean | false | Place the date below the clock instead of inline. |
| `date_offset` | number (0–100) | | Horizontal position. |

### Weather

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_weather` | boolean | false | Show the weather. |
| `weather_entity` | string | | A `weather.*` entity. When omitted and `backend_integration: true`, falls back to the global **Weather entity** setting, then to the first `weather.*` entity found. |
| `weather_size` | `standard` \| `custom` | `standard` | Weather size. |
| `weather_size_custom` | number (px) | | Size when `weather_size: custom`. |
| `show_weather_icon` | boolean | true | Show the weather icon. |
| `show_current_temp` | boolean | true | Show the current temperature. |
| `weather_above_clock` | boolean | false | Place the weather above the clock instead of inline. |
| `weather_offset` | number (0–100) | | Horizontal position. |
| `icon_style` | `basic` \| `cool` \| `fancy` | `basic` | Weather icon style. |

> **Tip (grid layouts):** with `hug_content: true` (or an explicit height on the
> card's grid row) the clock sizes to its content, which pairs well with an
> `auto` / `1fr` grid template.
