# Ted's Spacer Card

`type: custom:ted-spacer-card`

A transparent, non-interactive, fixed-size spacer. Mainly used inside a
[Room Card](./room-card.md) button section to add empty space and align tiles.

---

## Example

```yaml
type: custom:ted-spacer-card
size: 100
```

---

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | number (px) | 100 | Square size of the spacer. |

> When placed as a direct grid item (e.g. a Room Card button cell) it fills the
> cell; otherwise it uses its fixed `size`.
