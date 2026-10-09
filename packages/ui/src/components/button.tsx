import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { cn, variants } from "../lib/cn";
import type { ProbeSize } from "../lib/types";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "critical";

/**
 * Every state is a token swap, never a filter or an opacity trick: `--hover`,
 * `--active` and `--disabled` exist for all three properties of all five
 * variants, so the class list is a straight transcription of the token names.
 *
 * Disabled is styled through `data-[disabled]` rather than `:disabled`, because
 * the same rules have to reach an `<a>` (which cannot be `disabled`) as well as
 * a `<button>`.
 */
const button = variants({
  base: [
    "relative inline-flex select-none items-center justify-center whitespace-nowrap",
    "gap-[var(--probe-button-gap)]",
    "rounded-[var(--probe-button-radius)]",
    "border-solid border-[length:var(--probe-button-border-width)]",
    "text-[length:var(--probe-button-font-size)] leading-[var(--probe-button-line-height)]",
    "[font-weight:var(--probe-button-font-weight)]",
    "tracking-[var(--probe-button-tracking)]",
    "[transition:background-color_var(--probe-button-transition),border-color_var(--probe-button-transition),color_var(--probe-button-transition)]",
    "focus-visible:outline focus-visible:outline-[length:var(--probe-button-focus-ring-width)]",
    "focus-visible:outline-offset-[var(--probe-button-focus-ring-offset)]",
    "focus-visible:outline-[color:var(--probe-button-focus-ring)]",
    "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed",
    "[&>svg]:size-[var(--probe-button-icon-size)] [&>svg]:shrink-0",
  ].join(" "),
  variants: {
    variant: {
      primary: [
        "bg-[color:var(--probe-button-primary-background)]",
        "text-[color:var(--probe-button-primary-text)]",
        "border-[color:var(--probe-button-primary-border)]",
        "hover:bg-[color:var(--probe-button-primary-background--hover)]",
        "hover:text-[color:var(--probe-button-primary-text--hover)]",
        "hover:border-[color:var(--probe-button-primary-border--hover)]",
        "active:bg-[color:var(--probe-button-primary-background--active)]",
        "active:text-[color:var(--probe-button-primary-text--active)]",
        "active:border-[color:var(--probe-button-primary-border--active)]",
        "data-[disabled]:bg-[color:var(--probe-button-primary-background--disabled)]",
        "data-[disabled]:text-[color:var(--probe-button-primary-text--disabled)]",
        "data-[disabled]:border-[color:var(--probe-button-primary-border--disabled)]",
      ].join(" "),
      secondary: [
        "bg-[color:var(--probe-button-secondary-background)]",
        "text-[color:var(--probe-button-secondary-text)]",
        "border-[color:var(--probe-button-secondary-border)]",
        "hover:bg-[color:var(--probe-button-secondary-background--hover)]",
        "hover:text-[color:var(--probe-button-secondary-text--hover)]",
        "hover:border-[color:var(--probe-button-secondary-border--hover)]",
        "active:bg-[color:var(--probe-button-secondary-background--active)]",
        "active:text-[color:var(--probe-button-secondary-text--active)]",
        "active:border-[color:var(--probe-button-secondary-border--active)]",
        "data-[disabled]:bg-[color:var(--probe-button-secondary-background--disabled)]",
        "data-[disabled]:text-[color:var(--probe-button-secondary-text--disabled)]",
        "data-[disabled]:border-[color:var(--probe-button-secondary-border--disabled)]",
        "data-[inverted]:bg-[color:var(--probe-button-secondary-background--inverted)]",
        "data-[inverted]:text-[color:var(--probe-button-secondary-text--inverted)]",
        "data-[inverted]:border-[color:var(--probe-button-secondary-border--inverted)]",
        "data-[inverted]:hover:bg-[color:var(--probe-button-secondary-background--inverted-hover)]",
        "data-[inverted]:hover:border-[color:var(--probe-button-secondary-border--inverted-hover)]",
        "data-[inverted]:active:bg-[color:var(--probe-button-secondary-background--inverted-active)]",
      ].join(" "),
      tertiary: [
        "bg-[color:var(--probe-button-tertiary-background)]",
        "text-[color:var(--probe-button-tertiary-text)]",
        "border-[color:var(--probe-button-tertiary-border)]",
        "hover:bg-[color:var(--probe-button-tertiary-background--hover)]",
        "hover:text-[color:var(--probe-button-tertiary-text--hover)]",
        "hover:border-[color:var(--probe-button-tertiary-border--hover)]",
        "active:bg-[color:var(--probe-button-tertiary-background--active)]",
        "active:text-[color:var(--probe-button-tertiary-text--active)]",
        "active:border-[color:var(--probe-button-tertiary-border--active)]",
        "data-[disabled]:bg-[color:var(--probe-button-tertiary-background--disabled)]",
        "data-[disabled]:text-[color:var(--probe-button-tertiary-text--disabled)]",
        "data-[disabled]:border-[color:var(--probe-button-tertiary-border--disabled)]",
      ].join(" "),
      ghost: [
        "bg-[color:var(--probe-button-ghost-background)]",
        "text-[color:var(--probe-button-ghost-text)]",
        "border-[color:var(--probe-button-ghost-border)]",
        "hover:bg-[color:var(--probe-button-ghost-background--hover)]",
        "hover:text-[color:var(--probe-button-ghost-text--hover)]",
        "hover:border-[color:var(--probe-button-ghost-border--hover)]",
        "active:bg-[color:var(--probe-button-ghost-background--active)]",
        "active:text-[color:var(--probe-button-ghost-text--active)]",
        "active:border-[color:var(--probe-button-ghost-border--active)]",
        "data-[disabled]:bg-[color:var(--probe-button-ghost-background--disabled)]",
        "data-[disabled]:text-[color:var(--probe-button-ghost-text--disabled)]",
        "data-[disabled]:border-[color:var(--probe-button-ghost-border--disabled)]",
        "data-[inverted]:bg-[color:var(--probe-button-ghost-background--inverted)]",
        "data-[inverted]:text-[color:var(--probe-button-ghost-text--inverted)]",
        "data-[inverted]:hover:bg-[color:var(--probe-button-ghost-background--inverted-hover)]",
        "data-[inverted]:active:bg-[color:var(--probe-button-ghost-background--inverted-active)]",
      ].join(" "),
      critical: [
        "bg-[color:var(--probe-button-critical-background)]",
        "text-[color:var(--probe-button-critical-text)]",
        "border-[color:var(--probe-button-critical-border)]",
        "hover:bg-[color:var(--probe-button-critical-background--hover)]",
        "hover:text-[color:var(--probe-button-critical-text--hover)]",
        "hover:border-[color:var(--probe-button-critical-border--hover)]",
        "active:bg-[color:var(--probe-button-critical-background--active)]",
        "active:text-[color:var(--probe-button-critical-text--active)]",
        "active:border-[color:var(--probe-button-critical-border--active)]",
        "data-[disabled]:bg-[color:var(--probe-button-critical-background--disabled)]",
        "data-[disabled]:text-[color:var(--probe-button-critical-text--disabled)]",
        "data-[disabled]:border-[color:var(--probe-button-critical-border--disabled)]",
        // The destructive ring, so the focus outline agrees with the action.
        "focus-visible:outline-[color:var(--probe-button-critical-focus-ring)]",
      ].join(" "),
    },
    size: {
      sm: "h-[var(--probe-button-height-sm)] px-[var(--probe-button-padding-x-sm)]",
      md: "h-[var(--probe-button-height-md)] px-[var(--probe-button-padding-x-md)]",
      lg: "h-[var(--probe-button-height-lg)] px-[var(--probe-button-padding-x-lg)]",
    },
  },
  defaultVariants: { variant: "secondary", size: "md" },
});

