"use client";

import { useEffect } from "react";

import { markReviewerOpenedAction } from "@/lib/reviewers/actions";

export function TrackReviewerOpen({ reviewerId }: { reviewerId: string }) {
  useEffect(() => {
    void markReviewerOpenedAction(reviewerId);
  }, [reviewerId]);
  return null;
}
