"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileJson,
  Loader2,
  Trash2,
  Package,
  CheckCircle2,
  AlertCircle,
  Cpu,
  FileUp,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  convertApk,
  importJson,
  getJob,
  listExtensions,
  getExtension,
  deleteExtension,
  type ExtensionSummary,
  type ToolchainInfo,
  getToolchain,
} from "@/lib/api";
import type { ConversionJob, ExtensionJson } from "@/lib/converter/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { HealthBadge, CheckMark } from "@/components/shared/health-badge";
import { JsonViewer } from "@/components/shared/json-viewer";
import ExtensionDetailsView from "./extension-details-view";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  unpacking: "Unpacking APK",
  "decoding-manifest": "Decoding manifest",
  decompiling: "Decompiling DEX",
  analyzing: "Analyzing source",
  assembling: "Assembling JSON",
  "health-check": "Health check",
  done: "Complete",
  error: "Error",
};

export default function ConverterView({
  onOpenInPlayground,
}: {
  onOpenInPlayground?: (id: string) => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ConversionJob | null>(null);
  const [result, setResult] = useState<ExtensionJson | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [selectedExtId, setSelectedExtId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const qc = useQueryClient();
  const { data: toolchain } = useQuery({
    queryKey: ["toolchain"],
    queryFn: getToolchain,
  });
  const { data: extsData } = useQuery({
    queryKey: ["extensions"],
    queryFn: listExtensions,
    refetchInterval: jobId ? 2000 : false,
  });

  // Poll the active job until done/error.
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    async function poll() {
      try {
        const { job } = await getJob(jobId!);
        if (!active) return;
        setJob(job);
        if (job.status === "done" && job.extensionId) {
          const json = await getExtension(job.extensionId);
          if (active) {
            setResult(json);
            setResultId(job.extensionId);
            setJobId(null);
            qc.invalidateQueries({ queryKey: ["extensions"] });
            toast.success(
              `Converted "${json.meta.name}" — health ${json.health.score}%`,
            );
          }
        } else if (job.status === "error") {
          setJobId(null);
          toast.error(job.error || "Conversion failed");
        }
      } catch (e) {
        if (active) toast.error(e instanceof Error ? e.message : String(e));
      }
    }
    const t = setInterval(poll, 800);
    poll();
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [jobId, qc]);

  const startConvert = useCallback(async (file: File) => {
    try {
      setResult(null);
      setResultId(null);
      setJob(null);
      const { jobId } = await convertApk(file);
      setJobId(jobId);
      toast.info("Conversion started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const importMut = useMutation({
    mutationFn: importJson,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["extensions"] });
      toast.success("JSON imported");
      if (onOpenInPlayground) onOpenInPlayground(data.extensionId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function handleFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    const f = files[0];
    if (!f.name.toLowerCase().endsWith(".apk")) {
      toast.error("Please drop an .apk file");
      return;
    }
    startConvert(f);
  }

  function handleJsonFile(files: FileList | null) {
    if (!files || !files[0]) return;
    importMut.mutate(files[0]);
  }

  // If an extension is selected, show its details page instead of the converter.
  if (selectedExtId) {
    return (
      <ExtensionDetailsView
        extensionId={selectedExtId}
        onBack={() => setSelectedExtId(null)}
        onTestInPlayground={(id) => {
          setSelectedExtId(null);
          onOpenInPlayground?.(id);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Converter</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload an Aniyomi/Animiru anime-extension APK to convert it into a
          portable JSON document. The pipeline decompiles the APK (apktool +
          jadx), locates the Source class, and extracts its full structure.
        </p>
      </div>

      {toolchain && !toolchain.ready && (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--accent-amber)]/40 bg-[var(--accent-amber-soft)] px-4 py-3 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-[var(--accent-amber)] mt-0.5" />
          <div>
            <p className="font-semibold text-[var(--accent-amber)]">
              Toolchain not ready
            </p>
            <p className="text-muted-foreground mt-0.5">
              apktool / jadx / Java must be present in <code className="font-mono text-xs">tools/</code>.
              Visit Settings to see status, or re-run the launcher to download them.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload card */}
        <Card
          className={cn(
            "lift-on-hover relative overflow-hidden",
            dragOver && "ring-2 ring-[var(--accent-teal)]",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-[var(--accent-teal)]" />
              Upload APK
            </CardTitle>
            <CardDescription>
              Drag &amp; drop an extension APK, or click to browse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-[var(--surface-alt)] py-10 transition-colors hover:border-[var(--accent-teal)]/50 hover:bg-[var(--accent-teal-soft)]/40"
            >
              <motion.div
                animate={{ y: dragOver ? -4 : 0 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]"
              >
                <Upload className="h-6 w-6" />
              </motion.div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {dragOver ? "Drop to convert" : "Drop APK here"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  or click to select a file
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".apk"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </CardContent>
        </Card>

        {/* Import JSON / quick actions */}
        <Card className="lift-on-hover">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-[var(--accent-amber)]" />
              Import JSON
            </CardTitle>
            <CardDescription>
              Already have a converted <code className="font-mono text-xs">.json</code>?
              Import it to test in the playground instantly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => jsonInputRef.current?.click()}
              disabled={importMut.isPending}
            >
              {importMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileJson className="h-4 w-4" />
              )}
              Select JSON file
            </Button>
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => handleJsonFile(e.target.files)}
            />
            <div className="rounded-xl bg-[var(--surface-alt)] p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Pipeline stages</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Unpack APK (apktool)</li>
                <li>Parse AndroidManifest + resources</li>
                <li>Decompile DEX (jadx)</li>
                <li>Locate &amp; analyze Source class</li>
                <li>Assemble JSON + health report</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active job — full-width animated processing panel */}
      <AnimatePresence>
        {job && (
          <motion.div
            initial={{ opacity: 0, y: 12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -12, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ProcessingPanel job={job} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last result */}
      {result && (
        <HealthReport
          json={result}
          extensionId={resultId}
          onOpenInPlayground={onOpenInPlayground}
        />
      )}

      {/* Library */}
      <ExtensionsLibrary
        extensions={extsData?.extensions ?? []}
        onOpenDetails={(id) => setSelectedExtId(id)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const PIPELINE_STAGES: {
  id: string;
  label: string;
  threshold: number;
  icon: typeof Loader2;
}[] = [
  { id: "unpacking", label: "Unpack", threshold: 2, icon: Package },
  { id: "decoding-manifest", label: "Manifest", threshold: 18, icon: FileJson },
  { id: "decompiling", label: "Decompile", threshold: 28, icon: Cpu },
  { id: "analyzing", label: "Analyze", threshold: 55, icon: Search },
  { id: "assembling", label: "Assemble", threshold: 78, icon: FileUp },
  { id: "health-check", label: "Health", threshold: 92, icon: CheckCircle2 },
];

function ProcessingPanel({ job }: { job: ConversionJob }) {
  const isDone = job.status === "done";
  const isError = job.status === "error";
  const activeStageIdx = Math.max(
    0,
    PIPELINE_STAGES.findIndex((s) => job.progress < s.threshold),
  );
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom on update.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job.logs]);

  return (
    <Card
      className={cn(
        "overflow-hidden",
        isError && "border-[var(--accent-danger)]/40",
        isDone && "border-[var(--accent-teal)]/40",
      )}
    >
      {/* Header bar with animated gradient when running */}
      <div
        className={cn(
          "relative px-5 py-4 border-b border-border overflow-hidden",
          !isDone && !isError && "bg-[var(--surface-alt)]",
          isDone && "bg-[var(--accent-teal-soft)]",
          isError && "bg-[var(--accent-danger-soft)]",
        )}
      >
        {!isDone && !isError && (
          <motion.div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--accent-indigo-soft), transparent)",
            }}
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        )}
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {isError ? (
              <AlertCircle className="h-6 w-6 shrink-0 text-[var(--accent-danger)]" />
            ) : isDone ? (
              <CheckCircle2 className="h-6 w-6 shrink-0 text-[var(--accent-teal)]" />
            ) : (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="h-6 w-6 shrink-0 text-[var(--accent-indigo)]" />
              </motion.div>
            )}
            <div className="min-w-0">
              <p className="font-semibold truncate">
                {isDone
                  ? "Conversion complete"
                  : isError
                    ? "Conversion failed"
                    : "Converting…"}
              </p>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {job.apkFileName}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-xs shrink-0",
              isDone && "border-[var(--accent-teal)]/40 text-[var(--accent-teal)]",
              isError && "border-[var(--accent-danger)]/40 text-[var(--accent-danger)]",
            )}
          >
            {STAGE_LABEL[job.status] ?? job.status} · {job.progress}%
          </Badge>
        </div>
      </div>

      <CardContent className="p-5 space-y-5">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span className="truncate">{job.message}</span>
            <span className="font-mono shrink-0 ml-2">{job.progress}%</span>
          </div>
          <div className="relative h-2.5 w-full rounded-full bg-[var(--surface-alt)] overflow-hidden">
            <motion.div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                isError
                  ? "bg-[var(--accent-danger)]"
                  : isDone
                    ? "bg-[var(--accent-teal)]"
                    : "bg-gradient-to-r from-[var(--accent-indigo)] to-[var(--accent-teal)]",
              )}
              animate={{ width: `${job.progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
            {!isDone && !isError && job.progress > 0 && (
              <motion.div
                className="absolute inset-y-0 w-20"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                }}
                animate={{ x: ["-80px", "100%"] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            )}
          </div>
        </div>

        {/* Stage timeline */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {PIPELINE_STAGES.map((stage, i) => {
            const StageIcon = stage.icon;
            const isPast = i < activeStageIdx || isDone;
            const isActive = i === activeStageIdx && !isDone && !isError;
            return (
              <div
                key={stage.id}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-all",
                  isPast && "border-[var(--accent-teal)]/30 bg-[var(--accent-teal-soft)]",
                  isActive &&
                    "border-[var(--accent-indigo)] bg-[var(--accent-indigo-soft)] scale-[1.03]",
                  !isPast && !isActive && "border-border bg-[var(--surface-alt)] opacity-60",
                  isError && i >= activeStageIdx && "opacity-40",
                )}
              >
                <div className="relative">
                  <StageIcon
                    className={cn(
                      "h-4 w-4",
                      isPast && "text-[var(--accent-teal)]",
                      isActive && "text-[var(--accent-indigo)]",
                      !isPast && !isActive && "text-muted-foreground",
                    )}
                  />
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 -z-10"
                      animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{
                        background: "var(--accent-indigo)",
                        borderRadius: "50%",
                      }}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isPast && "text-[var(--accent-teal)]",
                    isActive && "text-[var(--accent-indigo)]",
                    !isPast && !isActive && "text-muted-foreground",
                  )}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Live logs */}
        {job.logs.length > 0 && (
          <div
            ref={logRef}
            className="max-h-44 overflow-y-auto rounded-xl bg-[#1a1a1c] p-3 font-mono text-xs space-y-0.5 border border-border"
          >
            {job.logs.slice(-50).map((l, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2",
                  l.level === "error" && "text-[var(--accent-danger)]",
                  l.level === "warn" && "text-[var(--accent-amber)]",
                  l.level === "info" && "text-[#a8a6a2]",
                )}
              >
                <span className="opacity-40 shrink-0">
                  {new Date(l.ts).toLocaleTimeString()}
                </span>
                <span className="break-all">{l.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error detail */}
        {isError && job.error && (
          <div className="rounded-xl border border-[var(--accent-danger)]/40 bg-[var(--accent-danger-soft)] p-3 text-sm">
            <p className="font-semibold text-[var(--accent-danger)] flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Error
            </p>
            <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
              {job.error}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function HealthReport({
  json,
  extensionId,
  onOpenInPlayground,
}: {
  json: ExtensionJson;
  extensionId: string | null;
  onOpenInPlayground?: (id: string) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                {json.meta.name}
              </CardTitle>
              <CardDescription className="mt-1 font-mono text-xs">
                {json.meta.packageName} · {json.meta.sourceType}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <HealthBadge status={json.health.status} score={json.health.score} />
              {onOpenInPlayground && extensionId && (
                <Button
                  size="sm"
                  onClick={() => onOpenInPlayground(extensionId)}
                >
                  Open in Playground
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{json.health.summary}</p>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetaCell label="Language" value={json.meta.lang} />
            <MetaCell label="Base URL" value={json.meta.baseUrl || "—"} mono />
            <MetaCell label="Version" value={json.meta.apkVersionName || `v${json.meta.apkVersionCode}`} />
            <MetaCell label="NSFW" value={json.meta.isNsfw ? "Yes" : "No"} />
          </div>

          {/* Capabilities */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Capabilities
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(json.capabilities).map(([k, v]) => (
                <CapabilityChip key={k} name={k} on={v as boolean} />
              ))}
            </div>
          </div>

          {/* Checks */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Health checks
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {json.health.checks.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-2 rounded-lg bg-[var(--surface-alt)] px-3 py-2"
                >
                  <CheckMark status={c.status} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <JsonViewer data={json} maxHeight={520} />
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MetaCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-alt)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-sm mt-0.5 truncate",
          mono && "font-mono text-xs",
        )}
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

/* -------------------------------------------------------------------------- */

function ExtensionsLibrary({
  extensions,
  onOpenDetails,
}: {
  extensions: ExtensionSummary[];
  onOpenDetails: (id: string) => void;
}) {
  const qc = useQueryClient();

  async function remove(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteExtension(id);
      qc.invalidateQueries({ queryKey: ["extensions"] });
      toast.success(`Removed "${name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          Extensions library
          <Badge variant="secondary" className="font-mono">
            {extensions.length}
          </Badge>
        </h2>
        <p className="text-xs text-muted-foreground hidden sm:block">
          Click an extension to see its full details
        </p>
      </div>

      {extensions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          <Cpu className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No extensions yet. Convert an APK above to get started.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {extensions.map((ext) => (
            <Card
              key={ext.id}
              className="lift-on-hover cursor-pointer group relative"
              onClick={() => onOpenDetails(ext.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{ext.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                      {ext.lang} · {ext.sourceType}
                    </p>
                  </div>
                  <HealthBadge status={ext.healthStatus} score={ext.healthScore} />
                </div>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {ext.healthSummary}
                </p>
                {/* Footer row: open affordance + delete */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    Open details
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <button
                    onClick={(e) => remove(ext.id, ext.name, e)}
                    aria-label={`Delete ${ext.name}`}
                    title="Delete extension"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--accent-danger-soft)] hover:text-[var(--accent-danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
