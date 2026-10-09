"use client";

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";

import { cn } from "../lib/cn";

/**
 * DropdownMenu — `@radix-ui/react-dropdown-menu`. Radix owns typeahead, roving
 * focus, submenu timing, collision-aware placement and focus return.
 *
 * The surface reads the shared `--probe-menu-*` tokens — the same set `Select`
 * wears — so a dropdown and a select list are visually the same object. The
 * `--probe-dropdown-menu-*` tokens only add what a menu has and a select does
 * not: submenu chevrons, shortcut hints, check/radio indicators.
 */
const DropdownMenu = DropdownMenuPrimitive.Root;
export type DropdownMenuProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export type DropdownMenuTriggerProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Trigger
>;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export type DropdownMenuGroupProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Group>;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export type DropdownMenuPortalProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Portal>;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export type DropdownMenuSubProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Sub>;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export type DropdownMenuRadioGroupProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.RadioGroup
>;

/** The panel chrome, shared by the root content and every submenu. */
const surface = [
  "flex flex-col overflow-hidden",
  "min-w-[var(--probe-menu-min-width)]",
  "p-[var(--probe-menu-padding)]",
  "rounded-[var(--probe-menu-radius)]",
  "border-solid border-[length:var(--probe-menu-border-width)]",
  "border-[color:var(--probe-menu-border)]",
  "bg-[color:var(--probe-menu-background)]",
  "z-[var(--probe-menu-z-index)]",
  "[animation-duration:var(--probe-dropdown-menu-animation-duration)]",
  "[animation-timing-function:var(--probe-dropdown-menu-animation-ease)]",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
  "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
].join(" ");

/**
 * The row chrome. Radix marks the keyboard/pointer-focused row with
 * `data-highlighted` — one state for both input methods, which is why there is
 * no separate `:hover` rule here.
 */
const row = [
  "relative flex cursor-default select-none items-center outline-none",
  "h-[var(--probe-menu-item-height)]",
  "gap-[var(--probe-menu-item-gap)]",
  "px-[var(--probe-menu-item-padding-x)]",
  "rounded-[var(--probe-dropdown-menu-item-radius)]",
  "text-[length:var(--probe-menu-item-font-size)]",
  "leading-[var(--probe-dropdown-menu-item-line-height)]",
  "bg-[color:var(--probe-menu-item-background)]",
  "text-[color:var(--probe-menu-item-text)]",
  "[transition:background-color_var(--probe-dropdown-menu-transition),color_var(--probe-dropdown-menu-transition)]",
  "data-[highlighted]:bg-[color:var(--probe-menu-item-background--hover)]",
  "data-[highlighted]:text-[color:var(--probe-menu-item-text--hover)]",
  "active:bg-[color:var(--probe-menu-item-background--active)]",
  "data-[state=open]:bg-[color:var(--probe-menu-item-background--selected)]",
  "data-[disabled]:pointer-events-none",
  "data-[disabled]:bg-[color:var(--probe-menu-item-background--disabled)]",
  "data-[disabled]:text-[color:var(--probe-menu-item-text--disabled)]",
  "[&>svg]:size-[var(--probe-dropdown-menu-icon-size)] [&>svg]:shrink-0",
  "[&>svg]:text-[color:var(--probe-menu-item-icon)]",
  // A critical row recolours text AND icon, and washes critical on highlight.
  "data-[tone=critical]:text-[color:var(--probe-menu-item-text--critical)]",
  "data-[tone=critical]:[&>svg]:text-[color:var(--probe-menu-item-text--critical)]",
  "data-[tone=critical]:data-[highlighted]:bg-[color:var(--probe-menu-item-background--critical-hover)]",
  "data-[tone=critical]:data-[highlighted]:text-[color:var(--probe-menu-item-text--critical)]",
].join(" ");

/** Left gutter that keeps labels aligned whether or not a row is indicated. */
const indicatorSlot =
  "absolute left-[var(--probe-menu-item-padding-x)] inline-flex w-[var(--probe-dropdown-menu-indicator-size)] items-center justify-center";
const indicatorInset =
  "pl-[calc(var(--probe-menu-item-padding-x)+var(--probe-dropdown-menu-indicator-width))]";

export type DropdownMenuContentProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Content
>;

/**
 * The menu panel. Portalled, so it escapes `overflow: hidden` ancestors.
 *
 * @example
 * <DropdownMenu>
 *   <DropdownMenuTrigger asChild>
 *     <IconButton label="Row actions" icon={<MoreHorizontal />} />
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent align="end">
 *     <DropdownMenuLabel>api-gateway</DropdownMenuLabel>
 *     <DropdownMenuItem icon={<Play />}>Deploy
 *       <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
 *     </DropdownMenuItem>
 *     <DropdownMenuSeparator />
 *     <DropdownMenuItem tone="critical" icon={<Trash2 />}>Delete</DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 */
