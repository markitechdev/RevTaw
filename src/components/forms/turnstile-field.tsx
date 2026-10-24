"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { useTheme } from "@/components/theme/theme-provider";
import { TURNSTILE_RESPONSE_FIELD, type TurnstileAction } from "@/lib/security/turnstile-shared";

/** Cloudflare requires this exact URL (no copies or proxies). Explicit mode lets React decide when to render. */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** The flexible widget is at least 300 px wide; narrower forms get the compact one. */
const FLEXIBLE_MIN_WIDTH = 300;

const LOAD_FAILED =
  "The security check could not load. Check your connection, or allow challenges.cloudflare.com if you use a blocker, then reload the page.";

/** Turnstile's error codes: 110xxx is a setup problem on our side, 300xxx and 600xxx a failed challenge. */
function checkFailed(code: string): string {
  if (code.startsWith("110")) return "The security check is not available on this page right now. Please try again later.";
  if (code.startsWith("300") || code.startsWith("600")) return "The security check could not finish. Try again, or reload the page.";
  return "The security check ran into a problem and is trying again. If it keeps failing, reload the page.";
}

type WidgetOptions = {
  sitekey: string;
  action: TurnstileAction;
  theme: "light" | "dark";
  size: "flexible" | "compact";
  "response-field-name": string;
  callback: (token: string) => void;
  "error-callback": (code: string) => boolean;
};

type TurnstileApi = {
  render(container: HTMLElement, options: WidgetOptions): string | null | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** Adds Cloudflare's script once per page load. The CSP allows it through 'strict-dynamic'. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not start")));
    script.onerror = () => {
      script.remove();
      loading = null; // the next widget may try again
      reject(new Error("Turnstile could not load"));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile inside a sign-up or sign-in form; renders nothing while
 * the check is off (no site key). The widget writes its one-time token into a
 * hidden field that the form posts with everything else, and the Server
 * Action confirms it (src/lib/security/turnstile.ts).
 */
export function TurnstileField({ siteKey, action }: { siteKey?: string; action: TurnstileAction }) {
  if (!siteKey) return null;
  return <TurnstileWidget siteKey={siteKey} action={action} />;
}

function TurnstileWidget({ siteKey, action }: { siteKey: string; action: TurnstileAction }) {
  const { resolvedTheme } = useTheme();
  const { pending } = useFormStatus();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  // `collapsed`: the script never loaded, so there is no widget to hold room for.
  const [problem, setProblem] = useState<{ message: string; collapsed: boolean } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let active = true;
    loadTurnstile().then(
      (turnstile) => {
        if (!active) return;
        setProblem(null);
        widgetRef.current =
          turnstile.render(container, {
            sitekey: siteKey,
            action,
            theme: resolvedTheme,
            size: container.clientWidth >= FLEXIBLE_MIN_WIDTH ? "flexible" : "compact",
            "response-field-name": TURNSTILE_RESPONSE_FIELD,
            callback: () => setProblem(null),
            // Returning true marks the error as handled; Turnstile retries on its own.
            "error-callback": (code) => {
              setProblem({ message: checkFailed(String(code)), collapsed: false });
              return true;
            },
          }) ?? null;
      },
      () => {
        if (active) setProblem({ message: LOAD_FAILED, collapsed: true });
      },
    );
    return () => {
      active = false;
      const widgetId = widgetRef.current;
      widgetRef.current = null;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, action, resolvedTheme]);

  // A token passes one check only, so start a new one as soon as the form is sent.
  // The form's data, with the token just used, has already been read by then.
  useEffect(() => {
    if (pending && widgetRef.current) window.turnstile?.reset(widgetRef.current);
  }, [pending]);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Holds the widget's height (65 px) so the button below does not jump when it appears. */}
      <div ref={containerRef} className={problem?.collapsed ? undefined : "min-h-[65px]"} />
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem.message}
        </p>
      )}
    </div>
  );
}
