"use client";

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn, variants } from "../lib/cn";
import type { ProbeSize } from "../lib/types";
import { useFieldControl, type FieldControlProps } from "./field";

/**
 * Select — `@radix-ui/react-select` with a square Probe menu.
 *
 * Radix owns the hard parts (typeahead, collision-aware positioning, focus
 * return, `aria-activedescendant`-free roving focus); Probe supplies the skin.
 * The list is styled from the shared `--probe-menu-*` tokens, so a Select menu
 * and a DropdownMenu are the same object visually.
 *
 * Put `required`/`name` on `Select` itself — they belong to the form control,
 * not the button. `disabled` may go on either.
 *
 * @example
 * <Field label="Warehouse" hint="Where previews run." required>
 *   <Select name="warehouse" required defaultValue="prod">
 *     <SelectTrigger placeholder="Pick one" />
 *     <SelectContent>
 *       <SelectGroup>
 *         <SelectLabel>Production</SelectLabel>
 *         <SelectItem value="prod">prod-eu-1</SelectItem>
 *         <SelectItem value="prod-us">prod-us-1</SelectItem>
 *       </SelectGroup>
 *       <SelectSeparator />
 *       <SelectItem value="dev" disabled>dev (offline)</SelectItem>
 *     </SelectContent>
 *   </Select>
 * </Field>
 */
const Select = SelectPrimitive.Root;
export type SelectProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Root>;

const SelectGroup = SelectPrimitive.Group;
export type SelectGroupProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Group>;

/**
 * The trigger box. Same geometry as `Input` so the two line up in a form grid.
 * Invalid/disabled precedence is carried by selector weight, not source order.
 */
const selectTrigger = variants({
  base: [
    "group flex w-full min-w-0 items-center justify-between whitespace-nowrap text-left [&>span:first-child]:min-w-0 [&>span:first-child]:truncate",
    "gap-[var(--probe-select-gap)] px-[var(--probe-select-padding-x)]",
    "rounded-[var(--probe-select-radius)]",
    "border-[length:var(--probe-select-border-width)] border-[color:var(--probe-select-border)]",
    "bg-[color:var(--probe-select-background)]",
    "text-[length:var(--probe-select-font-size)] leading-[var(--probe-select-line-height)]",
    "tracking-[var(--probe-select-tracking)] text-[color:var(--probe-select-text)]",
    "[transition:border-color_var(--probe-select-transition),background-color_var(--probe-select-transition)]",
    "data-[placeholder]:text-[color:var(--probe-select-text--placeholder)]",
    "hover:border-[color:var(--probe-select-border--hover)]",
    "hover:bg-[color:var(--probe-select-background--hover)]",
    "focus-visible:border-[color:var(--probe-select-border--focus)] focus-visible:outline",
    "focus-visible:outline-[length:var(--probe-select-focus-ring-width)]",
    "focus-visible:outline-offset-[var(--probe-select-focus-ring-offset)]",
    "focus-visible:outline-[color:var(--probe-select-focus-ring)]",
    "data-[invalid]:border-[color:var(--probe-select-border--invalid)]",
    "data-[invalid]:hover:border-[color:var(--probe-select-border--invalid--hover)]",
    "data-[invalid]:focus-visible:outline-[color:var(--probe-select-focus-ring--invalid)]",
    "data-[disabled]:pointer-events-none",
    "data-[disabled]:border-[color:var(--probe-select-border--disabled)]",
    "data-[disabled]:bg-[color:var(--probe-select-background--disabled)]",
    "data-[disabled]:text-[color:var(--probe-select-text--disabled)]",
  ].join(" "),
  variants: {
    size: {
      sm: "h-[var(--probe-select-height-sm)]",
      md: "h-[var(--probe-select-height-md)]",
      lg: "h-[var(--probe-select-height-lg)]",
    },
  },
  defaultVariants: { size: "md" },
});

export type SelectTriggerProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> &
  FieldControlProps & {
    /** Control height: 32 / 36 / 40px. */
    size?: ProbeSize;
    /** Shown until something is selected. */
    placeholder?: ReactNode;
  };

/**
 * The button that opens the list. It renders the selected value itself — pass
 * `children` only to override how that value is displayed.
 *
 * Inside a `Field` it inherits the id, `aria-describedby` and `aria-invalid`.
 * A `Field`'s `required` becomes `aria-required` here, because `required` is
 * not a valid attribute on a button — put the real one on `Select`.
 *
 * @example
 * <SelectTrigger size="sm" placeholder="Any status" />
 */
const SelectTrigger = forwardRef<ComponentRef<typeof SelectPrimitive.Trigger>, SelectTriggerProps>(
  function SelectTrigger(
    { className, size = "md", invalid, placeholder, children, ...props },
    ref,
  ) {
    const { required, ...control } = useFieldControl({ ...props, invalid });
    const isInvalid = control["aria-invalid"] === true;

    return (
      <SelectPrimitive.Trigger
        ref={ref}
        aria-required={required || undefined}
        data-invalid={isInvalid || undefined}
        className={selectTrigger({ size, className })}
        {...control}
      >
        <SelectPrimitive.Value
          className="min-w-0 flex-1 truncate text-left"
          placeholder={placeholder}
        >
          {children}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "shrink-0",
              "h-[var(--probe-select-icon-size)] w-[var(--probe-select-icon-size)]",
              "text-[color:var(--probe-select-indicator)]",
              "[transition:transform_var(--probe-select-transition)]",
              "group-data-[state=open]:rotate-180",
              "group-data-[disabled]:text-[color:var(--probe-select-indicator--disabled)]",
            )}
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
    );
  },
);

