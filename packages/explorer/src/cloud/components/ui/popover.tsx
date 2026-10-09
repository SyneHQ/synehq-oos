"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

import { PopoverContent as ProbePopoverContent } from "@synehq-oos/ui";
import { cn } from "../../lib/utils";

/**
 * shadcn's Popover, rendered by Probe. Root, Trigger and Anchor are the same
 * Radix parts on both sides, so they pass straight through — as do Close,
 * Title and Description, which Probe adds and shadcn never had.
 */
export {
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverClose,
  PopoverTitle,
  PopoverDescription,
} from "@synehq-oos/ui";

export type PopoverContentProps = ComponentPropsWithoutRef<typeof ProbePopoverContent>;

/**
 * Probe's panel with shadcn's box: a fixed 18rem and no cap, instead of Probe's
 * shrink-to-fit with a 320px ceiling. Both halves of that matter here —
 * call-sites that pass no width (the command palettes) were laid out against
 * 18rem, and the two that ask for 32rem / 360px would otherwise be clamped to
 * 320px. Everything else — surface, border, radius, motion — is Probe.
 */
export const PopoverContent = forwardRef<
  ComponentRef<typeof ProbePopoverContent>,
  PopoverContentProps
>(function PopoverContent({ className, ...props }, ref) {
  return (
    <ProbePopoverContent
      ref={ref}
      className={cn(
        "w-72 max-w-none",
        // Same as dialog: the !z-[9999999999] escalation that used to sit here
        // is gone with the page chrome it was fighting, so
        // --probe-popover-z-index governs. Call-sites passing !z-40 to duck
        // *under* something still win — theirs lands after this in the merge.
        className,
      )}
      {...props}
    />
  );
});
