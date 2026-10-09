import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { variants } from "../lib/cn";

export type BadgeTone = "neutral" | "brand" | "success" | "critical" | "warning" | "info";
export type BadgeVariant = "solid" | "subtle" | "outlined";
export type BadgeSize = "sm" | "md";

/**
 * Tone x variant is a real cross-product of tokens, so every pair is spelled
 * out: Tailwind only emits a class it can find as a literal string in source,
 * which rules out building these names at runtime.
 *
 * `brand` reads the `highlight` token set — tier 3 names the accent tone
 * `highlight`, the same way Render does.
 */
const badge = variants({
  base: [
    "inline-flex max-w-full shrink-0 items-center justify-center",
    "gap-[var(--probe-badge-gap)]",
    "rounded-[var(--probe-badge-radius)]",
    "border-solid border-[length:var(--probe-badge-border-width)]",
    "[font-weight:var(--probe-badge-font-weight)]",
    "tracking-[var(--probe-badge-tracking)]",
    "[transition:background-color_var(--probe-badge-transition),border-color_var(--probe-badge-transition),color_var(--probe-badge-transition)]",
  ].join(" "),
  variants: {
    look: {
      "neutral-subtle":
        "bg-[color:var(--probe-badge-neutral-background)] text-[color:var(--probe-badge-neutral-text)] border-[color:var(--probe-badge-neutral-border)] hover:bg-[color:var(--probe-badge-neutral-background--hover)]",
      "neutral-solid":
        "bg-[color:var(--probe-badge-neutral-background--solid)] text-[color:var(--probe-badge-neutral-text--solid)] border-[color:var(--probe-badge-neutral-border--solid)] hover:bg-[color:var(--probe-badge-neutral-background--solid-hover)]",
      "neutral-outlined":
        "bg-[color:var(--probe-badge-neutral-background--outlined)] text-[color:var(--probe-badge-neutral-text--outlined)] border-[color:var(--probe-badge-neutral-border--outlined)] hover:bg-[color:var(--probe-badge-neutral-background--outlined-hover)] hover:border-[color:var(--probe-badge-neutral-border--outlined-hover)] active:bg-[color:var(--probe-badge-neutral-background--outlined-active)] active:text-[color:var(--probe-badge-neutral-text--outlined-active)]",

      "brand-subtle":
        "bg-[color:var(--probe-badge-highlight-background)] text-[color:var(--probe-badge-highlight-text)] border-[color:var(--probe-badge-highlight-border)] hover:bg-[color:var(--probe-badge-highlight-background--hover)]",
      "brand-solid":
        "bg-[color:var(--probe-badge-highlight-background--solid)] text-[color:var(--probe-badge-highlight-text--solid)] border-[color:var(--probe-badge-highlight-border--solid)] hover:bg-[color:var(--probe-badge-highlight-background--solid-hover)]",
      "brand-outlined":
        "bg-[color:var(--probe-badge-highlight-background--outlined)] text-[color:var(--probe-badge-highlight-text--outlined)] border-[color:var(--probe-badge-highlight-border--outlined)] hover:bg-[color:var(--probe-badge-highlight-background--outlined-hover)] hover:border-[color:var(--probe-badge-highlight-border--outlined-hover)] active:bg-[color:var(--probe-badge-highlight-background--outlined-active)] active:text-[color:var(--probe-badge-highlight-text--outlined-active)]",

      "success-subtle":
        "bg-[color:var(--probe-badge-success-background)] text-[color:var(--probe-badge-success-text)] border-[color:var(--probe-badge-success-border)] hover:bg-[color:var(--probe-badge-success-background--hover)]",
      "success-solid":
        "bg-[color:var(--probe-badge-success-background--solid)] text-[color:var(--probe-badge-success-text--solid)] border-[color:var(--probe-badge-success-border--solid)] hover:bg-[color:var(--probe-badge-success-background--solid-hover)]",
      "success-outlined":
        "bg-[color:var(--probe-badge-success-background--outlined)] text-[color:var(--probe-badge-success-text--outlined)] border-[color:var(--probe-badge-success-border--outlined)] hover:bg-[color:var(--probe-badge-success-background--outlined-hover)] hover:border-[color:var(--probe-badge-success-border--outlined-hover)] active:bg-[color:var(--probe-badge-success-background--outlined-active)] active:text-[color:var(--probe-badge-success-text--outlined-active)]",

      "critical-subtle":
        "bg-[color:var(--probe-badge-critical-background)] text-[color:var(--probe-badge-critical-text)] border-[color:var(--probe-badge-critical-border)] hover:bg-[color:var(--probe-badge-critical-background--hover)]",
      "critical-solid":
        "bg-[color:var(--probe-badge-critical-background--solid)] text-[color:var(--probe-badge-critical-text--solid)] border-[color:var(--probe-badge-critical-border--solid)] hover:bg-[color:var(--probe-badge-critical-background--solid-hover)]",
      "critical-outlined":
        "bg-[color:var(--probe-badge-critical-background--outlined)] text-[color:var(--probe-badge-critical-text--outlined)] border-[color:var(--probe-badge-critical-border--outlined)] hover:bg-[color:var(--probe-badge-critical-background--outlined-hover)] hover:border-[color:var(--probe-badge-critical-border--outlined-hover)] active:bg-[color:var(--probe-badge-critical-background--outlined-active)] active:text-[color:var(--probe-badge-critical-text--outlined-active)]",

      "warning-subtle":
        "bg-[color:var(--probe-badge-warning-background)] text-[color:var(--probe-badge-warning-text)] border-[color:var(--probe-badge-warning-border)] hover:bg-[color:var(--probe-badge-warning-background--hover)]",
      "warning-solid":
        "bg-[color:var(--probe-badge-warning-background--solid)] text-[color:var(--probe-badge-warning-text--solid)] border-[color:var(--probe-badge-warning-border--solid)] hover:bg-[color:var(--probe-badge-warning-background--solid-hover)]",
      "warning-outlined":
        "bg-[color:var(--probe-badge-warning-background--outlined)] text-[color:var(--probe-badge-warning-text--outlined)] border-[color:var(--probe-badge-warning-border--outlined)] hover:bg-[color:var(--probe-badge-warning-background--outlined-hover)] hover:border-[color:var(--probe-badge-warning-border--outlined-hover)] active:bg-[color:var(--probe-badge-warning-background--outlined-active)] active:text-[color:var(--probe-badge-warning-text--outlined-active)]",

      "info-subtle":
        "bg-[color:var(--probe-badge-info-background)] text-[color:var(--probe-badge-info-text)] border-[color:var(--probe-badge-info-border)] hover:bg-[color:var(--probe-badge-info-background--hover)]",
      "info-solid":
        "bg-[color:var(--probe-badge-info-background--solid)] text-[color:var(--probe-badge-info-text--solid)] border-[color:var(--probe-badge-info-border--solid)] hover:bg-[color:var(--probe-badge-info-background--solid-hover)]",
      "info-outlined":
        "bg-[color:var(--probe-badge-info-background--outlined)] text-[color:var(--probe-badge-info-text--outlined)] border-[color:var(--probe-badge-info-border--outlined)] hover:bg-[color:var(--probe-badge-info-background--outlined-hover)] hover:border-[color:var(--probe-badge-info-border--outlined-hover)] active:bg-[color:var(--probe-badge-info-background--outlined-active)] active:text-[color:var(--probe-badge-info-text--outlined-active)]",
    },
    size: {
      sm: "h-[var(--probe-badge-height-sm)] px-[var(--probe-badge-padding-x-sm)] text-[length:var(--probe-badge-font-size-sm)] leading-[var(--probe-badge-line-height-sm)]",
      md: "h-[var(--probe-badge-height)] px-[var(--probe-badge-padding-x)] text-[length:var(--probe-badge-font-size)] leading-[var(--probe-badge-line-height)]",
    },
  },
  defaultVariants: { look: "neutral-subtle", size: "md" },
});

