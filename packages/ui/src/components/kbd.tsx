import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/cn";

export interface KbdProps extends ComponentPropsWithoutRef<"kbd"> {
  /**
   * For a Kbd sitting on an inverted surface — inside a Tooltip, on a scrim.
   * The tokens are translucent white/black mixes, so one flag is correct in
   * every theme.
   */
  inverted?: boolean;
}

/**
 * A single key cap. The one place Probe is not square: `--probe-kbd-radius` is
 * the 2px escape hatch, because a key legend that is perfectly square reads as
 * a badge rather than as a key.
 *
 * Render one Kbd per key and let the surrounding text supply the separator —
 * `<Kbd>⌘</Kbd><Kbd>K</Kbd>` beats a single cap containing "⌘K", because a
 * screen reader then announces two keys rather than one unpronounceable glyph.
 *
 * @example
 * <span className="inline-flex items-center gap-1">
 *   Open the palette <Kbd>⌘</Kbd><Kbd>K</Kbd>
 * </span>
 *
 * @example
 * <Tooltip>
 *   <TooltipTrigger asChild><IconButton label="Search" icon={<Search />} /></TooltipTrigger>
 *   <TooltipContent>Search <Kbd inverted>/</Kbd></TooltipContent>
 * </Tooltip>
 */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd(
  { inverted = false, className, children, ...rest },
  ref,
) {
  return (
    <kbd
      ref={ref}
      data-inverted={inverted || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center align-middle",
        "h-[var(--probe-kbd-height)] min-w-[var(--probe-kbd-min-width)]",
        "px-[var(--probe-kbd-padding-x)]",
        "rounded-[var(--probe-kbd-radius)]",
        "border-solid border-[length:var(--probe-kbd-border-width)]",
        "font-[family-name:var(--probe-kbd-font-family)]",
        "text-[length:var(--probe-kbd-font-size)]",
        "bg-[color:var(--probe-kbd-background)]",
        "text-[color:var(--probe-kbd-text)]",
        "border-[color:var(--probe-kbd-border)]",
        "data-[inverted]:bg-[color:var(--probe-kbd-background--inverted)]",
        "data-[inverted]:text-[color:var(--probe-kbd-text--inverted)]",
        "data-[inverted]:border-[color:var(--probe-kbd-border--inverted)]",
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
});
