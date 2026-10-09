"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

import {
  DropdownMenuContent as ProbeDropdownMenuContent,
  DropdownMenuItem as ProbeDropdownMenuItem,
  DropdownMenuSubTrigger as ProbeDropdownMenuSubTrigger,
} from "@synehq-oos/ui";
import { cn } from "../../lib/utils";

/**
 * shadcn's DropdownMenu, rendered by Probe. The two export sets are identical,
 * so every part without a layout quirk to reconcile passes straight through.
 */
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSubContent,
} from "@synehq-oos/ui";

/**
 * Probe wraps a row's children in a `flex-1 truncate` span so long labels
 * ellipsize. shadcn call-sites instead lay their children out on the row
 * itself — `gap-2` between icon and label, `justify-between` with a trailing
 * check — and that wrapper swallows all of it, collapsing them into one flex
 * child. `display: contents` drops the wrapper out of layout so those rules
 * land on the real children again.
 *
 * Only safe on Item and SubTrigger: the checkable rows use a second direct
 * span as the indicator gutter, which this would flatten.
 */
const unwrapLabel = "[&>span]:contents";

export type DropdownMenuContentProps = ComponentPropsWithoutRef<typeof ProbeDropdownMenuContent>;

/**
 * Probe's menu gives the panel a min width but no cap. shadcn's 16rem cap is
 * what keeps one long row from stretching the whole menu, and with the row
 * wrapper neutralised above nothing else truncates, so it stays.
 */
export const DropdownMenuContent = forwardRef<
  ComponentRef<typeof ProbeDropdownMenuContent>,
  DropdownMenuContentProps
>(function DropdownMenuContent({ className, ...props }, ref) {
  return (
    <ProbeDropdownMenuContent ref={ref} className={cn("max-w-[16rem]", className)} {...props} />
  );
});

export type DropdownMenuItemProps = ComponentPropsWithoutRef<typeof ProbeDropdownMenuItem>;

export const DropdownMenuItem = forwardRef<
  ComponentRef<typeof ProbeDropdownMenuItem>,
  DropdownMenuItemProps
>(function DropdownMenuItem({ className, ...props }, ref) {
  return <ProbeDropdownMenuItem ref={ref} className={cn(unwrapLabel, className)} {...props} />;
});

export type DropdownMenuSubTriggerProps = ComponentPropsWithoutRef<
  typeof ProbeDropdownMenuSubTrigger
>;

export const DropdownMenuSubTrigger = forwardRef<
  ComponentRef<typeof ProbeDropdownMenuSubTrigger>,
  DropdownMenuSubTriggerProps
>(function DropdownMenuSubTrigger({ className, ...props }, ref) {
  return (
    <ProbeDropdownMenuSubTrigger ref={ref} className={cn(unwrapLabel, className)} {...props} />
  );
});
