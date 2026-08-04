# Toolchain

The EXT-TO-JSON converter decompiles APK files using two Java tools:
**apktool** (decodes the APK container + AndroidManifest + resources) and
**jadx** (decompiles the DEX bytecode back to Java source). Both require a
recent **Java runtime** (JDK 21+ recommended).

This document explains what each tool does, where it lives, how to install
it, and how to verify it.

---

## What each tool does

### apktool — APK container decoder

- **Project:** <https://ibotpeaches.github.io/Apktool/> ·
  **Releases:** <https://github.com/iBotPeaches/Apktool/releases>
- **Version used:** `2.9.3`
- **What it does:** Decodes an APK into:
  - `AndroidManifest.xml` — converted from binary XML back to readable XML.
  - `res/` — decoded resources: `values/strings.xml`, drawables, layouts,
    etc.
  - `smali/` — Dalvik bytecode disassembled into smali (human-readable
    assembly). We pass `--no-src` to skip this — we don't need smali because
    jadx produces Java.
- **License:** Apache 2.0.

EXT-TO-JSON uses apktool purely for the manifest + resource strings. The
exact command run by `src/lib/converter/unpack.ts`:

```sh
java -jar tools/apktool.jar d -f --no-src -o <work>/apktool-out <apk>
```

### jadx — DEX → Java decompiler

- **Project:** <https://github.com/skylot/jadx>
- **Version used:** `1.4.7`
- **What it does:** Reads an APK directly (it has its own DEX parser) and
  produces a tree of `.java` files. The decompiler is good but not perfect —
  some classes come out with `goto` labels or odd syntax; we pass
  `--show-bad-code` to emit those rather than failing.
- **License:** Apache 2.0.

The exact command run by `src/lib/converter/decompile.ts`:

```sh
tools/bin/jadx -d <work>/jadx-out --no-res --show-bad-code --threads-count 4 <apk>
```

The `jadx-1.4.7.zip` distribution ships:

```
tools/
├─ apktool.jar
├─ bin/
│  ├─ jadx             ← Unix launcher (shell script)
│  ├─ jadx.bat         ← Windows launcher (batch file)
│  ├─ jadx-gui         ← optional GUI, not used by EXT-TO-JSON
│  └─ jadx-gui.bat
└─ lib/
   ├─ jadx-core-1.4.7.jar
   ├─ jadx-cli-1.4.7.jar
   └─ … (many dependency JARs)
```

### Java — runtime for both tools

- **Required version:** **21 or newer** (LTS).
  - Java 17 *might* work for apktool and jadx but is **not supported** —
    some jadx features need Java 21.
