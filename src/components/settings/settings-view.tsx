"use client";

import { getToolchain, type ToolchainInfo } from "@/lib/api";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SettingsView() {
  const [info, setInfo] = useState<ToolchainInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      setInfo(await getToolchain());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Toolchain status and appearance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Decompilation toolchain</CardTitle>
              <CardDescription>
                apktool + jadx + Java power the APK → JSON conversion.
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}
          {info && (
            <>
              <ToolRow
                name="Java"
                present={info.tools.java.present}
                version={info.tools.java.version}
              />
              <ToolRow
                name="apktool"
                present={info.tools.apktool.present}
                version={info.tools.apktool.version}
              />
              <ToolRow
                name="jadx"
                present={info.tools.jadx.present}
                version={info.tools.jadx.version}
              />
              <div className="pt-2">
                {info.ready ? (
                  <Badge className="bg-[var(--accent-teal-soft)] text-[var(--accent-teal)] border-0">
                    Ready to convert
                  </Badge>
                ) : (
                  <Badge className="bg-[var(--accent-amber-soft)] text-[var(--accent-amber)] border-0">
                    Setup incomplete
                  </Badge>
                )}
              </div>
              {info.error && (
                <p className="text-xs text-muted-foreground">{info.error}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Toggle light / dark theme.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <span className="text-sm">Theme</span>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ToolRow({
  name,
  present,
  version,
}: {
  name: string;
  present: boolean;
  version: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-[var(--surface-alt)] px-4 py-3">
      <div className="flex items-center gap-3">
        {present ? (
          <CheckCircle2 className="h-5 w-5 text-[var(--accent-teal)]" />
        ) : (
          <XCircle className="h-5 w-5 text-[var(--accent-danger)]" />
        )}
        <span className="font-medium">{name}</span>
      </div>
      <span className="font-mono text-xs text-muted-foreground">
        {present ? version : "not found"}
      </span>
    </div>
  );
}
