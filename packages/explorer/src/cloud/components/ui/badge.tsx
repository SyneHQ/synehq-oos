import { cn } from "../../lib/utils";
import { Badge as ProbeBadge, type BadgeProps as ProbeBadgeProps } from "@synehq-oos/ui";

/**
 * shadcn's flat variant list is a tone plus a fill in Probe's grid. The fill is
 * read off what the old classes actually painted: `default`/`destructive` were
 * full-bleed brand and red, `secondary`/`success` were 10%-tint chips, and
 * `outline` was border-only. `default` maps to Probe's `brand`, which reads the
 * `highlight` tokens — tier 3 names the accent tone `highlight`.
 */
const VARIANT_MAP = {
  default: { tone: "brand", variant: "solid" },
  secondary: { tone: "neutral", variant: "subtle" },
  destructive: { tone: "critical", variant: "solid" },
  outline: { tone: "neutral", variant: "outlined" },
  success: { tone: "success", variant: "subtle" },
} as const satisfies Record<string, Pick<ProbeBadgeProps, "tone" | "variant">>;

export type BadgeVariant = keyof typeof VARIANT_MAP;

/** Colour trio per variant, matching the tone/fill pair in `VARIANT_MAP`. */
const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default:
    "bg-[color:var(--probe-badge-highlight-background--solid)] text-[color:var(--probe-badge-highlight-text--solid)] border-[color:var(--probe-badge-highlight-border--solid)]",
  secondary:
    "bg-[color:var(--probe-badge-neutral-background)] text-[color:var(--probe-badge-neutral-text)] border-[color:var(--probe-badge-neutral-border)]",
  destructive:
    "bg-[color:var(--probe-badge-critical-background--solid)] text-[color:var(--probe-badge-critical-text--solid)] border-[color:var(--probe-badge-critical-border--solid)]",
  outline:
    "bg-[color:var(--probe-badge-neutral-background--outlined)] text-[color:var(--probe-badge-neutral-text--outlined)] border-[color:var(--probe-badge-neutral-border--outlined)]",
  success:
    "bg-[color:var(--probe-badge-success-background)] text-[color:var(--probe-badge-success-text)] border-[color:var(--probe-badge-success-border)]",
};

/**
 * Kept because the shadcn idiom is to paint a non-badge element (a link, a cell)
 * with `className={badgeVariants({ variant })}`. It reads Probe's public tokens
 * rather than Probe's private class factory, so it tracks the palette but will
 * not follow a later change to the badge's geometry — render `<Badge>` where you
 * own the element, and reach for this only where you do not.
 */
export function badgeVariants({
  variant,
  className,
}: { variant?: BadgeVariant | null; className?: string } = {}): string {
  return cn(
    "inline-flex max-w-full shrink-0 items-center justify-center gap-[var(--probe-badge-gap)]",
    "h-[var(--probe-badge-height)] px-[var(--probe-badge-padding-x)]",
    "rounded-[var(--probe-badge-radius)] border-solid border-[length:var(--probe-badge-border-width)]",
    "text-[length:var(--probe-badge-font-size)] leading-[var(--probe-badge-line-height)] [font-weight:var(--probe-badge-font-weight)]",
    VARIANT_CLASS[variant ?? "default"],
    className,
  );
}

export interface BadgeProps extends Omit<ProbeBadgeProps, "variant"> {
  /** shadcn's names. Probe's own `tone`/`size`/`dot`/`icon` still pass through. */
  variant?: BadgeVariant | null;
}

function Badge({ variant, ...props }: BadgeProps) {
  // Spread order matters: an explicit `tone` from a call-site outranks the tone
  // the variant implies, which is how a screen opts into Probe's extra tones.
  return <ProbeBadge {...VARIANT_MAP[variant ?? "default"]} {...props} />;
}

export { Badge };
