import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { variants } from "../lib/cn";

export type SpinnerSize = "sm" | "md" | "lg";
export type SpinnerTone = "accent" | "inverted";

/**
 * A ring with one coloured edge, rotated. The three quiet sides and the loud
 * one are set through *separate* border-side properties rather than
 * `border-color` + `border-top-color`, so there is no cascade order to lose:
 * the utilities touch different properties and cannot fight.
 *
 * `motion-safe:` carries the animation rather than `motion-reduce:` removing
 * it — the still frame is the default, and the movement is the addition. Under
 * reduced motion the ring simply sits there, and the `role="status"` label is
 * what reports progress.
 */
const spinner = variants({
  base: [
    "inline-block shrink-0 align-[-0.125em]",
    "rounded-[var(--probe-spinner-radius)]",
    "border-solid border-[length:var(--probe-spinner-thickness)]",
    "border-x-[color:var(--probe-spinner-track)]",
    "border-b-[color:var(--probe-spinner-track)]",
    "motion-safe:[animation:probe-spinner-spin_var(--probe-spinner-duration)_linear_infinite]",
  ].join(" "),
  variants: {
    tone: {
      accent: "border-t-[color:var(--probe-spinner-indicator)]",
      inverted: "border-t-[color:var(--probe-spinner-indicator--inverted)]",
    },
    size: {
      sm: "h-[var(--probe-spinner-size-sm)] w-[var(--probe-spinner-size-sm)]",
      md: "h-[var(--probe-spinner-size-md)] w-[var(--probe-spinner-size-md)]",
      lg: "h-[var(--probe-spinner-size-lg)] w-[var(--probe-spinner-size-lg)]",
    },
  },
  defaultVariants: { tone: "accent", size: "md" },
});

export interface SpinnerProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  /** `sm` sits inside a button, `md` beside body copy, `lg` owns a blank panel. */
  size?: SpinnerSize;
  /** `inverted` for inverted surfaces — inside a primary button, on a scrim. */
  tone?: SpinnerTone;
  /**
   * What is loading, announced to assistive tech. Rendered visually hidden, so
   * the spinner is never a shape with no name.
   */
  label?: string;
  /**
   * Drop the announcement when a nearby live region already reports the same
   * wait — two things saying "Loading" is worse than one.
   */
  decorative?: boolean;
}

/**
 * An indeterminate wait of unknown duration. For a wait you can measure, use
 * `<Progress />` instead.
 *
 * @example
 * <Spinner label="Running query" />
 *
 * @example
 * // Inside a primary button, where the surface is inverted and the button's
 * // own text already says what is happening.
 * <Button disabled>
 *   <Spinner size="sm" tone="inverted" decorative /> Running…
 * </Button>
 */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = "md", tone = "accent", label = "Loading", decorative = false, className, ...rest },
  ref,
) {
  if (decorative) {
    return (
      <span ref={ref} aria-hidden="true" className={spinner({ tone, size, className })} {...rest} />
    );
  }

  return (
    <span ref={ref} role="status" className={spinner({ tone, size, className })} {...rest}>
      <span className="sr-only">{label}</span>
    </span>
  );
});
