"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn, variants } from "../lib/cn";

/**
 * Sheet — the edge-anchored panel, built on `@radix-ui/react-dialog` (a sheet
 * IS a dialog to the accessibility tree; only the geometry differs). Radix owns
 * the focus trap, the scroll lock, `aria-modal`, Escape-to-close and focus
 * return.
 *
 * **A sheet is a viewer, not an editor.** Use it for a detail view of a row
 * while the list stays visible behind it. The moment it grows a wizard, more
 * than ~6 fields, or creates an object, it should have been a page — see
 * `docs/probe/product-philosophy.md`, "The surface ladder".
 *
 * **Sheets are addressable.** `open` / `onOpenChange` are Radix's, and the app
 * is expected to bind them to a query param rather than `useState`, so the
 * sheet survives a reload and can be linked to:
 *
 * ```tsx
 * const params = useSearchParams();
 * const router = useRouter();
 * const id = params.get("row");
 *
 * <Sheet
 *   open={id !== null}
 *   onOpenChange={(next) => {
 *     const q = new URLSearchParams(params);
 *     // Replace, never push: an overlay toggle is not a history entry, and
 *     // pushing turns Back into a trampoline between open and closed.
 *     next ? q.set("row", rowId) : q.delete("row");
 *     router.replace(`?${q}`, { scroll: false });
 *   }}
 * >
 * ```
 *
 * **Maximum overlay depth is one.** A sheet may not open a sheet. The single
 * exception is a `Confirm` over it, which is modal by nature and terminates
 * immediately — that is what the shared z-index scale exists for.
 */
const Sheet = SheetPrimitive.Root;
export type SheetProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Root>;

const SheetTrigger = SheetPrimitive.Trigger;
export type SheetTriggerProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Trigger>;

const SheetPortal = SheetPrimitive.Portal;
export type SheetPortalProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Portal>;

const SheetClose = SheetPrimitive.Close;
export type SheetCloseProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Close>;

export type SheetOverlayProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>;

