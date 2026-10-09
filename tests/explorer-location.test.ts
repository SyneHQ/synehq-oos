import assert from "node:assert/strict";
import test from "node:test";
import { readExplorerLocation } from "../apps/web/src/app/components/explorer-location";

test("the static explorer shell retains connection and console deep links", () => {
  const connectionId = "2a4c7385-77d4-4a2b-9527-252f9f3d0d17";
  for (const suffix of ["", "/"]) {
    assert.deepEqual(
      readExplorerLocation({ pathname: `/explorer/${connectionId}${suffix}`, search: "" }),
      {
        connectionId,
        initialView: "data",
      },
    );
    assert.deepEqual(
      readExplorerLocation({ pathname: `/explorer/${connectionId}/console${suffix}`, search: "" }),
      {
        connectionId,
        initialView: "console",
      },
    );
  }
});

test("an explicit static URL can open a connection without a path fallback", () => {
  assert.deepEqual(
    readExplorerLocation({
      pathname: "/explorer/",
      search: "?connection=connection-1&view=console",
    }),
    {
      connectionId: "connection-1",
      initialView: "console",
    },
  );
  assert.deepEqual(
    readExplorerLocation({ pathname: "/explorer", search: "?connection=connection-1" }),
    {
      connectionId: "connection-1",
      initialView: "data",
    },
  );
});

test("invalid explorer paths never become connection targets", () => {
  for (const pathname of [
    "/connections/connection-1",
    "/explorer/",
    "/explorer//",
    "/explorer/connection-1/unknown",
    "/explorer/connection-1/console/extra",
    "/explorer/%2e%2e",
    "/explorer/%2fapi",
    "/explorer/%00",
    "/explorer/%E0%A4%A",
    `/explorer/${"a".repeat(129)}`,
  ]) {
    assert.equal(readExplorerLocation({ pathname, search: "" }), null, pathname);
  }
});

test("ambiguous static URL parameters are rejected", () => {
  for (const search of [
    "?connection=first&connection=second",
    "?connection=first&view=data&view=console",
    "?connection=first&view=unknown",
    "?connection=..%2Fapi",
    "?connection=",
  ]) {
    assert.equal(readExplorerLocation({ pathname: "/explorer/", search }), null, search);
  }
});
