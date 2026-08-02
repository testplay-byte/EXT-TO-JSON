"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FlaskConical,
  Package,
  Globe,
  Settings2,
  ListFilter,
  FileText,
  Clapperboard,
  Subtitles,
  Volume2,
  Code2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Hash,
  Loader2,
} from "lucide-react";
import { getExtension } from "@/lib/api";
import type { ExtensionJson } from "@/lib/converter/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HealthBadge, CheckMark } from "@/components/shared/health-badge";
import { JsonViewer } from "@/components/shared/json-viewer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * ExtensionDetailsView — a full, beautiful details page for one converted
 * extension. Shows everything the JSON contains: meta, health breakdown,
 * capabilities, browse/search/episode/video config, servers, subtitles,
 * audio, raw analysis, and the full JSON.
 *
 * Reached by clicking an extension card in the library.
 */
export default function ExtensionDetailsView({
  extensionId,
  onBack,
  onTestInPlayground,
}: {
  extensionId: string;
  onBack: () => void;
  onTestInPlayground: (id: string) => void;
}) {
  const { data: json, isLoading, error } = useQuery({
    queryKey: ["extension", extensionId],
    queryFn: () => getExtension(extensionId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !json) {
    return (
      <div className="rounded-2xl border border-[var(--accent-danger)]/40 bg-[var(--accent-danger-soft)] p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-[var(--accent-danger)] mt-0.5" />
          <div>
            <p className="font-semibold text-[var(--accent-danger)]">
              Could not load extension
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back to library
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top bar: back + title + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight truncate flex items-center gap-2">
              {json.meta.name}
            </h1>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {json.meta.packageName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HealthBadge status={json.health.status} score={json.health.score} />
          <Button size="sm" onClick={() => onTestInPlayground(json.meta.packageName)}>
            <FlaskConical className="h-4 w-4" />
            Test in Playground
          </Button>
        </div>
      </div>

      {/* Health summary banner */}
      <HealthBanner json={json} />

      {/* Meta + capabilities */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-muted-foreground" />
              Metadata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetaCell label="Language" value={json.meta.lang} />
              <MetaCell label="Source type" value={json.meta.sourceType} />
              <MetaCell label="Version ID" value={String(json.meta.versionId || "—")} />
              <MetaCell label="APK version" value={json.meta.apkVersionName || `v${json.meta.apkVersionCode}`} />
              <MetaCell label="NSFW" value={json.meta.isNsfw ? "Yes" : "No"} />
              <MetaCell label="Source class" value={json.meta.sourceClassName} mono />
              <MetaCell label="Base URL" value={json.meta.baseUrl || "—"} mono full />
              <MetaCell label="Input file" value={json.converter.inputFile} mono full />
              <MetaCell label="SHA-256" value={json.converter.inputSha256.slice(0, 16) + "…"} mono />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Capabilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(json.capabilities).map(([k, v]) => (
                <CapabilityChip key={k} name={k} on={v as boolean} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Health checks breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            Conversion checks
          </CardTitle>
          <CardDescription>
            Each check verifies one part of the APK → JSON conversion. Fails are
            never hidden — they explain exactly what could not be extracted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {json.health.checks.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-2.5 rounded-xl bg-[var(--surface-alt)] px-3 py-2.5"
              >
                <CheckMark status={c.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{c.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {c.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Browse config */}
      <ConfigSection
        icon={Globe}
        title="Browse endpoints"
        description="How the extension lists anime — popular, latest, and search."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <EndpointCard name="Popular" ep={json.browse.popular} />
          <EndpointCard name="Latest" ep={json.browse.latest} />
          <EndpointCard name="Search" ep={json.browse.search} />
        </div>
      </ConfigSection>

      {/* Filters */}
      {json.filters.length > 0 && (
        <ConfigSection
          icon={ListFilter}
          title="Filters"
          description="Genre / sort / category filters detected in the source."
        >
          <div className="flex flex-wrap gap-2">
            {json.filters.map((f, i) => (
              <Badge key={i} variant="secondary" className="gap-1.5">
                <Hash className="h-3 w-3" />
                {f.name}
                <span className="text-muted-foreground font-normal">· {f.type}</span>
              </Badge>
            ))}
          </div>
        </ConfigSection>
      )}

      {/* Details + Episodes */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ConfigSection
          icon={FileText}
          title="Details parsing"
          description="CSS selectors for the anime details page."
        >
          <SelectorList
            items={[
              ["Title", json.details.title],
              ["Description", json.details.description],
              ["Thumbnail", json.details.thumbnail],
              ["Author", json.details.author],
              ["Artist", json.details.artist],
              ["Genre", json.details.genre],
              ["Status", json.details.status],
            ]}
          />
        </ConfigSection>

        <ConfigSection
          icon={ListFilter}
          title="Episodes parsing"
          description="How the episode list is fetched and parsed."
        >
          <div className="space-y-2">
            <CodeRow label="URL template" value={json.episodes.url} />
            <CodeRow label="Item selector" value={json.episodes.parse.itemSelector} />
            <CodeRow label="Number" value={json.episodes.parse.number} />
            <CodeRow label="Name" value={json.episodes.parse.name} />
            <CodeRow label="URL" value={json.episodes.parse.url} />
            <CodeRow
              label="Number extraction"
              value={`${json.episodes.parse.numberExtraction}${json.episodes.parse.numberRegex ? ` (${json.episodes.parse.numberRegex})` : ""}`}
            />
          </div>
        </ConfigSection>
      </div>

      {/* Videos / servers */}
      <ConfigSection
        icon={Clapperboard}
        title="Video servers"
        description="Servers detected in the source and how the playground resolves them."
      >
        {json.videos.servers.length === 0 ? (
          <EmptyRow
            icon={AlertTriangle}
            text="No video servers were detected by name in the source. The playground will attempt a generic page scan instead."
            tone="amber"
          />
        ) : (
          <div className="space-y-2">
            {json.videos.servers.map((s, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-[var(--surface)] px-3 py-2.5"
              >
                <span className="font-semibold text-sm">{s.name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[10px]",
                    s.extractor === "unsupported"
                      ? "text-[var(--accent-danger)] border-[var(--accent-danger)]/30"
                      : "text-[var(--accent-teal)] border-[var(--accent-teal)]/30",
                  )}
                >
                  {s.extractor}
                </Badge>
                {s.qualities.map((q) => (
                  <Badge key={q} variant="secondary" className="text-[10px]">
                    {q}
                  </Badge>
                ))}
                {s.note && (
                  <span className="text-xs text-muted-foreground ml-auto">{s.note}</span>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              {json.videos.resolutions.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  Resolutions: {json.videos.resolutions.join(", ")}
                </Badge>
              )}
              {json.videos.formats.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  Formats: {json.videos.formats.join(", ")}
                </Badge>
              )}
              <Badge variant="outline" className="gap-1">
                Strategy: {json.videos.extractorStrategy}
              </Badge>
            </div>
          </div>
        )}
      </ConfigSection>

      {/* Subtitles + Audio */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ConfigSection
          icon={Subtitles}
          title="Subtitles"
          description="Subtitle track handling."
        >
          <div className="space-y-1.5">
            <InfoRow label="Supported" value={json.subtitles.supported ? "Yes" : "No"} />
            <InfoRow label="Source" value={json.subtitles.source} />
            {json.subtitles.formats.length > 0 && (
              <InfoRow label="Formats" value={json.subtitles.formats.join(", ")} />
            )}
            {json.subtitles.note && (
              <p className="text-xs text-muted-foreground mt-1">{json.subtitles.note}</p>
            )}
          </div>
        </ConfigSection>

        <ConfigSection
          icon={Volume2}
          title="Audio tracks"
          description="Multiple audio track handling."
        >
          <div className="space-y-1.5">
            <InfoRow label="Supported" value={json.audio.supported ? "Yes" : "No"} />
            <InfoRow label="Source" value={json.audio.source} />
            {json.audio.tracks.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {json.audio.tracks.map((t, i) => (
                  <Badge key={i} variant="secondary">
                    {t.label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">{json.audio.note}</p>
            )}
          </div>
        </ConfigSection>
      </div>

      {/* Raw analysis (collapsible) */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-[var(--surface-alt)] transition-colors">
              <CardTitle className="flex items-center gap-2 text-base">
                <Code2 className="h-4 w-4 text-muted-foreground" />
                Raw analysis
                <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                  {json.rawAnalysis.methodOverrides.length} methods
                </Badge>
              </CardTitle>
              <CardDescription>
                Transparency dump: decompiled path, method overrides, analyzer
                notes, and resource strings.
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Overridden methods
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {json.rawAnalysis.methodOverrides.map((m) => (
                    <Badge key={m} variant="outline" className="font-mono text-[10px]">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
              {json.rawAnalysis.analyzerNotes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Analyzer notes
                  </p>
                  <div className="space-y-1 rounded-xl bg-[var(--surface-alt)] p-3 font-mono text-xs text-muted-foreground">
                    {json.rawAnalysis.analyzerNotes.map((n, i) => (
                      <div key={i}>• {n}</div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Full JSON */}
      <JsonViewer data={json} maxHeight={600} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function HealthBanner({ json }: { json: ExtensionJson }) {
  const { health } = json;
  const tone =
    health.status === "healthy"
      ? "teal"
      : health.status === "warning"
        ? "amber"
        : "danger";
  const Icon =
    health.status === "healthy"
      ? CheckCircle2
      : health.status === "warning"
        ? AlertTriangle
        : AlertCircle;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3",
        tone === "teal" && "border-[var(--accent-teal)]/30 bg-[var(--accent-teal-soft)]",
        tone === "amber" && "border-[var(--accent-amber)]/30 bg-[var(--accent-amber-soft)]",
        tone === "danger" && "border-[var(--accent-danger)]/30 bg-[var(--accent-danger-soft)]",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0 mt-0.5",
          tone === "teal" && "text-[var(--accent-teal)]",
          tone === "amber" && "text-[var(--accent-amber)]",
          tone === "danger" && "text-[var(--accent-danger)]",
        )}
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {health.score}% converted — {health.status === "healthy" ? "all checks passed" : health.status === "warning" ? "some checks need attention" : "critical checks failed"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{health.summary}</p>
      </div>
    </motion.div>
  );
}

function ConfigSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Globe;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function MetaCell({
  label,
  value,
  mono,
  full,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={cn("rounded-xl bg-[var(--surface-alt)] px-3 py-2.5", full && "sm:col-span-2 lg:col-span-1")}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn("text-sm mt-0.5 truncate", mono && "font-mono text-xs")}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function CapabilityChip({ name, on }: { name: string; on: boolean }) {
  const label = name
    .replace(/^supports/, "")
    .replace(/([A-Z])/g, " $1")
    .trim();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        on
          ? "bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]"
          : "bg-[var(--surface-alt)] text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          on ? "bg-[var(--accent-teal)]" : "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
}

function EndpointCard({
  name,
  ep,
}: {
  name: string;
  ep: { url: string; method: string; paginated: boolean; parse: { itemSelector: string } };
}) {
  return (
    <div className="rounded-xl border border-border bg-[var(--surface-alt)] p-3">
      <p className="text-xs font-semibold mb-1.5">{name}</p>
      <p className="font-mono text-[10px] text-muted-foreground break-all line-clamp-2 mb-2">
        {ep.url || "—"}
      </p>
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className="text-[10px]">
          {ep.method}
        </Badge>
        {ep.paginated && (
          <Badge variant="outline" className="text-[10px]">
            paginated
          </Badge>
        )}
        {ep.parse.itemSelector && (
          <Badge variant="outline" className="text-[10px]">
            has selector
          </Badge>
        )}
      </div>
    </div>
  );
}

function SelectorList({ items }: { items: [string, string][] }) {
  return (
    <div className="space-y-1.5">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
          <span className="font-mono text-xs text-foreground break-all">
            {value || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function CodeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-lg bg-[var(--surface-alt)] px-3 py-1.5">
      <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="font-mono text-xs text-foreground break-all">
        {value || "—"}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

function EmptyRow({
  icon: Icon,
  text,
  tone,
}: {
  icon: typeof AlertTriangle;
  text: string;
  tone: "amber" | "danger";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs",
        tone === "amber" && "bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]",
        tone === "danger" && "bg-[var(--accent-danger-soft)] text-[var(--accent-danger)]",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}