/** Both scroll affordances are the same strip of chrome. */
const SCROLL_BUTTON = [
  "flex cursor-default items-center justify-center",
  "h-[var(--probe-menu-item-height)]",
  "bg-[color:var(--probe-menu-background)]",
  "text-[color:var(--probe-menu-item-icon)]",
  "[&>svg]:h-[var(--probe-select-icon-size)] [&>svg]:w-[var(--probe-select-icon-size)]",
].join(" ");

export type SelectContentProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Content>;

/**
 * The menu. Portalled, so it escapes any `overflow: hidden` ancestor, and at
 * least as wide as the trigger. Square, 1px-bordered, unshadowed.
 *
 * @example
 * <SelectContent>
 *   <SelectItem value="1h">Last hour</SelectItem>
 * </SelectContent>
 */
const SelectContent = forwardRef<ComponentRef<typeof SelectPrimitive.Content>, SelectContentProps>(
  function SelectContent({ className, children, position = "popper", ...rest }, ref) {
    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          ref={ref}
          position={position}
          // 4px — the base grid. Radix needs a number here, not a token.
          sideOffset={4}
          className={cn(
            "relative overflow-hidden",
            "z-[var(--probe-menu-z-index)]",
            // The trigger width is only published in popper mode; fall back to
            // the menu's own minimum when a caller opts into item-aligned.
            "min-w-[max(var(--probe-menu-min-width),var(--radix-select-trigger-width,0px))]",
            "max-h-[var(--radix-select-content-available-height)]",
            "rounded-[var(--probe-menu-radius)]",
            "border-[length:var(--probe-menu-border-width)] border-[color:var(--probe-menu-border)]",
            "bg-[color:var(--probe-menu-background)]",
            className,
          )}
          {...rest}
        >
          <SelectPrimitive.ScrollUpButton className={SCROLL_BUTTON}>
            <ChevronUp aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-[var(--probe-menu-padding)]">
            {children}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className={SCROLL_BUTTON}>
            <ChevronDown aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  },
);

export type SelectItemProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Item>;

/**
 * One option. The selected one is marked by a check *and* an accent colour —
 * colour alone is never the signal.
 *
 * @example
 * <SelectItem value="24h">Last 24 hours</SelectItem>
 */
const SelectItem = forwardRef<ComponentRef<typeof SelectPrimitive.Item>, SelectItemProps>(
  function SelectItem({ className, children, ...rest }, ref) {
    return (
      <SelectPrimitive.Item
        ref={ref}
        className={cn(
          "relative flex cursor-pointer select-none items-center outline-none",
          "min-h-[var(--probe-menu-item-height)]",
          "gap-[var(--probe-menu-item-gap)]",
          "px-[var(--probe-menu-item-padding-x)] py-[var(--probe-menu-padding)]",
          "rounded-[var(--probe-menu-radius)]",
          "text-[length:var(--probe-menu-item-font-size)]",
          "text-[color:var(--probe-menu-item-text)]",
          "[transition:background-color_var(--probe-select-transition),color_var(--probe-select-transition)]",
          "data-[highlighted]:bg-[color:var(--probe-menu-item-background--hover)]",
          "data-[highlighted]:text-[color:var(--probe-menu-item-text--hover)]",
          "data-[state=checked]:text-[color:var(--probe-menu-item-text--selected)]",
          "data-[disabled]:pointer-events-none",
          "data-[disabled]:text-[color:var(--probe-menu-item-text--disabled)]",
          className,
        )}
        {...rest}
      >
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        <SelectPrimitive.ItemIndicator className="ml-auto flex shrink-0 items-center">
          <Check
            aria-hidden="true"
            className="h-[var(--probe-select-icon-size)] w-[var(--probe-select-icon-size)]"
          />
        </SelectPrimitive.ItemIndicator>
      </SelectPrimitive.Item>
    );
  },
);

export type SelectLabelProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Label>;

/**
 * A heading for a `SelectGroup`. Tiny, uppercase, wide-tracked.
 *
 * @example
 * <SelectGroup><SelectLabel>Regions</SelectLabel>…</SelectGroup>
 */
const SelectLabel = forwardRef<ComponentRef<typeof SelectPrimitive.Label>, SelectLabelProps>(
  function SelectLabel({ className, ...rest }, ref) {
    return (
      <SelectPrimitive.Label
        ref={ref}
        className={cn(
          "px-[var(--probe-menu-item-padding-x)] py-[var(--probe-menu-padding)]",
          "text-[length:var(--probe-menu-label-font-size)]",
          "uppercase tracking-[var(--probe-menu-label-tracking)]",
          "text-[color:var(--probe-menu-label-text)]",
          className,
        )}
        {...rest}
      />
    );
  },
);

export type SelectSeparatorProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>;

/**
 * A 1px rule between groups of options.
 *
 * @example
 * <SelectSeparator />
 */
const SelectSeparator = forwardRef<
  ComponentRef<typeof SelectPrimitive.Separator>,
  SelectSeparatorProps
>(function SelectSeparator({ className, ...rest }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn(
        "-mx-[var(--probe-menu-padding)] my-[var(--probe-menu-padding)]",
        "h-[var(--probe-menu-border-width)]",
        "bg-[color:var(--probe-menu-separator)]",
        className,
      )}
      {...rest}
    />
  );
});

export {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
};