const DropdownMenuContent = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(function DropdownMenuContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(surface, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export type DropdownMenuItemProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  /** `critical` recolours the row for a destructive action. */
  tone?: "neutral" | "critical";
  /** Leading glyph. Decorative — the label carries the meaning. */
  icon?: ReactNode;
  /** Reserves the indicator gutter so this row lines up with checkable ones. */
  inset?: boolean;
};

const DropdownMenuItem = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(function DropdownMenuItem(
  { className, tone = "neutral", icon, inset = false, children, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      data-tone={tone}
      className={cn(row, inset && indicatorInset, className)}
      {...props}
    >
      {/* With `asChild` the caller's own element *is* the row — usually a
          link, so the row gets a real href. Radix clones that element and
          requires exactly one child, so the icon slot and the truncating
          span cannot be wrapped around it: the pair makes `Children.only`
          throw and the whole menu fails to render. The caller lays out its
          own contents instead, and `row` still styles them. */}
      {props.asChild ? (
        children
      ) : (
        <>
          {icon}
          <span className="flex-1 truncate">{children}</span>
        </>
      )}
    </DropdownMenuPrimitive.Item>
  );
});

export type DropdownMenuCheckboxItemProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.CheckboxItem
>;

const DropdownMenuCheckboxItem = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  DropdownMenuCheckboxItemProps
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        row,
        indicatorInset,
        "data-[state=checked]:text-[color:var(--probe-menu-item-text--selected)]",
        className,
      )}
      {...props}
    >
      <span className={indicatorSlot}>
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-[var(--probe-dropdown-menu-indicator-size)]" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      <span className="flex-1 truncate">{children}</span>
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

export type DropdownMenuRadioItemProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.RadioItem
>;

const DropdownMenuRadioItem = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.RadioItem>,
  DropdownMenuRadioItemProps
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        row,
        indicatorInset,
        "data-[state=checked]:text-[color:var(--probe-menu-item-text--selected)]",
        className,
      )}
      {...props}
    >
      <span className={indicatorSlot}>
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle
            aria-hidden="true"
            className="size-[calc(var(--probe-dropdown-menu-indicator-size)/2)] fill-current"
          />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      <span className="flex-1 truncate">{children}</span>
    </DropdownMenuPrimitive.RadioItem>
  );
});

export type DropdownMenuLabelProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>;

/** A tiny uppercase section heading — the same treatment as SideNav sections. */
const DropdownMenuLabel = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Label>,
  DropdownMenuLabelProps
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        "px-[var(--probe-menu-item-padding-x)]",
        "py-[var(--probe-dropdown-menu-label-padding-y)]",
        "text-[length:var(--probe-menu-label-font-size)]",
        "leading-[var(--probe-dropdown-menu-label-line-height)]",
        "tracking-[var(--probe-menu-label-tracking)]",
        "[font-weight:var(--probe-dropdown-menu-label-font-weight)]",
        "text-[color:var(--probe-menu-label-text)]",
        "uppercase",
        className,
      )}
      {...props}
    />
  );
});

export type DropdownMenuSeparatorProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Separator
>;

const DropdownMenuSeparator = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  DropdownMenuSeparatorProps
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn(
        "h-px shrink-0",
        "my-[var(--probe-dropdown-menu-separator-margin-y)]",
        "-mx-[var(--probe-menu-padding)]",
        "bg-[color:var(--probe-menu-separator)]",
        className,
      )}
      {...props}
    />
  );
});

export type DropdownMenuShortcutProps = ComponentPropsWithoutRef<"span">;

/**
 * The keyboard hint at the end of a row. `aria-hidden`: the shortcut is a
 * pointer-user affordance, and a screen reader reading "Delete ⌘⌫" adds noise
 * to a menu it is already navigating by keyboard.
 */
const DropdownMenuShortcut = forwardRef<HTMLSpanElement, DropdownMenuShortcutProps>(
  function DropdownMenuShortcut({ className, ...props }, ref) {
    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={cn(
          "ml-auto inline-flex shrink-0 items-center",
          "gap-[var(--probe-dropdown-menu-shortcut-gap)]",
          "text-[length:var(--probe-dropdown-menu-shortcut-font-size)]",
          "text-[color:var(--probe-menu-item-shortcut-text)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export type DropdownMenuSubTriggerProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.SubTrigger
> & {
  icon?: ReactNode;
};

const DropdownMenuSubTrigger = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>,
  DropdownMenuSubTriggerProps
>(function DropdownMenuSubTrigger({ className, icon, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubTrigger ref={ref} className={cn(row, className)} {...props}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      <ChevronRight
        aria-hidden="true"
        className="ml-auto size-[var(--probe-dropdown-menu-icon-size)] text-[color:var(--probe-menu-item-icon)]"
      />
    </DropdownMenuPrimitive.SubTrigger>
  );
});

export type DropdownMenuSubContentProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.SubContent
>;

const DropdownMenuSubContent = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.SubContent>,
  DropdownMenuSubContentProps
>(function DropdownMenuSubContent({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubContent ref={ref} className={cn(surface, className)} {...props} />
  );
});

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
