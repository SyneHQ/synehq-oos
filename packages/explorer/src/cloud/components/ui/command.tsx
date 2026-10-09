"use client";

import * as React from "react";
import { DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";

import { cn } from "../../lib/utils";
import { Dialog, DialogContent } from "./dialog";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden",
      "bg-[color:var(--probe-menu-background)]",
      "text-[color:var(--probe-menu-item-text)]",
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({
  children,
  onCloseAutoFocus,
  ...props
}: DialogProps &
  Pick<React.ComponentPropsWithoutRef<typeof DialogContent>, "onCloseAutoFocus">) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0" onCloseAutoFocus={onCloseAutoFocus}>
        {/* Palette scale: a command palette is a destination, not a menu that
            drops out of a button, so rows and glyphs step up one size. The
            colour and weight overrides that used to live here are gone — the
            parts now read Probe's menu tokens directly. */}
        <Command
          className={cn(
            "[&_[cmdk-group]]:px-[var(--probe-menu-item-padding-x)]",
            "[&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0",
            "[&_[cmdk-input-wrapper]_svg]:size-5",
            "[&_[cmdk-input]]:h-12 [&_[cmdk-input]]:pr-12",
            "[&_[cmdk-item]]:py-[var(--probe-space-3)]",
            "[&_[cmdk-item]_svg]:size-5",
          )}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div
    className={cn(
      "flex items-center px-[var(--probe-space-3)]",
      "border-b-[length:var(--probe-border-width)] border-solid",
      "border-b-[color:var(--probe-menu-separator)]",
    )}
    cmdk-input-wrapper=""
  >
    <Search
      aria-hidden="true"
      className="mr-2 size-[var(--probe-input-icon-size)] shrink-0 text-[color:var(--probe-menu-item-icon)]"
    />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-[var(--probe-input-height-lg)] w-full bg-transparent outline-none",
        "text-[length:var(--probe-input-font-size)]",
        "text-[color:var(--probe-input-text)]",
        "placeholder:text-[color:var(--probe-input-placeholder)]",
        "disabled:cursor-not-allowed disabled:text-[color:var(--probe-input-text--disabled)]",
        className,
      )}
      {...props}
    />
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn(
      "py-[var(--probe-space-6)] text-center",
      "text-[length:var(--probe-field-hint-font-size)]",
      "text-[color:var(--probe-field-hint-text)]",
    )}
    {...props}
  />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden p-[var(--probe-menu-padding)]",
      "text-[color:var(--probe-menu-item-text)]",
      "[&_[cmdk-group-heading]]:px-[var(--probe-menu-item-padding-x)]",
      "[&_[cmdk-group-heading]]:py-[var(--probe-space-1)]",
      "[&_[cmdk-group-heading]]:text-[length:var(--probe-menu-label-font-size)]",
      "[&_[cmdk-group-heading]]:tracking-[var(--probe-menu-label-tracking)]",
      "[&_[cmdk-group-heading]]:text-[color:var(--probe-menu-label-text)]",
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn(
      "-mx-[var(--probe-menu-padding)] h-px",
      "bg-[color:var(--probe-menu-separator)]",
      className,
    )}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center outline-none",
      "min-h-[var(--probe-menu-item-height)]",
      "gap-[var(--probe-menu-item-gap)]",
      "px-[var(--probe-menu-item-padding-x)] py-[var(--probe-space-2)]",
      "rounded-[var(--probe-menu-radius)]",
      "text-[length:var(--probe-menu-item-font-size)]",
      "text-[color:var(--probe-menu-item-text)]",
      "aria-selected:bg-[color:var(--probe-menu-item-background--hover)]",
      "aria-selected:text-[color:var(--probe-menu-item-text--hover)]",
      "data-[disabled=true]:pointer-events-none",
      "data-[disabled=true]:text-[color:var(--probe-menu-item-text--disabled)]",
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-[length:var(--probe-menu-label-font-size)]",
        "tracking-[var(--probe-menu-label-tracking)]",
        "text-[color:var(--probe-menu-item-shortcut-text)]",
        className,
      )}
      {...props}
    />
  );
};
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
