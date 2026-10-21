import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import logoImage from "./revtaw-logo.png";

/**
 * The RevTaw mark: the navy app icon (the same picture as the favicon and the
 * home-screen icon in src/app). Decorative — the wordmark next to it names the
 * link. The file is already small (96 px for 32 px at 3x), so it skips the
 * image optimizer.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={logoImage}
      alt=""
      width={32}
      height={32}
      unoptimized
      loading="eager"
      draggable={false}
      className={cn("h-8 w-8 shrink-0 select-none", className)}
    />
  );
}

export function Logo({
  href = "/",
  className,
  withTagline = false,
}: {
  href?: string;
  className?: string;
  withTagline?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <LogoMark />
      {/* The visible wordmark is the link's accessible name (WCAG 2.5.3 label in name). */}
      <span className="flex flex-col leading-none">
        <span className="text-lg font-bold tracking-tight text-foreground">
          {BRAND.name}
        </span>
        {withTagline && (
          <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">
            {BRAND.motto}
          </span>
        )}
      </span>
    </Link>
  );
}
