/** Preserve wire values when an editor opens and closes without a change. */
export function numericEditValue(text: string, original: unknown, preserveText: boolean): unknown {
  if (text === String(original ?? "")) return original;
  if (text === "") return null;
  return preserveText ? text : Number(text);
}
