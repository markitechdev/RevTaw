import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

export function initialsFor(name: string, email: string | null): string {
  const source = name.trim() || email?.split("@")[0] || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compact identity block with theme and sign-out controls. */
export function UserCard({
  displayName,
  email,
  className,
}: {
  displayName: string;
  email: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
        >
          {initialsFor(displayName, email)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {displayName || "Student"}
          </p>
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle />
        <SignOutButton variant="ghost" size="sm" />
      </div>
    </div>
  );
}
