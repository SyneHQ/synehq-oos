"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

import {
  DialogBody as ProbeDialogBody,
  DialogContent as ProbeDialogContent,
  DialogFooter as ProbeDialogFooter,
  DialogHeader as ProbeDialogHeader,
} from "@synehq-oos/ui";
import { cn } from "../../lib/utils";

/**
 * shadcn's Dialog, rendered by Probe. Probe's API is a superset, so the parts
 * with no geometry of their own pass straight through.
 */
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "@synehq-oos/ui";

type DialogContentProps = ComponentPropsWithoutRef<typeof ProbeDialogContent>;

const DialogContent = forwardRef<ComponentRef<typeof ProbeDialogContent>, DialogContentProps>(
  function DialogContent({ className, size, ...props }, ref) {
    return (
      <ProbeDialogContent
        ref={ref}
        size={size}
        className={cn(
          // This app sizes dialogs with `max-w-*` on the content. Probe instead
          // pins an explicit width per `size`, which wins over `max-w-*` and would
          // shrink every wide dialog here to 480px. Unless a caller opts into
          // Probe's scale, drop the pin and restore the width basis those
          // existing `max-w-*` classes were written against.
          size === undefined && "sm:w-[calc(100vw-2*var(--probe-dialog-padding))] max-w-3xl",
          // shadcn pads the content and leaves the parts bare; Probe does the
          // reverse. Call-sites drop loose children straight into the content, so
          // keep shadcn's box model here and strip the padding off the parts
          // below — otherwise that content sits flush against the panel edge.
          "p-[var(--probe-dialog-padding)]",
          // No z-index here on purpose. This used to carry z-[9999999] to outrank
          // page chrome that had escalated into the millions; that chrome is now
          // back in normal flow, so DialogContent inherits --probe-dialog-z-index
          // and its scrim the rung below. If a dialog ever loses a stacking race
          // again, fix the thing that climbed — do not re-raise this.
          className,
        )}
        {...props}
      />
    );
  },
);

const DialogHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ProbeDialogHeader>>(
  function DialogHeader({ className, ...props }, ref) {
    return <ProbeDialogHeader ref={ref} className={cn("p-0", className)} {...props} />;
  },
);

const DialogFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ProbeDialogFooter>>(
  function DialogFooter({ className, ...props }, ref) {
    return <ProbeDialogFooter ref={ref} className={cn("p-0", className)} {...props} />;
  },
);

/** Probe-only. Not part of the shadcn API; the scrollable middle of a dialog. */
const DialogBody = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ProbeDialogBody>>(
  function DialogBody({ className, ...props }, ref) {
    return <ProbeDialogBody ref={ref} className={cn("px-0", className)} {...props} />;
  },
);

export { DialogContent, DialogHeader, DialogFooter, DialogBody };
