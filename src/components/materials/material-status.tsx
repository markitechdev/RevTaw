"use client";

import { CheckCircle2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STALE_AFTER_MS } from "@/lib/generation/stale";
import { IN_FLIGHT_STATUSES, STATUS_LABEL } from "@/lib/materials/constants";
import { fetchStatus, requestProcessing } from "@/lib/materials/upload-client";
import type { MaterialStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/**
 * Poll quickly while work is likely to finish, then less often. The server
 * reports a step cut off by a timeout or a closed tab as failed after
 * STALE_AFTER_MS, so polling stops a minute after that either way: a page
 * left open never keeps checking (or uses up the status route's limit).
 */
const POLL_DELAYS_MS = [2500, 2500, 2500, 2500, 2500, 5000, 5000, 5000, 5000, 10_000, 10_000];
const LATER_DELAY_MS = 20_000;
const POLL_FOR_MS = STALE_AFTER_MS + 60_000;

/**
 * Shows the processing state of a material and keeps polling while it is in
 * flight, refreshing the page once it settles. Failed materials get a Retry
 * button that re-runs the pipeline.
 */
export function MaterialStatusBadge({
  materialId,
  status: initialStatus,
  detail: initialDetail,
  showDetail = false,
  className,
}: {
  materialId: string;
  status: MaterialStatus;
  detail: string | null;
  showDetail?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [detail, setDetail] = useState(initialDetail);
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    if (!IN_FLIGHT_STATUSES.has(status)) return;
    let canceled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const schedule = () => {
      if (canceled || Date.now() - started > POLL_FOR_MS) return;
      const delay = POLL_DELAYS_MS[attempt] ?? LATER_DELAY_MS;
      attempt += 1;
      timer = setTimeout(async () => {
        const latest = await fetchStatus(materialId);
        if (canceled) return;
        if (latest && latest.status !== status) {
          setStatus(latest.status);
          setDetail(latest.detail);
          if (!IN_FLIGHT_STATUSES.has(latest.status)) router.refresh();
          // A new status re-runs this effect with a fresh schedule.
          return;
        }
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
    };
  }, [materialId, status, router]);

  const retry = () => {
    startRetry(async () => {
      setStatus("extracting");
      setDetail(null);
      const result = await requestProcessing(materialId, true);
      if ("error" in result) {
        setStatus("failed");
        setDetail(result.error);
      } else {
        setStatus(result.status);
        setDetail(result.detail);
        router.refresh();
      }
    });
  };

  const inFlight = IN_FLIGHT_STATUSES.has(status);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          tone={status === "ready" ? "success" : status === "failed" ? "danger" : "primary"}
          aria-live="polite"
        >
          {inFlight ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : status === "ready" ? (
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          ) : (
            <TriangleAlert className="h-3 w-3" aria-hidden="true" />
          )}
          {inFlight ? `${STATUS_LABEL[status]}…` : STATUS_LABEL[status]}
        </Badge>
        {status === "failed" && (
          <Button type="button" variant="secondary" size="sm" loading={retrying} onClick={retry}>
            {!retrying && <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            Retry
          </Button>
        )}
      </div>
      {showDetail && detail && (
        <p className={cn("text-xs", status === "failed" ? "text-danger" : "text-muted-foreground")}>{detail}</p>
      )}
    </div>
  );
}
