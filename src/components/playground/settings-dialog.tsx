"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, X, Check, RotateCcw, Loader2 } from "lucide-react";
import { getExtension, getSettings, saveSettings, type PrefValue } from "@/lib/api";
import type { PreferenceDef } from "@/lib/converter/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * ExtensionSettingsDialog — lets the user configure an extension's preferences
 * (domain, quality, etc.) from the playground. Saved values are applied to
 * subsequent playground fetches via the effective-source loader.
 */
export function ExtensionSettingsDialog({
  extensionId,
  open,
  onOpenChange,
}: {
  extensionId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: ext } = useQuery({
    queryKey: ["extension", extensionId],
    queryFn: () => getExtension(extensionId!),
    enabled: !!extensionId && open,
  });
  const { data: savedData } = useQuery({
    queryKey: ["settings", extensionId],
    queryFn: () => getSettings(extensionId!),
    enabled: !!extensionId && open,
  });

  const prefs = ext?.settings?.preferences ?? [];

  // Local overrides the user has typed/selected but not yet saved.
  // These take priority over saved/defaults so the UI reflects edits immediately.
  const [overrides, setOverrides] = useState<Record<string, PrefValue>>({});

  // The effective values: saved (or defaults) merged with local overrides.
  const values = useMemo<Record<string, PrefValue>>(() => {
    const base: Record<string, PrefValue> = {};
    for (const p of prefs) {
      if (p.default !== undefined) base[p.key] = p.default;
      else if (p.type === "switch") base[p.key] = false;
      else if (p.entryValues && p.entryValues.length)
        base[p.key] = p.entryValues[0];
    }
    if (savedData?.values) Object.assign(base, savedData.values);
    Object.assign(base, overrides);
    return base;
  }, [prefs, savedData, overrides]);

  const setVal = (key: string, v: PrefValue) =>
    setOverrides((o) => ({ ...o, [key]: v }));

  const saveMut = useMutation({
    mutationFn: (vals: Record<string, PrefValue>) =>
      saveSettings(extensionId!, vals),
    onSuccess: () => {
      toast.success("Settings saved — refetching with new configuration");
      qc.invalidateQueries({ queryKey: ["settings", extensionId] });
      // Refetch all playground data with the new effective baseUrl.
      qc.invalidateQueries({ queryKey: ["pg-browse"] });
      qc.invalidateQueries({ queryKey: ["pg-search"] });
      qc.invalidateQueries({ queryKey: ["pg-details"] });
      qc.invalidateQueries({ queryKey: ["pg-episodes"] });
      qc.invalidateQueries({ queryKey: ["pg-videos"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const configurable = ext?.settings?.configurable && prefs.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-[var(--accent-indigo)]" />
            Extension settings
          </DialogTitle>
          <DialogDescription>
            Configure preferences. The playground applies these to every
            request (e.g. domain, quality).
          </DialogDescription>
        </DialogHeader>

        {!ext ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !configurable ? (
          <div className="rounded-xl border border-border bg-[var(--surface-alt)] p-4 text-sm text-muted-foreground">
            This extension has no configurable settings.
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {prefs.map((p) => (
              <PreferenceRow
                key={p.key}
                pref={p}
                value={values[p.key]}
                onChange={(v) => setVal(p.key, v)}
              />
            ))}
          </div>
        )}

        {configurable && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Reset = clear saved + overrides so defaults show through.
                saveSettings(extensionId!, {}).then(() => {
                  setOverrides({});
                  qc.invalidateQueries({ queryKey: ["settings", extensionId] });
                  toast.info("Reset to defaults");
                });
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
            </Button>
            <Button
              size="sm"
              onClick={() => saveMut.mutate(values)}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreferenceRow({
  pref,
  value,
  onChange,
}: {
  pref: PreferenceDef;
  value: PrefValue | undefined;
  onChange: (v: PrefValue) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        pref.isDomainPreference
          ? "border-[var(--accent-teal)]/30 bg-[var(--accent-teal-soft)]"
          : "border-border bg-[var(--surface)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            {pref.title}
            {pref.isDomainPreference && (
              <Badge variant="outline" className="text-[10px] text-[var(--accent-teal)] border-[var(--accent-teal)]/30">
                domain
              </Badge>
            )}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
            {pref.key}
          </p>
        </div>
      </div>
      <div className="mt-2">
        {pref.type === "switch" ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={value === true}
              onCheckedChange={(c) => onChange(c)}
            />
            <span className="text-xs text-muted-foreground">
              {value ? "On" : "Off"}
            </span>
          </div>
        ) : pref.type === "list" && pref.entries && pref.entries.length ? (
          <div className="flex flex-wrap gap-1.5">
            {(pref.entryValues && pref.entryValues.length
              ? pref.entryValues
              : pref.entries
            ).map((opt, i) => {
              const label = pref.entries?.[i] ?? opt;
              const selected = value === opt;
              return (
                <button
                  key={opt}
                  onClick={() => onChange(opt)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                    selected
                      ? "border-[var(--accent-indigo)] bg-[var(--accent-indigo)] text-white"
                      : "border-border bg-[var(--surface-alt)] text-muted-foreground hover:text-foreground hover:border-[var(--border-strong)]",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <Input
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 text-sm"
          />
        )}
      </div>
    </div>
  );
}
