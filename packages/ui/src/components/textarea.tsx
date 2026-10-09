"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/cn";
import { useFieldControl, type FieldControlProps } from "./field";

export type TextareaProps = ComponentPropsWithoutRef<"textarea"> & FieldControlProps;

/**
 * Textarea — a multi-line text control.
 *
 * Unlike `Input` there is no wrapper element: the `<textarea>` carries its own
 * border, background and focus ring, because a resize grip inside a bordered
 * box looks wrong. It resizes vertically only — horizontal resize breaks the
 * grid it sits in. Pass `className="resize-none"` to pin it.
 *
 * Wrap it in `Field` for a label, hint and error; it inherits the id,
 * `aria-describedby`, `aria-invalid`, `required` and `disabled` from there.
 *
 * `ref` lands on the `<textarea>`, so it drops straight into react-hook-form.
 *
 * @example
 * <Field label="SQL" hint="Runs against the selected warehouse.">
 *   <Textarea rows={8} placeholder="select 1" />
 * </Field>
 *
 * <Textarea value={manifest} readOnly className="resize-none" />
 */
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  const control = useFieldControl({ ...props, invalid });
  const isInvalid = control["aria-invalid"] === true;

  return (
    <textarea
      ref={ref}
      data-invalid={isInvalid || undefined}
      className={cn(
        "block w-full resize-y",
        "min-h-[var(--probe-textarea-min-height)]",
        "px-[var(--probe-textarea-padding-x)] py-[var(--probe-textarea-padding-y)]",
        "rounded-[var(--probe-textarea-radius)]",
        "border-[length:var(--probe-textarea-border-width)] border-[color:var(--probe-textarea-border)]",
        "bg-[color:var(--probe-textarea-background)]",
        "text-[length:var(--probe-textarea-font-size)]",
        "leading-[var(--probe-textarea-line-height)]",
        "tracking-[var(--probe-textarea-tracking)]",
        "text-[color:var(--probe-textarea-text)]",
        "placeholder:text-[color:var(--probe-textarea-placeholder)]",
        "[transition:border-color_var(--probe-textarea-transition),background-color_var(--probe-textarea-transition)]",
        "hover:border-[color:var(--probe-textarea-border--hover)]",
        "focus:border-[color:var(--probe-textarea-border--focus)] focus:outline",
        "focus:outline-[length:var(--probe-textarea-focus-ring-width)]",
        "focus:outline-offset-[var(--probe-textarea-focus-ring-offset)]",
        "focus:outline-[color:var(--probe-textarea-focus-ring)]",
        // Each state rule below is one selector heavier than the bare
        // `hover:`/`focus:` rule it has to beat, so Tailwind's output order
        // cannot flip the precedence.
        "read-only:bg-[color:var(--probe-textarea-background--readonly)]",
        "read-only:border-[color:var(--probe-textarea-border--readonly)]",
        "read-only:text-[color:var(--probe-textarea-text--readonly)]",
        "read-only:hover:border-[color:var(--probe-textarea-border--readonly)]",
        "data-[invalid]:border-[color:var(--probe-textarea-border--invalid)]",
        "data-[invalid]:hover:border-[color:var(--probe-textarea-border--invalid--hover)]",
        "data-[invalid]:focus:border-[color:var(--probe-textarea-border--invalid)]",
        "data-[invalid]:focus:outline-[color:var(--probe-textarea-focus-ring--invalid)]",
        "disabled:cursor-not-allowed disabled:resize-none",
        "disabled:bg-[color:var(--probe-textarea-background--disabled)]",
        "disabled:border-[color:var(--probe-textarea-border--disabled)]",
        "disabled:text-[color:var(--probe-textarea-text--disabled)]",
        className,
      )}
      {...control}
    />
  );
});

export { Textarea };
