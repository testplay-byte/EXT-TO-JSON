"use client";

import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function JsonViewer({
  data,
  maxHeight = 480,
  className,
}: {
  data: unknown;
  maxHeight?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(true);
  const text = JSON.stringify(data, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-[var(--surface-alt)] overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[var(--surface)]">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          JSON · {text.length.toLocaleString()} bytes
        </button>
        <Button variant="ghost" size="sm" onClick={copy} className="h-7 gap-1.5 text-xs">
          {copied ? <Check className="h-3.5 w-3.5 text-[var(--accent-teal)]" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {open && (
        <pre
          className="overflow-auto p-4 text-xs leading-relaxed font-mono"
          style={{ maxHeight }}
        >
          <code>{text}</code>
        </pre>
      )}
    </div>
  );
}
