# EXT-TO-JSON

> Convert Aniyomi / Animiru **anime-extension APKs** into a portable,
> well-documented **JSON** format — and **test the converted extensions live**
> in a built-in playground.

EXT-TO-JSON decompiles an extension APK with **apktool** + **jadx**, statically
analyzes the resulting Java source, and produces a single self-describing JSON
document that captures everything the extension can do: browse, search,
details, episodes, multi-server/multi-resolution video, subtitles, and audio
tracks. A second screen — the **Playground** — consumes that JSON, fetches the
live source site server-side, applies the extracted CSS selectors via cheerio,
and resolves playable video URLs through a registry of best-effort extractors.

Everything the converter figured out (and everything it failed to figure out)
is surfaced explicitly. Nothing is silently hidden.

---

## What you get

| Screen | Purpose |
| --- | --- |
| **Converter** | Drop an `.apk` (or import a previously-produced `.json`). Watch the pipeline run end-to-end, see the resulting JSON, browse the health report, and persist the extension to your library. |
| **Playground** | Pick a converted extension, browse popular / latest, search, view details, list episodes, resolve videos across servers, play them in a `hls.js`-backed player, manage subtitles and (where supported) audio tracks. |
| **Settings** | Inspect the local toolchain status (apktool / jadx / java versions) and toggle the theme. |

The JSON format itself is the canonical artifact — see
[`docs/JSON_SCHEMA.md`](docs/JSON_SCHEMA.md). Every converted extension is
also written to `converted/<id>.json` so the library is version-controllable.

---

## Quickstart

### Windows (double-click)

1. Install **Git**, **Java 21+**, and **Bun or Node.js 18+** if you don't have them.
   Easiest via winget:
   ```bat
   winget install --id Git.Git -e
   winget install --id Microsoft.OpenJDK.21 -e
   winget install --id Oven-sh.Bun -e
   ```
2. **Double-click `START.bat`** in this folder.
3. The launcher clones (or pulls) the repo, installs dependencies, downloads
   the apktool + jadx toolchain if missing, runs `db:push`, and starts the dev
   server. A window opens — read the progress.
4. When you see `Ready on http://localhost:3000`, open that URL in your browser.

### macOS / Linux (or any platform with Bun)

```bash
git clone https://github.com/testplay-byte/EXT-TO-JSON.git
cd EXT-TO-JSON

# 1. Install the apktool + jadx toolchain into tools/
bun run scripts/download-tools.ts

# 2. Install JS dependencies
bun install

# 3. Set up the SQLite database
bun run db:push

# 4. Start the dev server
bun run dev
```

Then open <http://localhost:3000>.

> No Bun? Replace `bun` with `npm` (or `pnpm`/`yarn`) and
> `bun run scripts/download-tools.ts` with `node --experimental-strip-types
> scripts/download-tools.ts` (Node 22+) — though Bun is strongly recommended.

---

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| **Git** | any recent | Clone / sync the repo. |
| **Java (JDK)** | **21+** | Runs `apktool.jar` and `jadx`. Java 17 *might* work but is unsupported. |
| **Bun** (preferred) | 1.1+ | Fast install, native TS. |
| **Node.js** | 18+ | Alternative to Bun. |
| **`unzip`** | any | Only needed by `scripts/download-tools.ts` on Linux/macOS. Ships with macOS; `apt-get install unzip` on Debian/Ubuntu. Windows uses `START.bat` which uses PowerShell. |

The exact toolchain versions used at conversion time are recorded in the
`converter.toolchain` block of every produced JSON file, so conversions are
reproducible.

---

## The JSON format in one minute

