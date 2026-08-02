# Playground

The Playground is the second main screen of EXT-TO-JSON. Once you've converted
an extension to JSON, the playground lets you **test it live** — browse the
source's catalog, search, view anime details, list episodes, resolve videos
across servers, and play them in a real video player.

> The playground is **not a mock**. It genuinely fetches the live source site
> server-side (so there are no CORS issues) and applies the JSON's CSS
> selectors via cheerio — exactly the same selectors the original Aniyomi
> extension would apply via JSoup. If the site is down, geo-blocked, or
> anti-bot-protected, the playground surfaces that error explicitly.

---

## Picking an extension

The Playground opens with a library picker listing every extension in your
`converted/` folder (backed by the SQLite cache for fast listing). Each entry
shows:

- Display name, language, source type badge.
- Health score badge (green / amber / red) and one-line summary.
- Capabilities pills (Latest, Search, Filters, Episodes, Videos, Subtitles,
  Audio).
- Last-converted timestamp.

Click an extension to load it. The full `ExtensionJson` document is fetched
from `/api/extensions/:id` and kept in memory for the session.

> From the Converter screen, after a successful conversion you can click
> "Open in Playground" to jump directly to that extension.

---

## Browse: popular & latest

Two tabs at the top of the playground:

- **Popular** — calls `POST /api/playground/browse` with
  `{ extensionId, type: "popular", page }`.
- **Latest** — same endpoint, `type: "latest"`. Only shown if
  `capabilities.supportsLatest` is true.

The backend (`src/lib/playground/parse.ts::fetchAndParseBrowse`):

1. Resolves the endpoint's URL template (`browse.popular.url` /
   `browse.latest.url`) by substituting `{page}`, `{query}`, `{filter:…}`.
2. Fetches the URL server-side with the extension's configured headers
   (User-Agent, etc.).
3. Loads the HTML with cheerio.
4. Applies `parse.itemSelector` to find the repeating item containers.
5. For each item, applies `parse.title`, `parse.url`, `parse.thumbnail` and
   resolves relative URLs against `source.baseUrl`.
6. Detects next-page via `a[rel="next"]` (a common pattern) and returns
   `hasNextPage` + `nextPageUrl`.

The response carries a `fetch` sub-object (`{ ok, status, url, error? }`) and
a `warnings` array. The UI surfaces both:

- If the fetch failed, the page shows the HTTP status / error message
  prominently.
- If the fetch succeeded but `itemSelector` matched 0 elements, a warning
  appears: *"itemSelector "div.flw-item" matched 0 elements on the page.
  The site layout may have changed, or the selector needs adjustment."*

### Pagination

If the endpoint has `paginated: true`, "Next page" / "Previous page" buttons
appear. The page number is sent back to the backend, which substitutes
`{page}` in the URL template.

---

## Search

A search box at the top of the browse area. Submits to
`POST /api/playground/search` with `{ extensionId, query, page, filters }`.
The backend resolves the `browse.search.url` template (substituting `{query}`
URL-encoded) and parses the result exactly like browse.

### Filters

If `capabilities.supportsFilters` is true, a "Filters" button opens a panel
listing the detected filters (`filters[]`). Filter *names* are extracted by
the converter; their option lists and current values are populated
best-effort. Selected filter values are sent as `{ filter: { paramName:
value } }` and substituted into the URL template as `{filter:paramName}`.

> Filter extraction is currently best-effort: only names are extracted, not
> option lists. This is documented in
> [`CONVERSION_PIPELINE.md` § 5.4 Filters](./CONVERSION_PIPELINE.md).

---

## Anime details

Clicking a browse item calls `POST /api/playground/details` with
`{ extensionId, url }`. The backend fetches the anime's URL and applies the
`details.*` selectors:

- `title`, `description`, `author`, `artist`, `genre` — text content of the
  first match.
- `thumbnail` — `src` attribute of the first match (resolved against
  `source.baseUrl`).
- `status` — text content of the first match, mapped through
  `details.statusMapping` to `ONGOING` / `COMPLETED` / `CANCELED` /
  `ON_HIATUS` / `UNKNOWN`.

The result is rendered as a details card with cover image, title, status
badge, synopsis, genres, and a list of actions (e.g. "View episodes").

If the `title` selector matches nothing, a warning is shown: *"title selector
matched nothing — details may be incomplete."*

---

## Episodes

From the details view, "View episodes" calls `POST /api/playground/episodes`
with `{ extensionId, url }`. The backend:

