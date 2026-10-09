import type { Column, Table } from "@tanstack/react-table";
import {
  BaselineIcon,
  CalendarIcon,
  CheckSquareIcon,
  File,
  FileArchive,
  FileAudio,
  FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  HashIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  Presentation,
  TextInitialIcon,
} from "lucide-react";
import type * as React from "react";
import type {
  CellOpts,
  CellPosition,
  Direction,
  FileCellData,
  RowHeightValue,
} from "../types/data-grid";

export function flexRender<TProps extends object>(
  Comp: ((props: TProps) => React.ReactNode) | string | undefined,
  props: TProps,
): React.ReactNode {
  if (typeof Comp === "string") {
    return Comp;
  }
  return Comp?.(props);
}

export function getIsFileCellData(item: unknown): item is FileCellData {
  return (
    !!item &&
    typeof item === "object" &&
    "id" in item &&
    "name" in item &&
    "size" in item &&
    "type" in item
  );
}

export function matchSelectOption(
  value: string,
  options: { value: string; label: string }[],
): string | undefined {
  return options.find(
    (o) =>
      o.value === value ||
      o.value.toLowerCase() === value.toLowerCase() ||
      o.label.toLowerCase() === value.toLowerCase(),
  )?.value;
}

export function getCellKey(rowIndex: number, columnId: string) {
  return `${rowIndex}:${columnId}`;
}

export function parseCellKey(cellKey: string): Required<CellPosition> {
  const parts = cellKey.split(":");
  const rowIndexStr = parts[0];
  const columnId = parts[1];
  if (rowIndexStr && columnId) {
    const rowIndex = parseInt(rowIndexStr, 10);
    if (!Number.isNaN(rowIndex)) {
      return { rowIndex, columnId };
    }
  }
  return { rowIndex: 0, columnId: "" };
}

export function getRowHeightValue(rowHeight: RowHeightValue): number {
  const rowHeightMap: Record<RowHeightValue, number> = {
    short: 36,
    medium: 56,
    tall: 76,
    "extra-tall": 96,
  };

  return rowHeightMap[rowHeight];
}

export function getLineCount(rowHeight: RowHeightValue): number {
  const lineCountMap: Record<RowHeightValue, number> = {
    short: 1,
    medium: 2,
    tall: 3,
    "extra-tall": 4,
  };

  return lineCountMap[rowHeight];
}

export function getColumnBorderVisibility<TData>(params: {
  column: Column<TData>;
  nextColumn?: Column<TData>;
  isLastColumn: boolean;
}): {
  showEndBorder: boolean;
  showStartBorder: boolean;
} {
  const { column, nextColumn, isLastColumn } = params;

  const isPinned = column.getIsPinned();
  const isFirstRightPinnedColumn = isPinned === "right" && column.getIsFirstColumn("right");
  const isLastRightPinnedColumn = isPinned === "right" && column.getIsLastColumn("right");

  const nextIsPinned = nextColumn?.getIsPinned();
  const isBeforeRightPinned = nextIsPinned === "right" && nextColumn?.getIsFirstColumn("right");

  const showEndBorder = !isBeforeRightPinned && (isLastColumn || !isLastRightPinnedColumn);

  const showStartBorder = isFirstRightPinnedColumn;

  return {
    showEndBorder,
    showStartBorder,
  };
}

export function getColumnPinningStyle<TData>(params: {
  column: Column<TData>;
  withBorder?: boolean;
  dir?: Direction;
}): React.CSSProperties {
  const { column, withBorder = false, dir = "ltr" } = params;

  const isPinned = column.getIsPinned();
  const isLastLeftPinnedColumn = isPinned === "left" && column.getIsLastColumn("left");
  const isFirstRightPinnedColumn = isPinned === "right" && column.getIsFirstColumn("right");

  const isRtl = dir === "rtl";

  const leftPosition = isPinned === "left" ? `${column.getStart("left")}px` : undefined;
  const rightPosition = isPinned === "right" ? `${column.getAfter("right")}px` : undefined;

  return {
    boxShadow: withBorder
      ? isLastLeftPinnedColumn
        ? isRtl
          ? "4px 0 4px -4px var(--border) inset"
          : "-4px 0 4px -4px var(--border) inset"
        : isFirstRightPinnedColumn
          ? isRtl
            ? "-4px 0 4px -4px var(--border) inset"
            : "4px 0 4px -4px var(--border) inset"
          : undefined
      : undefined,
    left: isRtl ? rightPosition : leftPosition,
    right: isRtl ? leftPosition : rightPosition,
    opacity: isPinned ? 0.97 : 1,
    position: isPinned ? "sticky" : "relative",
    background: isPinned ? "var(--background)" : "var(--background)",
    // NOTE: no width here. Column width is owned by the --col-{id}-size var
    // (single source of truth shared by header and body cells).
    zIndex: isPinned ? 1 : undefined,
  };
}

