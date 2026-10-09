import { EyeOff, FilterX, Lock, Sparkles, Target } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "../lib/cn";
import { Button } from "./button";

/** Heading levels a titled surface may render as. All share `HTMLHeadingElement`. */
type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

/**
 * Why the region is empty. Five reasons, five different next actions — and
 * none of them is "loading" or "it broke", which are `Skeleton` and
 * `ErrorState` (Law 2).
 */
export type EmptyStateKind = "scope" | "first-run" | "causal" | "filtered" | "gated";

/**
 * Keyed to what the emptiness replaced, not to taste: a page's content column
 * is left-aligned at its own left edge, a fixed-size data viewport is centred
 * in both axes. A viewport has a frame, so centring reads as "this container
 * is empty"; a page has none, so centring reads as an error screen.
 */
export type EmptyStateAlign = "page" | "viewport";

/**
 * The floor each kind must clear, expressed where the compiler can hold it.
 *
 * Deliberately a floor and not a ceiling: the members add requirements rather
 * than forbidding the other kinds' props, so a `causal` state may still carry
 * `actions` and a `gated` one a `filterSummary`. Sealing every member with
 * `never` would buy a little tidiness at the call site and cost every honest
 * combination the taxonomy did not anticipate.
 */
type EmptyStateContract =
  | { kind: "scope"; children: ReactNode }
  | { kind: "first-run"; description: ReactNode; actions: ReactNode }
  | { kind: "causal"; cause: ReactNode; freeRemedy: ReactNode }
  | { kind: "filtered"; filterSummary: ReactNode; onClearFilters: () => void }
  | { kind: "gated"; reason: ReactNode; remedy: ReactNode };

export interface EmptyStateOwnProps {
  /** Replace the kind's default icon, or pass `null` to drop it entirely. */
  icon?: ReactNode | null;
  /** The observation, in a few words. Never the cause — that is `cause`. */
  title: ReactNode;
  /** One or two sentences on what to do about it. Required for `first-run`. */
  description?: ReactNode;
  /** Heading level. Pick the one that fits the page outline, not the size. */
  titleAs?: HeadingTag;
  /** What the region was going to be. See {@link EmptyStateAlign}. */
  align?: EmptyStateAlign;
  /**
   * Primary and secondary actions, in that order, after any the kind supplies.
   * Required for `first-run`, where it is the create action.
   */
  actions?: ReactNode;
  /** `causal`: the condition hiding the data, hyperlinked to where it is set. */
  cause?: ReactNode;
  /** `causal`: the remedy that costs nothing. Always rendered before `paidRemedy`. */
  freeRemedy?: ReactNode;
  /** `causal`: the remedy that costs money. Unreachable without `freeRemedy`. */
  paidRemedy?: ReactNode;
  /** `filtered`: the filter that excluded everything, in the user's own terms. */
  filterSummary?: ReactNode;
  /** `filtered`: clears the filter. Rendered as the first action. */
  onClearFilters?: () => void;
  /** `filtered`: label on the clear control. Name the filter when there is one. */
  clearFiltersLabel?: string;
  /** `gated`: why the answer is no — the plan or the role, named. */
  reason?: ReactNode;
  /** `gated`: the way out. Upgrade for a plan gate, "Ask an owner" for a role. */
  remedy?: ReactNode;
  /** Draw the 1px frame. Leave off when the surrounding `Panel` already has one. */
  bordered?: boolean;
  /** Below the actions — the picker for `scope`, else `<EmptyStateSuggestions>`. */
  children?: ReactNode;
}

export type EmptyStateProps = EmptyStateOwnProps &
  EmptyStateContract &
  Omit<ComponentPropsWithoutRef<"div">, "title">;

/** One shape per kind, because colour alone does not distinguish five states. */
const KIND_ICON: Record<EmptyStateKind, ReactNode> = {
  scope: <Target />,
  "first-run": <Sparkles />,
  causal: <EyeOff />,
  filtered: <FilterX />,
  gated: <Lock />,
};

