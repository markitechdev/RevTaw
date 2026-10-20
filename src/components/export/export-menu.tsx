"use client";

import { Download, FileText, Printer } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Export menu (spec §34): print, PDF or Word for whatever the page shows.
 * Links point at the export route, so downloads work without JavaScript
 * once the menu is open. It is a disclosure (button + list of links), not an
 * ARIA menu, so Tab moves through the options and Escape closes it.
 */

export type ExportTarget = { kind: "reviewer" | "quiz" | "results" | "deck" | "plan" | "mistakes" | "progress"; id?: string; query?: Record<string, string> };

export function exportHref(target: ExportTarget, format: "pdf" | "docx" | "html", print = false): string {
  const params = new URLSearchParams({ ...(target.id ? { id: target.id } : {}), ...(target.query ?? {}), format });
  if (print) params.set("print", "1");
  return `/api/export/${target.kind}?${params.toString()}`;
}

export function ExportMenu({ target, label = "Export", size = "sm", variant = "secondary", className }: { target: ExportTarget; label?: string; size?: "sm" | "md"; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        buttonRef.current?.focus();
      }
      if (event instanceof MouseEvent && ref.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget && !ref.current?.contains(event.relatedTarget as Node)) setOpen(false);
    };
    const node = ref.current;
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    node?.addEventListener("focusout", closeOnFocusOut);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      node?.removeEventListener("focusout", closeOnFocusOut);
    };
  }, [open]);

  const items = [
    { label: "Print", description: "Printer-friendly page", icon: Printer, href: exportHref(target, "html", true), target: "_blank" as const },
    { label: "Download PDF", description: "A4, readable formatting", icon: FileText, href: exportHref(target, "pdf"), target: undefined },
    { label: "Download Word", description: "Editable .docx", icon: Download, href: exportHref(target, "docx"), target: undefined },
  ];

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Button ref={buttonRef} type="button" size={size} variant={variant} aria-expanded={open} aria-controls={`${id}-menu`} onClick={() => setOpen((state) => !state)}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      {open && (
        <div id={`${id}-menu`} className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target={item.target}
              rel={item.target ? "noopener" : undefined}
              onClick={() => setOpen(false)}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex flex-col">
                <span className="font-medium">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.description}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
