import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonDocument, jsonEntries, jsonText } from "../packages/explorer/src/json-document";

test("document fields retain exact JSON number tokens, key order, and duplicate keys", () => {
  const source =
    '{"unsafe":9007199254740993,"decimal":1.2300,"zero":-0,"power":1e-9,"key":1,"key":2}';
  const root = jsonDocument(source);
  assert.equal(jsonText(root), source);
  const fields = jsonEntries(root);
  assert.deepEqual(
    fields.map((field) => field.label),
    ['"unsafe"', '"decimal"', '"zero"', '"power"', '"key"', '"key"'],
  );
  assert.deepEqual(
    fields.map((field) => jsonText(field.node)),
    ["9007199254740993", "1.2300", "-0", "1e-9", "1", "2"],
  );
});

test("nested documents retain canonical EJSON and escaped string boundaries", () => {
  const source =
    '{"_id":{"$oid":"650000000000000000000002"},"items":[{"balance":{"$numberDecimal":"1234567890123456.12345678"},"at":{"$date":{"$numberLong":"1690000000000"}}},"a,[]\\\"{}",true,null]}';
  const fields = jsonEntries(jsonDocument(source));
  assert.equal(jsonText(fields[0].node), '{"$oid":"650000000000000000000002"}');
  const items = jsonEntries(fields[1].node);
  assert.equal(items.length, 4);
  assert.ok(items.every((item) => item.label === ""));
  const nested = jsonEntries(items[0].node);
  assert.equal(jsonText(nested[0].node), '{"$numberDecimal":"1234567890123456.12345678"}');
  assert.equal(jsonText(nested[1].node), '{"$date":{"$numberLong":"1690000000000"}}');
  assert.equal(jsonText(items[1].node), '"a,[]\\\"{}"');
  assert.equal(jsonText(items[2].node), "true");
  assert.equal(jsonText(items[3].node), "null");
});

test("empty and invalid documents remain distinct", () => {
  assert.deepEqual(jsonEntries(jsonDocument(" \n { } \n ")), []);
  assert.throws(() => jsonDocument("[]"), /not a JSON document/);
  assert.throws(() => jsonDocument("null"), /not a JSON document/);
  assert.throws(() => jsonDocument('{"x":}'));
});
