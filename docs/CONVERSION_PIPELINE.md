# Conversion Pipeline

This document traces exactly what happens when you drop an `.apk` onto the
Converter screen. The orchestrator is `src/lib/converter/convert.ts` — every
other module in `src/lib/converter/` is a single-stage worker.

> For the **schema** of the produced JSON, see [`JSON_SCHEMA.md`](./JSON_SCHEMA.md).
> For the **architecture** that hosts this pipeline, see
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Pipeline at a glance

```
upload .apk ─▶ POST /api/convert ─▶ createJob() ─▶ void runConversion() (background)
                                                   │
   ┌───────────────────────────────────────────────┘
   ▼
1. unpacking           toolchain.ts → unpack.ts        (apktool d)
2. decoding-manifest   manifest.ts → resources.ts      (regex + XML)
3. decompiling         decompile.ts                    (jadx)
4. analyzing           analyze.ts                      (heuristic scan)
5. assembling          convert.ts::assembleJson        (map → schema)
6. health-check        health.ts                       (13 checks)
7. done                persist.ts                      (write .json + DB)
```

Each stage reports progress via `onProgress(stage, progress, message)`, which
the API route forwards into the in-memory job store. The frontend polls
`GET /api/jobs/:id` every ~1 s and renders a live progress bar + log.

Typical wall-clock time on a recent laptop: **8–15 seconds** for a real
Aniyomi extension APK (a few MB of DEX).

---

## Stage 1 — `unpacking`

**Modules:** `src/lib/converter/toolchain.ts`, `src/lib/converter/unpack.ts`
**Tool:** `apktool d -f --no-src -o <out> <apk>`
**Progress:** 2% → 8%

### What happens

1. **`resolveToolchain()`** locates the three required binaries relative to
   `process.cwd()`:
   - `tools/apktool.jar` — throws if missing.
   - `tools/bin/jadx` (or `tools/bin/jadx.bat` on Windows) — throws if missing.
   - `java` — `$JAVA_HOME/bin/java` if set, otherwise `java` on PATH.
2. **`verifyToolchain()`** runs each tool with `--version` / `-version` and
   captures the first line of output. These strings end up in
   `converter.toolchain` in the final JSON.