/**
 * The "there is nothing" rendering of a region, typed by *why* there is
 * nothing.
 *
 * `kind` is required so that reaching for this component when the truth is
 * "still loading" or "we could not find out" is a type error rather than a
 * judgement call — those are `Skeleton` and `ErrorState` (Law 2). Each kind
 * then requires the one thing that makes it actionable: `scope` a picker,
 * `first-run` a create action, `filtered` a way to clear, `gated` a remedy.
 *
 * `causal` splits its remedies into two ordered slots instead of one `actions`
 * node, because the free configuration change must be named before the paid
 * upgrade. Get that order wrong and the empty state is an upsell, which is how
 * users learn to stop reading empty states.
 *
 * Defaults to `align="viewport"`: most empty states replace a table or a chart
 * inside a page. Pass `align="page"` when it replaces the content column.
 *
 * @example
 * <EmptyState
 *   kind="first-run"
 *   title="No webhooks yet"
 *   description="Webhooks notify your services when a deploy finishes."
 *   actions={<Button iconStart={<Plus />}>Add webhook</Button>}
 * />
 *
 * @example
 * <EmptyState
 *   kind="causal"
 *   align="page"
 *   title="No logs to show"
 *   cause={<>Log streaming is off for <Link href="/settings/logs">this service</Link>.</>}
 *   freeRemedy={<Button variant="secondary">Turn on streaming</Button>}
 *   paidRemedy={<Button variant="tertiary">Compare retention plans</Button>}
 * />
 *
 * @example
 * <EmptyState
 *   kind="filtered"
 *   title="No tables match this filter"
 *   filterSummary="schema: public · name contains “ordr”"
 *   onClearFilters={() => setFilters({})}
 * />
 */
/** The evidence line, and any remedy that turned out to be prose. */
const NOTE_TEXT = [
  "m-0 max-w-[var(--probe-empty-state-max-width)]",
  "text-[length:var(--probe-empty-state-note-font-size)]",
  "leading-[var(--probe-empty-state-note-line-height)]",
  "text-[color:var(--probe-empty-state-note-text)]",
].join(" ");

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  {
    kind,
    icon,
    title,
    description,
    titleAs: Heading = "h2",
    align = "viewport",
    actions,
    cause,
    freeRemedy,
    paidRemedy,
    filterSummary,
    onClearFilters,
    clearFiltersLabel = "Clear filters",
    reason,
    remedy,
    bordered = false,
    children,
    className,
    ...rest
  },
  ref,
) {
  const centred = align === "viewport";
  // A remedy is usually a control, but not every remedy has one to offer —
  // "map both fields in the chart's settings" is a sentence, and there is no
  // button here that maps them. Dropped raw into the actions row it inherited
  // the root font size and colour and read as an orphaned line of text, so a
  // bare string gets the same typography as the note above it.
  const asRemedy = (node: ReactNode) =>
    typeof node === "string" ? <p className={NOTE_TEXT}>{node}</p> : node;
  // The evidence line: one per kind, and no kind carries two of them.
  const note = cause ?? filterSummary ?? reason;
  const kindActions =
    kind === "causal" ? (
      <>
        {asRemedy(freeRemedy)}
        {asRemedy(paidRemedy)}
      </>
    ) : kind === "filtered" ? (
      <Button variant="secondary" iconStart={<FilterX />} onClick={onClearFilters}>
        {clearFiltersLabel}
      </Button>
    ) : kind === "gated" ? (
      asRemedy(remedy)
    ) : null;

  return (
    <div
      ref={ref}
      // Polite: this arrives in a region the user is already looking at,
      // often as the answer to a filter they just typed.
      role="status"
      data-kind={kind}
      data-align={align}
      className={cn(
        "flex flex-col gap-[var(--probe-empty-state-gap)]",
        "p-[var(--probe-empty-state-padding)]",
        "rounded-[var(--probe-empty-state-radius)]",
        "bg-[color:var(--probe-empty-state-background)]",
        "tracking-[var(--probe-empty-state-tracking)]",
        centred ? "items-center justify-center text-center" : "items-start text-left",
        bordered &&
          "border-[length:var(--probe-empty-state-border-width)] border-[color:var(--probe-empty-state-border)]",
        className,
      )}
      {...rest}
    >
      {icon === null ? null : (
        <span
          aria-hidden
          className={cn(
            "text-[color:var(--probe-empty-state-icon)]",
            "[&>svg]:size-[var(--probe-empty-state-icon-size)]",
          )}
        >
          {icon ?? KIND_ICON[kind]}
        </span>
      )}

      <div className="flex max-w-[var(--probe-empty-state-max-width)] flex-col gap-[var(--probe-empty-state-title-gap)]">
        <Heading
          className={cn(
            "m-0 text-[length:var(--probe-empty-state-title-font-size)]",
            "leading-[var(--probe-empty-state-title-line-height)]",
            "[font-weight:var(--probe-empty-state-title-font-weight)]",
            "text-[color:var(--probe-empty-state-title-text)]",
          )}
        >
          {title}
        </Heading>
        {description ? (
          <p
            className={cn(
              "m-0 text-[length:var(--probe-empty-state-description-font-size)]",
              "leading-[var(--probe-empty-state-description-line-height)]",
              "text-[color:var(--probe-empty-state-description-text)]",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>

      {note ? <p className={NOTE_TEXT}>{note}</p> : null}

      {kindActions || actions ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-[var(--probe-empty-state-actions-gap)]",
            centred && "justify-center",
          )}
        >
          {kindActions}
          {actions}
        </div>
      ) : null}

      {children}
    </div>
  );
});

