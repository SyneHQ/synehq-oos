"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn, variants } from "../lib/cn";

/**
 * Dialog — `@radix-ui/react-dialog`. Radix owns the focus trap, the scroll
 * lock, `aria-modal`, Escape-to-close and focus return; Probe supplies the
 * skin. Do not hand-roll any of that.
 *
 * Every dialog needs a `DialogTitle`. Radix will warn loudly if one is missing,
 * because without it a screen reader announces an unnamed modal. If the title
 * should not be visible, keep the element and hide it with `sr-only`.
 */
const Dialog = DialogPrimitive.Root;
export type DialogProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Root>;

const DialogTrigger = DialogPrimitive.Trigger;
export type DialogTriggerProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>;

const DialogPortal = DialogPrimitive.Portal;
export type DialogPortalProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>;

const DialogClose = DialogPrimitive.Close;
export type DialogCloseProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Close>;

export type DialogOverlayProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>;

/** The scrim. Rendered by `DialogContent`; exported for bespoke layouts. */
const DialogOverlay = forwardRef<ComponentRef<typeof DialogPrimitive.Overlay>, DialogOverlayProps>(
  function DialogOverlay({ className, ...props }, ref) {
    return (
      <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
          "fixed inset-0",
          "bg-[color:var(--probe-dialog-scrim)]",
          "z-[var(--probe-dialog-scrim-z-index)]",
          "[animation-duration:var(--probe-dialog-animation-duration)]",
          "[animation-timing-function:var(--probe-dialog-animation-ease)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      />
    );
  },
);

const dialogContent = variants({
  base: [
    "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    "flex w-[calc(100vw-2*var(--probe-dialog-padding))] flex-col",
    "max-h-[var(--probe-dialog-max-height)]",
    "gap-[var(--probe-dialog-gap)]",
    "rounded-[var(--probe-dialog-radius)]",
    "border-solid border-[length:var(--probe-dialog-border-width)]",
    "border-[color:var(--probe-dialog-border)]",
    "bg-[color:var(--probe-dialog-background)]",
    "z-[var(--probe-dialog-z-index)]",
    "focus:outline-none",
    "[animation-duration:var(--probe-dialog-animation-duration)]",
    "[animation-timing-function:var(--probe-dialog-animation-ease)]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  ].join(" "),
  variants: {
    size: {
      sm: "sm:w-[var(--probe-dialog-width-sm)]",
      md: "sm:w-[var(--probe-dialog-width-md)]",
      lg: "sm:w-[var(--probe-dialog-width-lg)]",
    },
  },
  defaultVariants: { size: "md" },
});

export type DialogSize = "sm" | "md" | "lg";

export type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** 400 / 480 / 640px at `sm` breakpoint and up; full-bleed below it. */
  size?: DialogSize;
  /**
   * The corner close button. Keep it on unless the dialog is a decision the
   * user must actually make — and even then, Escape still closes it, so an
   * un-dismissable dialog needs `onEscapeKeyDown` handling too.
   */
  showClose?: boolean;
  /** Accessible name for the close button. */
  closeLabel?: string;
};

/**
 * The modal panel. Renders its own overlay and portal.
 *
 * @example
 * <Dialog>
 *   <DialogTrigger asChild><Button variant="critical">Delete service</Button></DialogTrigger>
 *   <DialogContent size="sm">
 *     <DialogHeader>
 *       <DialogTitle>Delete api-gateway?</DialogTitle>
 *       <DialogDescription>This removes every deploy and log. It cannot be undone.</DialogDescription>
 *     </DialogHeader>
 *     <DialogBody>
 *       <Field label="Type the service name to confirm"><Input /></Field>
 *     </DialogBody>
 *     <DialogFooter>
 *       <DialogClose asChild><Button>Cancel</Button></DialogClose>
 *       <Button variant="critical">Delete</Button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 */
