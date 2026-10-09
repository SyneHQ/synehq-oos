"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "../lib/cn";

/**
 * Popover — `@radix-ui/react-popover`. The interactive sibling of `Tooltip`:
 * it takes focus, traps nothing, closes on Escape and on outside click, and
 * returns focus to the trigger. Put links, inputs and buttons in here; put
 * bare labels in a `Tooltip`.
 *
 * Unlike `Dialog` it does not block the page. If the user must deal with it
 * before anything else, that is a `Dialog`.
 */
const Popover = PopoverPrimitive.Root;
export type PopoverProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>;

const PopoverTrigger = PopoverPrimitive.Trigger;
export type PopoverTriggerProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>;

/** Positions the popover against something other than its trigger. */
const PopoverAnchor = PopoverPrimitive.Anchor;
export type PopoverAnchorProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>;

const PopoverClose = PopoverPrimitive.Close;
export type PopoverCloseProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Close>;

export type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  /** The triangle pointing back at the trigger. Off by default. */
  arrow?: boolean;
};

/**
 * The panel. Portalled, square, 1px border, no shadow — depth comes from the
 * border plus `surface-overlay` sitting one step off the page.
 *
 * @example
 * <Popover>
 *   <PopoverTrigger asChild>
 *     <Button iconEnd={<ChevronDown />}>Filters</Button>
 *   </PopoverTrigger>
 *   <PopoverContent align="start">
 *     <PopoverTitle>Filter runs</PopoverTitle>
 *     <PopoverDescription>Applies to this view only.</PopoverDescription>
 *     <Field label="Status"><Select>…</Select></Field>
 *   </PopoverContent>
 * </Popover>
 */
const PopoverContent = forwardRef<
  ComponentRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent(
  { className, align = "center", sideOffset = 6, arrow = false, children, ...props },
  ref,
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "flex flex-col",
          "gap-[var(--probe-popover-gap)]",
          "w-max max-w-[var(--probe-popover-max-width)]",
          "p-[var(--probe-popover-padding)]",
          "rounded-[var(--probe-popover-radius)]",
          "border-solid border-[length:var(--probe-popover-border-width)]",
          "border-[color:var(--probe-popover-border)]",
          "bg-[color:var(--probe-popover-background)]",
          "text-[color:var(--probe-popover-text)]",
          "text-[length:var(--probe-popover-font-size)]",
          "leading-[var(--probe-popover-line-height)]",
          "z-[var(--probe-popover-z-index)]",
          "focus-visible:outline focus-visible:outline-[length:var(--probe-popover-focus-ring-width)]",
          "focus-visible:outline-offset-[var(--probe-popover-focus-ring-offset)]",
          "focus-visible:outline-[color:var(--probe-popover-focus-ring)]",
          "[animation-duration:var(--probe-popover-animation-duration)]",
          "[animation-timing-function:var(--probe-popover-animation-ease)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
          "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
          className,
        )}
        {...props}
      >
        {children}
        {arrow ? (
          <PopoverPrimitive.Arrow
            className={cn(
              "fill-[var(--probe-popover-arrow)]",
              "stroke-[var(--probe-popover-arrow-border)]",
              "h-[var(--probe-popover-arrow-size)]",
              "w-[calc(var(--probe-popover-arrow-size)*2)]",
            )}
          />
        ) : null}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
});

export type PopoverTitleProps = ComponentPropsWithoutRef<"h2">;

/**
 * Names the popover. Wire it up with `aria-labelledby` on `PopoverContent`
 * when the popover has no other accessible name.
 */
const PopoverTitle = forwardRef<HTMLHeadingElement, PopoverTitleProps>(function PopoverTitle(
  { className, ...props },
  ref,
) {
  return (
    <h2
      ref={ref}
      className={cn(
        "text-[color:var(--probe-popover-title-text)]",
        "text-[length:var(--probe-popover-title-font-size)]",
        "leading-[var(--probe-popover-title-line-height)]",
        "[font-weight:var(--probe-popover-title-font-weight)]",
        className,
      )}
      {...props}
    />
  );
});

export type PopoverDescriptionProps = ComponentPropsWithoutRef<"p">;

const PopoverDescription = forwardRef<HTMLParagraphElement, PopoverDescriptionProps>(
  function PopoverDescription({ className, ...props }, ref) {
    return (
      <p
        ref={ref}
        className={cn(
          "text-[color:var(--probe-popover-description-text)]",
          "text-[length:var(--probe-popover-description-font-size)]",
          "leading-[var(--probe-popover-description-line-height)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export {
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
};