/** The scrim. Rendered by `SheetContent`; exported for bespoke layouts. */
const SheetOverlay = forwardRef<ComponentRef<typeof SheetPrimitive.Overlay>, SheetOverlayProps>(
  function SheetOverlay({ className, ...props }, ref) {
    return (
      <SheetPrimitive.Overlay
        ref={ref}
        className={cn(
          "fixed inset-0",
          "bg-[color:var(--probe-sheet-scrim)]",
          "z-[var(--probe-sheet-scrim-z-index)]",
          "[animation-duration:var(--probe-sheet-animation-duration)]",
          "[animation-timing-function:var(--probe-sheet-animation-ease)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      />
    );
  },
);

/**
 * `size` publishes both axes and `side` consumes the one it needs, which is how
 * a single scale covers all four sides without a compound-variant table.
 */
const sheetContent = variants({
  base: [
    "fixed flex flex-col",
    "gap-[var(--probe-sheet-gap)]",
    "rounded-[var(--probe-sheet-radius)]",
    "border-solid border-[color:var(--probe-sheet-border)]",
    "bg-[color:var(--probe-sheet-background)]",
    "z-[var(--probe-sheet-z-index)]",
    "focus:outline-none",
    "[animation-duration:var(--probe-sheet-animation-duration)]",
    "[animation-timing-function:var(--probe-sheet-animation-ease)]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
  ].join(" "),
  variants: {
    side: {
      right: [
        "inset-y-0 right-0 h-full",
        "w-[var(--probe-sheet-inline)] max-w-[calc(100vw-var(--probe-sheet-inset))]",
        "border-l-[length:var(--probe-sheet-border-width)]",
        "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
      ].join(" "),
      left: [
        "inset-y-0 left-0 h-full",
        "w-[var(--probe-sheet-inline)] max-w-[calc(100vw-var(--probe-sheet-inset))]",
        "border-r-[length:var(--probe-sheet-border-width)]",
        "data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
      ].join(" "),
      top: [
        "inset-x-0 top-0 w-full",
        "h-[var(--probe-sheet-block)] max-h-[calc(100vh-var(--probe-sheet-inset))]",
        "border-b-[length:var(--probe-sheet-border-width)]",
        "data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
      ].join(" "),
      bottom: [
        "inset-x-0 bottom-0 w-full",
        "h-[var(--probe-sheet-block)] max-h-[calc(100vh-var(--probe-sheet-inset))]",
        "border-t-[length:var(--probe-sheet-border-width)]",
        "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
      ].join(" "),
    },
    size: {
      sm: "[--probe-sheet-inline:var(--probe-sheet-width-sm)] [--probe-sheet-block:var(--probe-sheet-height-sm)]",
      md: "[--probe-sheet-inline:var(--probe-sheet-width-md)] [--probe-sheet-block:var(--probe-sheet-height-md)]",
      lg: "[--probe-sheet-inline:var(--probe-sheet-width-lg)] [--probe-sheet-block:var(--probe-sheet-height-lg)]",
      xl: "[--probe-sheet-inline:var(--probe-sheet-width-xl)] [--probe-sheet-block:var(--probe-sheet-height-xl)]",
    },
  },
  defaultVariants: { side: "right", size: "md" },
});

export type SheetSide = "right" | "left" | "top" | "bottom";
export type SheetSize = "sm" | "md" | "lg" | "xl";

export type SheetContentProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
  /** Which edge it is anchored to. `right` is the detail-view default. */
  side?: SheetSide;
  /** One scale, both axes: width when side is left/right, height otherwise. */
  size?: SheetSize;
  /** The corner close button. A sheet is dismissable — keep it on. */
  showClose?: boolean;
  /** Accessible name for the close button. */
  closeLabel?: string;
};

/**
 * The panel. Renders its own overlay and portal.
 *
 * Every sheet needs a `SheetTitle`, or a screen reader announces an unnamed
 * modal. If it should not be visible, keep the element and hide it with
 * `sr-only`.
 *
 * @example
 * <Sheet open={open} onOpenChange={setOpen}>
 *   <SheetContent size="lg">
 *     <SheetHeader bordered>
 *       <SheetTitle>warehouse-prod</SheetTitle>
 *       <SheetDescription>Postgres 16 · us-east · connected 4m ago</SheetDescription>
 *     </SheetHeader>
 *     <SheetBody>
 *       <DataList>…</DataList>
 *     </SheetBody>
 *     <SheetFooter bordered>
 *       <SheetClose asChild><Button>Close</Button></SheetClose>
 *       <Button as="a" href="/connections/warehouse-prod/edit" variant="primary">Edit</Button>
 *     </SheetFooter>
 *   </SheetContent>
 * </Sheet>
 */
const SheetContent = forwardRef<ComponentRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  function SheetContent(
    {
      className,
      side = "right",
      size = "md",
      showClose = true,
      closeLabel = "Close",
      children,
      ...props
    },
    ref,
  ) {
    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={ref}
          className={sheetContent({ side, size, className })}
          {...props}
        >
          {children}
          {showClose ? (
            <SheetPrimitive.Close
              aria-label={closeLabel}
              className={cn(
                "absolute right-[var(--probe-sheet-padding)] top-[var(--probe-sheet-padding)]",
                "inline-flex items-center justify-center",
                "size-[var(--probe-sheet-close-size)]",
                "rounded-[var(--probe-sheet-close-radius)]",
                "bg-[color:var(--probe-sheet-close-background)]",
                "text-[color:var(--probe-sheet-close-text)]",
                "[transition:background-color_var(--probe-sheet-transition),color_var(--probe-sheet-transition)]",
                "hover:bg-[color:var(--probe-sheet-close-background--hover)]",
                "hover:text-[color:var(--probe-sheet-close-text--hover)]",
                "active:bg-[color:var(--probe-sheet-close-background--active)]",
                "focus-visible:outline focus-visible:outline-[length:var(--probe-sheet-focus-ring-width)]",
                "focus-visible:outline-offset-[var(--probe-sheet-focus-ring-offset)]",
                "focus-visible:outline-[color:var(--probe-sheet-focus-ring)]",
                "[&>svg]:size-[var(--probe-sheet-close-icon-size)]",
              )}
            >
              <X aria-hidden="true" />
            </SheetPrimitive.Close>
          ) : null}
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);

export type SheetHeaderProps = ComponentPropsWithoutRef<"div"> & {
  /** Draws the 1px rule under the header. Use it when the body scrolls. */
  bordered?: boolean;
};

const SheetHeader = forwardRef<HTMLDivElement, SheetHeaderProps>(function SheetHeader(
  { className, bordered = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex shrink-0 flex-col",
        "gap-[var(--probe-sheet-header-gap)]",
        "p-[var(--probe-sheet-padding)]",
        "pb-0",
        bordered &&
          "pb-[var(--probe-sheet-padding)] border-b-[length:var(--probe-sheet-border-width)] border-solid border-b-[color:var(--probe-sheet-header-border)]",
        className,
      )}
      {...props}
    />
  );
});

