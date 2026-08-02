"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileJson,
  Loader2,
  Trash2,
  Eye,
  Package,
  CheckCircle2,
  AlertCircle,
  Cpu,
  FileUp,
  X,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HealthBadge, CheckMark } from "@/components/shared/health-badge";
import { JsonViewer } from "@/components/shared/json-viewer";
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
            dragOver && "ring-2 ring-[var(--accent-indigo)]",
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
              <FileUp className="h-5 w-5 text-[var(--accent-indigo)]" />
              Upload APK
            </CardTitle>
            <CardDescription>
              Drag &amp; drop an extension APK, or click to browse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-[var(--surface-alt)] py-10 transition-colors hover:border-[var(--accent-indigo)]/50 hover:bg-[var(--accent-indigo-soft)]/40"
            >
              <motion.div
                animate={{ y: dragOver ? -4 : 0 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-indigo-soft)] text-[var(--accent-indigo)]"
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
              <FileJson className="h-5 w-5 text-[var(--accent-secondary)]" />
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

      {/* Active job */}
      <AnimatePresence>
        {job && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {job.status === "error" ? (
                      <AlertCircle className="h-5 w-5 text-[var(--accent-danger)]" />
                    ) : job.status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-[var(--accent-teal)]" />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-indigo)]" />
                    )}
                    Converting {job.apkFileName}
                  </span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {STAGE_LABEL[job.status] ?? job.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>{job.message}</span>
                    <span>{job.progress}%</span>
                  </div>
                  <Progress value={job.progress} className="h-2" />
                </div>
                {job.logs.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg bg-[var(--surface-alt)] p-3 font-mono text-xs space-y-0.5">
                    {job.logs.slice(-30).map((l, i) => (
                      <div
                        key={i}
                        className={cn(
                          l.level === "error" && "text-[var(--accent-danger)]",
                          l.level === "warn" && "text-[var(--accent-amber)]",
                          l.level === "info" && "text-muted-foreground",
                        )}
                      >
                        <span className="opacity-50">
                          {new Date(l.ts).toLocaleTimeString()}{" "}
                        </span>
                        {l.message}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last result */}
      {result && <HealthReport json={result} onOpenInPlayground={onOpenInPlayground} />}

      {/* Library */}
      <ExtensionsLibrary
        extensions={extsData?.extensions ?? []}
        onOpenInPlayground={onOpenInPlayground}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function HealthReport({
  json,
  onOpenInPlayground,
}: {
  json: ExtensionJson;
  onOpenInPlayground?: (id: string) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-[var(--accent-indigo)]" />
                {json.meta.name}
              </CardTitle>
              <CardDescription className="mt-1 font-mono text-xs">
                {json.meta.packageName} · {json.meta.sourceType}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <HealthBadge status={json.health.status} score={json.health.score} />
              {onOpenInPlayground && (
                <Button
                  size="sm"
                  onClick={() => onOpenInPlayground(json.meta.packageName)}
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
          ? "bg-[var(--accent-indigo-soft)] text-[var(--accent-indigo)]"
          : "bg-[var(--surface-alt)] text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          on ? "bg-[var(--accent-indigo)]" : "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function ExtensionsLibrary({
  extensions,
  onOpenInPlayground,
}: {
  extensions: ExtensionSummary[];
  onOpenInPlayground?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<string | null>(null);
  const [viewData, setViewData] = useState<ExtensionJson | null>(null);

  async function open(id: string) {
    try {
      setViewData(await getExtension(id));
      setViewing(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string, name: string) {
    try {
      await deleteExtension(id);
      qc.invalidateQueries({ queryKey: ["extensions"] });
      toast.success(`Removed "${name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
      </div>

      {extensions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          <Cpu className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No extensions yet. Convert an APK above to get started.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {extensions.map((ext) => (
            <Card key={ext.id} className="lift-on-hover">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{ext.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {ext.lang} · {ext.sourceType}
                    </p>
                  </div>
                  <HealthBadge status={ext.healthStatus} score={ext.healthScore} />
                </div>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {ext.healthSummary}
                </p>
                <div className="flex items-center gap-1.5 mt-3">
                  <Button size="sm" variant="secondary" className="h-8 flex-1" onClick={() => open(ext.id)}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  {onOpenInPlayground && (
                    <Button
                      size="sm"
                      className="h-8 flex-1"
                      onClick={() => onOpenInPlayground(ext.id)}
                    >
                      Test
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-[var(--accent-danger)]"
                    onClick={() => remove(ext.id, ext.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-[var(--accent-indigo)]" />
              {viewData?.meta.name ?? "Extension"}
              {viewData && (
                <HealthBadge
                  status={viewData.health.status}
                  score={viewData.health.score}
                />
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto -mx-6 px-6 pb-2">
            {viewData && <JsonViewer data={viewData} maxHeight={520} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
