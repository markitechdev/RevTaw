"use client";

import { Layers, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FLASHCARD_MAX, FLASHCARD_MIN, FLASHCARD_PRESETS } from "@/lib/flashcards/constants";
import { clearQueryParam } from "@/lib/hooks/query-param";
import { routes } from "@/lib/routes";

export type DeckMaterialOption = { id: string; title: string; subject?: string | null };

/** Button + dialog that generates a flashcard deck from a material. */
export function NewDeckButton({
  materialId,
  materials = [],
  disabled,
  defaultOpen = false,
  children = "Create flashcards",
  ...props
}: Omit<ButtonProps, "onClick" | "type"> & { materialId?: string; materials?: DeckMaterialOption[]; /** Open on arrival (/flashcards?create=1). */ defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen && (Boolean(materialId) || materials.length > 0));
  const [material, setMaterial] = useState(materialId ?? materials[0]?.id ?? "");
  const [count, setCount] = useState<number>(20);
  const [custom, setCustom] = useState(false);
  const [focus, setFocus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () => {
    setError(null);
    const target = materialId ?? material;
    if (!target) {
      setError("Choose a material first.");
      return;
    }
    if (count < FLASHCARD_MIN || count > FLASHCARD_MAX) {
      setError(`Choose between ${FLASHCARD_MIN} and ${FLASHCARD_MAX} cards.`);
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ materialId: target, count, focus: focus.trim() || null }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "The deck could not be created.");
        return;
      }
      router.push(`${routes.flashcards}/${body.id}`);
    });
  };

  const noMaterials = !materialId && materials.length === 0;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={disabled || noMaterials} {...props}>
        <Layers className="h-4 w-4" aria-hidden="true" />
        {children}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (pending) return;
          setOpen(false);
          clearQueryParam("create");
        }}
        dismissible={!pending}
        title="Create flashcards"
        description="Term → definition, question → answer and fill-in cards written only from the material, scheduled with spaced repetition."
      >
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            generate();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          {!materialId && (
            <Field id="deck-material" label="Material" required>
              <Select {...fieldA11y("deck-material")} value={material} onChange={(event) => setMaterial(event.target.value)} disabled={pending}>
                {materials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                    {item.subject ? ` · ${item.subject}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <fieldset disabled={pending}>
            <legend className="mb-1.5 text-sm font-medium">Number of cards</legend>
            <div className="flex flex-wrap gap-2">
              {FLASHCARD_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={!custom && count === preset ? "primary" : "secondary"}
                  onClick={() => {
                    setCustom(false);
                    setCount(preset);
                  }}
                >
                  {preset}
                </Button>
              ))}
              <Button type="button" size="sm" variant={custom ? "primary" : "secondary"} onClick={() => setCustom(true)}>
                Custom
              </Button>
            </div>
            {custom && (
              <Input
                aria-label="Custom number of cards"
                type="number"
                min={FLASHCARD_MIN}
                max={FLASHCARD_MAX}
                value={count}
                onChange={(event) => setCount(Number(event.target.value) || FLASHCARD_MIN)}
                className="mt-2 max-w-32"
              />
            )}
          </fieldset>
          <Field id="deck-focus" label="Focus (optional)" hint="A topic or chapter to concentrate on.">
            <Input {...fieldA11y("deck-focus")} value={focus} maxLength={200} placeholder="e.g. Chapter 3 definitions" disabled={pending} onChange={(event) => setFocus(event.target.value)} />
          </Field>
          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
              Writing {count} cards… this usually takes under a minute.
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Sparkles className="h-4 w-4" aria-hidden="true" />}
              Generate deck
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