/** True for objects/arrays and JSON object/array strings. Used to pick JsonCell. */
export function isJsonLike(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "object") {
    return !(value instanceof Date);
  }
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}
export function getColumnAlignment(variant?: CellOpts["variant"]): "start" | "end" {
  return variant === "number" ? "end" : "start";
}

export function getScrollDirection(
  direction: string,
): "left" | "right" | "home" | "end" | undefined {
  if (
    direction === "left" ||
    direction === "right" ||
    direction === "home" ||
    direction === "end"
  ) {
    return direction as "left" | "right" | "home" | "end";
  }
  if (direction === "pageleft") return "left";
  if (direction === "pageright") return "right";
  return undefined;
}

export function scrollCellIntoView<TData>(params: {
  container: HTMLDivElement;
  targetCell: HTMLDivElement;
  tableRef: React.RefObject<Table<TData> | null>;
  viewportOffset: number;
  direction?: "left" | "right" | "home" | "end";
  isRtl: boolean;
}): void {
  const { container, targetCell, tableRef, direction, viewportOffset, isRtl } = params;

  const containerRect = container.getBoundingClientRect();
  const cellRect = targetCell.getBoundingClientRect();

  const hasNegativeScroll = container.scrollLeft < 0;
  const isActuallyRtl = isRtl || hasNegativeScroll;

  const currentTable = tableRef.current;
  const leftPinnedColumns = currentTable?.getLeftVisibleLeafColumns() ?? [];
  const rightPinnedColumns = currentTable?.getRightVisibleLeafColumns() ?? [];

  const leftPinnedWidth = leftPinnedColumns.reduce((sum, c) => sum + c.getSize(), 0);
  const rightPinnedWidth = rightPinnedColumns.reduce((sum, c) => sum + c.getSize(), 0);

  const viewportLeft = isActuallyRtl
    ? containerRect.left + rightPinnedWidth + viewportOffset
    : containerRect.left + leftPinnedWidth + viewportOffset;
  const viewportRight = isActuallyRtl
    ? containerRect.right - leftPinnedWidth - viewportOffset
    : containerRect.right - rightPinnedWidth - viewportOffset;

  const isFullyVisible = cellRect.left >= viewportLeft && cellRect.right <= viewportRight;

  if (isFullyVisible) return;

  const isClippedLeft = cellRect.left < viewportLeft;
  const isClippedRight = cellRect.right > viewportRight;

  let scrollDelta = 0;

  if (!direction) {
    if (isClippedRight) {
      scrollDelta = cellRect.right - viewportRight;
    } else if (isClippedLeft) {
      scrollDelta = -(viewportLeft - cellRect.left);
    }
  } else {
    const shouldScrollRight = isActuallyRtl
      ? direction === "right" || direction === "home"
      : direction === "right" || direction === "end";

    if (shouldScrollRight) {
      scrollDelta = cellRect.right - viewportRight;
    } else {
      scrollDelta = -(viewportLeft - cellRect.left);
    }
  }

  container.scrollLeft += scrollDelta;
}

export function getIsInPopover(element: unknown): boolean {
  return (
    element instanceof Element &&
    (element.closest("[data-grid-cell-editor]") || element.closest("[data-grid-popover]")) !== null
  );
}

export function getColumnVariant(variant?: CellOpts["variant"]): {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
} | null {
  switch (variant) {
    case "short-text":
      return { label: "Short text", icon: BaselineIcon };
    case "long-text":
      return { label: "Long text", icon: TextInitialIcon };
    case "json":
      return { label: "JSON", icon: FileIcon };
    case "number":
      return { label: "Number", icon: HashIcon };
    case "url":
      return { label: "URL", icon: LinkIcon };
    case "checkbox":
      return { label: "Checkbox", icon: CheckSquareIcon };
    case "select":
      return { label: "Select", icon: ListIcon };
    case "multi-select":
      return { label: "Multi-select", icon: ListChecksIcon };
    case "date":
      return { label: "Date", icon: CalendarIcon };
    case "file":
      return { label: "File", icon: FileIcon };
    default:
      return null;
  }
}

export function getUrlHref(urlString: string): string {
  if (!urlString || urlString.trim() === "") return "";

  const trimmed = urlString.trim();

  // Reject dangerous protocols (extra safety, though our http:// prefix would neutralize them)
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

export function parseLocalDate(dateStr: unknown): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr !== "string") return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  // Verify date wasn't auto-corrected (e.g. Feb 30 -> Mar 1)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateForDisplay(dateStr: unknown): string {
  if (!dateStr) return "";
  const date = parseLocalDate(dateStr);
  if (!date) return typeof dateStr === "string" ? dateStr : "";
  return date.toLocaleDateString();
}

