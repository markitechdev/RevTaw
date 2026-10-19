"use client";

import { CheckCircle2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IN_FLIGHT_STATUSES, STATUS_LABEL } from "@/lib/materials/constants";
import { fetchStatus, requestProcessing } from "@/lib/materials/upload-client";
import type { MaterialStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const POLL_MS = 2500;

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
    let cancelled = false;
    const timer = setInterval(async () => {
      const latest = await fetchStatus(materialId);
      if (cancelled || !latest) return;
      if (latest.status !== status) {
        setStatus(latest.status);
        setDetail(latest.detail);
        if (!IN_FLIGHT_STATUSES.has(latest.status)) {
          router.refresh();
        }
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
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
