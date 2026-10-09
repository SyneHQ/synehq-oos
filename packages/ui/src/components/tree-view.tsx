"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "../lib/cn";

export interface TreeNode {
  /** Stable identity. Also what `selectedId` and `onSelect` speak in. */
  id: string;
  label: ReactNode;
  /** Leading glyph — a folder, a table, a file type. Decorative. */
  icon?: ReactNode;
  /** Non-interactive metadata at the end of the row. */
  trailing?: ReactNode;
  /** One leaf action control, rendered beside (never inside) its button. */
  action?: ReactNode;
  /** Cannot be selected. A leaf is inert; a branch remains expandable. */
  disabled?: boolean;
  /** Only meaningful on a branch. Expansion is uncontrolled, by design. */
  defaultExpanded?: boolean;
  /** Presence of this key makes the node a branch, even when empty. */
  children?: TreeNode[];
}

export interface TreeViewProps
  extends Omit<ComponentPropsWithoutRef<"ul">, "children" | "onSelect"> {
  items: TreeNode[];
  /** The currently selected node. Renders `aria-current`, not just a colour. */
  selectedId?: string;
  /** Activation of a leaf or branch. Disabled nodes cannot be selected. */
  onSelect?: (id: string, node: TreeNode) => void;
  /** Accessible name for the whole tree. */
  label?: string;
}

/**
 * A nested, collapsible list: a schema browser, a file tree, a nav hierarchy.
 *
 * Built on `<details>`/`<summary>` rather than `role="tree"` with a roving
 * tabindex. That is a deliberate trade: the disclosure pattern gets keyboard
 * operation, expansion state and screen-reader announcements from the browser
 * for free and cannot fall out of sync, where a hand-rolled ARIA tree has to
 * re-implement all three. The cost is that arrow keys move focus the ordinary
 * way instead of walking the tree — worth it until a file-manager-grade
 * interaction is actually required.
 *
 * Expansion is uncontrolled (`defaultExpanded`); selection is controlled
 * (`selectedId`). Those are the two halves that usually want different owners.
 *
 * @example
 * <TreeView
 *   label="Schema"
 *   selectedId={table}
 *   onSelect={setTable}
 *   items={[
 *     {
 *       id: "public",
 *       label: "public",
 *       icon: <Folder />,
 *       defaultExpanded: true,
 *       children: [
 *         { id: "public.users", label: "users", icon: <TableIcon /> },
 *         { id: "public.orders", label: "orders", icon: <TableIcon /> },
 *       ],
 *     },
 *   ]}
 * />
 */
export const TreeView = forwardRef<HTMLUListElement, TreeViewProps>(function TreeView(
  { className, items, selectedId, onSelect, label, ...rest },
  ref,
) {
  return (
    <ul
      ref={ref}
      aria-label={label}
      className={cn(
        "m-0 list-none p-0",
        "text-[length:var(--probe-tree-view-font-size)]",
        "leading-[var(--probe-tree-view-line-height)]",
        className,
      )}
      {...rest}
    >
      {items.map((node) => (
        <TreeViewNode key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </ul>
  );
});

/** Shared row skin. A summary and a leaf button must be indistinguishable. */
const ROW = [
  "flex w-full items-center text-left",
  "min-h-[var(--probe-tree-view-item-height)]",
  "gap-[var(--probe-tree-view-item-gap)]",
  "px-[var(--probe-tree-view-item-padding-x)]",
  "rounded-[var(--probe-tree-view-radius)]",
  "bg-[color:var(--probe-tree-view-item-background)]",
  "text-[color:var(--probe-tree-view-item-text)]",
  "[transition:background-color_var(--probe-tree-view-transition),color_var(--probe-tree-view-transition)]",
  "hover:bg-[color:var(--probe-tree-view-item-background--hover)]",
  "hover:text-[color:var(--probe-tree-view-item-text--hover)]",
  "active:bg-[color:var(--probe-tree-view-item-background--active)]",
  "focus-visible:outline focus-visible:outline-[length:var(--probe-tree-view-focus-ring-width)]",
  "focus-visible:outline-offset-[var(--probe-tree-view-focus-ring-offset)]",
  "focus-visible:outline-[color:var(--probe-tree-view-focus-ring)]",
  // Each state rule below is one selector heavier than the bare `hover:` rule
  // it has to beat, so Tailwind's output order cannot flip the precedence.
  "data-[selected]:bg-[color:var(--probe-tree-view-item-background--selected)]",
  "data-[selected]:text-[color:var(--probe-tree-view-item-text--selected)]",
  "data-[selected]:hover:bg-[color:var(--probe-tree-view-item-background--selected-hover)]",
  "data-[selected]:hover:text-[color:var(--probe-tree-view-item-text--selected)]",
  "data-[disabled]:text-[color:var(--probe-tree-view-item-text--disabled)]",
].join(" ");

const ICON = [
  "inline-flex shrink-0",
  "text-[color:var(--probe-tree-view-item-icon)]",
  "[&>svg]:size-[var(--probe-tree-view-icon-size)]",
  "group-data-[selected]:text-[color:var(--probe-tree-view-item-icon--selected)]",
].join(" ");

function TreeViewNode({
  node,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  selectedId?: string;
  onSelect?: (id: string, node: TreeNode) => void;
}) {
  const selected = node.id === selectedId;
  const state = {
    "data-selected": selected || undefined,
    "data-disabled": node.disabled || undefined,
  };

  const body = (
    <>
      {node.icon ? (
        <span aria-hidden="true" className={ICON}>
          {node.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{node.label}</span>
      {node.trailing ? (
        <span className="shrink-0 text-xs text-muted-foreground">{node.trailing}</span>
      ) : null}
    </>
  );

  if (!node.children) {
    return (
      <li className="relative">
        <button
          type="button"
          disabled={node.disabled}
          aria-current={selected ? "true" : undefined}
          className={cn("group min-w-0 disabled:pointer-events-none", ROW, node.action && "pr-9")}
          onClick={() => onSelect?.(node.id, node)}
          {...state}
        >
          {/* Aligns a leaf with its siblings' disclosure triangles. */}
          <span aria-hidden="true" className="w-[var(--probe-tree-view-icon-size)] shrink-0" />
          {body}
        </button>
        {node.action ? (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">{node.action}</div>
        ) : null}
      </li>
    );
  }

  return (
    <li>
      <details open={node.defaultExpanded} className="[&[open]>summary>svg]:rotate-90">
        <summary
          aria-current={selected ? "true" : undefined}
          className={cn("group cursor-pointer list-none [&::-webkit-details-marker]:hidden", ROW)}
          // A summary toggles on click; selecting a branch is a separate intent,
          // so it fires alongside rather than instead of the toggle.
          onClick={() => {
            if (!node.disabled) onSelect?.(node.id, node);
          }}
          {...state}
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "shrink-0 size-[var(--probe-tree-view-icon-size)]",
              "text-[color:var(--probe-tree-view-item-icon)]",
              "[transition:transform_var(--probe-tree-view-transition)]",
            )}
          />
          {body}
        </summary>
        <ul
          className={cn(
            "m-0 list-none p-0",
            "ml-[var(--probe-tree-view-indent)]",
            // The guide rail. It replaces the indent's left padding rather than
            // adding to it, so nesting depth stays on the 4px grid.
            "border-l-[length:var(--probe-tree-view-guide-width)]",
            "border-l-[color:var(--probe-tree-view-guide)]",
          )}
        >
          {node.children.map((child) => (
            <TreeViewNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      </details>
    </li>
  );
}
