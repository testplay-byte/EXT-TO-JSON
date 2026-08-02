"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="rounded-full h-9 w-9"
    >
      {/* CSS-driven icon swap — avoids hydration mismatch without a mounted flag */}
      <Sun className="h-[18px] w-[18px] hidden dark:block" />
      <Moon className="h-[18px] w-[18px] block dark:hidden" />
    </Button>
  );
}
