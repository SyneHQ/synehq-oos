"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../lib/cn";

/**
 * Tooltip — `@radix-ui/react-tooltip` with the one surface in Probe that
 * deliberately inverts against the page: dark-on-light in the light theme,
 * light-on-dark in the dark one. Because `surface-inverted` and `surface-page`
 * are ramp mirrors, that inversion is a single pair of token references rather
 * than a per-theme override.
 *
 * A tooltip is a *label*, never content. It must not contain a link, a button
 * or anything else focusable — pointer users cannot travel into it without it
 * closing, and keyboard users cannot reach it at all. If the content needs to
 * be interactive, that is a `Popover`.
 *
 * Wrap a page in one `TooltipProvider` so the open/close delays are shared;
 * that shared timer is what produces the "second tooltip opens instantly"
 * behaviour people expect when skimming a toolbar.
 */
const TooltipProvider = TooltipPrimitive.Provider;
export type TooltipProviderProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>;

const Tooltip = TooltipPrimitive.Root;
export type TooltipProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>;

const TooltipTrigger = TooltipPrimitive.Trigger;
export type TooltipTriggerProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>;

const TooltipPortal = TooltipPrimitive.Portal;
export type TooltipPortalProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Portal>;

export type TooltipContentProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
  /** The triangle pointing back at the trigger. On by default. */
  arrow?: boolean;
};

/**
 * The bubble. Portalled, so it escapes `overflow: hidden` ancestors.
 *
 * Motion is `tailwindcss-animate`'s data-state variants driven by Probe's own
 * duration and easing tokens. `prefers-reduced-motion` zeroes those tokens at
 * the primitive layer, so there is no reduced-motion branch in here.
 *
 * @example
 * <TooltipProvider delayDuration={200}>
 *   <Tooltip>
 *     <TooltipTrigger asChild>
 *       <IconButton label="Re-run query" icon={<RefreshCw />} />
 *     </TooltipTrigger>
 *     <TooltipContent>Re-run query <Kbd inverted>R</Kbd></TooltipContent>
 *   </Tooltip>
 * </TooltipProvider>
 */
const TooltipContent = forwardRef<
  ComponentRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(function TooltipContent({ className, sideOffset = 6, arrow = true, children, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "inline-flex max-w-[var(--probe-tooltip-max-width)] items-center",
          "gap-[var(--probe-tooltip-gap)]",
          "px-[var(--probe-tooltip-padding-x)] py-[var(--probe-tooltip-padding-y)]",
          "rounded-[var(--probe-tooltip-radius)]",
          "border-solid border-[length:var(--probe-tooltip-border-width)]",
          "border-[color:var(--probe-tooltip-border)]",
          "bg-[color:var(--probe-tooltip-background)]",
          "text-[color:var(--probe-tooltip-text)]",
          "text-[length:var(--probe-tooltip-font-size)]",
          "leading-[var(--probe-tooltip-line-height)]",
          "tracking-[var(--probe-tooltip-tracking)]",
          "[font-weight:var(--probe-tooltip-font-weight)]",
          "z-[var(--probe-tooltip-z-index)]",
          "[animation-duration:var(--probe-tooltip-animation-duration)]",
          "[animation-timing-function:var(--probe-tooltip-animation-ease)]",
          "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
          "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
          className,
        )}
        {...props}
      >
        {children}
        {arrow ? (
          // Radix's width/height props are numbers and cannot take a token, so
          // the arrow is sized in CSS instead — the SVG scales to the box.
          <TooltipPrimitive.Arrow
            className={cn(
              "fill-[var(--probe-tooltip-arrow)]",
              "h-[var(--probe-tooltip-arrow-size)]",
              "w-[calc(var(--probe-tooltip-arrow-size)*2)]",
            )}
          />
        ) : null}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipPortal, TooltipContent };
