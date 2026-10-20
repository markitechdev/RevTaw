"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setTimezoneAction } from "@/lib/planner/actions";

/** Time zone used for "today", due dates and the streak. Auto-detected once; editable here. */
export function TimezoneForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const detect = () => {
    try {
      setValue(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    } catch {
      setMessage({ tone: "error", text: "Your browser did not report a time zone." });
    }
  };

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await setTimezoneAction(value.trim());
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setMessage({ tone: "success", text: "Time zone saved." });
      router.refresh();
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Field id="timezone" label="Time zone" hint="IANA name, e.g. Asia/Manila. Planner dates and your streak follow it.">
        <div className="flex flex-wrap gap-2">
          <Input {...fieldA11y("timezone")} value={value} maxLength={64} placeholder="Asia/Manila" disabled={pending} onChange={(event) => setValue(event.target.value)} className="max-w-xs" />
          <Button type="button" variant="secondary" disabled={pending} onClick={detect}>
            Use my device&rsquo;s zone
          </Button>
        </div>
      </Field>
      <div>
        <Button type="submit" loading={pending} disabled={!value.trim()}>
          Save time zone
        </Button>
      </div>
    </form>
  );
}
