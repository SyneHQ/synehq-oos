"use client";

import * as React from "react";

import { cn, variants } from "../lib/cn";
import type { ProbeSize } from "../lib/types";
import { useFieldControl, type FieldControlProps } from "./field";

/**
 * The visible box. The `<input>` inside it is chrome-less — border, background
 * and focus ring all live out here so prefix/suffix adornments sit *inside* the
 * same box as the text.
 *
 * State precedence is carried by specificity rather than source order: every
 * `data-[…]:hover:` rule is one selector heavier than the bare `hover:` rule it
 * has to beat, so Tailwind's output order cannot flip them.
 */
const inputBox = variants({
  base: [
    // Stay in normal paint order so legacy positioned adornments remain visible.
    "group flex w-full items-center",
    "gap-[var(--probe-input-gap)] px-[var(--probe-input-padding-x)]",
    "rounded-[var(--probe-input-radius)]",
    "border-[length:var(--probe-input-border-width)] border-[color:var(--probe-input-border)]",
    "bg-[color:var(--probe-input-background)]",
    "[transition:border-color_var(--probe-input-transition),background-color_var(--probe-input-transition)]",
    "hover:border-[color:var(--probe-input-border--hover)]",
    "focus-within:border-[color:var(--probe-input-border--focus)]",
    "focus-within:outline focus-within:outline-[length:var(--probe-input-focus-ring-width)]",
    "focus-within:outline-offset-[var(--probe-input-focus-ring-offset)]",
    "focus-within:outline-[color:var(--probe-input-focus-ring)]",
    "data-[readonly]:bg-[color:var(--probe-input-background--readonly)]",
    "data-[readonly]:border-[color:var(--probe-input-border--readonly)]",
    "data-[readonly]:hover:border-[color:var(--probe-input-border--readonly)]",
    "data-[invalid]:border-[color:var(--probe-input-border--invalid)]",
    "data-[invalid]:hover:border-[color:var(--probe-input-border--invalid--hover)]",
    "data-[invalid]:focus-within:border-[color:var(--probe-input-border--invalid)]",
    "data-[invalid]:focus-within:outline-[color:var(--probe-input-focus-ring--invalid)]",
    // Disabled kills pointer events, so the bare `hover:` rule can never fire.
    "data-[disabled]:pointer-events-none",
    "data-[disabled]:bg-[color:var(--probe-input-background--disabled)]",
    "data-[disabled]:border-[color:var(--probe-input-border--disabled)]",
  ].join(" "),
  variants: {
    size: {
      sm: "h-[var(--probe-input-height-sm)]",
      md: "h-[var(--probe-input-height-md)]",
      lg: "h-[var(--probe-input-height-lg)]",
    },
  },
  defaultVariants: { size: "md" },
});

/**
 * Adornments inherit the input's type ramp; bare SVG children drop to the
 * faint icon colour because a decorative glyph is not the carrier of meaning.
 */
const ADORNMENT = [
  "flex shrink-0 items-center",
  "text-[length:var(--probe-input-font-size)] leading-[var(--probe-input-line-height)]",
  "text-[color:var(--probe-input-adornment-text)]",
  "[&>svg]:h-[var(--probe-input-icon-size)] [&>svg]:w-[var(--probe-input-icon-size)]",
  "[&>svg]:text-[color:var(--probe-input-icon)]",
  "group-data-[invalid]:[&>svg]:text-[color:var(--probe-input-icon--invalid)]",
].join(" ");

export interface InputProps
  extends Omit<React.ComponentPropsWithoutRef<"input">, "size" | "prefix" | "children">,
    FieldControlProps {
  /** Control height: 32 / 36 / 40px. Not the native `size` attribute. */
  size?: ProbeSize;
  /** Leading adornment — an icon, a unit, a currency symbol. */
  prefix?: React.ReactNode;
  /** Trailing adornment. */
  suffix?: React.ReactNode;
  /** `className` for the `<input>` itself; `className` styles the box. */
  inputClassName?: string;
}

/**
 * Input — a single-line text control with optional adornments.
 *
 * Wrap it in `Field` for a label, hint and error; it inherits the id,
 * `aria-describedby`, `aria-invalid`, `required` and `disabled` from there and
 * never renders label chrome of its own.
 *
 * `ref` lands on the `<input>`, so it drops straight into react-hook-form.
 *
 * @example
 * <Field label="Row limit" hint="Caps every preview query.">
 *   <Input type="number" defaultValue={500} suffix="rows" />
 * </Field>
 *
 * <Input size="sm" prefix={<Search />} placeholder="Filter tables" />
 * <Input value={connectionString} readOnly suffix={<Copy />} />
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputClassName, size = "md", invalid, prefix, suffix, ...props },
  ref,
) {
  const control = useFieldControl({ ...props, invalid });
  const isInvalid = control["aria-invalid"] === true;

  return (
    <div
      data-disabled={control.disabled || undefined}
      data-readonly={control.readOnly || undefined}
      data-invalid={isInvalid || undefined}
      className={inputBox({ size, className })}
    >
      {prefix ? <span className={ADORNMENT}>{prefix}</span> : null}
      <input
        ref={ref}
        className={cn(
          "min-w-0 flex-1 bg-transparent outline-none",
          "text-[length:var(--probe-input-font-size)]",
          "leading-[var(--probe-input-line-height)]",
          "tracking-[var(--probe-input-tracking)]",
          "text-[color:var(--probe-input-text)]",
          "placeholder:text-[color:var(--probe-input-placeholder)]",
          "read-only:text-[color:var(--probe-input-text--readonly)]",
          "disabled:cursor-not-allowed",
          "disabled:text-[color:var(--probe-input-text--disabled)]",
          inputClassName,
        )}
        {...control}
      />
      {suffix ? <span className={ADORNMENT}>{suffix}</span> : null}
    </div>
  );
});

export { Input };
