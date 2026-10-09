import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ElementType } from "react";

/**
 * Control sizing. `md` (36px) is the default; `sm` is 32px, which is the floor
 * for an interactive hit target in Probe. There is nothing smaller.
 */
export type ProbeSize = "sm" | "md" | "lg";

/**
 * Semantic colour role. Status tones must always be paired with an icon or
 * text — colour is never the sole carrier of meaning.
 */
export type ProbeTone = "neutral" | "brand" | "success" | "critical" | "warning" | "info";

/**
 * Props for a component that can render as a different element via `as`.
 *
 * @example
 * type LinkProps<E extends ElementType = "a"> =
 *   PolymorphicProps<E, { underline?: boolean }>;
 *
 * // <Link as={NextLink} href="/x" underline />
 */
export type PolymorphicProps<E extends ElementType, P = object> = P & { as?: E } & Omit<
    ComponentPropsWithoutRef<E>,
    keyof P | "as"
  >;

/** The `ref` type for whatever element `as` resolved to. */
export type PolymorphicRef<E extends ElementType> = ComponentPropsWithRef<E>["ref"];
