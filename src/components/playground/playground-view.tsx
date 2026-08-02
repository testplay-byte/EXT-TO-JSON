"use client";

/**
 * ============================================================================
 *  PlaygroundView — live testing environment for converted anime extensions.
 * ============================================================================
 *
 *  Owns the whole playground UX:
 *    1. Extension picker (top).
 *    2. Browse / Search tabs (popular+latest, pagination, debounced search,
 *       filters rendered from ext.filters).
 *    3. Details panel + Episodes + Videos panel appear when an anime/episode
 *       is selected.
 *
 *  Every backend response carries a `fetch` block + `warnings[]`. We surface
 *  them via <FetchAlert> / <WarningsAlert> at EVERY layer — nothing is hidden.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical,
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Box,
  Filter,
  Loader2,
  RotateCw,
} from "lucide-react";
import {
  listExtensions,
  getExtension,
  pgBrowse,
  pgSearch,
  type BrowseItem,
  type ExtensionSummary,
  type BrowseResult,
} from "@/lib/api";
import type { ExtensionJson, FilterDef } from "@/lib/converter/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthBadge } from "@/components/shared/health-badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { BrowseGrid } from "./browse-grid";
import { ExtensionSettingsDialog } from "./settings-dialog";
import { SlidersHorizontal } from "lucide-react";
import { DetailsPanel } from "./details-panel";
import { VideosSection } from "./videos-section";
import {
  CapabilitiesChips,
  EmptyState,
  FetchAlert,
  WarningsAlert,
} from "./shared";

export default function PlaygroundView({
  initialExtensionId,
}: {
  initialExtensionId?: string;
}) {
  const [selectedExtId, setSelectedExtId] = React.useState<string | undefined>(
    initialExtensionId,
  );
  const [tab, setTab] = React.useState<"browse" | "search">("browse");
  const [browseType, setBrowseType] = React.useState<"popular" | "latest">(
    "popular",
  );
  const [browsePage, setBrowsePage] = React.useState(1);

  const [searchInput, setSearchInput] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchPage, setSearchPage] = React.useState(1);
  const [searchFilters, setSearchFilters] = React.useState<
    Record<string, string>
  >({});

  const [selectedAnime, setSelectedAnime] =
    React.useState<BrowseItem | null>(null);
  const [selectedEpisodeUrl, setSelectedEpisodeUrl] = React.useState<
    string | undefined
  >();
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const extsQ = useQuery({
    queryKey: ["extensions"],
    queryFn: listExtensions,
  });
  const extensions: ExtensionSummary[] = extsQ.data?.extensions ?? [];

  // Auto-select first extension when none is selected but list is available.
  React.useEffect(() => {
    if (!selectedExtId && extensions.length > 0) {
      setSelectedExtId(extensions[0].id);
    }
  }, [extensions, selectedExtId]);

  // Honour initialExtensionId whenever it changes.
  React.useEffect(() => {
    if (initialExtensionId) setSelectedExtId(initialExtensionId);
  }, [initialExtensionId]);

  // Reset everything when the extension changes.
  React.useEffect(() => {
    setBrowsePage(1);
    setBrowseType("popular");
    setSearchPage(1);
    setSearchFilters({});
    setSearchInput("");
    setSearchQuery("");
    setSelectedAnime(null);
    setSelectedEpisodeUrl(undefined);
  }, [selectedExtId]);

  // Full extension JSON (for filters + capabilities display).
  const extQ = useQuery({
    queryKey: ["extension", selectedExtId],
    queryFn: () => getExtension(selectedExtId!),
    enabled: !!selectedExtId,
  });
  const extJson: ExtensionJson | undefined = extQ.data;
  const extSummary =
    extensions.find((e) => e.id === selectedExtId) ?? null;

  // Browse query
  const browseQ = useQuery({
    queryKey: ["pg-browse", selectedExtId, browseType, browsePage],
    queryFn: () => pgBrowse(selectedExtId!, browseType, browsePage),
    enabled: tab === "browse" && !!selectedExtId,
  });

  // Debounced search query
  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setSearchPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const searchQ = useQuery({
    queryKey: [
      "pg-search",
      selectedExtId,
      searchQuery,
      searchPage,
      searchFilters,
    ],
    queryFn: () =>
      pgSearch(selectedExtId!, searchQuery, searchPage, searchFilters),
    enabled:
      tab === "search" && !!selectedExtId && searchQuery.length > 0,
  });

  const onPickAnime = (item: BrowseItem) => {
    setSelectedAnime(item);
    setSelectedEpisodeUrl(undefined);
    toast.info(`Loading details for "${item.title}"…`);
  };

  const onPickEpisode = (url: string) => {
    setSelectedEpisodeUrl(url);
    toast.success("Episode selected — loading videos…");
  };

  // No extensions yet.
  if (!extsQ.isLoading && extensions.length === 0) {
    return (
      <div className="space-y-4">
        <Header />
        <EmptyState
          title="No extensions yet"
          description="Convert or import an extension in the Converter tab, then come back to test it live here."
          icon={Box}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header />

      {/* Extension picker */}
      <Card className="gap-4 rounded-3xl border-border bg-[var(--surface)] shadow-[var(--shadow)]">
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Extension
              </label>
              <Select
                value={selectedExtId}
                onValueChange={(v) => setSelectedExtId(v)}
              >
                <SelectTrigger className="h-10 w-full rounded-xl sm:w-[380px]">
                  <SelectValue placeholder="Pick an extension…" />
                </SelectTrigger>
                <SelectContent>
                  {extensions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="font-medium">{e.name}</span>
                      <span className="ml-1.5 text-muted-foreground">
                        · {e.lang}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {extSummary && (
              <div className="flex flex-wrap items-center gap-2">
                <HealthBadge
                  status={extSummary.healthStatus}
                  score={extSummary.healthScore}
                />
                <Badge
                  variant="secondary"
                  className="rounded-full bg-[var(--surface-alt)]"
                >
                  {extSummary.lang}
                </Badge>
                {extSummary.isNsfw && (
                  <Badge className="rounded-full bg-[var(--accent-danger)] text-white">
                    NSFW
                  </Badge>
                )}
                {extJson?.settings?.configurable && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 rounded-full"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Settings
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Capabilities + meta */}
          {extSummary && (
            <div className="space-y-2">
              <CapabilitiesChips capabilities={extSummary.capabilities} />
              <p className="break-all text-[11px] text-muted-foreground">
                {extSummary.baseUrl}
              </p>
              {extSummary.healthSummary && (
                <p className="text-[11px] italic text-muted-foreground">
                  {extSummary.healthSummary}
                </p>
              )}
            </div>
          )}
          {extQ.isLoading && (
            <Skeleton className="h-4 w-72 rounded bg-[var(--surface-alt)]" />
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "browse" | "search")}
        className="gap-3"
      >
        <TabsList className="rounded-xl">
          <TabsTrigger value="browse" className="rounded-lg">
            <Sparkles className="h-3.5 w-3.5" /> Browse
          </TabsTrigger>
          <TabsTrigger value="search" className="rounded-lg">
            <Search className="h-3.5 w-3.5" /> Search
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-3 outline-none">
          <BrowseToolbar
            browseType={browseType}
            setBrowseType={(t) => {
              setBrowseType(t);
              setBrowsePage(1);
            }}
          />
          <ResultArea
            q={browseQ}
            onPickAnime={onPickAnime}
            selectedUrl={selectedAnime?.url}
            emptyTitle="No items"
            emptyDescription="This extension returned an empty browse list."
            page={browsePage}
            setPage={setBrowsePage}
            hasNextPage={browseQ.data?.hasNextPage}
          />
        </TabsContent>

        <TabsContent value="search" className="space-y-3 outline-none">
          <SearchToolbar
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            filters={searchFilters}
            setFilters={setSearchFilters}
            extJson={extJson}
          />
          {searchQuery.length === 0 ? (
            <EmptyState
              title="Type to search"
              description="Enter a query above to search this extension's catalog."
              icon={Search}
            />
          ) : (
            <ResultArea
              q={searchQ}
              onPickAnime={onPickAnime}
              selectedUrl={selectedAnime?.url}
              emptyTitle={`No results for "${searchQuery}"`}
              emptyDescription="Try a different query, page, or filter set."
              page={searchPage}
              setPage={setSearchPage}
              hasNextPage={searchQ.data?.hasNextPage}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Details + Videos */}
      <AnimatePresence>
        {selectedAnime && selectedExtId && (
          <motion.div
            key="details-block"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <DetailsPanel
              extensionId={selectedExtId}
              anime={selectedAnime}
              onClose={() => {
                setSelectedAnime(null);
                setSelectedEpisodeUrl(undefined);
              }}
              selectedEpisodeUrl={selectedEpisodeUrl}
              onPickEpisode={onPickEpisode}
            />
            {selectedEpisodeUrl && (
              <VideosSection
                extensionId={selectedExtId}
                episodeUrl={selectedEpisodeUrl}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extension settings dialog */}
      <ExtensionSettingsDialog
        extensionId={selectedExtId}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}

/* ----------------------------- Header ----------------------------- */
function Header() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--text-primary)] text-[var(--canvas)] shadow-md">
        <FlaskConical className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-bold leading-tight">Playground</h2>
        <p className="text-xs leading-tight text-muted-foreground">
          Live-test a converted extension&apos;s browse, search, details,
          episodes, and video pipeline.
        </p>
      </div>
    </div>
  );
}

/* --------------------------- Browse toolbar ---------------------------- */
function BrowseToolbar({
  browseType,
  setBrowseType,
}: {
  browseType: "popular" | "latest";
  setBrowseType: (t: "popular" | "latest") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl border border-border bg-[var(--surface)] p-1">
        {(["popular", "latest"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setBrowseType(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all min-h-[36px]",
              browseType === t
                ? "bg-[var(--accent-indigo)] text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- Search toolbar ---------------------------- */
function SearchToolbar({
  searchInput,
  setSearchInput,
  filters,
  setFilters,
  extJson,
}: {
  searchInput: string;
  setSearchInput: (v: string) => void;
  filters: Record<string, string>;
  setFilters: (next: Record<string, string>) => void;
  extJson?: ExtensionJson;
}) {
  const filtersToShow =
    extJson?.filters?.filter(
      (f) =>
        f.type === "select" ||
        f.type === "sort" ||
        f.type === "text" ||
        f.type === "checkbox" ||
        f.type === "group",
    ) ?? [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search this extension…"
          className="h-10 rounded-xl pl-9 pr-9"
          autoComplete="off"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-[var(--surface-alt)] hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-45" />
          </button>
        )}
      </div>
      {filtersToShow.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3 w-3" />
            Filters ({filtersToShow.length})
          </div>
          <FiltersRenderer
            filters={filtersToShow}
            values={filters}
            onChange={(k, v) => {
              const next = { ...filters };
              if (v === "" || v == null) delete next[k];
              else next[k] = v;
              setFilters(next);
            }}
            onReset={() => setFilters({})}
          />
        </div>
      )}
    </div>
  );
}

function FiltersRenderer({
  filters,
  values,
  onChange,
  onReset,
  depth = 0,
}: {
  filters: FilterDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onReset?: () => void;
  depth?: number;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        depth === 0 ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1",
      )}
    >
      {filters.map((f, i) => {
        const key = f.param || f.name;
        if (f.type === "header") {
          return (
            <div
              key={i}
              className="col-span-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {f.name}
            </div>
          );
        }
        if (f.type === "separator") {
          return <div key={i} className="col-span-full h-px bg-border" />;
        }
        if (f.type === "group" && f.subFilters) {
          return (
            <div
              key={i}
              className="col-span-full rounded-2xl border border-border bg-[var(--surface-alt)] p-3"
            >
              <p className="mb-2 text-xs font-semibold">{f.name}</p>
              <FiltersRenderer
                filters={f.subFilters}
                values={values}
                onChange={onChange}
                depth={depth + 1}
              />
            </div>
          );
        }
        if (f.type === "text") {
          return (
            <div key={i} className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground">{f.name}</label>
              <Input
                value={values[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder={f.default ? String(f.default) : f.name}
                className="h-9 rounded-lg text-xs"
              />
            </div>
          );
        }
        if (f.type === "checkbox") {
          const checked = values[key] === "true" || values[key] === "1";
          return (
            <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-[var(--surface)] px-3 py-2">
              <span className="text-xs">{f.name}</span>
              <Switch
                checked={checked}
                onCheckedChange={(c) => onChange(key, c ? "true" : "")}
              />
            </div>
          );
        }
        // select or sort
        const options =
          f.type === "sort"
            ? (f.sortValues ?? []).map((sv) => ({
                value: sv.value,
                label: sv.name,
              }))
            : (f.values ?? []).map((v) => ({ value: v, label: v }));
        return (
          <div key={i} className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">{f.name}</label>
            <Select
              value={values[key] ?? "__all"}
              onValueChange={(v) => onChange(key, v === "__all" ? "" : v)}
            >
              <SelectTrigger className="h-9 rounded-lg text-xs">
                <SelectValue placeholder={f.name} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Any</SelectItem>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
      {depth === 0 && onReset && Object.keys(values).length > 0 && (
        <div className="col-span-full flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 rounded-lg text-[11px] text-muted-foreground"
          >
            <RotateCw className="h-3 w-3" /> Reset filters
          </Button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Result area ----------------------------- */
function ResultArea({
  q,
  onPickAnime,
  selectedUrl,
  emptyTitle,
  emptyDescription,
  page,
  setPage,
  hasNextPage,
}: {
  q: ReturnType<typeof useQuery<BrowseResult>>;
  onPickAnime: (item: BrowseItem) => void;
  selectedUrl?: string;
  emptyTitle: string;
  emptyDescription: string;
  page: number;
  setPage: (p: number) => void;
  hasNextPage?: boolean;
}) {
  return (
    <div className="space-y-3">
      {q.isError && (
        <FetchAlert
          fetch={{
            ok: false,
            status: 0,
            url: "",
            error:
              q.error instanceof Error
                ? q.error.message
                : "Network or server error",
          }}
          title="Request failed"
        />
      )}
      {q.data && <FetchAlert fetch={q.data.fetch} title="Browse request failed" />}
      {q.data && <WarningsAlert warnings={q.data.warnings} />}

      {q.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      )}

      <BrowseGrid
        items={q.data?.items ?? []}
        onSelect={onPickAnime}
        loading={q.isLoading}
        selectedUrl={selectedUrl}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />

      {!q.isLoading && q.data && q.data.items.length > 0 && (
        <Pagination
          page={page}
          setPage={setPage}
          hasNext={!!hasNextPage}
        />
      )}
    </div>
  );
}

function Pagination({
  page,
  setPage,
  hasNext,
}: {
  page: number;
  setPage: (p: number) => void;
  hasNext: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-2 pt-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="h-9 min-w-[80px] rounded-xl"
      >
        <ChevronLeft className="h-4 w-4" /> Prev
      </Button>
      <span className="rounded-full bg-[var(--surface-alt)] px-3 py-1 text-xs font-semibold">
        Page {page}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setPage(page + 1)}
        disabled={!hasNext}
        className="h-9 min-w-[80px] rounded-xl"
      >
        Next <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
