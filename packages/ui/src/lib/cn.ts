import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 *
 * Self-contained on purpose: Probe never imports from `@/lib/utils`, so the
 * package can be lifted out of this repo without dragging app code with it.
 *
 * @example
 * cn("px-2 py-1", isWide && "px-4", className) // -> "py-1 px-4 …"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

type VariantMap = Record<string, Record<string, string>>;
type Selection<M extends VariantMap> = { [K in keyof M]?: keyof M[K] | null };

/**
 * A ~20-line stand-in for `class-variance-authority`, which is deliberately
 * not a dependency of Probe.
 *
 * @example
 * const badge = variants({
 *   base: "inline-flex items-center",
 *   variants: {
 *     tone: { neutral: "text-[var(--probe-badge-neutral-text)]", …},
 *     size: { sm: "h-5 px-1", md: "h-6 px-2" },
 *   },
 *   defaultVariants: { tone: "neutral", size: "md" },
 * });
 *
 * badge({ tone: "success", className: "ml-2" });
 * type BadgeVariants = VariantProps<typeof badge>;
 */
export function variants<M extends VariantMap>(config: {
  base?: string;
  variants: M;
  defaultVariants?: Selection<M>;
}): (props?: Selection<M> & { className?: ClassValue }) => string {
  return (props = {}) => {
    const keys = Object.keys(config.variants) as (keyof M)[];
    const picked = keys.map((key) => {
      // `undefined` means "unset, use the default"; `null` means "no class at
      // all" — the caller is opting out of the default. `??` would conflate them.
      const chosen = props[key] === undefined ? config.defaultVariants?.[key] : props[key];
      return chosen == null ? undefined : config.variants[key][String(chosen)];
    });
    return cn(config.base, ...picked, props.className);
  };
}

/** Infer the variant props of a `variants()` result, cva-style. */
export type VariantProps<F> = F extends (props?: infer P) => string
  ? Omit<NonNullable<P>, "className">
  : never;
