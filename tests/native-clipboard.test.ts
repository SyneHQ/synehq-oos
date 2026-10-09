import assert from "node:assert/strict";
import test from "node:test";
import {
  readClipboardRows,
  writeClipboardRows,
} from "../packages/explorer/src/cloud/lib/clipboard";
import {
  handleGridClipboardEvent,
  isClipboardShortcut,
  isClipboardTextTarget,
  writeClipboardText,
} from "../packages/explorer/src/cloud/lib/native-clipboard";

function clipboardEvent(type: string, text = "") {
  const values = new Map([["text/plain", text]]);
  let prevented = false;
  const event = {
    type,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
    clipboardData: {
      getData(format: string) {
        return values.get(format) ?? "";
      },
      setData(format: string, value: string) {
        values.set(format, value);
      },
    },
  } as unknown as ClipboardEvent;
  return { event, values };
}

const writable = { editing: false, hasCells: true, canCut: true, canPaste: true };

test("context-menu copy retains the asynchronous clipboard fallback", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const writes: string[] = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text: string) => {
          writes.push(text);
        },
      },
    },
  });
  try {
    await writeClipboardText("9223372036854775807\t123.4500");
    assert.deepEqual(writes, ["9223372036854775807\t123.4500"]);
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("native copy and cut set exact clipboard bytes synchronously and handle each event once", () => {
  const rows = [
    [
      "9223372036854775807",
      "123.4500",
      "2026-10-09 14:25:30.123456+05:30",
      "one\ttwo",
      'line one\n"line two"',
    ],
  ];
  const text = writeClipboardRows(rows);
  for (const type of ["copy", "cut"]) {
    const { event, values } = clipboardEvent(type);
    let calls = 0;
    const write = (nativeEvent: ClipboardEvent) => {
      calls++;
      assert.equal(writeClipboardText(text, nativeEvent), undefined);
    };
    const actions = { copy: write, cut: write, paste: () => assert.fail("Unexpected paste.") };
    handleGridClipboardEvent(event, writable, actions);
    assert.equal(event.defaultPrevented, true);
    assert.equal(values.get("text/plain"), text);
    assert.deepEqual(readClipboardRows(values.get("text/plain")!), rows);
    handleGridClipboardEvent(event, writable, actions);
    assert.equal(calls, 1);
  }
});

test("native paste reads event text before dispatch returns, including an empty clipboard", () => {
  for (const text of ["", "one\ttwo\r\nthree\tfour", "9223372036854775807"]) {
    const { event } = clipboardEvent("paste", text);
    const received: Array<string | undefined> = [];
    handleGridClipboardEvent(event, writable, {
      copy: () => assert.fail("Unexpected copy."),
      cut: () => assert.fail("Unexpected cut."),
      paste: (value) => {
        assert.equal(event.defaultPrevented, true);
        received.push(value);
      },
    });
    assert.deepEqual(received, [text]);
    event.clipboardData!.getData = () => {
      throw new Error("Event data is no longer available.");
    };
    assert.equal(received[0], text);
  }
});

test("read-only grids allow copy and preserve cut, paste, editing, and empty-selection guards", () => {
  for (const type of ["copy", "cut", "paste"]) {
    const { event } = clipboardEvent(type, "value");
    let calls = 0;
    const act = () => {
      calls++;
    };
    handleGridClipboardEvent(
      event,
      { ...writable, canCut: false, canPaste: false },
      { copy: act, cut: act, paste: act },
    );
    assert.equal(calls, type === "copy" ? 1 : 0);
    for (const state of [
      { ...writable, editing: true },
      { ...writable, hasCells: false, canPaste: false },
    ]) {
      const blocked = clipboardEvent(type).event;
      handleGridClipboardEvent(blocked, state, {
        copy: () => assert.fail("Unexpected copy."),
        cut: () => assert.fail("Unexpected cut."),
        paste: () => assert.fail("Unexpected paste."),
      });
      assert.equal(blocked.defaultPrevented, false);
    }
  }
});

test("clipboard shortcuts defer to native events without cancelling keyboard defaults", () => {
  for (const key of ["c", "C", "x", "v"]) {
    for (const modifier of ["ctrlKey", "metaKey"]) {
      const keyboard = {
        key,
        ctrlKey: modifier === "ctrlKey",
        metaKey: modifier === "metaKey",
        shiftKey: false,
      };
      assert.equal(isClipboardShortcut(keyboard), true);
      assert.equal(isClipboardShortcut({ ...keyboard, shiftKey: true }), false);
    }
  }
  assert.equal(
    isClipboardShortcut({ key: "v", ctrlKey: false, metaKey: false, shiftKey: false }),
    false,
  );
  assert.equal(
    isClipboardShortcut({ key: "f", ctrlKey: true, metaKey: false, shiftKey: false }),
    false,
  );
});

test("native text editing is preserved while display-only textbox cells allow grid copy", () => {
  class ElementFixture extends EventTarget {
    constructor(
      readonly tagName: string,
      readonly isContentEditable = false,
      readonly role = "",
    ) {
      super();
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  Object.defineProperty(globalThis, "HTMLElement", { value: ElementFixture, configurable: true });
  try {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"])
      assert.equal(isClipboardTextTarget(new ElementFixture(tagName)), true);
    assert.equal(isClipboardTextTarget(new ElementFixture("DIV", true)), true);
    assert.equal(isClipboardTextTarget(new ElementFixture("DIV", false, "textbox")), false);
    assert.equal(isClipboardTextTarget(new ElementFixture("BUTTON", false, "checkbox")), false);
    assert.equal(isClipboardTextTarget(null), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "HTMLElement", previous);
    else Reflect.deleteProperty(globalThis, "HTMLElement");
  }
});