interface ButtonOwnProps {
  /** `primary` is inverted against the page and goes brand on hover. */
  variant?: ButtonVariant;
  /** 32 / 36 / 40px. `sm` is the floor — nothing smaller is a hit target. */
  size?: ProbeSize;
  /** Leading icon. Decorative; the label carries the meaning. */
  iconStart?: ReactNode;
  /** Trailing icon — a chevron, an external-link mark. */
  iconEnd?: ReactNode;
  /**
   * Swaps `iconStart` for a spinner, sets `aria-busy` and stops interaction.
   * The label must stay put: a button that changes width mid-click moves the
   * thing the pointer is already on.
   */
  loading?: boolean;
  /** Stretch to the container — a form's submit, a mobile action sheet. */
  fullWidth?: boolean;
  /**
   * For `secondary` and `ghost` sitting on an inverted surface (a scrim, a
   * dark hero). Other variants ignore it: they are already self-contained.
   */
  inverted?: boolean;
}

export type ButtonProps = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
    /**
     * Renders an `<a>` instead of a `<button>`, styled identically. Use it for
     * navigation; keep `onClick` for actions. Client-side routing is not
     * wired in here — for a Next `<Link>`, style the link with `buttonClass()`.
     */
    href?: string;
    target?: AnchorHTMLAttributes<HTMLAnchorElement>["target"];
    rel?: string;
  };

