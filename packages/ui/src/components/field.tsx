"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "../lib/cn";

/**
 * What `Field` hands down to whatever control it wraps. Single controls never
 * read this directly — they call {@link useFieldControl}. Grouping controls
 * (`RadioGroup`) read `labelId`, which cannot be expressed as a DOM prop:
 * `<label for>` does not name a `role="radiogroup"`, `aria-labelledby` does.
 */
export interface FieldContextValue {
  controlId: string;
  labelId: string;
  /** Space-separated ids of the hint and error nodes, if any. */
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

/** Read the enclosing `Field`'s wiring, or `null` when there is no `Field`. */
export function useField(): FieldContextValue | null {
  return React.useContext(FieldContext);
}

/**
 * The slice of props every Probe form control shares with `Field`. A control
 * may set any of them explicitly; whatever it leaves out, `Field` fills in.
 *
 * The aria members are borrowed from React's own types rather than redeclared,
 * so a control can `extends`/`&` this alongside `ComponentPropsWithoutRef<…>`
 * without the two declarations of `aria-invalid` colliding.
 */
export interface FieldControlProps
  extends Pick<React.AriaAttributes, "aria-describedby" | "aria-invalid"> {
  id?: string;
  disabled?: boolean;
  required?: boolean;
  /** Visual + `aria-invalid`. Inherited from an enclosing `Field`'s `error`. */
  invalid?: boolean;
}

/**
 * Merge a control's own props with the enclosing `Field`'s wiring. This is the
 * *only* place id / `aria-describedby` / `aria-invalid` plumbing lives — a
 * control that re-implements it will drift from the label.
 *
 * Explicit props always win; `invalid` is translated into `aria-invalid` and
 * dropped, so the result is safe to spread onto a DOM node.
 *
 * @example
 * const { invalid, ...rest } = props;
 * const control = useFieldControl({ ...rest, invalid });
 * return <input {...control} />;
 */
export function useFieldControl<P extends FieldControlProps>(props: P): Omit<P, "invalid"> {
  const field = React.useContext(FieldContext);
  const { invalid, ...rest } = props;
  const isInvalid = invalid ?? field?.invalid ?? false;
  // Read through `props`, not `rest`: indexing a generic `Omit<P, …>` with a
  // literal key is an implicit-any error, while `props` has the constraint's
  // apparent type.
  const describedBy = [field?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ");

  return {
    ...rest,
    id: props.id ?? field?.controlId,
    disabled: props.disabled ?? field?.disabled,
    required: props.required ?? field?.required,
    "aria-invalid": props["aria-invalid"] ?? (isInvalid || undefined),
    "aria-describedby": describedBy || undefined,
  } as Omit<P, "invalid">;
}

export interface FieldProps extends Omit<React.ComponentPropsWithoutRef<"div">, "id"> {
  /** Always required — an unlabelled control is a bug, not a style choice. */
  label: React.ReactNode;
  /** Supporting copy. Announced with the control via `aria-describedby`. */
  hint?: React.ReactNode;
  /** Validation message. Its presence marks the control invalid. */
  error?: React.ReactNode;
  /** Mark invalid without rendering a message (e.g. a form-level summary). */
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  /**
   * `inline` puts the control before the label — the layout checkboxes,
   * radios and switches want. `vertical` (default) stacks label over control.
   */
  orientation?: "vertical" | "inline";
  /** Keep the label for screen readers only. The label is never omitted. */
  labelHidden?: boolean;
  /** Override the generated control id (e.g. to match a server-rendered form). */
  controlId?: string;
}

/**
 * Field — the label / hint / error / required wrapper every Probe form control
 * composes with.
 *
 * It generates the control id, wires `htmlFor`, builds `aria-describedby` from
 * whichever of hint and error are present, and propagates
 * `invalid` / `required` / `disabled` down. Controls contribute nothing to this
 * — they just call `useFieldControl`.
 *
 * @example
 * <Field label="Warehouse name" hint="Lowercase, no spaces." required>
 *   <Input placeholder="analytics-prod" />
 * </Field>
 *
 * <Field label="Region" error="Pick a region to continue.">
 *   <Select>…</Select>
 * </Field>
 *
 * <Field label="Email me on failures" orientation="inline">
 *   <Checkbox />
 * </Field>
 */
const Field = React.forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    label,
    hint,
    error,
    invalid,
    required = false,
    disabled = false,
    orientation = "vertical",
    labelHidden = false,
    controlId,
    className,
    children,
    ...rest
  },
  ref,
) {
  const generatedId = React.useId();
  const id = controlId ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const context = React.useMemo<FieldContextValue>(
    () => ({
      controlId: id,
      labelId: `${id}-label`,
      describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined,
      invalid: invalid ?? Boolean(error),
      required,
      disabled,
    }),
    [id, hintId, errorId, invalid, error, required, disabled],
  );

  const labelNode = (
    <label
      id={context.labelId}
      htmlFor={id}
      className={cn(
        "text-[length:var(--probe-field-label-font-size)]",
        "leading-[var(--probe-field-label-line-height)]",
        "tracking-[var(--probe-field-label-tracking)]",
        "font-[number:var(--probe-field-label-font-weight)]",
        disabled
          ? "text-[color:var(--probe-field-label-text--disabled)]"
          : "text-[color:var(--probe-field-label-text)]",
        labelHidden && "sr-only",
        orientation === "inline" && !disabled && "cursor-pointer",
      )}
    >
      {label}
      {required ? (
        // The control itself carries `required`/`aria-required`, so the marker
        // is purely visual and must not be read out twice.
        <span aria-hidden="true" className="text-[color:var(--probe-field-required-text)]">
          {" *"}
        </span>
      ) : null}
    </label>
  );

  const messages =
    hint || error ? (
      <div className="flex flex-col gap-[var(--probe-field-message-gap)]">
        {hint ? (
          <p
            id={hintId}
            className={cn(
              "text-[length:var(--probe-field-hint-font-size)]",
              "leading-[var(--probe-field-hint-line-height)]",
              "text-[color:var(--probe-field-hint-text)]",
            )}
          >
            {hint}
          </p>
        ) : null}
        {error ? (
          <p
            id={errorId}
            role="alert"
            className={cn(
              "flex items-start gap-[var(--probe-field-error-gap)]",
              "text-[length:var(--probe-field-error-font-size)]",
              "leading-[var(--probe-field-error-line-height)]",
              "text-[color:var(--probe-field-error-text)]",
            )}
          >
            {/* Colour is never the only signal — the icon says "error" too. */}
            <AlertCircle
              aria-hidden="true"
              className={cn(
                "mt-[calc((var(--probe-field-error-line-height)_-_var(--probe-field-error-icon-size))/2)]",
                "h-[var(--probe-field-error-icon-size)] w-[var(--probe-field-error-icon-size)] shrink-0",
              )}
            />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <FieldContext.Provider value={context}>
      <div
        ref={ref}
        data-orientation={orientation}
        data-disabled={disabled || undefined}
        data-invalid={context.invalid || undefined}
        className={cn(
          orientation === "inline"
            ? "flex items-start gap-[var(--probe-field-inline-gap)]"
            : "flex flex-col gap-[var(--probe-field-gap)]",
          className,
        )}
        {...rest}
      >
        {orientation === "inline" ? (
          <>
            {/* Centre the control on the label's first line rather than the
                whole block, so a hint below does not drag it downwards. */}
            <span className="flex h-[var(--probe-field-label-line-height)] shrink-0 items-center">
              {children}
            </span>
            <span className="flex min-w-0 flex-col gap-[var(--probe-field-message-gap)]">
              {labelNode}
              {messages}
            </span>
          </>
        ) : (
          <>
            {labelNode}
            {children}
            {messages}
          </>
        )}
      </div>
    </FieldContext.Provider>
  );
});

export { Field };
