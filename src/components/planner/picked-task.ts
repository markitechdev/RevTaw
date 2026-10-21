"use client";

import { useSyncExternalStore } from "react";

/**
 * The planner task the student last touched or focused, in any list on the
 * page (Due today, the calendar's day, an exam's plan): what "this" means when
 * they ask Tamari to "move this to Friday" (companion doc §15). One per tab.
 */
const store = { id: null as string | null, listeners: new Set<() => void>() };

function subscribe(listener: () => void) {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

export function pickTask(id: string | null): void {
  if (store.id === id) return;
  store.id = id;
  store.listeners.forEach((listener) => listener());
}

export function usePickedTask(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => store.id,
    () => null,
  );
}
