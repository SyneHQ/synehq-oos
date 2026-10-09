export function isClipboardTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

export function isClipboardShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">,
): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    ["c", "x", "v"].includes(event.key.toLowerCase())
  );
}

/** Native clipboard data must be set before the event handler returns. */
export function writeClipboardText(text: string, event?: ClipboardEvent): void | Promise<void> {
  if (event?.clipboardData) {
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    return;
  }
  event?.preventDefault();
  return navigator.clipboard.writeText(text);
}

export function handleGridClipboardEvent(
  event: ClipboardEvent,
  state: { editing: boolean; hasCells: boolean; canCut: boolean; canPaste: boolean },
  actions: {
    copy: (event: ClipboardEvent) => void;
    cut: (event: ClipboardEvent) => void;
    paste: (text: string | undefined) => void;
  },
): void {
  if (event.defaultPrevented || state.editing) return;
  if (event.type === "copy" && state.hasCells) actions.copy(event);
  else if (event.type === "cut" && state.hasCells && state.canCut) actions.cut(event);
  else if (event.type === "paste" && state.canPaste) {
    const text = event.clipboardData?.getData("text/plain");
    event.preventDefault();
    actions.paste(text);
  }
}
