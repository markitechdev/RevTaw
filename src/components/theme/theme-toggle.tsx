"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useId } from "react";

import { Segmented } from "@/components/ui/segmented";

import { useTheme, type Theme } from "./theme-provider";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Light / dark / system as a segmented radio group (arrow keys move between them). */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const name = useId();
  return (
    <Segmented
      label="Color theme"
      name={`theme-${name}`}
      value={theme}
      onChange={setTheme}
      size="sm"
      className={className}
      options={OPTIONS.map(({ value, label, icon: Icon }) => ({
        value,
        title: label,
        label: (
          <>
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </>
        ),
      }))}
    />
  );
}
