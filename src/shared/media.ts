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
 * cancelled. HA lazy-loads this dialog on first use.
 */
export function pickMedia(
  host: HTMLElement,
  hass: HassLike,
  opts: { accept?: string[] } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    host.dispatchEvent(
      new CustomEvent("show-dialog", {
        bubbles: true,
        composed: true,
        detail: {
          dialogTag: "dialog-media-player-browse",
          dialogImport: () => customElements.whenDefined("dialog-media-player-browse"),
          dialogParams: {
            hass,
            action: "pick",
            entityId: "browser",
            accept: opts.accept ?? ["image/*"],
            mediaPickedCallback: (picked: { item?: MediaItem }) => {
              done(picked?.item?.media_content_id ?? null);
            },
          },
        },
      }),
    );
    // If HA can't open the dialog (chunk not available), don't hang forever.
    setTimeout(() => done(null), 60_000);
  });
}
