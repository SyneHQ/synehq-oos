"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Search } from "lucide-react";

import {
  Select,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectContent as ProbeSelectContent,
  SelectTrigger as ProbeSelectTrigger,
  type SelectTriggerProps as ProbeSelectTriggerProps,
} from "@synehq-oos/ui";

import { cn } from "../../lib/utils";

/**
 * The shadcn-shaped door onto Probe's Select. `Select`, `SelectGroup`,
 * `SelectItem`, `SelectLabel` and `SelectSeparator` are the same Radix parts
 * with a Probe skin, so they pass straight through. Only the trigger and the
 * content need an adapter, and only because of the two exports Probe has no
 * answer for: `SelectValue` and `SelectSearch`.
 */

/**
 * Probe's trigger renders the value node itself — the placeholder is a *prop*
 * there, not a child. So this is the raw Radix primitive purely to keep the
 * name working for any direct use; inside our trigger it is a marker we read
 * and then drop (see below). Nesting it in Probe's trigger would not work:
 * two `Select.Value`s fight over the one `valueNode` slot in Radix's context
 * and the selected item's text ends up rendering nowhere.
 */
const SelectValue = SelectPrimitive.Value;
type SelectValueProps = React.ComponentPropsWithoutRef<typeof SelectValue>;

/** The first `<SelectValue>` anywhere in the subtree — call-sites wrap it. */
function findValue(children: React.ReactNode): SelectValueProps | undefined {
  let found: SelectValueProps | undefined;
  React.Children.forEach(children, (child) => {
    if (found || !React.isValidElement(child)) return;
    found =
      child.type === SelectValue
        ? (child.props as SelectValueProps)
        : findValue((child.props as { children?: React.ReactNode }).children);
  });
  return found;
}

/**
 * Lifts `placeholder` off the `<SelectValue>` child and hands it to Probe,
 * which then renders the selection itself.
 *
 * Lossy where a trigger wraps or flanks its `SelectValue` with markup — an
 * icon, a `<Badge>`, a `<div className="truncate">` (six call-sites). Probe's
 * trigger has exactly one slot and it *is* the value, so anything else passed
 * as children replaces the selected text rather than sitting beside it.
 * Showing the selection beats keeping the decoration, so when a `SelectValue`
 * is present the rest of the children go. Triggers with no `SelectValue` at
 * all mean the call-site is painting the value by hand, which is precisely
 * what Probe's `children` override is for, so those pass through untouched.
 */
const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof ProbeSelectTrigger>,
  ProbeSelectTriggerProps
>(function SelectTrigger({ children, ...props }, ref) {
  const value = findValue(children);

  return (
    <ProbeSelectTrigger ref={ref} placeholder={value?.placeholder} {...props}>
      {value ? undefined : children}
    </ProbeSelectTrigger>
  );
});

/**
 * Not a Probe component: a local searchable-select addition. Kept verbatim,
 * since Probe's menus are not filterable and inventing that here would be a
 * design decision, not a bridge.
 */
const SelectSearch = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function SelectSearch({ className, ...props }, ref) {
  return (
    <div className="flex items-center border-b px-3">
      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full bg-transparent py-3 text-sm outline-none aria-invalid:border-destructive placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
});

type SelectContentProps = React.ComponentPropsWithoutRef<typeof ProbeSelectContent> & {
  search?: boolean;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
};

/** Drops items whose text does not match, and groups left with no items. */
function filterChildren(children: React.ReactNode, search: string): React.ReactNode {
  if (!search.trim()) return children;

  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    const element = child as React.ReactElement<{
      children?: React.ReactNode;
    }>;

    if (child.type === SelectGroup) {
      const kept = filterChildren(element.props.children, search);
      return React.Children.count(kept) ? React.cloneElement(element, { children: kept }) : null;
    }

    if (child.type === SelectItem) {
      const label = element.props.children;
      const text = React.isValidElement(label)
        ? (label.props as { children?: React.ReactNode }).children
        : label;
      return String(text).toLowerCase().includes(search.toLowerCase()) ? child : null;
    }

    return child;
  });
}

/**
 * Probe's content owns the portal, the viewport and the scroll buttons, so the
 * search box can no longer sit above the viewport as a fixed header — it goes
 * in as the first child and is made `sticky` to read the same way.
 */
const SelectContent = React.forwardRef<
  React.ComponentRef<typeof ProbeSelectContent>,
  SelectContentProps
>(function SelectContent(
  { children, search = false, searchPlaceholder = "Search...", onSearchChange, ...props },
  ref,
) {
  const [searchValue, setSearchValue] = React.useState("");

  return (
    <ProbeSelectContent ref={ref} {...props}>
      {search && (
        <div className="sticky top-0 z-10 bg-[color:var(--probe-menu-background)]">
          <SelectSearch
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => {
              setSearchValue(event.target.value);
              onSearchChange?.(event.target.value);
            }}
          />
        </div>
      )}
      {search ? filterChildren(children, searchValue) : children}
    </ProbeSelectContent>
  );
});

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectSearch,
};
