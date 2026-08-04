/**
 * manifest.ts — Parse the apktool-decoded AndroidManifest.xml.
 *
 * The decoded manifest is plain XML text. We extract:
 *   - package name (encodes language, kind, source slug)
 *   - versionCode / versionName
 *   - <meta-data> name/value pairs (source class, nsfw, etc.)
 *   - application label / icon references
 *
 * A lightweight regex extractor is used (the manifest is a flat structure for
 * the fields we need); this avoids an XML parser dependency.
 */
import { readFileSync } from "node:fs";

export interface ManifestInfo {
  packageName: string;
  versionCode: number;
  versionName: string;
  metaData: Record<string, string>;
  applicationLabel: string; // resource ref like @string/app_name
  applicationIcon: string; // resource ref like @mipmap/ic_launcher
  raw: Record<string, unknown>;
}

export function parseManifest(manifestPath: string): ManifestInfo {
  const xml = readFileSync(manifestPath, "utf8");

  const pkgMatch = xml.match(/<manifest[^>]*\bpackage="([^"]+)"/);
  const packageName = pkgMatch?.[1] ?? "";

  // versionCode can be on <manifest> or <manifest android:versionCode=...>
  const vcMatch =
    xml.match(/android:versionCode="(\d+)"/) ||
    xml.match(/\bversionCode="(\d+)"/);
  const versionCode = vcMatch ? parseInt(vcMatch[1], 10) : 0;

  const vnMatch = xml.match(/android:versionName="([^"]+)"/);
  const versionName = vnMatch?.[1] ?? "";

  // all <meta-data android:name=".." android:value=".."/>
  const metaData: Record<string, string> = {};
  const metaRe =
    /<meta-data\s+[^>]*?android:name="([^"]+)"[^>]*?android:value="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(xml)) !== null) {
    metaData[m[1]] = m[2];
  }
  // also catch value-before-name ordering
  const metaRe2 =
    /<meta-data\s+[^>]*?android:value="([^"]*)"[^>]*?android:name="([^"]+)"/g;
  while ((m = metaRe2.exec(xml)) !== null) {
    if (!metaData[m[2]]) metaData[m[2]] = m[1];
  }

  const appMatch = xml.match(/<application\s+[^>]*?>/);
  const appTag = appMatch?.[0] ?? "";
  const labelMatch = appTag.match(/android:label="([^"]+)"/);
  const iconMatch = appTag.match(/android:icon="([^"]+)"/);

  return {
    packageName,
    versionCode,
    versionName,
    metaData,
    applicationLabel: labelMatch?.[1] ?? "",
    applicationIcon: iconMatch?.[1] ?? "",
    raw: {
      packageName,
      versionCode,
      versionName,
      metaDataKeys: Object.keys(metaData),
    },
  };
}

/** Derive language + source kind + slug from the package name. */
export function deriveFromPackage(packageName: string): {
  lang: string;
  kind: "anime" | "manga";
  slug: string;
} {
  const parts = packageName.split(".");
  const animeIdx = parts.indexOf("animeextension");
  const extIdx = parts.indexOf("extension");
  let kind: "anime" | "manga" = "manga";
  let base = -1;
  if (animeIdx !== -1) {
    kind = "anime";
    base = animeIdx;
  } else if (extIdx !== -1) {
    kind = "manga";
    base = extIdx;
  }
  const lang = base !== -1 && parts[base + 1] ? parts[base + 1] : "en";
  const slug = parts[parts.length - 1] || "unknown";
  return { lang, kind, slug };
}

/** Title-case a slug into a display name (fallback when no name found). */
export function slugToName(slug: string): string {
  return slug
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