/**
 * Auto-fitting grid of next steps. Collapses to one column when the container
 * is narrower than two tiles.
 *
 * @example
 * <EmptyStateSuggestions>
 *   <EmptyStateSuggestion href="/docs" title="Docs" />
 * </EmptyStateSuggestions>
 */
export const EmptyStateSuggestions = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  function EmptyStateSuggestions({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "grid w-full gap-[var(--probe-empty-state-suggestions-gap)] text-left",
          "grid-cols-[repeat(auto-fit,minmax(var(--probe-empty-state-suggestions-min-column),1fr))]",
          className,
        )}
        {...rest}
      />
    );
  },
);

export interface EmptyStateSuggestionProps extends Omit<ComponentPropsWithoutRef<"a">, "title"> {
  /** A single icon element, shown above the tile's title. */
  icon?: ReactNode;
  /** What this next step is. */
  title: ReactNode;
  /** Why it is worth a click. */
  description?: ReactNode;
}

/**
 * One tile in the suggestion grid. Always a link: give it an `href` so it is
 * focusable and openable in a new tab.
 *
 * @example
 * <EmptyStateSuggestion
 *   href="/docs/webhooks"
 *   icon={<BookOpen />}
 *   title="Webhook reference"
 *   description="Every event Probe can send you."
 * />
 */
export const EmptyStateSuggestion = forwardRef<HTMLAnchorElement, EmptyStateSuggestionProps>(
  function EmptyStateSuggestion({ icon, title, description, className, ...rest }, ref) {
    return (
      <a
        ref={ref}
        className={cn(
          // Same overlay trick as the interactive Card: the hover token is a
          // translucent wash, so it layers on the tile instead of replacing it.
          "relative isolate flex flex-col no-underline",
          "gap-[var(--probe-empty-state-tile-gap)] p-[var(--probe-empty-state-tile-padding)]",
          "rounded-[var(--probe-empty-state-tile-radius)]",
          "border-[length:var(--probe-empty-state-tile-border-width)] border-[color:var(--probe-empty-state-tile-border)]",
          "bg-[color:var(--probe-empty-state-tile-background)]",
          "[transition:border-color_var(--probe-empty-state-tile-transition)]",
          "hover:border-[color:var(--probe-empty-state-tile-border--hover)]",
          "after:pointer-events-none after:absolute after:inset-0 after:z-[-1] after:content-['']",
          "after:bg-[color:var(--probe-empty-state-tile-background--hover)] after:opacity-0",
          "after:[transition:opacity_var(--probe-empty-state-tile-transition)]",
          "hover:after:opacity-100",
          "focus-visible:outline focus-visible:outline-[color:var(--probe-empty-state-tile-focus-ring)]",
          "focus-visible:outline-[length:var(--probe-empty-state-tile-focus-ring-width)]",
          "focus-visible:outline-offset-[var(--probe-empty-state-tile-focus-ring-offset)]",
          className,
        )}
        {...rest}
      >
        {icon ? (
          <span
            aria-hidden
            className={cn(
              "text-[color:var(--probe-empty-state-tile-icon)]",
              "[&>svg]:size-[var(--probe-empty-state-tile-icon-size)]",
            )}
          >
            {icon}
          </span>
        ) : null}
        <span
          className={cn(
            "text-[length:var(--probe-empty-state-tile-title-font-size)]",
            "[font-weight:var(--probe-empty-state-tile-title-font-weight)]",
            "text-[color:var(--probe-empty-state-tile-title-text)]",
          )}
        >
          {title}
        </span>
        {description ? (
          <span
            className={cn(
              "text-[length:var(--probe-empty-state-tile-description-font-size)]",
              "text-[color:var(--probe-empty-state-tile-description-text)]",
            )}
          >
            {description}
          </span>
        ) : null}
      </a>
    );
  },
);
