"use client";

import { useEffect } from "react";

import { markMaterialOpenedAction } from "@/lib/materials/actions";

/** Fire-and-forget "opened" ping so the dashboard can list recent materials. */
export function TrackOpen({ materialId }: { materialId: string }) {
  useEffect(() => {
    void markMaterialOpenedAction(materialId);
  }, [materialId]);
  return null;
}
