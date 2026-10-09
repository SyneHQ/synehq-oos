import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/cn";

/**
 * The shimmer is a repeating gradient twice the box's width, slid by exactly
 * one image width per cycle — which is what makes the loop seamless.
 *
 * `motion-safe:` carries the animation rather than `motion-reduce:` removing
 * it, so the still frame is the default and the movement is the addition:
 * there is no utility-order race to lose, and a reduced-motion reader gets a
 * flat placeholder instead of a pulsing one.
 */
const SHIMMER = [
  "bg-[color:var(--probe-skeleton-background)]",
  "bg-[image:linear-gradient(90deg,var(--probe-skeleton-background)_0%,var(--probe-skeleton-highlight)_50%,var(--probe-skeleton-background)_100%)]",
  "bg-[length:200%_100%]",
  "motion-safe:[animation:probe-skeleton-shimmer_var(--probe-skeleton-duration)_linear_infinite]",
].join(" ");

export interface SkeletonProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /**
   * Number of stacked lines. Above 1 the last line is short, the way a real
   * paragraph ends.
   */
  lines?: number;
  /** Circular placeholder for an avatar. The only rounded shape in Probe. */
  circle?: boolean;
  /**
   * Announce the wait. Omit it — the default — when the surrounding region
   * already reports loading, which is the usual case: a screen full of
   * skeletons should say "Loading" once, not forty times.
   */
  label?: string;
}

/**
 * A placeholder for content that has not arrived. Size it with `className`;
 * a bare `<Skeleton />` is one full-width 12px line.
 *
 * @example
 * <Skeleton className="w-40" />
 * <Skeleton lines={3} />
 * <Skeleton circle className="h-8 w-8" />
 *
 * @example
 * // The one skeleton in a region that owns the announcement.
 * <Skeleton lines={4} label="Loading query results" />
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { lines = 1, circle = false, label, className, ...rest },
  ref,
) {
  const a11y = label
    ? { role: "status" as const, "aria-label": label }
    : ({ "aria-hidden": true } as const);

  const shape = cn(
    SHIMMER,
    circle
      ? "rounded-[var(--probe-skeleton-radius--circle)]"
      : "rounded-[var(--probe-skeleton-radius)]",
  );

  if (lines > 1) {
    return (
      <div
        ref={ref}
        {...a11y}
        className={cn("flex w-full flex-col gap-[var(--probe-skeleton-line-gap)]", className)}
        {...rest}
      >
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn(
              shape,
              "h-[var(--probe-skeleton-height)]",
              i === lines - 1 ? "w-3/5" : "w-full",
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      {...a11y}
      className={cn(shape, "h-[var(--probe-skeleton-height)] w-full", className)}
      {...rest}
    />
  );
});