- **Recommended distribution:** Microsoft OpenJDK 21
  (<https://learn.microsoft.com/java/openjdk/>) or
  Eclipse Temurin 21 (<https://adoptium.net/>).
- **License:** GPL v2 with Classpath Exception (OpenJDK).

`java` is invoked as:

- `java -jar tools/apktool.jar …` — runs apktool.
- `tools/bin/jadx(.bat)` — a launcher script that internally invokes `java
  -cp tools/lib/* …` to run jadx.

---

## Where they live

All three tools are stored under `<repo>/tools/`:

```
<repo>/
├─ tools/
│  ├─ apktool.jar            ← downloaded from iBotPeaches/Apktool releases
│  ├─ bin/
│  │  ├─ jadx                ← from the jadx-1.4.7.zip distribution
│  │  ├─ jadx.bat
│  │  └─ …
│  └─ lib/
│     └─ … (jadx's dependency JARs)
└─ …
```

The `tools/` folder is committed to the repo so a fresh clone on any machine
is immediately ready to convert (after `bun install` + `bun run db:push`).
The total size is ~80 MiB.

`src/lib/converter/toolchain.ts::resolveToolchain()` locates these paths
relative to `process.cwd()` (the repo root when the dev server runs):

- `tools/apktool.jar`
- `tools/bin/jadx` (Unix) or `tools/bin/jadx.bat` (Windows — both are
  present in the zip; `resolveToolchain` checks for the Unix name and Node's
  `execFile` handles the `.bat` resolution on Windows automatically).
- `java` — from `$JAVA_HOME/bin/java` if set, otherwise the `java` on PATH.

---

## How to install

### Option A: START.bat (Windows)

Double-click `START.bat` in the repo root. The launcher:

1. Checks for Git, Node-or-Bun, and Java on PATH.
2. Clones (or pulls) the repo into a subfolder.
3. Runs `bun install` (or `npm install`).
4. **Downloads the toolchain if missing** using PowerShell:
   - `apktool.jar` from
     <https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar>
     via `Invoke-WebRequest`.
   - `jadx-1.4.7.zip` from
     <https://github.com/skylot/jadx/releases/download/v1.4.7/jadx-1.4.7.zip>,
     then `Expand-Archive` into `tools/`.
5. Skips the download if `tools/apktool.jar` and `tools/bin/jadx` already
   exist.
6. Runs `db:push` and starts the dev server.

The launcher is idempotent — re-running it pulls the latest repo and only
re-downloads tools that are missing.

### Option B: `scripts/download-tools.ts` (macOS / Linux / CI)

Run from the repo root:

```bash
bun run scripts/download-tools.ts
```

This Bun/Node script:

1. Checks if `tools/apktool.jar` and `tools/bin/jadx` exist. If both present,
   prints *"tools already present - nothing to do"* and exits.
2. Downloads `apktool_2.9.3.jar` → `tools/apktool.jar` via `fetch`.
3. Downloads `jadx-1.4.7.zip` → `tools/jadx.zip` via `fetch`.
4. Extracts the zip via the system `unzip` command (`unzip -o -q zip -d
   tools/`).
5. Cleans up the zip.
6. Verifies `tools/bin/jadx` (or `jadx.bat`) exists.

**Requirements:**

- Bun 1.1+ (or Node 18+ with a global `fetch`).
- `unzip` on PATH. Ships with macOS; on Debian/Ubuntu install with
  `sudo apt-get install unzip`; on Fedora `sudo dnf install unzip`.

The script prints clear progress (`[i]`, `[ok]`, `[!]`, `[x]` prefixes) and
exits non-zero on failure with a troubleshooting hint.

### Option C: Manual

If both automatic options fail, download manually:

1. Download
   <https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar>
   and save as `tools/apktool.jar`.
2. Download
   <https://github.com/skylot/jadx/releases/download/v1.4.7/jadx-1.4.7.zip>
   and extract its contents into `tools/` (so `tools/bin/jadx`,
   `tools/bin/jadx.bat`, and `tools/lib/*.jar` all appear).
3. Verify Java is installed: `java -version` should print `21.x.x` or later.

---

## How to verify

### From the app (recommended)

Open the **Settings** screen (sidebar → Settings). It calls
`GET /api/toolchain` and shows:

- A "Ready" / "Not ready" banner.
- Per-tool cards: `java`, `apktool`, `jadx` — each with a present/absent
  badge and the detected version string.
- The resolved file paths.
- Any error message from the toolchain resolver.

If everything is green, you're ready to convert.

### From the API directly

```bash
curl http://localhost:3000/api/toolchain
```

Example response when everything is ready:

```json
{
  "ready": true,
  "tools": {
    "java":    { "present": true, "version": "openjdk version 21.0.11 2026-04-21" },
    "apktool": { "present": true, "version": "2.9.3" },
    "jadx":    { "present": true, "version": "1.4.7" }
  },
  "error": null,
  "paths": {
    "apktoolJar": "/path/to/repo/tools/apktool.jar",
    "jadxBin":     "/path/to/repo/tools/bin/jadx"
  }
}
```

### From the command line

```bash
java -version                 # should print 21.x or later
java -jar tools/apktool.jar --version   # should print "2.9.3"
tools/bin/jadx --version                # should print "1.4.7"
```

---

## Version requirements

| Tool | Required | Tested with |
| --- | --- | --- |
| Java | **21+** (LTS) | OpenJDK 21.0.11 |
| apktool | **2.9.3** | 2.9.3 |
| jadx | **1.4.7** | 1.4.7 |

The exact versions used at conversion time are recorded in
`converter.toolchain.{apktool, jadx, java}` in every produced JSON file, so
conversions are reproducible. If you upgrade a tool, re-convert any
extensions you want to keep in sync.

### Why these specific versions?

- **apktool 2.9.3** is the latest stable as of the converter's release. Older
  versions (2.x) generally also work; 1.x does not support modern APK
  features.
- **jadx 1.4.7** is the latest stable. Older 1.4.x versions generally work;
  1.3.x has a different output structure that the analyzer doesn't expect.
- **Java 21** is required because jadx 1.4.7 targets Java 21 bytecode in
  some of its internal libraries. Java 17 may work for apktool but will fail
  on recent jadx builds.

---

## Updating the toolchain

To upgrade to a newer apktool or jadx:

1. Delete the old files:
   ```bash
   rm tools/apktool.jar
   rm -rf tools/bin tools/lib
   ```
2. Edit the version constants in:
   - `START.bat` (top of file): `APKTOOL_URL`, `JADX_URL`.
   - `scripts/download-tools.ts`: `APKTOOL_URL`, `JADX_URL`.
3. Re-run the installer (`START.bat` on Windows,
   `bun run scripts/download-tools.ts` elsewhere).
4. Optionally re-convert existing extensions to refresh their
   `converter.toolchain` block.

The `tools/LICENSE` and `tools/NOTICE` files contain the upstream license
texts. Both apktool and jadx are Apache 2.0; the JARs in `tools/lib/` carry
their own licenses (all permissive).

---

## Troubleshooting the toolchain

See [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) for:

- "Toolchain not ready" — what to check first.
- "Java not on PATH" — Windows / macOS / Linux fixes.
- "apktool/jadx failed to execute" — usually a Java version mismatch.
- "Conversion fails at the unpacking / decompiling stage" — debugging.
