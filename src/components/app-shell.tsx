"use client";

import { useState, useCallback, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Boxes,
  FlaskConical,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Menu,
  Github,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import ConverterView from "@/components/converter/converter-view";
import PlaygroundView from "@/components/playground/playground-view";
import SettingsView from "@/components/settings/settings-view";

type View = "converter" | "playground" | "settings";

const NAV: { id: View; label: string; icon: typeof Boxes; desc: string }[] = [
  { id: "converter", label: "Converter", icon: Boxes, desc: "APK → JSON pipeline" },
  { id: "playground", label: "Playground", icon: FlaskConical, desc: "Test extensions live" },
  { id: "settings", label: "Settings", icon: SettingsIcon, desc: "Toolchain & theme" },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function AppShell() {
  const [view, setView] = useState<View>("converter");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [playgroundExtId, setPlaygroundExtId] = useState<string>();

  const openInPlayground = useCallback((id: string) => {
    setPlaygroundExtId(id);
    setView("playground");
  }, []);

  const current = useMemo(() => NAV.find((n) => n.id === view)!, [view]);

  const sidebar = (
    <div
      className={cn(
        "flex h-full flex-col transition-[width] duration-300",
        collapsed ? "w-[68px]" : "w-[240px]",
      )}
    >
      {/* Brand + collapse toggle */}
      <div className="flex items-center gap-2.5 px-3 h-16 shrink-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-indigo)] to-[var(--accent-teal)] text-white shadow-lg shadow-[var(--accent-teal)]/25">
          <Boxes className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight truncate">EXT→JSON</p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              anime extension toolkit
            </p>
          </div>
        )}
        {/* Collapse toggle — proper bordered icon button */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--surface)] text-muted-foreground transition-all hover:bg-[var(--surface-alt)] hover:text-foreground hover:border-[var(--border-strong)] active:scale-95"
        >
          {collapsed ? (
            <PanelLeft className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id);
                setMobileOpen(false);
              }}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-[var(--accent-indigo)] text-white shadow-md shadow-[var(--accent-indigo)]/25"
                  : "text-muted-foreground hover:bg-[var(--surface-alt)] hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Sidebar footer — version badge */}
      <div className="px-3 pb-3">
        {!collapsed && (
          <div className="rounded-xl bg-[var(--surface-alt)] p-3 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground mb-0.5">v1.0.0</p>
            <p>Decompiles via apktool + jadx. Pure JSON output.</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col bg-[var(--canvas)]">
        <div className="flex flex-1 gap-0 lg:gap-4 lg:p-4">
          {/* Desktop sidebar — floating rounded */}
          <aside className="hidden lg:flex shrink-0">
            <div className="sticky top-4 h-[calc(100vh-2rem)] rounded-3xl border border-border bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
              {sidebar}
            </div>
          </aside>

          {/* Mobile sidebar — drawer */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden fixed top-3 left-3 z-40 rounded-full bg-[var(--surface)] shadow-md"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0 border-0">
              <div className="flex items-center justify-between px-4 h-16 border-b border-border">
                <span className="font-bold">Menu</span>
                <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <nav className="p-3 space-y-1">
                {NAV.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setView(item.id);
                        setMobileOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                        active
                          ? "bg-[var(--accent-indigo)] text-white"
                          : "text-muted-foreground hover:bg-[var(--surface-alt)]",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Main */}
          <main className="flex-1 flex flex-col min-w-0">
            {/* Top bar */}
            <header className="sticky top-0 z-30 flex items-center justify-between gap-3 rounded-none lg:rounded-2xl border border-border bg-[var(--surface)]/80 backdrop-blur-xl px-4 lg:px-6 py-3 lg:my-0">
              <div className="flex items-center gap-3 lg:ml-0 ml-12">
                <div>
                  <h2 className="text-base font-semibold leading-tight">
                    {current.label}
                  </h2>
                  <p className="text-xs text-muted-foreground leading-tight hidden sm:block">
                    {current.desc}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-9 w-9"
                  asChild
                >
                  <a
                    href="https://github.com/testplay-byte/EXT-TO-JSON"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="GitHub repository"
                  >
                    <Github className="h-[18px] w-[18px]" />
                  </a>
                </Button>
                <ThemeToggle />
              </div>
            </header>

            {/* Content */}
            <div className="flex-1 p-4 lg:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  {view === "converter" && (
                    <ConverterView onOpenInPlayground={openInPlayground} />
                  )}
                  {view === "playground" && (
                    <PlaygroundView initialExtensionId={playgroundExtId} />
                  )}
                  {view === "settings" && <SettingsView />}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
