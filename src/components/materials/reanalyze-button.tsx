"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import type { MaterialStatus } from "@/lib/supabase/database.types";

/** Re-runs the AI analysis for a material and refreshes the page when done. */
export function ReanalyzeButton({
  materialId,
  children = "Re-analyze",
  ...props
}: Omit<ButtonProps, "onClick" | "type" | "loading"> & { materialId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/materials/${materialId}/analyze`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; status?: MaterialStatus };
      if (!response.ok) {
        setError(body.error ?? "Analysis could not be started.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" size="sm" loading={pending} onClick={run} {...props}>
        {!pending && <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
        {pending ? "Analyzing…" : children}
      </Button>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
