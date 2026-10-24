"use client";

import { Check, Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Alert } from "@/components/forms/form-alert";
import { useAppearance } from "@/components/theme/appearance-root";
import { useTheme, type Theme } from "@/components/theme/theme-provider";
import { CHOICE_INPUT } from "@/components/ui/choice-input";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { ACCENT_PRESETS, type AppearancePreferences } from "@/lib/preferences/options";
import { buildAccentPalette, isHexColor } from "@/lib/theme/color";
import { cn } from "@/lib/utils";

const MODES: ReadonlyArray<{ value: Theme; label: React.ReactNode }> = [
  { value: "light", label: (<><Sun className="h-4 w-4" aria-hidden="true" /> Light</>) },
  { value: "dark", label: (<><Moon className="h-4 w-4" aria-hidden="true" /> Dark</>) },
  { value: "system", label: (<><Monitor className="h-4 w-4" aria-hidden="true" /> Match device</>) },
];

/** A fun starting point for a custom color: none of the presets. */
const CUSTOM_STARTER = "#c026d3";

function Swatch({ accent, color }: { accent?: string; color?: string }) {
  return (
    <span
      aria-hidden="true"
      data-accent={accent}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary shadow-sm ring-2 ring-card"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

/**
 * Appearance (UI phase §10–§11, §34): light/dark/system for this device, the
 * theme color and reduced motion for the account. A color applies the moment
 * it is picked; the custom picker previews while you drag and saves when you
 * stop.
 */
export function AppearanceForm() {
  const { theme, setTheme } = useTheme();
  const { appearance, saved, preview, save, saving } = useAppearance();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(saved.customColor ?? CUSTOM_STARTER);
  const [hex, setHex] = useState(saved.customColor ?? CUSTOM_STARTER);
  const saveTimer = useRef<number | undefined>(undefined);
  const hexId = useId();

  const commit = async (next: AppearancePreferences) => {
    setError(null);
    const result = await save(next);
    if (!result.ok) setError(result.error);
  };

  const pickCustom = (color: string, { immediate = false } = {}) => {
    const value = color.toLowerCase();
    setDraft(value);
    setHex(value);
    const next: AppearancePreferences = { ...appearance, accent: "custom", customColor: value };
    preview(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void commit(next), immediate ? 0 : 600);
  };

  const palette = buildAccentPalette(appearance.accent === "custom" && appearance.customColor ? appearance.customColor : draft);
  const isCustom = appearance.accent === "custom";

  return (
    <div className="flex flex-col gap-8">
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="appearance-mode" className="flex flex-col gap-2">
        <h3 id="appearance-mode" className="text-sm font-semibold text-foreground">
          Mode
        </h3>
        <Segmented label="Mode" name="mode" value={theme} onChange={setTheme} options={MODES} />
        <p className="text-xs text-muted-foreground">Saved on this device, so your phone can stay dark while your laptop stays light.</p>
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-foreground">Theme color</legend>
        <p className="-mt-1 text-xs text-muted-foreground">Buttons, the current page in the menu, progress bars, selected options and links. Status colors (correct, wrong, due) never change.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ACCENT_PRESETS.map((preset) => {
            const selected = appearance.accent === preset.id;
            return (
              <label
                key={preset.id}
                className={cn(
                  "relative flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 pr-3 text-sm font-medium transition-[border-color,background-color] duration-150",
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                  selected ? "border-primary bg-primary-soft text-foreground" : "border-border bg-card text-foreground hover:border-input",
                )}
              >
                <input type="radio" name="accent" value={preset.id} checked={selected} onChange={() => void commit({ ...appearance, accent: preset.id })} className={CHOICE_INPUT} />
                <Swatch accent={preset.id} />
                <span className="min-w-0 flex-1 leading-tight">{preset.label}</span>
                {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              </label>
            );
          })}
          <label
            className={cn(
              "relative flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 pr-3 text-sm font-medium transition-[border-color,background-color] duration-150",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
              isCustom ? "border-primary bg-primary-soft text-foreground" : "border-border bg-card text-foreground hover:border-input",
            )}
          >
            <input type="radio" name="accent" value="custom" checked={isCustom} onChange={() => pickCustom(draft, { immediate: true })} className={CHOICE_INPUT} />
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[conic-gradient(from_90deg,#e11d48,#f59e0b,#16a34a,#0ea5e9,#7c3aed,#e11d48)] shadow-sm ring-2 ring-card">
              <Sparkles className="h-4 w-4 text-white drop-shadow" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">Custom</span>
            {isCustom && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
          </label>
        </div>

        {isCustom && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-end sm:gap-4">
            <div className="flex items-end gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Color
                <input
                  type="color"
                  value={draft}
                  onChange={(event) => pickCustom(event.target.value)}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-input bg-card p-1"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={hexId} className="text-sm font-medium text-foreground">
                  Hex
                </label>
                <Input
                  id={hexId}
                  value={hex}
                  maxLength={7}
                  spellCheck={false}
                  className="w-28 font-mono uppercase"
                  onChange={(event) => {
                    const value = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;
                    setHex(value);
                    if (isHexColor(value) && value.length === 7) pickCustom(value);
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground sm:pb-2">
              RevTaw adjusts the shade so text on it stays readable: <span className="font-mono">{palette.light.primary}</span> in light mode, <span className="font-mono">{palette.dark.primary}</span> in dark mode.
            </p>
          </div>
        )}
      </fieldset>

      <section aria-labelledby="appearance-preview" className="flex flex-col gap-2">
        <h3 id="appearance-preview" className="text-sm font-semibold text-foreground">
          Preview
        </h3>
        <div aria-hidden="true" className="grid gap-4 rounded-xl border border-border bg-background p-4 sm:grid-cols-[10rem_1fr]">
          <div className="flex flex-col gap-1 rounded-lg bg-card p-2 text-sm">
            <span className="rounded-md bg-primary-soft px-2.5 py-1.5 font-medium text-primary">Home</span>
            <span className="px-2.5 py-1.5 text-muted-foreground">Study</span>
            <span className="px-2.5 py-1.5 text-muted-foreground">Materials</span>
          </div>
          <div className="flex flex-col gap-3 rounded-lg bg-card p-4">
            <p className="text-sm text-foreground">
              Review <span className="highlighter">the Calvin cycle</span> before Friday.{" "}
              <span className="font-medium text-primary underline underline-offset-4">Open the reviewer</span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 rounded-full bg-progress" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Continue</span>
              <span className="inline-flex h-8 items-center rounded-lg bg-primary-soft px-3 text-sm font-medium text-primary ring-1 ring-inset ring-primary/15">Practice</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary-soft px-3 py-1 text-sm font-medium text-primary">
                <Check className="h-3.5 w-3.5" /> Selected
              </span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="appearance-motion" className="flex flex-col gap-2">
        <h3 id="appearance-motion" className="text-sm font-semibold text-foreground">
          Motion
        </h3>
        <Switch
          checked={appearance.reduceMotion}
          onChange={(next) => void commit({ ...appearance, reduceMotion: next })}
          label="Reduce motion"
          description="Turns off animations and transitions inside RevTaw on every device you sign in on; the landing page keeps its own. A device that asks for reduced motion always gets it."
        />
      </section>

      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {saving ? "Saving…" : "Theme color and motion are saved to your account."}
      </p>
    </div>
  );
}
