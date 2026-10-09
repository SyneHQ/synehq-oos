import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "../lib/cn";

/** `none` still renders the sort affordance — it is sortable, just not sorted. */
export type TableSortDirection = "asc" | "desc" | "none";

const CELL = [
  "px-[var(--probe-table-cell-padding-x)] py-[var(--probe-table-cell-padding-y)]",
  "text-left align-middle",
].join(" ");

export interface TableProps extends ComponentPropsWithoutRef<"table"> {
  /** Accessible name. Use it whenever no visible heading already names the table. */
  label?: string;
  /** Class for the scroll container that owns the frame, not the `<table>`. */
  containerClassName?: string;
  /**
   * Attributes for that same scroll container. A table capped in height scrolls
   * *here*, so this is the only element that can carry the `role="region"`,
   * `aria-label` and `tabIndex={0}` such a box needs — put them on a wrapper the
   * caller owns and the keyboard lands on something arrow keys do not move.
   * `className` is `containerClassName`'s job.
   */
  containerProps?: Omit<ComponentPropsWithoutRef<"div">, "className">;
}

/**
 * A data table. The frame (1px border, square) lives on the scroll container so
 * horizontal overflow scrolls *inside* the border instead of tearing it.
 *
 * Every part is a plain element — Probe does not own sorting, selection or
 * pagination state. Drive `sort` on `TableHead` and `selected` on `TableRow`
 * from wherever that state already lives.
 *
 * @example
 * <Table label="Recent queries">
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead sort={dir} onSort={toggle}>Query</TableHead>
 *       <TableHead numeric>Rows</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     {rows.map((r) => (
 *       <TableRow key={r.id} selected={r.id === activeId}>
 *         <TableCell>{r.sql}</TableCell>
 *         <TableCell numeric>{r.rowCount}</TableCell>
 *       </TableRow>
 *     ))}
 *   </TableBody>
 * </Table>
 */
export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { className, containerClassName, containerProps, label, ...rest },
  ref,
) {
  return (
    <div
      {...containerProps}
      className={cn(
        "w-full overflow-x-auto",
        "rounded-[var(--probe-table-radius)]",
        "border-[length:var(--probe-table-border-width)] border-solid border-[color:var(--probe-table-border)]",
        "bg-[color:var(--probe-table-background)]",
        containerClassName,
      )}
    >
      <table
        ref={ref}
        aria-label={label}
        className={cn(
          "w-full border-collapse",
          "text-[length:var(--probe-table-font-size)]",
          "leading-[var(--probe-table-line-height)]",
          className,
        )}
        {...rest}
      />
    </div>
  );
});

export type TableSectionProps = ComponentPropsWithoutRef<"thead">;

export const TableHeader = forwardRef<HTMLTableSectionElement, TableSectionProps>(
  function TableHeader({ className, ...rest }, ref) {
    return (
      <thead
        ref={ref}
        className={cn(
          "bg-[color:var(--probe-table-header-background)]",
          "[&>tr]:border-b-[length:var(--probe-table-border-width)]",
          "[&>tr]:border-b-[color:var(--probe-table-header-border)]",
          className,
        )}
        {...rest}
      />
    );
  },
);

export const TableBody = forwardRef<HTMLTableSectionElement, TableSectionProps>(function TableBody(
  { className, ...rest },
  ref,
) {
  // The last row's rule is dropped: the container border already closes the box.
  return <tbody ref={ref} className={cn("[&>tr:last-child]:border-b-0", className)} {...rest} />;
});

export const TableFooter = forwardRef<HTMLTableSectionElement, TableSectionProps>(
  function TableFooter({ className, ...rest }, ref) {
    return (
      <tfoot
        ref={ref}
        className={cn(
          "bg-[color:var(--probe-table-footer-background)]",
          "[&>tr]:border-t-[length:var(--probe-table-border-width)]",
          "[&>tr]:border-t-[color:var(--probe-table-header-border)]",
          "[&>tr]:border-b-0",
          className,
        )}
        {...rest}
      />
    );
  },
);

export interface TableRowProps extends ComponentPropsWithoutRef<"tr"> {
  /** Renders `aria-selected` as well as the accent wash — never colour alone. */
  selected?: boolean;
}

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(function TableRow(
  { className, selected, ...rest },
  ref,
) {
  return (
    <tr
      ref={ref}
      aria-selected={selected}
      data-selected={selected || undefined}
      className={cn(
        "min-h-[var(--probe-table-row-height)]",
        "bg-[color:var(--probe-table-row-background)]",
        "border-b-[length:var(--probe-table-border-width)] border-b-[color:var(--probe-table-row-border)]",
        "[transition:background-color_var(--probe-table-transition)]",
        "hover:bg-[color:var(--probe-table-row-background--hover)]",
        // One selector heavier than the bare `hover:` rule above, so CSS
        // output order cannot flip which of the two wins.
        "data-[selected]:bg-[color:var(--probe-table-row-background--selected)]",
        "data-[selected]:hover:bg-[color:var(--probe-table-row-background--selected-hover)]",
        className,
      )}
      {...rest}
    />
  );
});

