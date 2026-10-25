import { siFacebook, siGithub, siInstagram, type SimpleIcon } from "simple-icons";

import { buttonClasses } from "@/components/ui/button";
import { BRAND, type SocialId } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The brand marks from Simple Icons (CC0), drawn in the text color like the rest of the footer. */
const ICONS: Record<SocialId, SimpleIcon> = { facebook: siFacebook, instagram: siInstagram, github: siGithub };

/**
 * The contact icons: the creator's Facebook, Instagram and GitHub. Plain links that open in a new tab, with
 * no embeds, widgets or scripts from those sites, so nothing reaches them until a visitor clicks. `labeled`
 * shows each network's name beside its icon (the About page); the footer shows the icons alone.
 */
export function SocialLinks({ id, className, labeled = false, label = "Contact" }: { id?: string; className?: string; labeled?: boolean; label?: string }) {
  return (
    <ul id={id} aria-label={label} className={cn("flex flex-wrap items-center", labeled ? "gap-2" : "gap-1", className)}>
      {BRAND.social.map((link) => (
        <li key={link.id}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={labeled ? buttonClasses({ variant: "secondary" }) : cn(buttonClasses({ variant: "ghost", size: "icon" }), "text-muted-foreground hover:text-foreground")}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className={labeled ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" focusable="false">
              <path d={ICONS[link.id].path} />
            </svg>
            {labeled ? (
              <>
                {link.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </>
            ) : (
              <span className="sr-only">
                {BRAND.creator} on {link.label} (opens in a new tab)
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
