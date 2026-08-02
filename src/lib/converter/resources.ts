/**
 * resources.ts — Extract decoded resource strings (res/values/strings.xml).
 *
 * Used for the app display name and any source-specific overrides.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function readResourceStrings(resDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const valuesDir = join(resDir, "values");
  if (!existsSync(valuesDir)) return out;

  let files: string[] = [];
  try {
    files = readdirSync(valuesDir).filter((f) => f.endsWith(".xml"));
  } catch {
    return out;
  }

  for (const f of files) {
    const path = join(valuesDir, f);
    let xml = "";
    try {
      xml = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    // <string name="key">value</string>
    const re = /<string\s+name="([^"]+)"\s*>([\s\S]*?)<\/string>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const val = m[2]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
      out[m[1]] = val;
    }
  }
  return out;
}

/** Resolve an @string/KEY reference to its value, if present. */
export function resolveStringRef(
  ref: string,
  strings: Record<string, string>,
): string | undefined {
  if (!ref) return undefined;
  const m = ref.match(/^@string\/(.+)$/);
  if (!m) return ref;
  return strings[m[1]];
}