export interface TableHeadProps extends Omit<ComponentPropsWithoutRef<"th">, "onSort"> {
  /**
   * Present = this column is sortable. `asc`/`desc` also set `aria-sort`, so
   * the announced state and the drawn arrow cannot drift apart.
   */
  sort?: TableSortDirection;
  /** Called when the header button is activated. Required for `sort` to be interactive. */
  onSort?: () => void;
  /** Right-aligns and switches to tabular figures. */
  numeric?: boolean;
}

const SORT_ICON: Record<TableSortDirection, ReactNode> = {
  asc: <ArrowUp />,
  desc: <ArrowDown />,
  none: <ChevronsUpDown />,
};

/**
 * A column header. Tiny, uppercase, wide-tracked — the same treatment as a
 * SideNav section label, because both are labels for a region rather than copy.
 */
export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  { className, sort, onSort, numeric, children, ...rest },
  ref,
) {
  const label = (
    <span
      className={cn(
        "inline-flex items-center gap-[var(--probe-table-header-gap)]",
        numeric && "flex-row-reverse",
      )}
    >
      {children}
      {sort ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex shrink-0",
            "[&>svg]:size-[var(--probe-table-sort-icon-size)]",
            sort === "none"
              ? "text-[color:var(--probe-table-sort-icon)]"
              : "text-[color:var(--probe-table-sort-icon--active)]",
          )}
        >
          {SORT_ICON[sort]}
        </span>
      ) : null}
    </span>
  );

  return (
    <th
      ref={ref}
      scope="col"
      aria-sort={
        sort === "asc" ? "ascending" : sort === "desc" ? "descending" : sort ? "none" : undefined
      }
      className={cn(
        CELL,
        "whitespace-nowrap",
        "text-[length:var(--probe-table-header-font-size)]",
        "leading-[var(--probe-table-header-line-height)]",
        "[font-weight:var(--probe-table-header-font-weight)]",
        "tracking-[var(--probe-table-header-tracking)] uppercase",
        "text-[color:var(--probe-table-header-text)]",
        numeric && "text-right tabular-nums",
        sort && "p-0",
        className,
      )}
      {...rest}
    >
      {sort ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "flex h-full w-full items-center",
            CELL,
            numeric && "justify-end",
            "[transition:background-color_var(--probe-table-transition)]",
            "hover:bg-[color:var(--probe-table-header-background--hover)]",
            "focus-visible:outline focus-visible:outline-[length:var(--probe-table-header-focus-ring-width)]",
            "focus-visible:outline-offset-[var(--probe-table-header-focus-ring-offset)]",
            "focus-visible:outline-[color:var(--probe-table-header-focus-ring)]",
          )}
        >
          {label}
        </button>
      ) : (
        label
      )}
    </th>
  );
});

export interface TableCellProps extends ComponentPropsWithoutRef<"td"> {
  /** Right-aligns and switches to tabular figures so digits line up by column. */
  numeric?: boolean;
  /** Secondary text colour for supporting values — never for the row's subject. */
  faint?: boolean;
}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { className, numeric, faint, ...rest },
  ref,
) {
  return (
    <td
      ref={ref}
      className={cn(
        CELL,
        faint
          ? "text-[color:var(--probe-table-cell-text--faint)]"
          : "text-[color:var(--probe-table-cell-text)]",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...rest}
    />
  );
});

export type TableCaptionProps = ComponentPropsWithoutRef<"caption">;

/**
 * A visible table name. `caption-bottom` deliberately: the caption reads as a
 * footnote about the data, and a top caption fights the column headers.
 */
export const TableCaption = forwardRef<HTMLTableCaptionElement, TableCaptionProps>(
  function TableCaption({ className, ...rest }, ref) {
    return (
      <caption
        ref={ref}
        className={cn(
          "caption-bottom text-left",
          "px-[var(--probe-table-cell-padding-x)] py-[var(--probe-table-caption-padding-y)]",
          "text-[length:var(--probe-table-caption-font-size)]",
          "leading-[var(--probe-table-caption-line-height)]",
          "text-[color:var(--probe-table-caption-text)]",
          className,
        )}
        {...rest}
      />
    );
  },
);
