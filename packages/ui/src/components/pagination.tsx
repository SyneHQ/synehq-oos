"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../lib/cn";

/** Always show the first and last page, however far away they are. */
const BOUNDARY_COUNT = 1;

const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(end - start + 1, 0) }, (_, i) => start + i);

/**
 * The page list with the middle collapsed. The item count stays constant as
 * the user pages through, so the buttons never shuffle sideways under the
 * cursor. An ellipsis only appears where it actually saves space — a gap of
 * one page renders that page instead, since "… 5 …" is no shorter than "4 5 6".
 *
 * @example
 * paginationRange(1, 10, 1)  // [1, 2, 3, 4, 5, "ellipsis", 10]
 * paginationRange(6, 10, 1)  // [1, "ellipsis", 5, 6, 7, "ellipsis", 10]
 * paginationRange(10, 10, 1) // [1, "ellipsis", 6, 7, 8, 9, 10]
 * paginationRange(4, 6, 1)   // [1, 2, 3, 4, 5, 6]
 */
export function paginationRange(
  page: number,
  count: number,
  siblingCount = 1,
): (number | "ellipsis")[] {
  const startPages = range(1, Math.min(BOUNDARY_COUNT, count));
  const endPages = range(Math.max(count - BOUNDARY_COUNT + 1, BOUNDARY_COUNT + 1), count);

  const siblingsStart = Math.max(
    Math.min(page - siblingCount, count - BOUNDARY_COUNT - siblingCount * 2 - 1),
    BOUNDARY_COUNT + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(page + siblingCount, BOUNDARY_COUNT + siblingCount * 2 + 2),
    endPages.length > 0 ? endPages[0] - 2 : count - 1,
  );

  return [
    ...startPages,
    ...(siblingsStart > BOUNDARY_COUNT + 2
      ? (["ellipsis"] as const)
      : BOUNDARY_COUNT + 1 < count - BOUNDARY_COUNT
        ? [BOUNDARY_COUNT + 1]
        : []),
    ...range(siblingsStart, siblingsEnd),
    ...(siblingsEnd < count - BOUNDARY_COUNT - 1
      ? (["ellipsis"] as const)
      : count - BOUNDARY_COUNT > BOUNDARY_COUNT
        ? [count - BOUNDARY_COUNT]
        : []),
    ...endPages,
  ];
}

const ITEM = [
  "inline-flex shrink-0 select-none items-center justify-center",
  "h-[var(--probe-pagination-item-size)] min-w-[var(--probe-pagination-item-size)]",
  "px-[var(--probe-pagination-item-padding-x)]",
  "rounded-[var(--probe-pagination-radius)]",
  "border-[length:var(--probe-pagination-border-width)] border-solid",
  "border-[color:var(--probe-pagination-item-border)]",
  "bg-[color:var(--probe-pagination-item-background)]",
  "text-[length:var(--probe-pagination-font-size)]",
  "leading-[var(--probe-pagination-line-height)]",
  "tracking-[var(--probe-pagination-tracking)]",
  "[font-weight:var(--probe-pagination-item-font-weight)]",
  "text-[color:var(--probe-pagination-item-text)]",
  "[transition:var(--probe-pagination-transition)]",
  "hover:border-[color:var(--probe-pagination-item-border--hover)]",
  "hover:bg-[color:var(--probe-pagination-item-background--hover)]",
  "hover:text-[color:var(--probe-pagination-item-text--hover)]",
  "active:bg-[color:var(--probe-pagination-item-background--active)]",
  "focus-visible:outline focus-visible:outline-[color:var(--probe-pagination-focus-ring)]",
  "focus-visible:outline-[length:var(--probe-pagination-focus-ring-width)]",
  "focus-visible:outline-offset-[var(--probe-pagination-focus-ring-offset)]",
  "disabled:pointer-events-none",
  "disabled:border-transparent",
  "disabled:bg-[color:var(--probe-pagination-item-background--disabled)]",
  "disabled:text-[color:var(--probe-pagination-item-text--disabled)]",
  // Spelled out on hover too: variant ordering must never let the hover tint
  // wash the current page back to neutral.
  "aria-[current=page]:border-[color:var(--probe-pagination-item-border--selected)]",
  "aria-[current=page]:bg-[color:var(--probe-pagination-item-background--selected)]",
  "aria-[current=page]:text-[color:var(--probe-pagination-item-text--selected)]",
  "aria-[current=page]:[font-weight:var(--probe-pagination-item-font-weight--selected)]",
  "aria-[current=page]:hover:border-[color:var(--probe-pagination-item-border--selected)]",
  "aria-[current=page]:hover:bg-[color:var(--probe-pagination-item-background--selected)]",
  "aria-[current=page]:hover:text-[color:var(--probe-pagination-item-text--selected)]",
].join(" ");

