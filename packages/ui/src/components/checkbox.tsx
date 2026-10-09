"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "../lib/cn";
import { useFieldControl, type FieldControlProps } from "./field";

/**
 * `true | false | "indeterminate"` — Radix's tri-state, re-exported so callers
 * can type their own state without importing Radix directly.
 */
export type CheckboxCheckedState = NonNullable<
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>["checked"]
>;

export type CheckboxProps = ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> &
  FieldControlProps;

/**
 * Checkbox — `@radix-ui/react-checkbox`, 16px and square.
 *
 * It renders no label of its own: wrap it in `<Field orientation="inline">`,
 * which owns the label, the hint, the error and the id wiring. The 16px box
 * keeps a 32px hit target via a transparent `::before`, so the visual rhythm
 * of a form does not have to pay for the touch target.
 *
 * Indeterminate is a real state, not a class: pass `checked="indeterminate"`
 * (or `defaultChecked="indeterminate"`) and the glyph swaps to a dash off
 * `data-state`, so it works controlled and uncontrolled alike.
 *
 * @example
 * <Field label="Email me when a sync fails" orientation="inline">
 *   <Checkbox name="notify" defaultChecked />
 * </Field>
 *
 * // "select all" for a table header
 * const [checked, setChecked] = useState<CheckboxCheckedState>("indeterminate");
 * <Checkbox checked={checked} onCheckedChange={setChecked} aria-label="Select all rows" />
 */
const Checkbox = forwardRef<ComponentRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  function Checkbox({ className, invalid, ...props }, ref) {
    const control = useFieldControl({ ...props, invalid });
    const isInvalid = control["aria-invalid"] === true;

    return (
      <CheckboxPrimitive.Root
        ref={ref}
        data-invalid={isInvalid || undefined}
        className={cn(
          "group relative inline-flex shrink-0 items-center justify-center",
          "h-[var(--probe-checkbox-size)] w-[var(--probe-checkbox-size)]",
          "rounded-[var(--probe-checkbox-radius)]",
          "border-[length:var(--probe-checkbox-border-width)] border-[color:var(--probe-checkbox-border)]",
          "bg-[color:var(--probe-checkbox-background)]",
          "[transition:border-color_var(--probe-checkbox-transition),background-color_var(--probe-checkbox-transition)]",
          // A 32px hit target around a 16px box, without disturbing layout.
          "before:absolute before:left-1/2 before:top-1/2 before:content-['']",
          "before:h-[var(--probe-checkbox-hit-area)] before:w-[var(--probe-checkbox-hit-area)]",
          "before:-translate-x-1/2 before:-translate-y-1/2",
          "hover:border-[color:var(--probe-checkbox-border--hover)]",
          "hover:bg-[color:var(--probe-checkbox-background--hover)]",
          "focus-visible:outline focus-visible:outline-[length:var(--probe-checkbox-focus-ring-width)]",
          "focus-visible:outline-offset-[var(--probe-checkbox-focus-ring-offset)]",
          "focus-visible:outline-[color:var(--probe-checkbox-focus-ring)]",
          "data-[state=checked]:border-[color:var(--probe-checkbox-border--checked)]",
          "data-[state=checked]:bg-[color:var(--probe-checkbox-background--checked)]",
          "data-[state=checked]:hover:border-[color:var(--probe-checkbox-border--checked-hover)]",
          "data-[state=checked]:hover:bg-[color:var(--probe-checkbox-background--checked-hover)]",
          "data-[state=indeterminate]:border-[color:var(--probe-checkbox-border--checked)]",
          "data-[state=indeterminate]:bg-[color:var(--probe-checkbox-background--checked)]",
          "data-[state=indeterminate]:hover:border-[color:var(--probe-checkbox-border--checked-hover)]",
          "data-[state=indeterminate]:hover:bg-[color:var(--probe-checkbox-background--checked-hover)]",
          "data-[invalid]:border-[color:var(--probe-checkbox-border--invalid)]",
          // Disabled kills pointer events, so no `hover:` rule can outrank it.
          "disabled:pointer-events-none",
          "disabled:border-[color:var(--probe-checkbox-border--disabled)]",
          "disabled:bg-[color:var(--probe-checkbox-background--disabled)]",
          "disabled:data-[state=checked]:bg-[color:var(--probe-checkbox-background--checked-disabled)]",
          "disabled:data-[state=indeterminate]:bg-[color:var(--probe-checkbox-background--checked-disabled)]",
          className,
        )}
        {...control}
      >
        <CheckboxPrimitive.Indicator
          className={cn(
            "flex items-center justify-center",
            "text-[color:var(--probe-checkbox-indicator)]",
            "group-disabled:text-[color:var(--probe-checkbox-indicator--disabled)]",
            "[&>svg]:h-[var(--probe-checkbox-icon-size)] [&>svg]:w-[var(--probe-checkbox-icon-size)]",
          )}
        >
          {/* Both glyphs are rendered and switched by `data-state`, so an
            uncontrolled checkbox does not need its state read back in JS. */}
          <Check aria-hidden="true" className="hidden group-data-[state=checked]:block" />
          <Minus aria-hidden="true" className="hidden group-data-[state=indeterminate]:block" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  },
);

export { Checkbox };
