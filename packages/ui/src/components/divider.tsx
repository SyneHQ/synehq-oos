import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn, variants } from "../lib/cn";

const divider = variants({
  base: "border-[color:var(--probe-divider-color)]",
  variants: {
    orientation: {
      horizontal: "w-full border-t-[length:var(--probe-divider-thickness)]",
      // `self-stretch` makes a vertical rule match its flex row's height
      // without anyone having to know that height.
      vertical: "h-full self-stretch border-l-[length:var(--probe-divider-thickness)]",
    },
    tone: {
      default: "",
      strong: "border-[color:var(--probe-divider-color--strong)]",
    },
  },
  defaultVariants: { orientation: "horizontal", tone: "default" },
});

export interface DividerProps extends ComponentPropsWithoutRef<"div"> {
  /** Defaults to `horizontal`. A `vertical` rule stretches to its flex row. */
  orientation?: "horizontal" | "vertical";
  /** `strong` steps the rule up one border token, for major page seams. */
  tone?: "default" | "strong";
  /**
   * Margin along the rule's axis. Defaults to `none` — spacing normally belongs
   * to the parent's `gap`, so opt in only when the divider stands alone.
   */
  spacing?: "none" | "default";
  /**
   * Optional inset caption, e.g. `OR` or a section name. Horizontal only: the
   * label sits between a short leading rule and a full-width trailing one.
   */
  label?: ReactNode;
}

/**
 * A 1px rule. Probe separates surfaces with lines, never with shadows.
 *
 * @example
 * <Divider />
 * <Divider orientation="vertical" />
 * <Divider label="Advanced" spacing="default" />
 */
export const Divider = forwardRef<HTMLDivElement, DividerProps>(function Divider(
  { orientation = "horizontal", tone = "default", spacing = "none", label, className, ...rest },
  ref,
) {
  const margin =
    spacing === "none"
      ? ""
      : orientation === "horizontal"
        ? "my-[var(--probe-divider-spacing)]"
        : "mx-[var(--probe-divider-spacing)]";

  if (label !== undefined && label !== null && orientation === "horizontal") {
    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation="horizontal"
        className={cn(
          "flex w-full items-center gap-[var(--probe-divider-label-gap)]",
          tone === "strong"
            ? "border-[color:var(--probe-divider-color--strong)]"
            : "border-[color:var(--probe-divider-color)]",
          margin,
          className,
        )}
        {...rest}
      >
        {/* `border-color: inherit` keeps the tone decision on the container. */}
        <span
          aria-hidden
          className="w-[var(--probe-divider-label-inset)] shrink-0 border-t-[length:var(--probe-divider-thickness)] border-[color:inherit]"
        />
        <span
          className={cn(
            "shrink-0 uppercase text-[length:var(--probe-divider-label-font-size)]",
            "tracking-[var(--probe-divider-label-tracking)]",
            "[font-weight:var(--probe-divider-label-font-weight)]",
            "text-[color:var(--probe-divider-label-text)]",
          )}
        >
          {label}
        </span>
        <span
          aria-hidden
          className="flex-1 border-t-[length:var(--probe-divider-thickness)] border-[color:inherit]"
        />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={divider({ orientation, tone, className: cn(margin, className) })}
      {...rest}
    />
  );
});
