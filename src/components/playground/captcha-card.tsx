"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { solveCaptcha } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * CaptchaRequiredCard — shown when the browser-fetch service detects a
 * Cloudflare/anti-bot challenge. Provides a "Solve Now" button that opens
 * a visible browser window for the user to solve the captcha. After solving,
 * cookies are persisted and the playground refetches automatically.
 */
export function CaptchaRequiredCard({
  url,
  onSolved,
}: {
  url: string;
  onSolved?: () => void;
}) {
  const qc = useQueryClient();
  const [solving, setSolving] = useState(false);

  const solveMut = useMutation({
    mutationFn: () => solveCaptcha(url),
    onMutate: () => setSolving(true),
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(data.message);
        // Invalidate all playground queries so they refetch with new cookies.
        qc.invalidateQueries({ queryKey: ["pg-browse"] });
        qc.invalidateQueries({ queryKey: ["pg-search"] });
        qc.invalidateQueries({ queryKey: ["pg-details"] });
        qc.invalidateQueries({ queryKey: ["pg-episodes"] });
        qc.invalidateQueries({ queryKey: ["pg-videos"] });
        onSolved?.();
      } else {
        toast.error(data.message);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => setSolving(false),
  });

  // Derive the domain for display.
  let domain = url;
  try {
    domain = new URL(url).hostname;
  } catch {
    /* keep raw url */
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[var(--accent-amber)]/40 bg-[var(--accent-amber-soft)] p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-amber)]/15">
          <ShieldAlert className="h-5 w-5 text-[var(--accent-amber)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--accent-amber)]">
            Captcha required
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            The site <span className="font-mono font-medium">{domain}</span> is
            protected by Cloudflare. A browser window will open for you to solve
            the challenge. After solving, cookies are saved and this page will
            reload automatically.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => solveMut.mutate()}
              disabled={solving}
            >
              {solving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for you to solve…
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" />
                  Solve Now
                </>
              )}
            </Button>
            {solving && (
              <span className="text-xs text-muted-foreground">
                A browser window should be open — solve the captcha there.
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * BrowserFetchWarning — shown when the browser-fetch service is not running.
 * The playground cannot fetch pages without it.
 */
export function BrowserFetchWarning() {
  return (
    <div className="rounded-2xl border border-[var(--accent-danger)]/40 bg-[var(--accent-danger-soft)] p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-[var(--accent-danger)] mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-[var(--accent-danger)]">
            Browser-fetch service not running
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            The playground needs the browser-fetch service (port 3030) to fetch
            pages through a real browser. It should start automatically with{" "}
            <code className="font-mono">bun run dev</code>. If it's not running,
            stop the dev server and restart it.
          </p>
        </div>
      </div>
    </div>
  );
}