const ICON =
  "[&>svg]:h-[var(--probe-pagination-icon-size)] [&>svg]:w-[var(--probe-pagination-icon-size)]";

export interface PaginationProps
  extends Omit<ComponentPropsWithoutRef<"nav">, "children" | "onChange"> {
  /** Current page, 1-based. */
  page: number;
  /** Total number of pages. Below 1 the component renders nothing. */
  count: number;
  /** Called with the 1-based page the user picked. */
  onPageChange: (page: number) => void;
  /** Pages shown either side of the current one. */
  siblingCount?: number;
  /** Optional context line, e.g. "Showing 41–60 of 214". */
  summary?: ReactNode;
  /** Accessible name — override when a page has more than one pagination. */
  "aria-label"?: string;
  labels?: {
    previous?: string;
    next?: string;
    /** Receives the 1-based page number. */
    page?: (page: number) => string;
  };
}

/**
 * Pagination — page numbers with a collapsed middle, plus prev/next.
 *
 * Every control is a real `<button>`, so the whole strip is tab-reachable and
 * the ends genuinely disable at the first and last page. The current page is
 * `aria-current="page"`; the ellipses are decorative and hidden from the
 * accessibility tree.
 *
 * @example
 * const [page, setPage] = useState(1);
 *
 * <Pagination
 *   page={page}
 *   count={12}
 *   onPageChange={setPage}
 *   summary={`Showing ${(page - 1) * 20 + 1}–${page * 20} of 240`}
 * />
 * // page 1 → ‹ 1 2 3 4 5 … 12 ›   page 6 → ‹ 1 … 5 6 7 … 12 ›
 */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(
  {
    page,
    count,
    onPageChange,
    siblingCount = 1,
    summary,
    labels,
    className,
    "aria-label": ariaLabel = "Pagination",
    ...rest
  },
  ref,
) {
  if (count < 1) return null;

  const current = Math.min(Math.max(page, 1), count);
  const pageLabel = labels?.page ?? ((n: number) => `Go to page ${n}`);

  return (
    <nav
      ref={ref}
      aria-label={ariaLabel}
      className={cn(
        "flex items-center justify-between gap-[var(--probe-pagination-gap)]",
        className,
      )}
      {...rest}
    >
      {summary ? (
        <span
          className={cn(
            "text-[length:var(--probe-pagination-font-size)]",
            "leading-[var(--probe-pagination-line-height)]",
            "tracking-[var(--probe-pagination-tracking)]",
            "text-[color:var(--probe-pagination-summary-text)]",
          )}
        >
          {summary}
        </span>
      ) : null}

      <ul className="m-0 flex list-none items-center gap-[var(--probe-pagination-gap)] p-0">
        <li>
          <button
            type="button"
            aria-label={labels?.previous ?? "Go to previous page"}
            disabled={current <= 1}
            onClick={() => onPageChange(current - 1)}
            className={cn(ITEM, ICON)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        </li>

        {paginationRange(current, count, siblingCount).map((item, index) =>
          item === "ellipsis" ? (
            <li
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className={cn(
                "inline-flex items-center justify-center",
                "h-[var(--probe-pagination-item-size)] min-w-[var(--probe-pagination-item-size)]",
                "text-[length:var(--probe-pagination-font-size)]",
                "leading-[var(--probe-pagination-line-height)]",
                "text-[color:var(--probe-pagination-ellipsis-text)]",
              )}
            >
              &hellip;
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                aria-label={pageLabel(item)}
                aria-current={item === current ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={ITEM}
              >
                {item}
              </button>
            </li>
          ),
        )}

        <li>
          <button
            type="button"
            aria-label={labels?.next ?? "Go to next page"}
            disabled={current >= count}
            onClick={() => onPageChange(current + 1)}
            className={cn(ITEM, ICON)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </li>
      </ul>
    </nav>
  );
});