export type SheetTitleProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Title>;

const SheetTitle = forwardRef<ComponentRef<typeof SheetPrimitive.Title>, SheetTitleProps>(
  function SheetTitle({ className, ...props }, ref) {
    return (
      <SheetPrimitive.Title
        ref={ref}
        className={cn(
          // Room for the close button, so a long title never runs under it.
          "pr-[calc(var(--probe-sheet-close-size)+var(--probe-sheet-gap))]",
          "text-[color:var(--probe-sheet-title-text)]",
          "text-[length:var(--probe-sheet-title-font-size)]",
          "leading-[var(--probe-sheet-title-line-height)]",
          "[font-weight:var(--probe-sheet-title-font-weight)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export type SheetDescriptionProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Description>;

const SheetDescription = forwardRef<
  ComponentRef<typeof SheetPrimitive.Description>,
  SheetDescriptionProps
>(function SheetDescription({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Description
      ref={ref}
      className={cn(
        "text-[color:var(--probe-sheet-description-text)]",
        "text-[length:var(--probe-sheet-description-font-size)]",
        "leading-[var(--probe-sheet-description-line-height)]",
        className,
      )}
      {...props}
    />
  );
});

export type SheetBodyProps = ComponentPropsWithoutRef<"div">;

/** The scrollable middle. Header and footer stay put; only this moves. */
const SheetBody = forwardRef<HTMLDivElement, SheetBodyProps>(function SheetBody(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto",
        "px-[var(--probe-sheet-padding)]",
        "text-[color:var(--probe-sheet-body-text)]",
        "text-[length:var(--probe-sheet-body-font-size)]",
        "leading-[var(--probe-sheet-body-line-height)]",
        className,
      )}
      {...props}
    />
  );
});

export type SheetFooterProps = ComponentPropsWithoutRef<"div"> & {
  /** Draws the 1px rule above the footer. Use it when the body scrolls. */
  bordered?: boolean;
};

/**
 * Actions, trailing-aligned. In a sheet these are usually Close plus a link
 * *out* to the page that can actually edit the thing — not a submit.
 */
const SheetFooter = forwardRef<HTMLDivElement, SheetFooterProps>(function SheetFooter(
  { className, bordered = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex shrink-0 flex-col-reverse sm:flex-row sm:justify-end",
        "gap-[var(--probe-sheet-footer-gap)]",
        "p-[var(--probe-sheet-padding)]",
        "pt-0",
        bordered &&
          "pt-[var(--probe-sheet-padding)] border-t-[length:var(--probe-sheet-border-width)] border-solid border-t-[color:var(--probe-sheet-footer-border)]",
        className,
      )}
      {...props}
    />
  );
});

export {
  Sheet,
  SheetTrigger,
  SheetPortal,
  SheetOverlay,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
};
