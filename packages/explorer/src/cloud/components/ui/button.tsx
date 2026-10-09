import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import {
  Button as ProbeButton,
  buttonClass,
  type ButtonVariant,
  type ProbeSize,
} from "@synehq-oos/ui";

import { cn } from "../../lib/utils";

/**
 * The shadcn-shaped door onto Probe's Button. Every call-site in the app still
 * says `variant="outline"` / `size="icon"`; this file is the only place that
 * knows those names are not Probe's.
 *
 * `default` used to render HoverButton — an animated gradient that belongs to
 * no design system. It is now Probe's `primary`, which is the whole point of
 * the bridge. HoverButton itself stays: a dozen screens still import it direct.
 */
type ShadcnVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
type ShadcnSize = "default" | "sm" | "lg" | "icon";

/**
 * Probe has five variants where shadcn has six, so one mapping is lossy:
 * shadcn's `outline` (bordered, page background) is Probe's `secondary`, which
 * pushes shadcn's `secondary` (filled grey) down onto Probe's `tertiary`. That
 * keeps the visual hierarchy of the 124 `outline` call-sites intact, which
 * matters more than the names lining up.
 */
const PROBE_VARIANT: Record<ShadcnVariant, ButtonVariant> = {
  default: "primary",
  destructive: "critical",
  outline: "secondary",
  secondary: "tertiary",
  ghost: "ghost",
  // Probe has no `link` button. Ghost is the closest chassis; LINK_SKIN below
  // repaints it with the Link tokens.
  link: "ghost",
};

const PROBE_SIZE: Record<ShadcnSize, ProbeSize> = {
  default: "md",
  sm: "sm",
  lg: "lg",
  // Probe ships IconButton for this, but it takes `icon`/`label` props no
  // call-site passes and forbids arbitrary children. A square md box gets the
  // same result through the API the app already uses.
  icon: "md",
};

/** Strips the button chrome back to text so `link` reads as a link. */
const LINK_SKIN = [
  "border-transparent bg-transparent hover:border-transparent hover:bg-transparent active:bg-transparent",
  "text-[color:var(--probe-link-text)] hover:text-[color:var(--probe-link-text--hover)] active:text-[color:var(--probe-link-text--active)]",
  "underline-offset-[var(--probe-link-underline-offset)] hover:underline",
].join(" ");

/** Square: drop the horizontal padding, match the width to the md height. */
const ICON_SKIN = "w-[var(--probe-button-height-md)] px-0";

/**
 * `null` is accepted because cva's `VariantProps` allowed it and the old
 * `buttonVariants` was a cva function. Defaults match the old `defaultVariants`
 * exactly — note size defaults to `sm`, not `default`, so a bare `<Button>`
 * must not grow.
 */
function toProbe(
  variant: ShadcnVariant | null | undefined,
  size: ShadcnSize | null | undefined,
  className?: string,
) {
  const v = variant ?? "default";
  const s = size ?? "sm";
  return {
    variant: PROBE_VARIANT[v],
    size: PROBE_SIZE[s],
    // Caller `className` stays last so a call-site override still wins.
    className: cn(v === "link" && LINK_SKIN, s === "icon" && ICON_SKIN, className),
  };
}

/**
 * Probe styles disabled through `data-[disabled]`, which only its own Button
 * sets — a foreign element wearing the class string never gets the attribute,
 * so `<PopoverTrigger className={buttonVariants(...)} disabled>` in the
 * data-grid menus would render at full strength and merely stop responding.
 * These are the two classes the old cva base carried; they go on the foreign
 * paths only, because stacking `opacity-50` on Probe's disabled tokens would
 * dim its own Button twice.
 */
const FOREIGN_DISABLED = "disabled:pointer-events-none disabled:opacity-50";

/** The skin for an element Probe does not render: `buttonVariants`, `asChild`. */
function foreignClass(probe: ReturnType<typeof toProbe>): string {
  return buttonClass({
    ...probe,
    className: cn(FOREIGN_DISABLED, probe.className),
  });
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ShadcnVariant | null;
  size?: ShadcnSize | null;
  asChild?: boolean;
}

/**
 * Class-string only, for the elements that are not buttons: calendar day cells,
 * pagination `<a>`s, AlertDialog actions, data-grid menu triggers. Same call
 * signature as the cva function it replaces.
 */
function buttonVariants(
  options: {
    variant?: ShadcnVariant | null;
    size?: ShadcnSize | null;
    className?: string;
  } = {},
): string {
  return foreignClass(toProbe(options.variant, options.size, options.className));
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, disabled, ...props }, ref) => {
    const probe = toProbe(variant, size, className);

    // Probe's Button has no `asChild`, and ~185 call-sites rely on it
    // (`<Button asChild><Link/></Button>`, every Radix `asChild` trigger).
    // That is what `buttonClass` exists for: hand the skin to Slot.
    if (asChild) {
      // `Slot` merges these onto whatever child it is handed, and its props are
      // typed as plain `HTMLAttributes` — no `type`, because the child is
      // usually a Next `<Link>` and an `<a>` has no `type` attribute. The old
      // file got away with passing it only because `Comp` was a union of `Slot`
      // and `"button"`. Forward it when a call-site actually set it, so an
      // `asChild` wrapper around a real `<button>` keeps its submit behaviour.
      // The slotted child is usually an `<a>`, and an anchor cannot be
      // disabled: the attribute is ignored, so without this the link stays
      // focusable, still navigates, and — because `FOREIGN_DISABLED` is keyed
      // on the `:disabled` pseudo-class, which an `<a>` never matches — renders
      // at full strength while claiming to be off. Say it the way an anchor can
      // hear, and swallow the activation, since removing it from the tab order
      // does not stop a click. `data-disabled` is what Probe's own rules read.
      const slotProps = {
        ...props,
        ...(type ? { type } : {}),
        disabled,
        ...(disabled
          ? {
              "aria-disabled": true,
              tabIndex: -1,
              "data-disabled": "",
              onClickCapture: (event: React.MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
              },
            }
          : {}),
      } as React.ComponentPropsWithoutRef<typeof Slot>;

      return <Slot ref={ref} className={foreignClass(probe)} {...slotProps} />;
    }

    return (
      <ProbeButton
        ref={ref as React.Ref<HTMLElement>}
        {...probe}
        // Probe defaults to `type="button"`; the old file left `type` unset, so
        // a bare `<Button>` inside a `<form>` submits it today. Spelling out
        // `submit` preserves that — it is inert outside a form.
        type={type ?? "button"}
        disabled={disabled}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