const ICON = {
  sm: "inline-flex shrink-0 items-center justify-center [&>svg]:h-[var(--probe-badge-icon-size-sm)] [&>svg]:w-[var(--probe-badge-icon-size-sm)]",
  md: "inline-flex shrink-0 items-center justify-center [&>svg]:h-[var(--probe-badge-icon-size)] [&>svg]:w-[var(--probe-badge-icon-size)]",
} as const;

const DOT = {
  sm: "inline-block shrink-0 rounded-[var(--probe-badge-dot-radius)] bg-current h-[var(--probe-badge-dot-size-sm)] w-[var(--probe-badge-dot-size-sm)]",
  md: "inline-block shrink-0 rounded-[var(--probe-badge-dot-radius)] bg-current h-[var(--probe-badge-dot-size)] w-[var(--probe-badge-dot-size)]",
} as const;

export interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  /** Semantic colour. Never the sole carrier of meaning — the label says it too. */
  tone?: BadgeTone;
  /** `subtle` is the default fill; `solid` shouts; `outlined` is the quietest. */
  variant?: BadgeVariant;
  /** `md` (20px) reads in prose; `sm` (16px) fits inside a dense table row. */
  size?: BadgeSize;
  /** Leading dot in the badge's own text colour. Ignored when `icon` is set. */
  dot?: boolean;
  /** Leading icon, e.g. `<GitBranch />`. Decorative: hidden from assistive tech. */
  icon?: ReactNode;
}

/**
 * A compact label for a state, count or category. Square, 1px border, no shadow.
 *
 * @example
 * <Badge tone="success" variant="subtle" dot>Live</Badge>
 * <Badge tone="critical" variant="solid" size="sm" icon={<TriangleAlert />}>
 *   Failed
 * </Badge>
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    tone = "neutral",
    variant = "subtle",
    size = "md",
    dot = false,
    icon,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <span
      ref={ref}
      data-tone={tone}
      className={badge({
        look: `${tone}-${variant}` as `${BadgeTone}-${BadgeVariant}`,
        size,
        className,
      })}
      {...rest}
    >
      {icon ? (
        <span aria-hidden="true" className={ICON[size]}>
          {icon}
        </span>
      ) : dot ? (
        <span aria-hidden="true" className={DOT[size]} />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
});
