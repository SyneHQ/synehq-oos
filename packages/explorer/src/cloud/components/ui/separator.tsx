"use client";

import * as React from "react";

import { Divider, type DividerProps } from "@synehq-oos/ui";

/**
 * Probe calls this a Divider; ten files here call it a Separator, so the rename
 * lives in this file rather than in theirs. Probe's `tone`, `spacing` and
 * `label` come along for free.
 *
 * Two props are shimmed back onto Probe's plain div:
 * - `decorative` (Radix's default-true "this rule carries no meaning") has no
 *   Probe equivalent, so it picks the role — Probe always announces `separator`.
 * - `data-orientation`, because Probe exposes the axis as `aria-orientation`
 *   only and at least one call-site styles off `data-[orientation=horizontal]:`.
 *
 * Lossy: Probe draws the rule as a border rather than a 1px `bg-muted` box, so
 * a call-site's `bg-*` override no longer paints it — `border-*` does. Nothing
 * in the app currently relies on the old behaviour.
 */
export interface SeparatorProps extends DividerProps {
  /** Radix's prop: `false` keeps the rule in the accessibility tree. */
  decorative?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { orientation = "horizontal", decorative = true, ...rest },
  ref,
) {
  return (
    <Divider
      ref={ref}
      orientation={orientation}
      // Both land in Divider's own `...rest`, which it spreads last, so these
      // override the role and attributes Divider sets for itself.
      role={decorative ? "none" : "separator"}
      data-orientation={orientation}
      {...rest}
    />
  );
});

export { Separator };