1. Resolves `episodes.url` template (substituting `{animeUrl}`, `{animeId}`,
   `{page}`). If the template is missing or equals `"{animeUrl}"`, fetches
   the anime URL directly.
2. Fetches and parses with cheerio.
3. Applies `episodes.parse.itemSelector` to find episode rows.
4. For each row, extracts `number`, `name`, `url`, `scanlator`, `date` via
   their selectors.
5. Derives the episode number:
   - `numberExtraction: "index"` → 1-based row index.
   - `numberExtraction: "regex"` + `numberRegex` → first capture group,
     parsed as float (falls back to first `\d+(\.\d+)?` in the text).
   - `numberExtraction: "float"` → `parseFloat(text)`.

Episodes are listed newest-first or oldest-first (toggle). Each row shows
number, name, date, and a "Play" button.

If `episodes.pagination` is configured, "Load more" calls the next-page URL
and appends results.

---

## Videos

Clicking an episode's "Play" button calls `POST /api/playground/videos` with
`{ extensionId, url, serverName? }`. The backend
(`src/lib/playground/videos.ts::resolveVideos`):

1. Resolves `videos.url` template (substituting `{episodeUrl}`). If the
   template is missing or equals `"{episodeUrl}"`, fetches the episode URL
   directly.
2. Fetches the video page with cheerio.
3. For each configured server in `videos.servers`:
   - Applies `server.selector` to locate the server's embed element.
   - Reads `src`, `data-src`, `href`, or `data-video` from the matched
     element (resolved against `source.baseUrl`).
   - Looks up `server.extractor` in the registry
     (`src/lib/playground/extractors/index.ts`).
   - Runs the extractor, which returns `videos[]`, `notes[]`, `unsupported`.
4. If no servers are configured, runs the `generic` extractor directly on the
   page.
5. Aggregates all videos, dedupes by URL, collects:
   - `resolutions` — union of `quality` across all videos.
   - `formats` — union of `format` (`mp4`, `m3u8`, `mkv`, `unknown`).
   - `subtitleTracks` — union of `subtitleTracks` across all videos.
   - `audioTracks` — union of `audioTracks` across all videos.

### The extractor registry

| Extractor id | Behavior |
| --- | --- |
| `direct` | The URL is itself a `.mp4`/`.m3u8`/`.mkv` file. Returns one video. |
| `generic` | Fetches the page and regex-scans for `https?://….m3u8`, `https?://….mp4`, `"file":"…"` patterns, and `<iframe src="…">` (one level of recursion). Also extracts `<track kind="subtitles">` elements and `audio: "…"` patterns. |
| Named (`vidstream`, `gogo`, `mp4upload`, `doodstream`, `streamtape`, `filemoon`, `kwik`, `mixdrop`, `streamlare`, `streamwish`, `fembed`, `sendvid`, `streamsb`, `voe`, `yourupload`, `zoro`, `aniwatch`, `kaido`, `miruro`) | Delegates to `generic` but prepends an honest note: *"Named extractor 'vidstream' applied (best-effort source scan). If no videos are found, the real Aniyomi extractor for 'vidstream' may require API keys / anti-bot solving that this playground does not implement."* |
| `unsupported` | Returns `unsupported: true` with a note explaining that no extractor is registered for this server name. **Never silently returns zero videos.** |

### Per-server panel

The UI shows each server as a collapsible panel:

- Server name + extractor badge.
- Number of videos found.
- The embed URL that was extracted (or the selector-matched-failed error).
- The `notes[]` array, rendered as a list.
- An `unsupported` badge if the extractor returned `unsupported: true`.
- An `error` badge if the extractor threw (rare; usually network failures).

This means you can always see **exactly what happened per server**. If
"Vidstream" returned 0 videos, the panel will tell you whether it's because
the selector matched nothing, the page fetched failed, or the named extractor
just couldn't find a video URL in the page source.

### Aggregated video list

The "All videos" tab shows the deduped list across all servers:

- Quality pill (e.g. `1080p`, `720p`, `auto (HLS)`, `default`).
- Format pill (`mp4` / `m3u8` / `mkv`).
- Server name.
- "Play" button → loads this video into the player.

---

## The video player

A modal / inline player with:

- **`hls.js`** for `.m3u8` URLs (HLS streaming). Native `<video>` for `.mp4`
  and `.mkv` (browser support varies; `.mkv` may not play in all browsers).
