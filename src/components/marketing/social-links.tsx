import { siFacebook, siGithub, siInstagram, type SimpleIcon } from "simple-icons";

import { buttonClasses } from "@/components/ui/button";
import { BRAND, type SocialId } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The brand marks from Simple Icons (CC0), drawn in the text color like the rest of the footer. */
const ICONS: Record<SocialId, SimpleIcon> = { facebook: siFacebook, instagram: siInstagram, github: siGithub };

/**
 * The contact icons: the creator's Facebook, Instagram and GitHub. Plain links that open in a new tab, with
 * no embeds, widgets or scripts from those sites, so nothing reaches them until a visitor clicks.
 */
export function SocialLinks({ className }: { className?: string }) {
  return (
    <ul aria-label="Contact" className={cn("flex items-center gap-1", className)}>
      {BRAND.social.map((link) => (
        <li key={link.id}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonClasses({ variant: "ghost", size: "icon" }), "text-muted-foreground hover:text-foreground")}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true" focusable="false">
              <path d={ICONS[link.id].path} />
            </svg>
            <span className="sr-only">
              {BRAND.creator} on {link.label} (opens in a new tab)
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
