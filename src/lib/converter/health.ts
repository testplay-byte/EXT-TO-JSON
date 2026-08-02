/**
 * health.ts — Compute a transparent health report from the assembled analysis.
 *
 * Every check is explicit and surfaces in the UI. Nothing is silently hidden.
 */
import type {
  HealthCheck,
  HealthReport,
  SourceAnalysis,
  Capabilities,
} from "./types";

export interface HealthInput {
  manifestParsed: boolean;
  sourceFound: boolean;
  analysis: SourceAnalysis;
  capabilities: Capabilities;
  hasPopular: boolean;
  hasSearch: boolean;
  hasDetails: boolean;
  hasEpisodes: boolean;
  hasVideos: boolean;
  serverCount: number;
}

function check(
  id: string,
  label: string,
  ok: boolean | null,
  detail: string,
): HealthCheck {
  // ok === null -> skipped
  const status = ok === null ? "skip" : ok ? "pass" : "fail";
  return { id, label, status, detail };
}

export function computeHealth(input: HealthInput): HealthReport {
  const { analysis, capabilities } = input;
  const checks: HealthCheck[] = [];

  checks.push(
    check(
      "manifest",
      "AndroidManifest parsed",
      input.manifestParsed,
      input.manifestParsed
        ? "Package name, version code/name and meta-data extracted."
        : "apktool did not produce a readable manifest.",
    ),
  );

  checks.push(
    check(
      "source-class",
      "Source class located",
      input.sourceFound,
      input.sourceFound
        ? `${analysis.sourceClassName} extends ${analysis.sourceType}.`
        : "No class extending a known Aniyomi base was found in the decompiled source.",
    ),
  );

  checks.push(
    check(
      "base-url",
      "Base URL extracted",
      !!analysis.properties.baseUrl,
      analysis.properties.baseUrl
        ? analysis.properties.baseUrl
        : "baseUrl property not found; browse/video requests will be incomplete.",
    ),
  );

  checks.push(
    check(
      "language",
      "Language extracted",
      !!analysis.properties.lang,
      analysis.properties.lang ?? "lang property not found.",
    ),
  );

  checks.push(
    check(
      "name",
      "Display name extracted",
      !!analysis.properties.name,
      analysis.properties.name
        ? analysis.properties.name
        : "name not found in source; falling back to package slug / app_name.",
    ),
  );

  checks.push(
    check(
      "method-overrides",
      "Method overrides detected",
      analysis.methodOverrides.length > 0,
      `${analysis.methodOverrides.length} overridden methods detected.`,
    ),
  );

  checks.push(
    check(
      "browse-popular",
      "Popular endpoint",
      input.hasPopular,
      input.hasPopular
        ? "popularAnimeRequest + popularAnimeSelector present."
        : "Popular browse endpoint missing or incomplete.",
    ),
  );

  checks.push(
    check(
      "browse-search",
      "Search endpoint",
      input.hasSearch,
      input.hasSearch
        ? "searchAnimeRequest present."
        : "Search endpoint missing.",
    ),
  );

  checks.push(
    check(
      "details",
      "Anime details parsing",
      input.hasDetails,
      input.hasDetails
        ? "animeDetailsParse / FromElement present."
        : "Details parsing missing.",
    ),
  );

  checks.push(
    check(
      "episodes",
      "Episode list parsing",
      input.hasEpisodes,
      input.hasEpisodes
        ? "episodeListParse present."
        : capabilities.sourceKind === "anime"
          ? "Episode list parsing missing."
          : "Not applicable for manga sources.",
    ),
  );

  checks.push(
    check(
      "videos",
      "Video extraction",
      input.hasVideos,
      input.hasVideos
        ? "videoListParse / videoUrlParse present."
        : capabilities.sourceKind === "anime"
          ? "Video extraction missing."
          : "Not applicable for manga sources (page list).",
    ),
  );

  checks.push(
    check(
      "servers",
      "Video servers detected",
      capabilities.sourceKind === "anime" ? input.serverCount > 0 : null,
      capabilities.sourceKind === "anime"
        ? input.serverCount > 0
          ? `${input.serverCount} server(s): ${analysis.detectedExtractors.join(", ")}`
          : "No known video server names detected in source string literals."
        : "Skipped (manga source).",
    ),
  );

  checks.push(
    check(
      "filters",
      "Filter list",
      capabilities.supportsFilters ? true : null,
      capabilities.supportsFilters
        ? `${analysis.filters.length} filter(s) detected.`
        : "No filters.",
    ),
  );

  // Scoring
  const counted = checks.filter((c) => c.status !== "skip");
  const passCount = counted.filter((c) => c.status === "pass").length;
  const failCount = counted.filter((c) => c.status === "fail").length;
  const score = counted.length
    ? Math.round((passCount / counted.length) * 100)
    : 0;

  const errors = checks
    .filter((c) => c.status === "fail" && isCritical(c.id))
    .map((c) => `${c.label}: ${c.detail}`);
  const warnings = checks
    .filter((c) => c.status === "fail" && !isCritical(c.id))
    .map((c) => `${c.label}: ${c.detail}`);

  let status: HealthReport["status"];
  if (errors.length > 0 || score < 40) status = "error";
  else if (warnings.length > 0 || score < 80) status = "warning";
  else status = "healthy";

  const summary =
    status === "healthy"
      ? `Conversion healthy — ${score}% complete. ${passCount}/${counted.length} checks passed.`
      : status === "warning"
        ? `Conversion incomplete — ${score}% complete. ${warnings.length} warning(s), ${errors.length} error(s).`
        : `Conversion failed — ${score}% complete. ${errors.length} critical error(s).`;

  return { score, status, summary, checks, warnings, errors };
}

function isCritical(id: string): boolean {
  return ["manifest", "source-class", "base-url", "method-overrides"].includes(
    id,
  );
}
