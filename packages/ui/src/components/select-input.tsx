"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  type SelectTriggerProps,
} from "./select";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectInputProps
  extends Omit<
    SelectTriggerProps,
    "children" | "defaultValue" | "name" | "onChange" | "required" | "value"
  > {
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
}

/** A controlled toolbar select. Use the composable Select for named form fields. */
export function SelectInput({
  value,
  options,
  onValueChange,
  disabled,
  ...triggerProps
}: SelectInputProps) {
  // Radix reserves the empty string for its placeholder. Prefix every option so
  // an empty database name and a name containing the prefix remain distinct.
  const encodedValue = options.some((option) => option.value === value) ? `value:${value}` : "";

  return (
    <Select
      value={encodedValue}
      onValueChange={(next) => onValueChange(next.slice("value:".length))}
      disabled={disabled || options.length === 0}
    >
      <SelectTrigger {...triggerProps} />
      <SelectContent style={{ minWidth: "var(--radix-select-trigger-width)" }}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={`value:${option.value}`}
            textValue={option.label}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
