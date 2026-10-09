export interface JsonNode {
  source: string;
  start: number;
  end: number;
  kind: "object" | "array" | "value";
}

export interface JsonEntry {
  label: string;
  node: JsonNode;
}

function whitespace(source: string, index: number): number {
  while (/\s/.test(source[index] ?? "") && index < source.length) index++;
  return index;
}

function valueEnd(source: string, start: number): number {
  let depth = 0;
  let quoted = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (character === "\\") index++;
      else if (character === '"') {
        quoted = false;
        if (depth === 0) return index + 1;
      }
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") depth++;
    else if (character === "}" || character === "]") {
      if (depth === 0) return index;
      if (--depth === 0) return index + 1;
    } else if (depth === 0 && (character === "," || /\s/.test(character))) return index;
  }
  return source.length;
}

function node(source: string, start: number, end: number): JsonNode {
  return {
    source,
    start,
    end,
    kind: source[start] === "{" ? "object" : source[start] === "[" ? "array" : "value",
  };
}

/** Validate syntax, then retain source ranges. Do not convert numeric tokens for display or copy. */
export function jsonDocument(source: string): JsonNode {
  JSON.parse(source);
  const start = whitespace(source, 0);
  if (source[start] !== "{") throw new Error("The result is not a JSON document.");
  return node(source, start, valueEnd(source, start));
}

export function jsonText(value: JsonNode): string {
  return value.source.slice(value.start, value.end);
}

/** Read one container level. Nested fields are read only when the viewer opens them. */
export function jsonEntries(value: JsonNode): JsonEntry[] {
  if (value.kind === "value") return [];
  const entries: JsonEntry[] = [];
  let index = whitespace(value.source, value.start + 1);
  while (index < value.end - 1) {
    let label = "";
    if (value.kind === "object") {
      const keyEnd = valueEnd(value.source, index);
      label = value.source.slice(index, keyEnd);
      index = whitespace(value.source, whitespace(value.source, keyEnd) + 1);
    }
    const end = valueEnd(value.source, index);
    entries.push({ label, node: node(value.source, index, end) });
    index = whitespace(value.source, end);
    if (value.source[index] === ",") index = whitespace(value.source, index + 1);
  }
  return entries;
}
