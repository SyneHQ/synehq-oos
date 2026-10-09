import { cn } from "../../lib/utils";

/**
 * Probe's Kbd under the shadcn name. Probe has no `KbdGroup`, so that one stays
 * here — it is pure layout, not a design decision worth exporting.
 *
 * The old `Kbd` carried `[[data-slot=tooltip-content]_&]` rules to flip its
 * colours inside a tooltip; Probe spells that as the `inverted` prop. The only
 * call-site renders inside a dialog, not a tooltip, so nothing needs it today.
 */
export { Kbd } from "@synehq-oos/ui";
export type { KbdProps } from "@synehq-oos/ui";

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    // A `<kbd>` of `<kbd>`s is the spec'd markup for a key combination, and it
    // is what this rendered before. Left alone.
    <kbd
      data-slot="kbd-group"
      className={cn("gap-1 inline-flex items-center", className)}
      {...props}
    />
  );
}

export { KbdGroup };
