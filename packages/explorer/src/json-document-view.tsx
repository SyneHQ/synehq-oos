"use client";

import { memo, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { Button } from "@synehq-oos/ui";
import { toast } from "sonner";
import type { CellValue } from "@synehq-oos/explorer-contracts";
import {
  jsonDocument,
  jsonEntries,
  jsonText,
  type JsonEntry,
  type JsonNode,
} from "./json-document";

const FIELD_PAGE_SIZE = 100;
const extendedJsonKeys = new Set([
  '"$oid"',
  '"$numberInt"',
  '"$numberLong"',
  '"$numberDouble"',
  '"$numberDecimal"',
  '"$date"',
  '"$timestamp"',
  '"$binary"',
  '"$regularExpression"',
  '"$minKey"',
  '"$maxKey"',
  '"$undefined"',
  '"$symbol"',
  '"$code"',
  '"$dbPointer"',
]);

function valueClass(value: JsonNode): string {
  const first = value.source[value.start];
  if (first === '"') return "json-string";
  if (first === "t" || first === "f") return "json-boolean";
  if (first === "n") return "json-null";
  return "json-number";
}

function JsonFields({ entries, kind }: { entries: JsonEntry[]; kind: "object" | "array" }) {
  const [visible, setVisible] = useState(FIELD_PAGE_SIZE);
  return (
    <>
      {entries.slice(0, visible).map((entry, index) => (
        <FieldValue key={index} entry={entry} comma={index < entries.length - 1} />
      ))}
      {visible < entries.length && (
        <button
          type="button"
          className="json-show-fields"
          onClick={() => setVisible((count) => count + FIELD_PAGE_SIZE)}
        >
          Show next {Math.min(FIELD_PAGE_SIZE, entries.length - visible)}{" "}
          {kind === "array" ? "items" : "fields"}
          <span> · {entries.length - visible} remaining</span>
        </button>
      )}
    </>
  );
}

/** Adapt the main app's recursive FieldValue pattern to exact JSON source text. */
function FieldValue({ entry, comma }: { entry: JsonEntry; comma: boolean }) {
  const { label, node } = entry;
  const entries = useMemo(() => jsonEntries(node), [node]);
  const [expanded, setExpanded] = useState(false);
  const text = jsonText(node);
  const scalar = node.kind === "value";
  const inline =
    scalar ||
    entries.length === 0 ||
    (node.kind === "object" &&
      entries.length === 1 &&
      extendedJsonKeys.has(entries[0].label) &&
      text.length <= 160 &&
      !text.includes("\n"));
  const opening = node.kind === "array" ? "[" : "{";
  const closing = node.kind === "array" ? "]" : "}";
  return (
    <div className="json-field">
      <div className="json-field-line">
        {inline ? (
          <span className="json-toggle-space" />
        ) : (
          <button
            type="button"
            className="json-toggle"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${label || "array item"}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
        {label && (
          <>
            <span className="json-field-key">{label}</span>
            <span className="json-punctuation">: </span>
          </>
        )}
        {inline ? (
          <span className={scalar ? valueClass(node) : "json-extended"}>
            {text}
            {comma ? "," : ""}
          </span>
        ) : (
          <span className="json-punctuation">
            {opening}
            {!expanded && (
              <>
                {" "}
                … {closing}
                {comma ? "," : ""}
                <span className="json-size">
                  {" "}
                  {entries.length} {node.kind === "array" ? "items" : "fields"}
                </span>
              </>
            )}
          </span>
        )}
      </div>
      {!inline && expanded && (
        <>
          <div className="json-nested">
            <JsonFields entries={entries} kind={node.kind === "array" ? "array" : "object"} />
          </div>
          <div className="json-closing">
            {closing}
            {comma ? "," : ""}
          </div>
        </>
      )}
    </div>
  );
}

const DocumentCard = memo(function DocumentCard({
  document,
  index,
}: {
  document: CellValue;
  index: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [copying, setCopying] = useState(false);
  const parsed = useMemo(() => {
    if (typeof document !== "string") return null;
    try {
      return jsonEntries(jsonDocument(document));
    } catch {
      return null;
    }
  }, [document]);
  async function copy() {
    if (typeof document !== "string" || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(document);
      toast.success("Document copied.");
    } catch {
      toast.error("The document could not be copied. Check browser clipboard access.");
    } finally {
      setCopying(false);
    }
  }
  return (
    <li className="json-document-card">
      <div className="json-document-heading">
        <button
          type="button"
          className="json-document-disclosure"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Document {index + 1}
        </button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void copy()}
          disabled={typeof document !== "string" || copying}
          aria-label={`Copy document ${index + 1}`}
          title="Copy original JSON"
        >
          <Copy size={13} />
        </Button>
      </div>
      {expanded && (
        <div className="json-document-content">
          {parsed ? (
            <>
              <div className="json-root-brace">{"{"}</div>
              <JsonFields entries={parsed} kind="object" />
              <div className="json-root-brace">{"}"}</div>
            </>
          ) : (
            <>
              <p role="alert" className="json-document-error">
                This result is not a valid JSON document.
              </p>
              <pre>{typeof document === "string" ? document : String(document)}</pre>
            </>
          )}
        </div>
      )}
    </li>
  );
});

/** Read-only adaptation of SyneHQ/app.ts JsonDocumentView. The host supplies one result page. */
export function JsonDocumentView({
  documents,
  startIndex = 0,
}: {
  documents: CellValue[];
  startIndex?: number;
}) {
  return (
    <section className="json-document-view" aria-label="MongoDB documents">
      {documents.length ? (
        <ol className="json-document-list" start={startIndex + 1}>
          {documents.map((document, index) => (
            <DocumentCard key={startIndex + index} document={document} index={startIndex + index} />
          ))}
        </ol>
      ) : (
        <div className="json-document-empty">
          <strong>No documents found.</strong>
          <p>
            The query for this page returned no documents. Check the command or return to the
            previous page.
          </p>
        </div>
      )}
    </section>
  );
}
