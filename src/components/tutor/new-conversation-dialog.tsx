"use client";

import { MessageCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { routes } from "@/lib/routes";
import { TUTOR_MODE_BY_ID } from "@/lib/tutor/types";

export type TutorMaterialOption = { id: string; title: string; subject?: string | null };

/** Starts a tutor conversation, grounded in a material when one is chosen. */
export function NewConversationButton({
  materials = [],
  materialId,
  children = "New conversation",
  ...props
}: Omit<ButtonProps, "onClick" | "type"> & { materials?: TutorMaterialOption[]; materialId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState(materialId ?? materials[0]?.id ?? "");
  const [mode, setMode] = useState<"tutor" | "guided">("tutor");
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/tutor/conversations", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ materialId: material && material !== "none" ? material : null, mode, message: question.trim() || null }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "The conversation could not be started.");
        return;
      }
      router.push(`${routes.tutor}/${body.id}`);
    });
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...props}>
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {children}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} dismissible={!pending} title="Ask the tutor" description="Pick a material so answers stay grounded in it and cite their sources.">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          {!materialId && (
            <Field id="tutor-material" label="Material">
              <Select {...fieldA11y("tutor-material")} value={material || "none"} disabled={pending} onChange={(event) => setMaterial(event.target.value)}>
                {materials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                    {item.subject ? ` · ${item.subject}` : ""}
                  </option>
                ))}
                <option value="none">No material — general question</option>
              </Select>
            </Field>
          )}
          <ChipGroup
            type="single"
            look="card"
            columns={2}
            name="tutor-mode"
            legend="How should the tutor respond?"
            value={mode}
            onChange={setMode}
            disabled={pending}
            options={(["tutor", "guided"] as const).map((item) => ({ value: item, label: TUTOR_MODE_BY_ID[item].label, hint: TUTOR_MODE_BY_ID[item].description }))}
          />
          <Field id="tutor-question" label="First question (optional)">
            <Textarea {...fieldA11y("tutor-question")} rows={3} maxLength={6000} value={question} disabled={pending} placeholder="e.g. Explain the Calvin cycle like I'm a beginner" onChange={(event) => setQuestion(event.target.value)} />
          </Field>
          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
              {question.trim() ? "Asking the tutor…" : "Opening the conversation…"}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Start
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
