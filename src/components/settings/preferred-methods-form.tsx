"use client";

import { Search } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { saveStudyPreferencesAction, type SavePreferencesResult } from "@/lib/preferences/actions";
import { MAX_PREFERRED_METHODS } from "@/lib/preferences/schema";
import { BUILDER_METHOD_IDS, methodName, type BuilderMethodId } from "@/lib/study/catalog";

/**
 * Preferred study methods (UI phase §35): the ones the session builder shows
 * first. Everything else stays one "Show all methods" away.
 */
export function PreferredMethodsForm({ initial }: { initial: BuilderMethodId[] }) {
  const [selected, setSelected] = useState<BuilderMethodId[]>(initial);
  const [filter, setFilter] = useState("");
  const [result, setResult] = useState<SavePreferencesResult | null>(null);
  const [pending, startTransition] = useTransition();
  const filterId = useId();
  const full = selected.length >= MAX_PREFERRED_METHODS;
  const needle = filter.trim().toLowerCase();
  const methods = BUILDER_METHOD_IDS.filter((id) => !needle || methodName(id).toLowerCase().includes(needle) || selected.includes(id));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setResult(null);
        startTransition(async () => setResult(await saveStudyPreferencesAction({ preferredMethods: selected })));
      }}
    >
      {result && !result.ok && <Alert tone="error">{result.error}</Alert>}
      {result?.ok && <Alert tone="success">Saved. The session builder shows these first.</Alert>}
      <div className="relative max-w-xs">
        <label htmlFor={filterId} className="sr-only">
          Filter methods
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id={filterId}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter methods"
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus-visible:border-ring focus-visible:outline-none"
        />
      </div>
      <ChipGroup
        type="multiple"
        name="preferred-methods"
        legend="Preferred methods"
        hideLegend
        description={`${selected.length} of ${MAX_PREFERRED_METHODS} picked.${full ? " Remove one to pick another." : ""}`}
        value={selected}
        onChange={(next) => setSelected(next.slice(0, MAX_PREFERRED_METHODS))}
        options={methods.map((id) => ({ value: id, label: methodName(id), disabled: full && !selected.includes(id) }))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          Save methods
        </Button>
        {selected.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
            Clear
          </Button>
        )}
      </div>
    </form>
  );
}
