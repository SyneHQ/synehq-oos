/** Use spreadsheet quoting so tabs, line breaks, and quotes remain inside their cells. */
export function writeClipboardRows(rows: string[][]): string {
  const quote = (value: string) =>
    value === "" || /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return rows.map((row) => row.map(quote).join("\t")).join("\n");
}

export function readClipboardRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let atStart = true;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"' && atStart) {
      quoted = true;
      atStart = false;
      continue;
    }
    if (character === "\t") {
      row.push(cell);
      cell = "";
      atStart = true;
      continue;
    }
    if (character === "\n" || character === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atStart = true;
      if (character === "\r" && text[index + 1] === "\n") index++;
      continue;
    }
    cell += character;
    atStart = false;
  }
  if (quoted) throw new Error("The clipboard contains an unclosed quoted value.");
  if (!atStart || row.length || !rows.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