// ISO-like date/timestamp: 1962-01-02, 1962-01-02T00:00:00Z, 1962-01-02T14:30:00.123+05:30
const ISO_DATE_LIKE_RE =
  /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2})?)?$/;
const MIDNIGHT_RE = /^00:00(?::00(?:\.0+)?)?$/;

/**
 * Display-only formatting for date/timestamp cells: date-only values render
 * as "YYYY-MM-DD", time-bearing values as "YYYY-MM-DD HH:mm:ss" (with ms /
 * numeric offset preserved). Never goes through Date parsing, so values can
 * not be shifted across timezones. The raw cell value is untouched — this is
 * only what the user sees.
 */
export function formatDateCellForDisplay(value: unknown): string {
  const str = value == null ? "" : String(value);
  const match = ISO_DATE_LIKE_RE.exec(str.trim());
  if (!match) return str;
  const [, date, time, tz] = match;
  if (!time) return date;
  const suffix = tz && tz !== "Z" ? tz : "";
  if (MIDNIGHT_RE.test(time) && !suffix) return date;
  return `${date} ${time}${suffix}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function getFileIcon(type: string): React.ComponentType<React.SVGProps<SVGSVGElement>> {
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("video/")) return FileVideo;
  if (type.startsWith("audio/")) return FileAudio;
  if (type.includes("pdf")) return FileText;
  if (type.includes("zip") || type.includes("rar")) return FileArchive;
  if (type.includes("word") || type.includes("document") || type.includes("doc")) return FileText;
  if (type.includes("sheet") || type.includes("excel") || type.includes("xls"))
    return FileSpreadsheet;
  if (type.includes("presentation") || type.includes("powerpoint") || type.includes("ppt"))
    return Presentation;
  return File;
}

const LOCKED_FROM_STRETCH = ["select", "actions"];

/**
 * CSS custom-property name for a column's pixel width.
 * Column ids can contain spaces ("Adj Close") — those are illegal in
 * `var(--ident)` so the declaration is dropped, width falls back to auto,
 * and header (label min-content) vs body (number min-content) edges drift.
 */
export function columnSizeCssVar(columnId: string): string {
  return `--col-${columnId.replace(/[^A-Za-z0-9_-]/g, "_")}-size`;
}

export interface ColumnWidthInput {
  id: string;
  size: number;
  minSize?: number;
  maxSize?: number;
  pinned?: boolean;
}

/**
 * Deterministic column width resolution shared by the grid header and every
 * body row. Flex-grow is intentionally NOT used for final width computation:
 * rows live inside a `contain: strict` layout island while the header does
 * not, so the browser resolved leftover space differently per region and
 * column edges drifted out of alignment.
 *
 * Rules: locked columns (gutter/actions) and pinned columns keep their
 * declared size; leftover space is distributed evenly over the remaining
 * (stretchable) columns, respecting min/max bounds. When the container is
 * narrower than the natural total, all columns keep declared sizes and the
 * grid scrolls horizontally.
 */
export function computeColumnWidths({
  columns,
  containerWidth,
  stretch,
}: {
  columns: ColumnWidthInput[];
  containerWidth: number;
  stretch?: boolean;
}): Record<string, number> {
  const natural = columns.reduce((sum, col) => sum + col.size, 0);
  const leftover = stretch && containerWidth > 0 ? Math.max(0, containerWidth - natural) : 0;

  const stretchable = columns.filter((col) => !col.pinned && !LOCKED_FROM_STRETCH.includes(col.id));
  const perColumn = stretchable.length > 0 ? leftover / stretchable.length : 0;

  const widths: Record<string, number> = {};
  for (const col of columns) {
    const distributable = !col.pinned && !LOCKED_FROM_STRETCH.includes(col.id) && perColumn > 0;
    const raw = col.size + (distributable ? perColumn : 0);
    const floored = col.minSize !== undefined ? Math.max(col.minSize, raw) : raw;
    widths[col.id] = col.maxSize !== undefined ? Math.min(col.maxSize, floored) : floored;
  }
  return widths;
}

// === Content-measured autosize ============================================
// Canvas-text measurement so column widths follow content exactly: the header
// label, each visible cell value, plus every row in the loaded page sample.
// Applied identically to header and body (see computeColumnWidths) so column
// edges stay colinear everywhere.

let autoSizeCanvasCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (autoSizeCanvasCtx !== undefined) return autoSizeCanvasCtx;
  autoSizeCanvasCtx = document.createElement("canvas").getContext("2d");
  return autoSizeCanvasCtx;
}

function cssFontFamily(): string {
  if (typeof document === "undefined") return "system-ui";
  return getComputedStyle(document.body).fontFamily || "Inter, system-ui, sans-serif";
}

const HEADER_FONT_SIZE = 14;
const CELL_FONT_SIZE = 14;
const HEADER_HEAVY = 600;
const CELL_NORMAL = 400;

export function measureTextWidth(text: string, font: string): number {
  if (!text) return 0;
  const ctx = getMeasureContext();
  if (!ctx) return text.length * (CELL_FONT_SIZE * 0.58); // SSR-safe estimate
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** What a typical data-grid column needs around its content. */
const AUTO_SIZE = {
  headerPadding: 44, // px-4 both sides + resizer inset
  headerIcons: 40, // type icon + menu chevron
  headerBadge: 20,
  cellPadding: 28, // px-3 both sides + spare for focus ring
  minWidth: 64,
  maxWidth: 560,
  // Per-variant constraints
  checkboxWidth: 72,
  numberMin: 88,
} as const;

interface AutoSizeColumn {
  id: string;
  label: string;
  variant: string;
  hasBadge?: boolean;
  pinned?: boolean;
  /** Display formatter (e.g. readable dates) — measure what's actually shown. */
  formatDisplay?: (value: unknown) => string;
}

function serializeCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > 200 ? s.slice(0, 200) + "…" : s;
    } catch {
      return "";
    }
  }
  return String(value);
}

/**
 * For each visible column, compute PX width as
 *   max(headerLabelW, maxCellValueW) + chrome padding,
 * clamped to [variantMin, 560]. The select gutter is fixed by its own def.
 */
export function computeAutoColumnWidths({
  columns,
  rows,
  maxRows = 500,
}: {
  columns: AutoSizeColumn[];
  rows: Array<Record<string, unknown>>;
  maxRows?: number;
}): Record<string, number> {
  const family = cssFontFamily();
  const headerFont = `${HEADER_HEAVY} ${HEADER_FONT_SIZE}px ${family}`;
  const cellFont = `${CELL_NORMAL} ${CELL_FONT_SIZE}px ${family}`;

  const sample = rows.length > maxRows ? rows.slice(0, maxRows) : rows;
  const widths: Record<string, number> = {};

  for (const col of columns) {
    if (col.id === "select" || col.id === "actions") continue;

    if (col.variant === "checkbox") {
      const headerWidth =
        measureTextWidth(col.label, headerFont) +
        AUTO_SIZE.headerPadding +
        AUTO_SIZE.headerIcons +
        (col.hasBadge ? AUTO_SIZE.headerBadge : 0);
      widths[col.id] = Math.min(
        AUTO_SIZE.maxWidth,
        Math.max(AUTO_SIZE.checkboxWidth, Math.ceil(headerWidth)),
      );
      continue;
    }

    // JSON-like payloads use the JSON button/sheet UX → payload size should
    // not drive column width. Mirror render logic in `DataGridCell`.
    const shouldTreatAsJson = col.variant === "json" || sample.some((r) => isJsonLike(r?.[col.id]));

    if (shouldTreatAsJson) {
      const headerW =
        measureTextWidth(col.label, headerFont) +
        AUTO_SIZE.headerPadding +
        AUTO_SIZE.headerIcons +
        (col.hasBadge ? AUTO_SIZE.headerBadge : 0);
      widths[col.id] = Math.min(
        AUTO_SIZE.maxWidth,
        Math.max(AUTO_SIZE.minWidth, Math.ceil(headerW)),
      );
      continue;
    }

    const headerW =
      measureTextWidth(col.label, headerFont) +
      AUTO_SIZE.headerPadding +
      AUTO_SIZE.headerIcons +
      (col.hasBadge ? AUTO_SIZE.headerBadge : 0);

    let maxCellW = 0;
    for (let i = 0; i < sample.length; i++) {
      const raw = sample[i]?.[col.id];
      if (raw === null || raw === undefined || raw === "") continue;
      const text = col.formatDisplay ? col.formatDisplay(raw) : serializeCellValue(raw);
      const w = measureTextWidth(text, cellFont);
      if (w > maxCellW) maxCellW = w;
    }
    const cellW = maxCellW + AUTO_SIZE.cellPadding;

    const isNumber = col.variant === "number";
    const contentW = Math.ceil(Math.max(headerW, cellW));
    const minW = isNumber ? AUTO_SIZE.numberMin : AUTO_SIZE.minWidth;
    widths[col.id] = Math.min(AUTO_SIZE.maxWidth, Math.max(minW, contentW));
  }

  return widths;
}