- **Quality switcher** — when an HLS manifest offers multiple variants,
  hls.js exposes them; the player lists them and lets you pick.
- **Server switcher** — jump between videos from different servers without
  leaving the player.
- **Subtitles panel** — see below.
- **Audio tracks panel** — see below.
- **Headers** — if a video requires custom headers (rare; some CDNs need a
  `Referer`), the player can attach them via the `headers` field on
  `ExtractedVideo`. (Browser `<video>` cannot attach headers to HLS via
  hls.js's `xhrSetup`; this is a known limitation, documented in the panel.)

### Subtitles

If any video carries `subtitleTracks`, they're listed in the player's
subtitles panel:

- Language label (from `<track label="…">` or `srclang`).
- Format badge (`vtt` / `srt` / `ass`).
- Toggle to enable / disable.

**Format handling:**

- `vtt` — loaded directly as a `<track>` element.
- `srt` — converted to WebVTT client-side before being attached. The
  conversion is straightforward: prepend `WEBVTT` header, replace `,` in
  timestamps with `.`, leave the rest.
- `ass` — surfaced in the panel (so you know it exists) but **not rendered**
  in the player. ASS subtitle rendering in-browser requires a library like
  `libass-wasm`; we don't bundle it. The panel will say so explicitly.

### Subtitle customization

A settings popover in the player lets you adjust:

- Font family (system default, sans-serif, monospace).
- Font size (50%–200%).
- Text color (white / yellow / cyan).
- Background opacity (0%–100%).
- Edge style (none / outline / drop shadow).
- Vertical position (bottom / top / center).

These are applied via the `::cue` pseudo-element on the `<video>` element.
Changes persist for the session.

### Audio tracks

If the HLS manifest declares multiple audio tracks (via `EXT-X-MEDIA`),
hls.js exposes them. The player's audio panel:

- Lists each track with its language label.
- Lets you switch tracks (hls.js swaps the active audio track).
- Surfaces any separate-URL audio tracks discovered by the extractor (these
  cannot be played in the HTML5 player — see below).

> **HTML5 limitation.** The native `<video>` element cannot switch audio
> tracks for **separate URLs** (only for in-manifest HLS `EXT-X-MEDIA`
> tracks). If a source provides audio tracks as separate URLs, the playground
> surfaces them in the panel but cannot play them simultaneously with the
> video. This is a documented browser limitation, surfaced explicitly in the
> UI — not a silent failure.

---

## Error surfacing

The playground's design principle is **never silent**. Every API response
carries:

- `fetch: { ok, status, url, error? }` — the raw HTTP fetch outcome.
- `warnings: string[]` — non-fatal issues (selector matched 0 elements,
  no videos found, etc.).
- For video resolution: per-server `notes[]`, `unsupported`, `error?`.

The UI renders all of these prominently. Examples:

- **Site is down**: `fetch.ok = false`, `fetch.error = "HTTP 503 Service
  Unavailable"`. The browse view shows a red banner with the status and URL.
- **Geo-blocked**: `fetch.ok = false`, `fetch.error = "HTTP 451 Unavailable
  For Legal Reasons"` (or a country-specific redirect). Same banner.
- **Anti-bot (Cloudflare)**: `fetch.ok = false`, `fetch.error = "HTTP 403
  Forbidden"`. Banner suggests running the dev server from a different
  region or using a different IP.
- **Selector matched nothing**: `fetch.ok = true`, `warnings = ["itemSelector
  … matched 0 elements on the page."]`. The browse view shows the items list
  empty + the warning in an amber callout.
- **Unsupported server**: per-server panel shows `unsupported: true` with the
  note. The "All videos" tab simply omits that server's (zero) videos.

You will never see an empty list with no explanation. If something failed,
the playground tells you why.

---

## Tips

- **Run the dev server in the right region.** If a source is geo-blocked,
  the playground fetches from the dev server's IP. Consider running the dev
  server on a VPS in the source's region, or routing through a proxy.
- **Edit the JSON to fix selectors.** If the playground reveals a selector
  is wrong (e.g. the site changed its layout), edit
  `converted/<id>.json` directly and reload the playground. No need to
  re-convert the whole APK.
- **Use the "Open in Playground" button.** After converting, this jumps
  directly to the new extension with the latest JSON loaded.
- **Inspect `rawAnalysis`.** If a conversion is incomplete, the
  `rawAnalysis.stringLiterals` dump shows exactly what the analyzer saw —
  useful for understanding why a selector is missing.
