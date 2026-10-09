import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type HTMLAttributeAnchorTarget,
  type HTMLAttributes,
  type Ref,
} from "react";

import { cn, variants } from "../lib/cn";

/** Heading levels a titled surface may render as. All share `HTMLHeadingElement`. */
type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

/**
 * The hover/active wash is an `::after` overlay rather than a background swap:
 * `--probe-card-background--hover` is a translucent overlay token (black in
 * light, white in dark), so it has to sit ON the card's own background instead
 * of replacing it. `z-[-1]` keeps it above that background but below the
 * content, and `isolate` keeps the negative layer inside the card.
 */
const INTERACTIVE = [
  "relative isolate cursor-pointer no-underline",
  "[transition:border-color_var(--probe-card-transition)]",
  "hover:border-[color:var(--probe-card-border--hover)]",
  "after:pointer-events-none after:absolute after:inset-0 after:z-[-1] after:content-['']",
  "after:bg-[color:var(--probe-card-background--hover)] after:opacity-0",
  "after:[transition:opacity_var(--probe-card-transition)]",
  "hover:after:opacity-100",
  "active:after:bg-[color:var(--probe-card-background--active)] active:after:opacity-100",
  "focus-visible:outline focus-visible:outline-[color:var(--probe-card-focus-ring)]",
  "focus-visible:outline-[length:var(--probe-card-focus-ring-width)]",
  "focus-visible:outline-offset-[var(--probe-card-focus-ring-offset)]",
].join(" ");

const card = variants({
  base: [
    "flex flex-col",
    "rounded-[var(--probe-card-radius)]",
    "border-[length:var(--probe-card-border-width)] border-[color:var(--probe-card-border)]",
    "bg-[color:var(--probe-card-background)] text-[color:var(--probe-card-body-text)]",
    "tracking-[var(--probe-card-tracking)]",
  ].join(" "),
  variants: {
    interactive: { yes: INTERACTIVE, no: "" },
    selected: {
      yes: "border-[color:var(--probe-card-border--selected)] bg-[color:var(--probe-card-background--selected)]",
      no: "",
    },
  },
  defaultVariants: { interactive: "no", selected: "no" },
});

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * Give the card hover and focus affordances. Implied by `href`; set it by
   * hand only when you have made the card focusable yourself (`role`,
   * `tabIndex`), because a plain `div` cannot be tabbed to.
   */
  interactive?: boolean;
  /** Current selection in a list of cards. Also sets `data-selected`. */
  selected?: boolean;
  /** Renders the whole card as one `<a>` — the link target is the card itself. */
  href?: string;
  /** Only meaningful with `href`. `_blank` gets `rel="noreferrer"` by default. */
  target?: HTMLAttributeAnchorTarget;
  /** Only meaningful with `href`. */
  rel?: string;
}

/**
 * A bordered content surface. Square, 1px border, no shadow — depth comes from
 * the border plus one background step, never from elevation.
 *
 * @example
 * <Card>
 *   <CardHeader divided>
 *     <CardTitle as="h2">Production</CardTitle>
 *     <CardDescription>Last deploy 4 minutes ago.</CardDescription>
 *   </CardHeader>
 *   <CardContent>Serving 12k requests/min.</CardContent>
 *   <CardFooter>Redeploy</CardFooter>
 * </Card>
 *
 * @example
 * // The whole card is one focusable link target.
 * <Card href="/services/api" selected={isCurrent}>
 *   <CardHeader><CardTitle>api</CardTitle></CardHeader>
 * </Card>
 */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { interactive, selected = false, href, target, rel, className, ...rest },
  ref,
) {
  const isInteractive = interactive ?? href !== undefined;
  const classes = card({
    interactive: isInteractive ? "yes" : "no",
    selected: selected ? "yes" : "no",
    className,
  });

  if (href !== undefined) {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        href={href}
        target={target}
        rel={rel ?? (target === "_blank" ? "noreferrer" : undefined)}
        data-selected={selected || undefined}
        className={classes}
        {...rest}
      />
    );
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      data-selected={selected || undefined}
      className={classes}
      {...rest}
    />
  );
});

const cardHeader = variants({
  base: "flex flex-col gap-[var(--probe-card-header-gap)] p-[var(--probe-card-padding)]",
  variants: {
    divided: {
      // The margin (not padding) on the next sibling is deliberate: sections
      // below carry `pt-0`, and a margin cannot lose a specificity tie with it.
      yes: "border-b-[length:var(--probe-card-border-width)] border-b-[color:var(--probe-card-header-border)] [&+*]:mt-[var(--probe-card-padding)]",
      no: "",
    },
  },
  defaultVariants: { divided: "no" },
});

export interface CardHeaderProps extends ComponentPropsWithoutRef<"div"> {
  /** Separate the header from what follows with a 1px rule. */
  divided?: boolean;
}

/**
 * Title block of a card.
 *
 * @example
 * <CardHeader divided><CardTitle>Webhooks</CardTitle></CardHeader>
 */
export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { divided = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cardHeader({ divided: divided ? "yes" : "no", className })}
      {...rest}
    />
  );
});

export interface CardTitleProps extends ComponentPropsWithoutRef<"h3"> {
  /** Heading level. Pick the one that fits the page outline, not the size. */
  as?: HeadingTag;
}

/**
 * @example
 * <CardTitle as="h2">Environment variables</CardTitle>
 */
export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle(
  { as: Tag = "h3", className, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref}
      className={cn(
        "m-0 text-[length:var(--probe-card-title-font-size)]",
        "leading-[var(--probe-card-title-line-height)]",
        "[font-weight:var(--probe-card-title-font-weight)]",
        "text-[color:var(--probe-card-title-text)]",
        className,
      )}
      {...rest}
    />
  );
});

/**
 * @example
 * <CardDescription>Delivered to every service in this project.</CardDescription>
 */
export const CardDescription = forwardRef<HTMLParagraphElement, ComponentPropsWithoutRef<"p">>(
  function CardDescription({ className, ...rest }, ref) {
    return (
      <p
        ref={ref}
        className={cn(
          "m-0 text-[length:var(--probe-card-description-font-size)]",
          "leading-[var(--probe-card-description-line-height)]",
          "text-[color:var(--probe-card-body-text)]",
          className,
        )}
        {...rest}
      />
    );
  },
);

/**
 * Body of a card. Top padding is owned by whatever sits above it, so a card
 * that is nothing but content still gets its full padding via `first:`.
 *
 * @example
 * <CardContent>Two services use this variable.</CardContent>
 */
export const CardContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  function CardContent({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-[var(--probe-card-gap)]",
          "px-[var(--probe-card-padding)] pb-[var(--probe-card-padding)] pt-0",
          "first:pt-[var(--probe-card-padding)]",
          className,
        )}
        {...rest}
      />
    );
  },
);

/**
 * Action row. Sits on the sunken surface with a 1px rule above it.
 *
 * @example
 * <CardFooter><Button variant="secondary">Cancel</Button><Button>Save</Button></CardFooter>
 */
export const CardFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  function CardFooter({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "mt-auto flex items-center gap-[var(--probe-card-footer-gap)]",
          "border-t-[length:var(--probe-card-border-width)] border-t-[color:var(--probe-card-footer-border)]",
          "bg-[color:var(--probe-card-footer-background)] p-[var(--probe-card-padding)]",
          className,
        )}
        {...rest}
      />
    );
  },
);