const DialogContent = forwardRef<ComponentRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  function DialogContent(
    { className, size = "md", showClose = true, closeLabel = "Close", children, ...props },
    ref,
  ) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={dialogContent({ size, className })}
          {...props}
        >
          {children}
          {showClose ? (
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className={cn(
                // `end`, not `right`: a dialog rendered with `dir="rtl"` puts its
                // close button on the left, where that reading direction expects
                // it. Identical to `right` in LTR.
                "absolute end-[var(--probe-dialog-padding)] top-[var(--probe-dialog-padding)]",
                "inline-flex items-center justify-center",
                "size-[var(--probe-dialog-close-size)]",
                "rounded-[var(--probe-dialog-close-radius)]",
                "bg-[color:var(--probe-dialog-close-background)]",
                "text-[color:var(--probe-dialog-close-text)]",
                "[transition:background-color_var(--probe-dialog-transition),color_var(--probe-dialog-transition)]",
                "hover:bg-[color:var(--probe-dialog-close-background--hover)]",
                "hover:text-[color:var(--probe-dialog-close-text--hover)]",
                "active:bg-[color:var(--probe-dialog-close-background--active)]",
                "focus-visible:outline focus-visible:outline-[length:var(--probe-dialog-focus-ring-width)]",
                "focus-visible:outline-offset-[var(--probe-dialog-focus-ring-offset)]",
                "focus-visible:outline-[color:var(--probe-dialog-focus-ring)]",
                "[&>svg]:size-[var(--probe-dialog-close-icon-size)]",
              )}
            >
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);

export type DialogHeaderProps = ComponentPropsWithoutRef<"div"> & {
  /** Draws the 1px rule under the header. Use it when the body scrolls. */
  bordered?: boolean;
};

const DialogHeader = forwardRef<HTMLDivElement, DialogHeaderProps>(function DialogHeader(
  { className, bordered = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex shrink-0 flex-col",
        "gap-[var(--probe-dialog-header-gap)]",
        "p-[var(--probe-dialog-padding)]",
        "pb-0",
        bordered &&
          "pb-[var(--probe-dialog-padding)] border-b-[length:var(--probe-dialog-border-width)] border-solid border-b-[color:var(--probe-dialog-header-border)]",
        className,
      )}
      {...props}
    />
  );
});

export type DialogTitleProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Title>;

const DialogTitle = forwardRef<ComponentRef<typeof DialogPrimitive.Title>, DialogTitleProps>(
  function DialogTitle({ className, ...props }, ref) {
    return (
      <DialogPrimitive.Title
        ref={ref}
        className={cn(
          // Room for the close button, so a long title never runs under it.
          "pr-[calc(var(--probe-dialog-close-size)+var(--probe-dialog-gap))]",
          "text-[color:var(--probe-dialog-title-text)]",
          "text-[length:var(--probe-dialog-title-font-size)]",
          "leading-[var(--probe-dialog-title-line-height)]",
          "[font-weight:var(--probe-dialog-title-font-weight)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export type DialogDescriptionProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Description>;

const DialogDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  DialogDescriptionProps
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn(
        "text-[color:var(--probe-dialog-description-text)]",
        "text-[length:var(--probe-dialog-description-font-size)]",
        "leading-[var(--probe-dialog-description-line-height)]",
        className,
      )}
      {...props}
    />
  );
});

export type DialogBodyProps = ComponentPropsWithoutRef<"div">;

/** The scrollable middle. Header and footer stay put; only this moves. */
const DialogBody = forwardRef<HTMLDivElement, DialogBodyProps>(function DialogBody(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto",
        "px-[var(--probe-dialog-padding)]",
        "text-[color:var(--probe-dialog-body-text)]",
        "text-[length:var(--probe-dialog-body-font-size)]",
        "leading-[var(--probe-dialog-body-line-height)]",
        className,
      )}
      {...props}
    />
  );
});

export type DialogFooterProps = ComponentPropsWithoutRef<"div"> & {
  /** Draws the 1px rule above the footer. Use it when the body scrolls. */
  bordered?: boolean;
};

/**
 * Actions, trailing-aligned. Put the confirming action last: it is the one
 * closest to the natural resting place of the pointer and the last thing a
 * screen reader reaches.
 */
const DialogFooter = forwardRef<HTMLDivElement, DialogFooterProps>(function DialogFooter(
  { className, bordered = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex shrink-0 flex-col-reverse sm:flex-row sm:justify-end",
        "gap-[var(--probe-dialog-footer-gap)]",
        "p-[var(--probe-dialog-padding)]",
        "pt-0",
        bordered &&
          "pt-[var(--probe-dialog-padding)] border-t-[length:var(--probe-dialog-border-width)] border-solid border-t-[color:var(--probe-dialog-footer-border)]",
        className,
      )}
      {...props}
    />
  );
});

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
};
