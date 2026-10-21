"use client";

import { useEffect } from "react";

import { useTamari } from "@/components/assistant/assistant-provider";

/**
 * Tamari reacts to an answer being checked (companion doc §17): a quick
 * bounce when it is right, a step to the side when it is not, nothing for
 * "partly". Fires once per checked answer (`key`), wherever Tamari sits.
 */
export function useTamariReaction(verdict: "correct" | "partial" | "incorrect" | null | undefined, key: string | number): void {
  const react = useTamari()?.react;
  useEffect(() => {
    if (!react || !verdict || verdict === "partial") return;
    react(verdict === "correct" ? "correct" : "wrong");
  }, [react, verdict, key]);
}