3. The APK is read into memory and **SHA-256'd** (`converter.inputSha256`).
4. **`apktool d -f --no-src -o <work>/apktool-out <apk>`** decodes:
   - `AndroidManifest.xml` (binary XML → readable XML),
   - `res/` (decoded resources — strings, drawables, layouts),
   - **`--no-src`** skips smali (we don't need it; jadx will produce Java).
5. The output path `<work>/apktool-out/AndroidManifest.xml` is verified to
   exist; if apktool produced nothing, the job fails here.

### What's extracted

- `AndroidManifest.xml` (plain XML text).
- `res/values/strings.xml` and any sibling `*-strings.xml`.

### How long

2–4 s for a typical extension. apktool is the slowest of the two tools.

---

## Stage 2 — `decoding-manifest`

**Modules:** `src/lib/converter/manifest.ts`, `src/lib/converter/resources.ts`
**Progress:** 18%

### What happens

1. **`parseManifest(manifestPath)`** uses lightweight regex to pull out:
   - `package` attribute on `<manifest>` → `meta.packageName`.
   - `android:versionCode` → `meta.apkVersionCode`.
   - `android:versionName` → `meta.apkVersionName`.
   - All `<meta-data android:name=".." android:value=".."/>` pairs (and the
     reversed-attribute-order variant) → `manifest.metaData`. These carry
     Aniyomi-specific hints like:
     - `tachiyomi.animeextension.class` → the source class name.
     - `tachiyomi.animeextension.nsfw` → `true`/`false`.
     - `tachiyomi.extension.class` (manga variant).
   - The `<application android:label="…">` and `android:icon="…"` references
     (usually `@string/app_name`, `@mipmap/ic_launcher`).
2. **`deriveFromPackage(packageName)`** extracts:
   - `lang` — the package segment after `animeextension` or `extension`
     (e.g. `en`, `all`, `ja`).
   - `kind` — `"anime"` if the package contains `animeextension`, else
     `"manga"`.
   - `slug` — the last package segment (e.g. `aniwatch`).
3. **`readResourceStrings(resDir)`** walks `res/values/*.xml` and extracts
   every `<string name="key">value</string>` entry into a flat
   `Record<string, string>`. XML entity escapes (`&amp;`, `&lt;`, …) are
   decoded.

### What's extracted

- `meta.packageName`, `meta.apkVersionCode`, `meta.apkVersionName`.
- The manifest hint that points to the source class
  (`tachiyomi.animeextension.class`), used by Stage 4 to disambiguate
  candidates.
- `resourceStrings["app_name"]` — used as a fallback display name.

### How long

< 100 ms. Pure regex on a single XML file.

---

## Stage 3 — `decompiling`

**Module:** `src/lib/converter/decompile.ts`
**Tool:** `jadx -d <out> --no-res --show-bad-code --threads-count 4 <apk>`
**Progress:** 28%

### What happens

jadx reads the APK directly (it has its own DEX parser + a Java decompiler
frontend) and produces a tree of `.java` files under `<work>/jadx-out/`. The
flags mean:

- `-d <out>` — output directory.
- `--no-res` — don't decode resources (apktool already did).
- `--show-bad-code` — emit imperfect code rather than failing on classes jadx
  can't fully decompile. We prefer breadth over perfection.
- `--threads-count 4` — parallelize.

`countJavaFiles(outDir)` walks the resulting tree and returns the `.java`
file count, which is logged for transparency (e.g. "Scanned 365 .java files
from jadx output.")

### What's extracted

A sources tree mirroring the Java package hierarchy, e.g.:

```
jadx-out/sources/
└─ eu/kanade/tachiyomi/animeextension/all/jellyfin/
   ├─ Jellyfin.java          ← the source class
   ├─ JellyfinFactory.java
   ├─ ItemDto.java
   ├─ AuthInterceptor.java
   └─ …
```

### How long

4–10 s. jadx is the second-slowest step. Some large multi-source extensions
(e.g. `all.*` packages with several sources) can take 15–20 s.

---

## Stage 4 — `analyzing`

**Module:** `src/lib/converter/analyze.ts`
**Progress:** 55%

This is the heuristic heart of the converter. It walks the jadx output and
produces a `SourceAnalysis` that `assembleJson` (Stage 5) maps to the schema.

### Step 4.1 — Collect `.java` files

`collectJavaFiles(dir)` recursively lists every `*.java` file under
`jadx-out/sources/`. This typically returns 50–500 files (most are bundled
library code: `org.apache.commons.*`, `kotlin.*`, `okhttp3.*`, …).

### Step 4.2 — Find source class candidates

`findSourceCandidates(files)` reads each file and looks for the regex
`class (\w+) extends (ParsedAnimeHttpSource|AnimeHttpSource|ParsedHttpSource|HttpSource|AnimeSource)\b`.

For each match, it scores the candidate by counting how many of the ~70 known
Aniyomi method names (`popularAnimeRequest`, `popularAnimeSelector`,
`episodeListParse`, `videoListRequest`, `getFilterList`, `popularMangaRequest`,
`chapterListParse`, `pageListRequest`, …) appear as `\b<name>\s*\(` in the
source. Candidates are sorted by score descending.

If no candidate is found, `analyzeSource` returns an empty analysis with a
note explaining that conversion will be limited to manifest data — and the
`source-class` health check fails (critical).

### Step 4.3 — Pick the chosen one

If the manifest hint (`tachiyomi.animeextension.class`) matches a candidate's
class name or file path, that candidate is chosen. Otherwise the top-scored
candidate wins. The choice is recorded in `analyzerNotes` for transparency.

### Step 4.4 — Extract properties

For each of `name`, `baseUrl`, `lang`:

1. Getter: `String getBaseUrl() { … return "https://example.org"; }`.
2. Field initializer: `String baseUrl = "https://example.org";`.
3. Any assignment: `baseUrl = "https://example.org";`.

For `versionId` (int) and `isNsfw` (boolean), similar patterns.

> **Honest limitation:** some sources don't store `baseUrl` as a literal —
> they read it from `SharedPreferences` (user-configurable). In that case,
> `extractProperty("baseUrl")` returns whatever string literal appears in the
> getter, which may be a placeholder like `"The server address"` (Jellyfin).
> The `base-url` health check still passes because a value was found, but the
> playground fetch will fail at runtime and surface the error explicitly.

### Step 4.5 — Method overrides

The full deduped list of known anime + manga method names present in the
source (`\b<name>\s*\(`). This drives `capabilities` and tells the analyzer
which selector/request/FromElement methods to look at next.

### Step 4.6 — CSS selectors (ParsedHttpSource methods)

For each method whose name ends in `Selector` (e.g.
`popularAnimeSelector`, `episodeListSelector`), `extractMethodBody` brace-
matches the method body and `extractSelectorReturn` grabs the first
`return "…"` literal. These end up in `analysis.selectors[method]` and
eventually populate `browse.*.parse.itemSelector`, `details.*`,
`episodes.parse.itemSelector`, etc.

### Step 4.7 — Request URL templates

For each `*Request` method (`popularAnimeRequest`, `searchAnimeRequest`,
`episodeListRequest`, `videoListRequest`, …), `buildUrlTemplate` reconstructs
a URL template by walking the method body's string concatenation chain:

- `"path/" + page` → `"path/{page}"`.
- `"search?q=" + query` → `"search?q={query}"`.
- `baseUrl + "/popular"` → `<baseUrl>/popular`.
- Identifiers containing `url` → `{animeUrl}` / `{episodeUrl}`.

The output is `analysis.requestUrls[method] = [template, ...otherLiterals]`.

### Step 4.8 — FromElement selectors

For each `*FromElement` method, `extractJsoupSelectors(body)` collects every
`.select("…")` / `.selectFirst("…")` argument. These become
`analysis.fromElementSelectors[method]`. `assembleJson` uses positional
indices (`[0]` → title/number, `[1]` → url, `[2]` → thumbnail, …) to fill in
`ListParse` and `EpisodesParse` fields. This is a best-effort mapping that
mirrors how Aniyomi's `*FromElement` typically orders its `select()` calls.

### Step 4.9 — Filters

If `getFilterList` is overridden, its body is scanned for
`new <FilterClass>("name", …)` patterns. The class name is mapped to a
`FilterType`:

- `Sort*` → `"sort"`.
- `Select*` / `Category*` / `Genre*` → `"select"`.
- `Text*` → `"text"`.
- `Checkbox*` / `Check*` → `"checkbox"`.
- `Header*` / `Separator*` / `Divider*` → `"header"` (or `"separator"`).

Filter values and default values are **not currently extracted** (the schema
has fields for them but they're `undefined`); the names are extracted so the
UI can show "12 filters detected" honestly.

### Step 4.10 — Detected video extractors

`detectExtractors(allStrings)` checks every string literal in the source
class against a fixed list of ~30 known extractor names (`vidstream`,
`mp4upload`, `doodstream`, `streamtape`, `filemoon`, `kwik`, `mixdrop`,
`streamlare`, `streamwish`, `fembed`, `sendvid`, `streamsb`, `voe`,
`yourupload`, `zoro`, `aniwatch`, `kaido`, `miruro`, …). Matches become
`analysis.detectedExtractors`. These are converted to `VideoServer[]`
entries in Stage 5, each with a `selector` of the form
`iframe[src*="name"], a[data-server*="name"], li[data-video*="name"]`.

### What's extracted

The full `SourceAnalysis` object: `sourceClassFile`, `sourceClassName`,
`sourceType`, `candidateClasses`, `methodOverrides`, `properties`,
`selectors`, `requestUrls`, `fromElementSelectors`, `filters`,
`detectedExtractors`, `stringLiterals`, `notes`.

### How long

< 1 s. Pure regex on already-loaded source. The expensive part was jadx.

---

## Stage 5 — `assembling`

**Module:** `src/lib/converter/convert.ts::assembleJson`
**Progress:** 78%

Maps the `SourceAnalysis` to the `ExtensionJson` schema. This is mostly
field-by-field assignment with sensible defaults and a few heuristics:

### 5.1 Identity

- `name` = `properties.name` → `app_name` resource string →
  `slugToName(slug)` (Title Case).
- `baseUrl` = `properties.baseUrl ?? ""`.
- `lang` = `properties.lang ?? pkgLang ?? "en"`.
- `isNsfw` from `properties.isNsfw`, the `nsfw` field, or the manifest
  meta-data.

### 5.2 Browse endpoints

`buildBrowseEndpoint` is called three times (popular / latest / search). It
combines:

- `requestUrls[<requestMethod>]?.[0]` → `url` (falls back to
  `baseUrl + defaultPath`).
- `selectors[<selectorMethod>]` → `parse.itemSelector`.
- `fromElementSelectors[<fromElementMethod>]` → `parse.title / url / thumbnail`
  (positional).
- `selectors[<nextPageMethod>]` → `paginated: true | false`.

### 5.3 Details

`fromElementSelectors["animeDetailsFromElement"]` provides up to 7 positional
selectors: `[title, description, thumbnail, author, artist, genre, status]`.
Falls back to `selectors["animeDetailsSelector"]` for `title`.

### 5.4 Episodes

Same pattern: `requestUrls["episodeListRequest"]`, `selectors["episodeListSelector"]`,
`fromElementSelectors["episodeFromElement"]` (5 positional: number, name, url,
scanlator, date). `numberExtraction` defaults to `"regex"` with pattern
`\d+(?:\.\d+)?`. `pagination` is set only if `selectors["episodeNextPageSelector"]`
exists, using the template `{baseUrl}{nextHref}`.

### 5.5 Videos

For each `detectedExtractors` name, a `VideoServer` is created with:

- `name` = capitalized.
- `selector` = `iframe[src*="name"], a[data-server*="name"], li[data-video*="name"]`.
- `extractor` = `extractorToRegistryId(name)` (the fixed map; `"unsupported"`
  if no match).
- `qualities` = `[]` (discovered at runtime by the playground).
- `note` = `"Detected by name in source string literals."`.

`extractorStrategy` = `"registry"` if any servers, else `"none"`.
`formats` is always `["mp4", "m3u8"]`.

### 5.6 Subtitles / audio

Heuristic: if any `stringLiterals` mention `subtitle|\.vtt|\.srt|\.ass`, set
`subtitles.source = "video-track"`, `formats = ["vtt", "srt"]`. Same for
audio with `audio|dub|track`. The playground will surface actual
`subtitleTracks` / `audioTracks` it discovers at runtime.

### 5.7 Raw analysis

`buildRawAnalysis` copies the analyzer's transparency fields, capping
`stringLiterals` to 200 entries and `resourceStrings` to 100 entries for
file-size sanity.

### How long

< 100 ms. Pure object mapping.

---

## Stage 6 — `health-check`

**Module:** `src/lib/converter/health.ts`
**Progress:** 92%

Runs 13 checks (see [`JSON_SCHEMA.md` § Health scoring](./JSON_SCHEMA.md#health-scoring))
and computes:

- `score` = `passCount / (totalCount - skipCount) * 100`.
- `status`: `error` if any critical check failed or score < 40; `warning`
  if any non-critical check failed or score < 80; else `healthy`.
- `errors[]` — critical failures (`manifest`, `source-class`, `base-url`,
  `method-overrides`).
- `warnings[]` — non-critical failures.
- `summary` — human-readable one-liner.

Every check is explicit: a `fail` carries a `detail` string explaining what
was expected and what was found. The UI surfaces the full list so a developer
can immediately see *why* a conversion is at 75% instead of 100%.

### How long

< 100 ms.

---

## Stage 7 — `done` / persistence

**Module:** `src/lib/converter/persist.ts`
**Progress:** 100%

1. **Upsert by `packageName`.** If a row with the same package name exists,
   reuse its `id` (so re-conversions overwrite rather than duplicate).
   Otherwise generate a new `ext_<random8>_<time4>` id.
2. **Write the JSON file** to `converted/<id>.json` (pretty-printed, 2-space
   indent). This is the canonical artifact — synced to GitHub, reviewable in
   PRs.
3. **Upsert the DB row** with denormalized columns for fast listing:
   identity, APK provenance, health, capabilities (JSON string), and the full
   JSON document as a string.
4. The job is marked `done` with `progress: 100` and the `extensionId` is
   attached so the frontend can immediately open the result in the
   Playground.

### How long

< 100 ms (SQLite is fast, the JSON file is a few KB).

---

## Honest limitations

The converter is heuristic, not a perfect compiler. These are documented
limitations, surfaced explicitly by the health report and `rawAnalysis`:

1. **Configurable sources with lazy `baseUrl`.** Jellyfin's `baseUrl` is
   `"The server address"` (a placeholder string the user replaces via the
   extension settings UI). The `base-url` health check passes, but the
   playground fetch will fail at runtime. The error surfaces explicitly in the
   UI.
2. **Anti-bot video extractors.** The converter detects server *names*
   (e.g. `vidstream`) by scanning string literals, but does not extract the
   real per-server embed selectors (those require running the extension).
   The playground falls back to a generic page scan and surfaces "no videos
   found, the real extractor may need anti-bot solving" as an explicit note.
3. **Method-body brace matching.** jadx sometimes emits `goto` labels or
   syntactically odd Java. The analyzer's brace matcher can occasionally
   include or exclude too much. The `rawAnalysis.stringLiterals` dump lets
   you audit what was actually scanned.
4. **Filter values.** Only filter *names* are extracted, not their option
   lists or defaults. The schema has fields for them; they're `undefined`
   until a future analyzer improvement populates them.
5. **FromElement selector positional mapping.** `assembleJson` assumes
   `popularAnimeFromElement` calls `.select()` in title/url/thumbnail order.
   This is the Aniyomi convention but not a contract. If a source deviates,
   the wrong field gets the wrong selector — easily spotted in the playground
   (titles showing up as URLs, etc.) and editable in the JSON.

Every one of these is reported through the health block or `rawAnalysis`; no
silent failures.
