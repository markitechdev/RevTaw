/**
 * Hand-drawn study doodles that drift behind the hero desk. Decorative only:
 * small inline SVGs, transform-only motion (paused under reduced motion).
 */
export function Doodles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden select-none sm:block">
      {/* Sticky note */}
      <svg className="absolute -left-10 -top-8 h-16 w-16 animate-float text-highlight [--float-rotate:-8deg]" viewBox="0 0 64 64" fill="none">
        <path d="M8 8h48v34L42 56H8z" fill="currentColor" />
        <path d="M42 56V42h14" fill="none" stroke="color-mix(in oklab, var(--foreground) 25%, transparent)" strokeWidth="2" />
        <path d="M16 22h28M16 30h22M16 38h16" stroke="color-mix(in oklab, var(--foreground) 35%, transparent)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {/* Pencil */}
      <svg className="absolute -bottom-12 -right-8 h-20 w-20 animate-float text-primary [--float-rotate:24deg] [animation-delay:-2s]" viewBox="0 0 80 80" fill="none">
        <path d="M14 58 52 20l8 8-38 38-11 3z" fill="color-mix(in oklab, currentColor 18%, transparent)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="m46 26 8 8M14 58l8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {/* Star burst */}
      <svg className="absolute -right-6 -top-10 h-10 w-10 animate-float text-primary [animation-delay:-4s]" viewBox="0 0 40 40" fill="none">
        <path d="M20 4v8M20 28v8M4 20h8M28 20h8M8.7 8.7l5.6 5.6M25.7 25.7l5.6 5.6M8.7 31.3l5.6-5.6M25.7 14.3l5.6-5.6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
