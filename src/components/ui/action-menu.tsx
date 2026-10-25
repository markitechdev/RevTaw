"use client";

import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { POPOVER } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

export type ActionMenuItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Deletes something: last, after a divider. It looks like the others; red is for the confirmation it opens. */
  danger?: boolean;
  disabled?: boolean;
};

/** Room kept free under a menu on phones and tablets, where the tab bar sits along the bottom. */
const TAB_BAR_ROOM = 72;

/**
 * The "⋯" button with a row's other actions (rename, end, delete), beside its main button: the same button
 * and menu wherever a list offers them. A WAI-ARIA menu button: Enter, Space or ↓ opens it on the first
 * action and ↑ on the last; ↑ ↓ Home End move; Enter picks; Escape closes it and goes back to the button;
 * Tab or a click outside closes it. It opens under the button, or above it when there is no room below
 * (rows at the bottom of a phone screen). A delete comes last, after a divider, in the same color as the
 * rest: only the confirmation it opens is red. `label` names the row ("More actions for Biology 2").
 */
export function ActionMenu({
  label,
  items,
  className,
  triggerClassName,
  triggerId,
}: {
  label: string;
  items: ActionMenuItem[];
  className?: string;
  triggerClassName?: string;
  /** The ⋯ button's id, for putting the focus back on it after a dialog the menu opened. */
  triggerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const startAt = useRef<"first" | "last">("first");
  const id = useId();
  const buttonId = triggerId ?? `${id}-button`;
  const menuId = `${id}-menu`;

  const enabledItems = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];

  const show = (at: "first" | "last") => {
    startAt.current = at;
    setOpen(true);
  };

  // Placed and focused before it is painted, so it never shows in the wrong place.
  useLayoutEffect(() => {
    if (!open) return;
    const box = trigger.current?.getBoundingClientRect();
    const height = menu.current?.offsetHeight ?? 0;
    if (box) {
      const bottom = window.innerHeight - (window.matchMedia("(min-width: 64rem)").matches ? 8 : TAB_BAR_ROOM);
      setAbove(box.bottom + 4 + height > bottom && box.top - 4 - height >= 8);
    }
    const list = enabledItems();
    (startAt.current === "last" ? list.at(-1) : list[0])?.focus();
  }, [open]);

  // A click or tap anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowUp" ? "last" : "first");
    }
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = enabledItems();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      // Only this menu closes, not a dialog it sits in.
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "Tab") setOpen(false);
  };

  const safe = items.filter((item) => !item.danger);
  const danger = items.filter((item) => item.danger);

  const itemButton = (item: ActionMenuItem) => (
    <button
      key={item.key}
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={item.disabled}
      onClick={() => {
        setOpen(false);
        item.onSelect();
      }}
      className={cn(
        "flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60",
        "max-lg:min-h-11 pointer-coarse:min-h-11",
        "text-foreground hover:bg-muted focus-visible:bg-muted",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {item.label}
    </button>
  );

  return (
    <div ref={root} className={cn("relative shrink-0", className)}>
      <Button
        ref={trigger}
        id={buttonId}
        type="button"
        variant="secondary"
        size="icon-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : show("first"))}
        onKeyDown={onTriggerKey}
        className={triggerClassName}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          onKeyDown={onMenuKey}
          onBlur={(event) => {
            if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node)) setOpen(false);
          }}
          className={cn(POPOVER, "absolute right-0 z-30 w-52 p-1 animate-pop-in", above ? "bottom-full mb-1 origin-bottom-right" : "top-full mt-1 origin-top-right")}
        >
          {safe.map(itemButton)}
          {safe.length > 0 && danger.length > 0 && <div role="separator" className="-mx-1 my-1 h-px bg-border" />}
          {danger.map(itemButton)}
        </div>
      )}
    </div>
  );
}