```jsonc
{
  "schemaVersion": "1.0.0",
  "converter":   { /* apktool/jadx/java versions, sha256, timing */ },
  "meta":        { /* name, lang, baseUrl, packageName, sourceType, ... */ },
  "health":      { /* 0-100 score, status, per-check pass/warn/fail */ },
  "capabilities":{ /* supportsLatest, supportsSearch, supportsVideos, ... */ },
  "source":      { /* baseUrl, lang, headers, rateLimitPerSecond */ },
  "browse":      { /* popular / latest / search endpoints + CSS selectors */ },
  "filters":     [ /* genre, sort, select, ... */ ],
  "details":     { /* title/description/thumbnail/status selectors */ },
  "episodes":    { /* URL template + per-episode selectors */ },
  "videos":      { /* servers[], resolutions, formats, detectedExtractors */ },
  "subtitles":   { /* supported, source, formats */ },
  "audio":       { /* supported, tracks[] */ },
  "rawAnalysis": { /* sourceClassFile, methodOverrides, stringLiterals, ... */ }
}
```

URL templates use `{page}`, `{query}`, `{animeUrl}`, `{episodeId}`,
`{filter:PARAM}` placeholders. CSS selectors are JSoup-compatible (applied via
cheerio in the playground). The `rawAnalysis` block preserves the original
decompiled source path, every overridden method, and the string literals
grouped by method — so any converter decision can be audited.

Full field-by-field documentation: [`docs/JSON_SCHEMA.md`](docs/JSON_SCHEMA.md).

---

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | High-level architecture, request flow, mermaid diagram. |
| [docs/JSON_SCHEMA.md](docs/JSON_SCHEMA.md) | **Every** field of `ExtensionJson` documented with type, meaning, example. |
| [docs/CONVERSION_PIPELINE.md](docs/CONVERSION_PIPELINE.md) | Stage-by-stage walkthrough of APK → JSON. |
| [docs/PLAYGROUND.md](docs/PLAYGROUND.md) | How to use the playground, video player, subtitles, audio tracks. |
| [docs/TOOLCHAIN.md](docs/TOOLCHAIN.md) | apktool + jadx + Java: what they do, where they live, how to install. |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems and fixes. |
| [docs/DESIGN.md](docs/DESIGN.md) | The Warm Canvas design system. |

---

## Repository layout

```
EXT-TO-JSON/
├─ START.bat                     # Windows double-click launcher
├─ scripts/
│  ├─ download-tools.ts          # Cross-platform apktool+jadx downloader
│  └─ convert-one.ts             # CLI: convert a single APK to stdout/file
├─ tools/                        # apktool.jar + bin/jadx + lib/*.jar
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                # Renders <AppShell/>
│  │  ├─ layout.tsx              # Fonts + ThemeProvider + Toaster
│  │  ├─ globals.css             # Warm Canvas design tokens
│  │  └─ api/
│  │     ├─ convert/             # POST APK upload, async job; ?importJson=1
│  │     ├─ jobs/                # GET job status (polling)
│  │     ├─ extensions/          # GET list / [id] / DELETE
│  │     ├─ toolchain/           # GET apktool+jadx+java status
│  │     └─ playground/          # browse / search / details / episodes / videos
│  ├─ components/                # AppShell + Converter/Playground/Settings views
│  └─ lib/
│     ├─ converter/              # toolchain → unpack → decompile → manifest →
│     │                          # resources → analyze → health → convert → persist
│     ├─ playground/             # fetch → parse (cheerio) → extractors → videos
│     └─ api.ts                  # Typed client used by the frontend
├─ prisma/schema.prisma          # Extension model (SQLite cache)
├─ converted/                    # Canonical JSON files (synced to GitHub)
├─ work/                         # Per-job decompile trees (gitignored)
├─ upload/                       # Uploaded APKs (gitignored)
└─ docs/                         # You are here
```

---

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** with the custom **Warm Canvas** token system
- **shadcn/ui** component library on Radix primitives
- **framer-motion** for view transitions
- **Prisma 6** + **SQLite** for the extension library cache
- **cheerio** for HTML parsing in the playground (JSoup-equivalent selectors)
- **hls.js** for HLS video playback
- **apktool 2.9.3** + **jadx 1.4.7** for APK decompilation (Java tools)

---

## License

Source code in this repository is provided as-is for educational and
interoperability purposes. The bundled decompilation tools in `tools/` retain
their own licenses (see `tools/LICENSE` and `tools/NOTICE`). The converted
JSON documents describe third-party Aniyomi extensions and do not redistribute
their source code.
