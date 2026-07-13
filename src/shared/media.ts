/**
 * Thin wrappers over Home Assistant's media-source + image-upload APIs, used by
 * the Background Wallpaper UI (Single Image "Select"/"Add", Slideshow folders)
 * and the ted-background-card (resolving media-source URIs, enumerating folders).
 *
 * These call HA's own WebSocket / HTTP endpoints directly so we don't need to
 * import any private frontend modules.
 */

const DOMAIN = "teds_cards_backend";

interface HassLike {
  callWS?<T>(msg: Record<string, unknown>): Promise<T>;
  fetchWithAuth?(path: string, init?: RequestInit): Promise<Response>;
}

export interface MediaItem {
  title: string;
  media_content_id: string;
  media_content_type: string;
  media_class: string;
  can_play: boolean;
  can_expand: boolean;
  thumbnail?: string | null;
  children?: MediaItem[];
}

interface ResolvedMediaSource {
  url: string;
  mime_type: string;
}

/** Categorised built-in wallpaper URLs from the backend. */
export interface BuiltinBackgrounds {
  general: string[];
  light: string[];
  dark: string[];
}

const IMAGE_EXT_RE = /\.(webp|jpe?g|png|gif|avif|bmp|svg)(\?.*)?$/i;

export function isMediaSourceUri(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("media-source://");
}

/** Resolve a `media-source://` URI to a fetchable (signed) URL. */
export async function resolveMediaSource(hass: HassLike, mediaContentId: string): Promise<string | null> {
  try {
    const res = await hass.callWS?.<ResolvedMediaSource>({
      type: "media_source/resolve_media",
      media_content_id: mediaContentId,
    });
    return res?.url ?? null;
  } catch {
    return null;
  }
}

/** Browse a media-source folder (or the root when no id is given). */
export async function browseMedia(hass: HassLike, mediaContentId?: string): Promise<MediaItem | null> {
  try {
    return (
      (await hass.callWS?.<MediaItem>({
        type: "media_source/browse_media",
        media_content_id: mediaContentId,
      })) ?? null
    );
  } catch {
    return null;
  }
}

/** The playable image children of a folder, as media-source URIs. */
export async function listFolderImages(hass: HassLike, folderId: string): Promise<string[]> {
  const item = await browseMedia(hass, folderId);
  if (!item?.children) return [];
  return item.children
    .filter(
      (c) =>
        c.can_play &&
        (c.media_content_type?.startsWith("image/") || IMAGE_EXT_RE.test(c.media_content_id)),
    )
    .map((c) => c.media_content_id);
}

/** The built-in wallpaper catalogue served by the backend. */
export async function listBuiltinBackgrounds(hass: HassLike): Promise<BuiltinBackgrounds> {
  try {
    const res = await hass.callWS?.<BuiltinBackgrounds>({ type: `${DOMAIN}/list_backgrounds` });
    return { general: res?.general ?? [], light: res?.light ?? [], dark: res?.dark ?? [] };
  } catch {
    return { general: [], light: [], dark: [] };
  }
}

/** Upload an image to HA's image store; returns a stable `/api/image/serve/…`
 *  URL that never expires and needs no resolving. */
export async function uploadImage(hass: HassLike, file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const resp = await hass.fetchWithAuth?.("/api/image/upload", { method: "POST", body: fd });
  if (!resp || resp.status !== 200) return null;
  const media = (await resp.json()) as { id: string };
  if (!media?.id) return null;
  return `/api/image/serve/${media.id}/original`;
}

/**
 * Open HA's native media browser dialog to pick an image. Resolves with the
 * picked item's `media_content_id` (a `media-source://` URI), or null if
 * cancelled.
 *
 * HA lazy-loads `dialog-media-player-browse` via a dynamic `import()` inside its
 * own `showMediaBrowserDialog` helper — a path we can't reference from a custom
 * card. Firing `show-dialog` with `customElements.whenDefined(...)` as the
 * `dialogImport` never actually loads the chunk, so on a fresh page the dialog
 * silently never opens. Instead we mount HA's own `<ha-selector>` media control
 * off-screen *inside the calling card* (so its bubbling `show-dialog` reaches
 * `<home-assistant>`) and trigger its pick: ha-selector runs the correct import
 * + dialog for us, and reports the choice back via `value-changed`.
 */
export function pickMedia(
  host: HTMLElement,
  hass: HassLike,
  opts: { accept?: string[] } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selector = document.createElement("ha-selector") as any;
    selector.hass = hass;
    selector.selector = { media: { accept: opts.accept ?? ["image/*"] } };
    selector.value = {};
    // Keep it out of view but still clickable / event-connected.
    Object.assign(selector.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      opacity: "0",
    } as Partial<CSSStyleDeclaration>);

    const cleanup = () => {
      selector.removeEventListener("value-changed", onValue);
      selector.remove();
    };
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(v);
    };
    const onValue = (e: Event) => {
      const value = (e as CustomEvent).detail?.value as { media_content_id?: string } | undefined;
      done(value?.media_content_id ?? null);
    };
    selector.addEventListener("value-changed", onValue);

    // Mount INSIDE the card so the media-browser `show-dialog` event bubbles up
    // through the card to `<home-assistant>` (a body-level mount would not).
    host.appendChild(selector);

    // ha-selector lazy-renders <ha-selector-media>, which renders a clickable
    // ha-card that opens the media browser. Click it once it exists.
    const tryPick = (attempt: number) => {
      if (settled) return;
      const inner = selector.shadowRoot?.querySelector("ha-selector-media");
      const card = inner?.shadowRoot?.querySelector("ha-card") as HTMLElement | null;
      if (card) {
        card.click();
        return;
      }
      if (attempt < 120) requestAnimationFrame(() => tryPick(attempt + 1));
      else done(null);
    };
    customElements.whenDefined("ha-selector").then(() => requestAnimationFrame(() => tryPick(0)));

    // Safety net: if HA can't provide the control, don't hang or leak the node.
    setTimeout(() => done(null), 60_000);
  });
}