/**
 * Returns the class list for a button, so an element Probe does not own (a
 * Next `<Link>`, a third-party trigger) can wear the same skin.
 *
 * @example
 * <NextLink href="/settings" className={buttonClass({ variant: "primary" })}>
 *   Settings
 * </NextLink>
 */
export function buttonClass(
  options: {
    variant?: ButtonVariant;
    size?: ProbeSize;
    className?: string;
  } = {},
): string {
  const { variant = "secondary", size = "md", className } = options;
  return button({ variant, size, className });
}

/**
 * The action primitive. Square, 1px-bordered, no shadow; depth comes from the
 * border and a one-step background shift.
 *
 * @example
 * <Button variant="primary" onClick={deploy}>Deploy</Button>
 *
 * @example
 * <Button variant="critical" iconStart={<Trash2 />} loading={deleting}>
 *   Delete service
 * </Button>
 *
 * @example
 * // Navigation, not an action.
 * <Button href="/docs" target="_blank" iconEnd={<ArrowUpRight />}>Docs</Button>
 */
export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    iconStart,
    iconEnd,
    loading = false,
    fullWidth = false,
    inverted = false,
    disabled = false,
    className,
    children,
    href,
    type,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const classes = button({
    variant,
    size,
    className: cn(fullWidth && "w-full", className),
  });

  const content = (
    <>
      {loading ? (
        <Spinner
          size="sm"
          tone={variant === "primary" || variant === "critical" ? "inverted" : "accent"}
          decorative
        />
      ) : iconStart ? (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 [&>svg]:size-[var(--probe-button-icon-size)]"
        >
          {iconStart}
        </span>
      ) : null}
      {children}
      {iconEnd ? (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 [&>svg]:size-[var(--probe-button-icon-size)]"
        >
          {iconEnd}
        </span>
      ) : null}
    </>
  );

  if (href !== undefined) {
    const { target, rel, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        // An `<a>` with no `href` is not focusable, which is the correct
        // shape for a disabled link: it leaves the tab order entirely.
        href={isDisabled ? undefined : href}
        target={target}
        rel={target === "_blank" ? (rel ?? "noreferrer") : rel}
        aria-disabled={isDisabled || undefined}
        data-disabled={isDisabled || undefined}
        data-inverted={inverted || undefined}
        aria-busy={loading || undefined}
        className={classes}
        {...anchorRest}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      // React does not default this, and a bare <button> in a form submits it.
      type={type ?? "button"}
      disabled={isDisabled}
      data-disabled={isDisabled || undefined}
      data-inverted={inverted || undefined}
      aria-busy={loading || undefined}
      className={classes}
      {...rest}
    >
      {content}
    </button>
  );
});
