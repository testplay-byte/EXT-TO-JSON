# Troubleshooting

Common problems and their fixes, grouped by area. If you can't find your
answer here, check the [worklog](../worklog.md) for known issues from previous
agents, or open an issue on
[GitHub](https://github.com/testplay-byte/EXT-TO-JSON/issues).

---

## Table of contents

- [Toolchain / startup](#toolchain--startup)
- [Conversion failures](#conversion-failures)
- [Health report issues](#health-report-issues)
- [Playground fetch failures](#playground-fetch-failures)
- [Video player issues](#video-player-issues)
- [Database / persistence](#database--persistence)
- [Windows-specific](#windows-specific)

---

## Toolchain / startup

### "Toolchain not ready" on the Settings screen

The Settings screen calls `GET /api/toolchain`. If `ready: false`, the
response tells you exactly which tool is missing.

**Checks:**

1. **`tools/apktool.jar` exists.** If not, re-run the installer:
   - Windows: double-click `START.bat`.
   - macOS/Linux: `bun run scripts/download-tools.ts`.
2. **`tools/bin/jadx` (or `tools/bin/jadx.bat` on Windows) exists.** Same
   fix as above.
3. **`java -version` works** in the same terminal you started the dev server
   from. If it doesn't:
   - Windows: install OpenJDK 21 (`winget install --id Microsoft.OpenJDK.21 -e`),
     close **all** terminals, then re-open and re-run `bun run dev`. The PATH
     update from winget only takes effect in new terminals.
   - macOS: `brew install openjdk@21`, then follow the caveats to symlink
     into `/Library/Java/JavaVirtualMachines/`.
   - Linux: `sudo apt-get install openjdk-21-jdk` (Debian/Ubuntu) or
     `sudo dnf install java-21-openjdk` (Fedora).
4. **`JAVA_HOME` points at Java 21+.** Some shells pick up an older Java
   from `JAVA_HOME` even when `java -version` shows 21. Run
   `echo $JAVA_HOME` (or `echo %JAVA_HOME%` on Windows) and verify it points
   at a Java 21 install. Unset it if unsure: `unset JAVA_HOME` /
   `set JAVA_HOME=`.

### "Java not on PATH" — re-running START.bat doesn't fix it

The launcher checks `where java` (Windows) or implicitly `which java` (via
Node's `execFile`). If you just installed Java:

1. **Close every terminal window** — the PATH update from the installer
   doesn't affect already-open terminals.
2. **Close any running dev server.**
3. **Open a fresh terminal**, verify `java -version` works.
4. Re-double-click `START.bat`.

On Windows specifically: if `java -version` works in a fresh terminal but
`START.bat` still says Java not found, you may have launched the .bat from an
Explorer window that inherited a stale environment. Restart Explorer
(Task Manager → Windows Explorer → Restart) or reboot.

### Conversion fails at the unpacking stage

`unpacking` is the first stage that actually runs apktool. Common causes:

- **`apktool.jar` is corrupt or partial.** Delete it and re-download:
  ```bash
  rm tools/apktool.jar
  bun run scripts/download-tools.ts   # or START.bat on Windows
  ```
- **APK is encrypted/packed.** Some extensions use DEXGuard or other
  packers. apktool will fail with `could not smali file`. There's no fix on
  our side — the APK is not decompilable by apktool.
- **APK is too large.** Very large APKs (rare for extensions) may hit the
  180 s timeout in `unpack.ts`. Edit the timeout if needed.
- **Java crashed.** Look in the job's `logs` array — the error message will
  include the apktool stderr. Common: `UnsupportedClassVersionError` means
  you're running Java 8/11/17 against a Java 21-built apktool jar.

### Conversion fails at the decompiling stage

`decompiling` runs jadx. Common causes:

- **jadx crashed on a specific class.** Try running jadx manually to see the
  full error:
  ```bash
  tools/bin/jadx -d /tmp/jadx-out --show-bad-code path/to/your.apk
  ```
- **APK uses DEXGuard / R8 with obfuscation.** jadx will produce lots of
  classes named `a`, `b`, `c` — these still extend the known Aniyomi bases,
  so the analyzer usually finds them, but the decompiled source may be
  partial. The `analyzerNotes` will mention how many files were scanned.
- **Out of memory.** Very large APKs may exhaust the default JVM heap. Edit
  `tools/bin/jadx` (Unix) or `tools/bin/jadx.bat` (Windows) to add
  `-Xmx2g` (or more) to the `JAVA_OPTS` line.

---

## Conversion failures

### "No Source class found" — conversion completes but health is low

This means `analyze.ts::findSourceCandidates` didn't find any class extending
a known Aniyomi base (`ParsedAnimeHttpSource`, `AnimeHttpSource`,
`ParsedHttpSource`, `HttpSource`, `AnimeSource`). The conversion still
completes (with manifest-only data) but `health.status` will be `error` and
`health.score` will be very low.

**Possible causes:**

1. **The extension uses a non-standard base class.** Some forks of Aniyomi
   extend custom intermediate classes. Inspect the jadx output manually:
   ```bash
   # Find classes that look like source classes
   rg "extends .*Source" work/job-*/jadx-out/sources/ | head -50
   ```
   If you find one, you can edit `src/lib/converter/analyze.ts::BASE_CLASSES`
   to add it (local fix; not currently configurable from JSON).
2. **The extension is multi-source.** Some `all.*` packages contain a single
   `*Factory` class plus many per-site source classes. The factory extends
   `AnimeSource.Factory`; the individual sources extend `AnimeHttpSource`.
   The converter picks the highest-scored candidate, which usually works, but
   if the factory wins (e.g. for Jellyfin), you may need to delete the
   factory file from the jadx output and re-run conversion.
3. **jadx failed to decompile the source class.** Look at the jadx output
   tree under `work/job-*/jadx-out/sources/`. If the file is missing or
   contains `// jadx: failed to decompile`, the analyzer can't see it. Try
   running jadx with `--no-debug-info` or upgrading jadx.

### Low health score even though the source looks fine

Re-check the `health.checks[]` array — each `fail` carries a `detail` field
explaining what was expected. Common failures:

- `base-url: fail` → `baseUrl` wasn't a literal string in the source (e.g.
  Jellyfin's `"The server address"` placeholder, or sources that read it
  from `SharedPreferences`).
- `name: fail` → no `getName()` / `name` property; falls back to
  `app_name` resource string or slug-derived Title Case. Usually harmless.
- `details: fail` → `animeDetailsParse` not overridden (common for sources
  that return JSON instead of HTML; they parse in `popularAnimeParse` etc.
  and skip the details step).
- `servers: fail` → no known video server name appeared in the source's
  string literals. The extension may use a server we don't have in
  `KNOWN_EXTRACTORS`, or fetch video URLs via an API.

For each `fail`, the `rawAnalysis.analyzerNotes` and `rawAnalysis.stringLiterals`
let you audit exactly what the analyzer saw.

### Conversion succeeds but the JSON has empty selectors

This typically means the source extends `AnimeHttpSource` (not
`ParsedAnimeHttpSource`) and parses responses manually rather than via CSS
selectors. The `*Selector` methods only exist on `ParsedHttpSource`. These
sources cannot be playground-tested for browse/details/episodes — the
playground will fetch the page but match nothing (and surface a warning
explaining this).

There is no fix on our side; the source genuinely doesn't expose CSS
selectors. Look at `rawAnalysis.stringLiterals` to understand what the source
does instead (often JSON parsing).

---

## Health report issues

### Health score is 0%

This happens if every check failed (e.g. the APK wasn't a real Aniyomi
extension at all). Inspect `health.errors[]` — usually `manifest: fail`
and `source-class: fail`.

### Health shows "healthy" but the playground can't browse

A high health score means the *conversion* was complete (selectors were
extracted), not that the *live site* still matches those selectors. Sites
change their HTML all the time. The playground will surface this as:
*"itemSelector "div.old-class" matched 0 elements on the page. The site
layout may have changed, or the selector needs adjustment."*

Fix: edit `converted/<id>.json` and update the selector, or re-convert from a
newer version of the extension APK if the maintainer shipped a fix.

### Health shows "warning" with 0 errors

This is the most common case for real-world extensions — some non-critical
checks failed (e.g. `name`, `details`, `servers`). The extension is still
usable; the playground will tell you what works and what doesn't.

---

## Playground fetch failures

### Browse returns "HTTP 0 / Fetch failed"

`HTTP 0` (with `fetch.error` like `"fetch failed"`) means the request never
got a response. Causes:

- **DNS failure** — the source's `baseUrl` is unreachable from your machine.
  Try `curl -I <baseUrl>` from the same machine.
- **TLS handshake failure** — rare; usually a sign of an outdated Node
  version.
- **Timeout** — the playground uses a 30 s timeout. Slow sites may need
  longer (edit `src/lib/playground/fetch.ts::fetchPage`'s `timeoutMs`).

### Browse returns "HTTP 403 Forbidden"

The source has anti-bot protection (Cloudflare, etc.) and is rejecting the
playground's request. Options:

- **Run the dev server from a different IP** — some sites geo-block or
  IP-ban datacenter ranges. A residential IP usually works.
- **Override the User-Agent** — edit the extension's `converted/<id>.json`:
  ```json
  "source": { "headers": { "User-Agent": "Mozilla/5.0 …" } }
  ```
  The default UA is already a realistic desktop Chrome; some sites want a
  mobile UA, others want specific Accept-Language headers.
- **Accept it as a limitation.** Some sites cannot be fetched without a
  full browser stack (Cloudflare JS challenge). The playground surfaces the
  403 explicitly so you know.

### Browse returns "HTTP 451" or country-specific redirect

Geo-blocked. Run the dev server from a machine in the source's expected
region, or route through a proxy.

### Browse returns 0 items but the page loaded

The `itemSelector` matched nothing. The page's HTML changed, or the selector
was wrong to begin with. Edit `converted/<id>.json`:

1. Open the page in your browser, inspect an item element.
2. Find a stable CSS selector that matches the repeating item container.
3. Update `browse.popular.parse.itemSelector` (and the per-item selectors if
   needed).
4. Reload the playground.

The playground hot-reads the JSON from disk on every request — no need to
restart the dev server.

### Search returns 0 items

Same as browse: either the search URL template is wrong, or the search
results page uses a different layout than the browse page (in which case the
search needs its own selectors — currently the schema uses one `ListParse`
per endpoint, so this is supported).

Check `browse.search.url` — the `{query}` placeholder must be present and
the URL must produce a real search results page when substituted.

### CORS error?

You should **never** see a CORS error in the playground. All fetches are
server-side (Next.js Route Handlers running on the Node runtime). If you see
a CORS error, something is making a direct browser-side fetch — that's a bug
in the frontend; please report it.

---

## Video player issues

### "No playable videos were resolved from any server"

The video resolution step ran but no extractor produced any video URLs.
Inspect the per-server panels — each will have a `notes[]` explaining why:

- *"Selector "iframe[src*=vidstream]" matched no element on the page."* →
  the page structure differs from what the converter expected. Edit the
  `videos.servers[].selector` in the JSON.
- *"Named extractor 'vidstream' applied (best-effort source scan). If no
  videos are found, the real Aniyomi extractor for 'vidstream' may require
  API keys / anti-bot solving that this playground does not implement."* →
  the named extractor did its best but the page doesn't expose video URLs in
  the patterns the generic scanner recognizes. This is a known limitation;
  see [`PLAYGROUND.md` § Extractor registry](./PLAYGROUND.md#the-extractor-registry).
- *"No extractor registered for server 'X'."* → the converter detected a
  server name we don't have an extractor for. The server is unsupported;
  the panel shows an `unsupported` badge.

### Video loads but won't play

- **`.mkv` file** — most browsers can't play MKV in `<video>`. Re-encode to
  MP4 or pick a different server that offers MP4/HLS.
- **HLS manifest requires headers** — some CDNs require a `Referer` or
  `Origin` header. Browser `<video>` cannot attach headers to HLS requests
  via hls.js without `xhrSetup` configuration. The player surfaces this if
  it's the issue.
- **Mixed content** — if the dev server runs on `http://` (not `https://`)
  and the video URL is `https://`, browsers will block it. Run the dev
  server on `https://` (Next.js supports this with `--experimental-https`)
  or use HTTP video URLs.

### Subtitles not showing

- The video element has no `<track>` children → no subtitles were detected
  on this video. Check a different server, or check the page's HTML manually
  for `<track kind="subtitles">` elements.
- Subtitle format is `.ass` → the player surfaces the track in the panel
  (so you know it exists) but doesn't render it. See
  [`PLAYGROUND.md` § Subtitles](./PLAYGROUND.md#subtitles).
- Subtitle URL is cross-origin and the CDN doesn't send CORS headers → the
  `<track>` element will fail to load. You can usually tell because the
  track appears in the list but enabling it shows nothing. Try downloading
  the subtitle file and serving it locally.

### Audio track switch doesn't work

- The track is a **separate URL** (not in the HLS manifest). The HTML5
  `<video>` element cannot switch audio tracks for separate URLs — see
  [`PLAYGROUND.md` § Audio tracks](./PLAYGROUND.md#audio-tracks). The player
  surfaces this with a note in the audio panel.
- The HLS manifest has only one audio track. Nothing to switch to.

---

## Database / persistence

### "Extension not found" after re-converting

Re-converting the same APK upserts by `packageName` and **reuses the same
id** — so the URL doesn't change. If you see "Extension not found", the DB
row was probably deleted but the JSON file wasn't (or vice versa).

Fix: delete the extension via the UI (which removes both), then re-convert.

### How to reset the DB

```bash
# From the repo root
rm db/custom.db
bun run db:push
```

The `converted/*.json` files are **not** deleted — they're the canonical
artifact. After resetting the DB, the extensions won't appear in the library
list until you re-import them (Converter screen → "Import JSON" → pick the
files from `converted/`).

### How to re-convert an extension

There's no in-place "re-convert" button yet. Workflow:

1. Note the extension's `packageName` (visible in the JSON viewer).
2. Delete the extension from the UI (or `DELETE /api/extensions/<id>`).
3. Drop the APK again on the Converter screen. The converter will re-use
   the same `id` if the `packageName` matches an existing row — but since
   you deleted it, a new id will be generated. If you need the same id back,
   rename the `converted/<old-id>.json` file to `<new-id>.json`.

---

## Windows-specific

### START.bat closes immediately

The .bat re-launches itself with `cmd /k` so the window stays open even on
failure. If you're seeing it close, possible causes:

- You launched it from a context menu that doesn't pass arguments correctly.
  Try double-clicking the file directly in Explorer.
- Your `cmd.exe` has `AutoRun` configured that interferes. Check
  `HKCU\Software\Microsoft\Command Processor\AutoRun` in `regedit`.

### START.bat reports "Git not found" but I have Git installed

The `where git` check uses the current PATH. If you installed Git but didn't
restart Explorer, the .bat may inherit a stale PATH. Reboot, or run the .bat
from a fresh `cmd.exe` window opened after the Git install.

### START.bat's PowerShell download fails with TLS error

The .bat forces TLS 1.2 (`[Net.ServicePointManager]::SecurityProtocol =
[Tls12]`). If GitHub rejects it:

- Upgrade to PowerShell 7+ (`winget install --id Microsoft.PowerShell -e`).
- Or download `apktool.jar` and `jadx-1.4.7.zip` manually from the URLs in
  the .bat header and place them in `tools/` (extract the zip).

### After installing Java via winget, START.bat still says Java not found

The winget install updates PATH, but only new processes pick it up. Close
**all** terminals and Explorer windows, then re-run `START.bat`. If that
still fails, reboot.

### `bun run db:push` fails on Windows with "prisma: not found"

If you installed with `npm install` (not `bun install`), the START.bat
correctly falls back to `npx prisma db push --accept-data-loss`. If you
manually ran `bun run db:push` after `npm install`, switch to
`npx prisma db push` instead. The two package managers create different
`node_modules` layouts; mixing them can confuse `prisma`.

### Converted JSON has Windows-style paths in `rawAnalysis.decompiledPath`

This is expected — the paths reflect the machine that ran the conversion.
The playground doesn't read these paths (it loads the JSON from
`converted/<id>.json` directly), so this is purely cosmetic.

### Conversion fails with `spawn ...\tools\bin\jadx ENOENT` on Windows

This was a bug in earlier versions: the toolchain resolver pointed at
`tools/bin/jadx` (the Unix shell script), which Windows cannot execute. The
converter now detects the platform and uses `tools/bin/jadx.bat` on Windows
(invoked with `shell: true`). Re-run `START.bat` to pull the fix, or re-clone.

### Playground shows "fetch failed" / wrong base URL

The extension's `baseUrl` is often preference-driven (e.g.
`preferences.getString(PREF_DOMAIN_KEY, defaultBaseUrl)`). The converter now
extracts a fallback base URL from preference defaults / domain lists and stores
all available domains in `settings.availableDomains`. If the playground can't
reach the site:

1. Open the extension's **Details** page → **Extension settings** section to see
   the detected domains.
2. In the **Playground**, click the **Settings** button (top-right of the
   extension picker) and pick a different domain. Saved settings are applied to
   every subsequent fetch.

### `bun run dev` fails with "command not found: tee" on Windows

Fixed. The `dev` script is now `node scripts/dev.mjs`, a cross-platform launcher
that tees output to both the console and `dev.log` without relying on the
Unix-only `tee` command. It also auto-opens `http://localhost:3000` in your
default browser when the server is ready.

---

## Still stuck?

1. Read the [worklog](../worklog.md) — every agent's findings are there.
2. Check the per-extension `rawAnalysis.analyzerNotes` and `health.checks[]`
   — they almost always explain what went wrong.
3. Open the browser devtools Network tab and inspect the failing
   `/api/playground/*` or `/api/convert` request — the response body usually
   contains a useful `error` field.
4. File an issue on
   [GitHub](https://github.com/testplay-byte/EXT-TO-JSON/issues) with the
   failing APK (if shareable), the produced JSON, and the exact error
   message.

### Playground shows "Browser-fetch service not running"

The playground needs the browser-fetch service (port 3030) to fetch pages
through a real Chromium browser. It starts automatically with `bun run dev`.
If it's not running:

1. Stop the dev server (Ctrl+C).
2. Make sure Playwright Chromium is installed:
   `cd mini-services/browser-fetch && bunx playwright install chromium`
3. Restart: `bun run dev` (or double-click START.bat).

### Playground shows "Captcha required"

The site is protected by Cloudflare. Click **Solve Now** — a browser window
will open for you to solve the captcha. After solving, cookies are saved and
the page reloads automatically. Subsequent requests will work without another
captcha (until cookies expire).

If the headless browser bypasses Cloudflare automatically (common), you won't
see this card at all — the playground just works.

### Port 3030 already in use

If the browser-fetch service can't start because port 3030 is occupied:
1. Stop all services (Ctrl+C).
2. Kill any leftover processes: `pkill -f browser-fetch` (or close all
   terminal windows).
3. Restart: `bun run dev`.
