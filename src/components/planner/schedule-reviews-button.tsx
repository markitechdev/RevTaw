"use client";

import { Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { scheduleReviewCycleAction } from "@/lib/planner/actions";

/** Adds the optional 1-3-7-14 review cycle for a material to the planner. */
export function ScheduleReviewsButton({ materialId, scheduled = 0, ...props }: Omit<ButtonProps, "onClick" | "type"> & { materialId: string; scheduled?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const schedule = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await scheduleReviewCycleAction(materialId);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMessage(result.data.created === 0 ? "Reviews are already scheduled for those days." : `${result.data.created} review${result.data.created === 1 ? "" : "s"} added to the planner.`);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" onClick={schedule} loading={pending} {...props}>
        {!pending && <Repeat className="h-4 w-4" aria-hidden="true" />}
        {scheduled > 0 ? `Reviews scheduled (${scheduled})` : "Schedule 1-3-7-14 reviews"}
      </Button>
      {message && (
        <span className="text-xs text-muted-foreground" role="status">
          {message}
        </span>
      )}
    </span>
  );
}
