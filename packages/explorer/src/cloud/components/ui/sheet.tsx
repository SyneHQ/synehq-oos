"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

import {
  SheetBody as ProbeSheetBody,
  SheetContent as ProbeSheetContent,
  SheetFooter as ProbeSheetFooter,
  SheetHeader as ProbeSheetHeader,
} from "@synehq-oos/ui";
import { cn } from "../../lib/utils";

/**
 * shadcn's Sheet, rendered by Probe. Probe's API is a superset — `side` has the
 * same name and the same four values — so the parts with no geometry of their
 * own pass straight through.
 */
export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose } from "@synehq-oos/ui";

type SheetContentProps = ComponentPropsWithoutRef<typeof ProbeSheetContent>;

const SheetContent = forwardRef<ComponentRef<typeof ProbeSheetContent>, SheetContentProps>(
  function SheetContent({ className, side = "right", size, ...props }, ref) {
    return (
      <ProbeSheetContent
        ref={ref}
        side={side}
        size={size}
        className={cn(
          // This app sizes sheets with `max-w-*` on the content. Probe instead
          // pins an explicit extent per `size` (480px by default), which wins over
          // `max-w-*` and would shrink every wide sheet here. Unless a caller opts
          // into Probe's scale, restore shadcn's basis: viewport-filling until
          // `sm`, then capped by whatever `max-w-*` the call-site passes. Probe
          // gives top/bottom a fixed height where shadcn let them size to content.
          size === undefined &&
            (side === "top" || side === "bottom" ? "h-auto" : "w-full md:w-3/4 sm:max-w-sm"),
          // shadcn pads the content and leaves the parts bare; Probe does the
          // reverse. Call-sites drop loose children straight into the content, so
          // keep shadcn's box model here and strip the padding off the parts
          // below — otherwise that content sits flush against the panel edge.
          "p-[var(--probe-sheet-padding)]",
          // Same as dialog: the z-[999999] escalation that used to sit here is
          // gone with the page chrome it was fighting. Probe's own
          // --probe-sheet-z-index governs, scrim on the rung below.
          className,
        )}
        {...props}
      />
    );
  },
);

const SheetHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ProbeSheetHeader>>(
  function SheetHeader({ className, ...props }, ref) {
    return <ProbeSheetHeader ref={ref} className={cn("p-0", className)} {...props} />;
  },
);

const SheetFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ProbeSheetFooter>>(
  function SheetFooter({ className, ...props }, ref) {
    return <ProbeSheetFooter ref={ref} className={cn("p-0", className)} {...props} />;
  },
);

/** Probe-only. Not part of the shadcn API; the scrollable middle of a sheet. */
const SheetBody = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ProbeSheetBody>>(
  function SheetBody({ className, ...props }, ref) {
    return <ProbeSheetBody ref={ref} className={cn("px-0", className)} {...props} />;
  },
);

export { SheetContent, SheetHeader, SheetFooter, SheetBody };
export { SheetTitle, SheetDescription } from "@synehq-oos/ui";
