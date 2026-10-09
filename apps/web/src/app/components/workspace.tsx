"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Database,
  FileCode2,
  FolderOpen,
  KeyRound,
  Layers,
  LogOut,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Table2,
  Terminal,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button, Input, Spinner } from "@synehq-oos/ui";
import {
  DatabaseGrid,
  SchemaDiagram,
  SchemaTree,
  SqlEditor,
  schemaTableId,
  type GridMutationBatch,
} from "@synehq-oos/explorer";
import type {
  ConnectionSummary,
  OwnerSummary,
  QueryOperation,
  QueryTarget,
  SchemaTable,
  PreparedRowChanges,
  RowMutationScope,
} from "@synehq-oos/explorer-contracts";
import { api, errorMessage } from "./api";
import { Brand } from "./brand";
import { ConnectionForm } from "./connection-form";
import { WriteReview, type PreparedWrite } from "./write-review";
import { AISettings } from "./ai-settings";
import { SqlAssistant } from "./sql-assistant";
import { RowReview, RowOperationRecovery, type RowReviewSession } from "./row-review";

const engineName = (engine: string) => (engine === "postgres" ? "PostgreSQL" : "MySQL");
const QueryResultChart = dynamic(
  () => import("@synehq-oos/charts").then((module) => module.QueryResultChart),
  {
    ssr: false,
    loading: () => (
      <div className="panel-loading">
        <Spinner size="sm" label="Loading chart" />
        Loading chart...
      </div>
    ),
  },
);
type View = "data" | "structure" | "relationships" | "console";
export function Workspace({
  connectionId,
  initialView = "data",
}: {
  connectionId?: string;
  initialView?: View;
}) {
  const router = useRouter();
  const [owner, setOwner] = useState<OwnerSummary | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [aiSettings, setAiSettings] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [testState, setTestState] = useState<
    Record<string, { busy?: boolean; message: string; ok?: boolean }>
  >({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const connection = connections.find((item) => item.id === connectionId);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const session = await api<{ owner: OwnerSummary | null }>("/api/session", { signal });
        if (!session.owner) {
          const setup = await api<{ initialized: boolean }>("/api/setup", { signal });
          router.replace(setup.initialized ? "/login" : "/setup");
          return;
        }
        const data = await api<{ connections: ConnectionSummary[] }>("/api/connections", {
          signal,
        });
        setOwner(session.owner);
        setConnections(data.connections);
      } catch (cause) {
        if (!signal?.aborted) setError(errorMessage(cause));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [router],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function test(id: string) {
    setTestState((state) => ({ ...state, [id]: { busy: true, message: "Testing connection..." } }));
    try {
      await api(`/api/connections/${encodeURIComponent(id)}/test`, { method: "POST" });
      setTestState((state) => ({ ...state, [id]: { ok: true, message: "Connection verified." } }));
    } catch (cause) {
      setTestState((state) => ({ ...state, [id]: { ok: false, message: errorMessage(cause) } }));
    }
  }
  async function remove(item: ConnectionSummary) {
    if (
      !window.confirm(
        `Remove “${item.label}” from this installation? This does not change the database.`,
      )
    )
      return;
    setDeleting(item.id);
    setError("");
    try {
      await api(`/api/connections/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      setConnections((items) => items.filter((value) => value.id !== item.id));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeleting(null);
    }
  }
  if (loading && !owner)
    return (
      <div className="boot-screen">
        <Brand />
        <Spinner label="Opening your workspace" />
        <p>Opening your workspace...</p>
      </div>
    );
  if (!owner)
    return (
      <div className="boot-screen">
        <Brand />
        <p className="form-error" role="alert">
          {error || "Sign in to continue."}
        </p>
        <Button onClick={() => void load()}>Retry</Button>
      </div>
    );
  return (
    <div
      className={`workspace ${mobileNav ? "nav-open" : ""}`}
      onClickCapture={(event) => {
        if (navigationLocked && (event.target as Element).closest("a")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <a href="/connections" aria-label="SyneHQ OOS home">
            <Brand />
          </a>
          <button
            className="mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <div className="installation-label">
          <span className="status-dot" /> Personal installation
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <a href="/connections" className={!connectionId ? "active" : ""}>
            <Layers size={16} />
            Connections<span className="nav-count">{connections.length}</span>
          </a>
        </nav>
        <div className="sidebar-section-title">
          YOUR DATABASES
          <button onClick={() => setAdding(true)} aria-label="Add connection">
            <Plus size={15} />
          </button>
        </div>
        <nav className="connection-nav" aria-label="Database connections">
          {connections.map((item) => (
            <a
              key={item.id}
              href={`/explorer/${encodeURIComponent(item.id)}`}
              onClick={() => setMobileNav(false)}
              className={connectionId === item.id ? "active" : ""}
            >
              <Database size={15} />
              <span>
                {item.label}
                <small>{engineName(item.engine)}</small>
              </span>
              {connectionId === item.id && <span className="connection-active-dot" />}
            </a>
          ))}
          {connections.length === 0 && (
            <p className="sidebar-empty">Your connections will appear here.</p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-settings"
            onClick={() => setAiSettings(true)}
            title="AI provider settings"
          >
            <Settings2 size={16} />
            <span>AI settings</span>
          </button>
          <div className="sidebar-note">
            <ShieldCheck size={16} />
            <span>
              Your connections.
              <br />
              Your infrastructure.
            </span>
          </div>
          <div className="owner-menu">
            <span className="owner-avatar">{owner.name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{owner.name}</strong>
              <small>Installation owner</small>
            </span>
            <button
              disabled={navigationLocked}
              onClick={() => void signOut({ callbackUrl: "/login" })}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="workspace-main">
        <header className="workspace-header">
          <button
            className="mobile-menu"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Layers size={18} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{connection?.label ?? "Connections"}</strong>
          </div>
          <span className="header-tag">
            <ShieldCheck size={13} />
            {connection
              ? connection.readOnly
                ? "Read-only access"
                : "Writes require approval"
              : "Self-hosted"}
          </span>
        </header>
        {connectionId ? (
          connection ? (
            <DatabaseWorkspace
              key={`${connection.id}:${connection.revision}`}
              connection={connection}
              initialView={initialView}
              onAISettings={() => setAiSettings(true)}
              onNavigationLock={setNavigationLocked}
            />
          ) : (
            <div className="page-empty">
              <Database />
              <h2>Connection not found.</h2>
              <p>The connection may have been removed.</p>
              <a href="/connections">Back to connections</a>
            </div>
          )
        ) : (
          <section className="connections-page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">YOUR DATA, IN ONE PLACE</p>
                <h1>Connections</h1>
                <p>Connect a database. Start with a table, or go straight to SQL.</p>
              </div>
              <Button variant="primary" iconStart={<Plus />} onClick={() => setAdding(true)}>
                New connection
              </Button>
            </div>
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            {connections.length === 0 ? (
              <div className="first-connection">
                <div className="empty-database-art" aria-hidden="true">
                  <div />
                  <Database size={36} />
                  <span />
                </div>
                <p className="eyebrow">A CLEAR VIEW STARTS HERE</p>
                <h2>Bring your first database.</h2>
                <p>
                  Browse rows, inspect your schema, and see how tables connect. No data import
                  required.
                </p>
                <Button variant="primary" iconEnd={<ArrowRight />} onClick={() => setAdding(true)}>
                  Add a connection
                </Button>
                <div className="supported-engines">
                  <span>
                    <Database size={14} /> PostgreSQL
                  </span>
                  <span>
                    <Database size={14} /> MySQL
                  </span>
                </div>
              </div>
            ) : (
              <div className="connection-cards">
                {connections.map((item) => (
                  <article className="connection-card" key={item.id}>
                    <div className="connection-card-top">
                      <span className={`database-symbol ${item.engine}`}>
                        <Database size={22} />
                      </span>
                      <span className="connection-access">
                        <ShieldCheck size={12} />{" "}
                        {item.readOnly ? "Read only" : "Approval for writes"}
                      </span>
                    </div>
                    <h2>
                      <a href={`/explorer/${encodeURIComponent(item.id)}`}>{item.label}</a>
                    </h2>
                    <p className="connection-engine">{engineName(item.engine)}</p>
                    <dl>
                      <div>
                        <dt>Database</dt>
                        <dd>{item.database}</dd>
                      </div>
                      <div>
                        <dt>Host</dt>
                        <dd title={`${item.host}:${item.port}`}>
                          {item.host}:{item.port}
                        </dd>
                      </div>
                      <div>
                        <dt>Transport</dt>
                        <dd>
                          {item.tlsMode === "verify-full" ? "Verified TLS" : "Local / no TLS"}
                        </dd>
                      </div>
                    </dl>
                    {testState[item.id] && (
                      <p
                        className={`connection-test ${testState[item.id].ok ? "success" : ""}`}
                        role="status"
                      >
                        {testState[item.id].message}
                      </p>
                    )}
                    <footer>
                      <Button
                        size="sm"
                        onClick={() => void test(item.id)}
                        loading={testState[item.id]?.busy}
                      >
                        Test
                      </Button>
                      <button
                        className="icon-button delete-connection"
                        disabled={deleting === item.id}
                        onClick={() => void remove(item)}
                        aria-label={`Remove ${item.label}`}
                      >
                        <Trash2 size={14} />
                      </button>
                      <a
                        className="open-connection"
                        href={`/explorer/${encodeURIComponent(item.id)}`}
                      >
                        Open explorer
                        <ArrowRight size={14} />
                      </a>
                    </footer>
                  </article>
                ))}
              </div>
            )}
            <div className="connections-bottom">
              <div>
                <KeyRound size={16} />
                <span>Credentials are encrypted on this installation.</span>
              </div>
              <span>Database permissions still apply.</span>
            </div>
          </section>
        )}
      </main>
      {aiSettings && <AISettings onClose={() => setAiSettings(false)} />}
      {adding && (
        <ConnectionForm
          onClose={() => setAdding(false)}
          onCreated={(item) => {
            setConnections((items) => [...items, item]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function DatabaseWorkspace({
  connection,
  initialView,
  onAISettings,
  onNavigationLock,
}: {
  connection: ConnectionSummary;
  initialView: View;
  onAISettings: () => void;
  onNavigationLock: (locked: boolean) => void;
}) {
  const [tables, setTables] = useState<SchemaTable[]>([]);
  const [selected, setSelected] = useState<SchemaTable | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>(initialView);
  const [sql, setSql] = useState("");
  const [selectedSql, setSelectedSql] = useState("");
  const [querySchema, setQuerySchema] = useState("");
  const [relationshipSchema, setRelationshipSchema] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState("asc");
  const [filterColumn, setFilterColumn] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [operation, setOperation] = useState<QueryOperation | null>(null);
  const [resultKind, setResultKind] = useState<"table" | "query">("table");
  const [busy, setBusy] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [queryPage, setQueryPage] = useState(0);
  const [resultView, setResultView] = useState<"table" | "chart">("table");
  const [queryMode, setQueryMode] = useState<"read" | "write">("read");
  const [preparing, setPreparing] = useState(false);
  const [pendingWrite, setPendingWrite] = useState<PreparedWrite | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [hasPendingRows, setHasPendingRows] = useState(false);
  const [gridReset, setGridReset] = useState(0);
  const [rowReview, setRowReview] = useState<RowReviewSession | null>(null);
  const rowReviewResolver = useRef<((applied: boolean) => void) | null>(null);
  useEffect(() => {
    onNavigationLock(hasPendingRows || rowReview !== null);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    if (hasPendingRows || rowReview) window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      onNavigationLock(false);
    };
  }, [hasPendingRows, rowReview, onNavigationLock]);
  useEffect(
    () => () => {
      rowReviewResolver.current?.(false);
    },
    [],
  );
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);
  const preparingRef = useRef(false);
  const locked =
    busy ||
    preparing ||
    pendingWrite !== null ||
    generating ||
    hasPendingRows ||
    rowReview !== null;
  const draftKey = JSON.stringify([
    "synehq-oos-draft",
    connection.id,
    connection.database,
    querySchema,
  ]);
  useEffect(() => {
    try {
      setSql(localStorage.getItem(draftKey) ?? "");
    } catch {
      setSql("");
    }
    setSelectedSql("");
    setPendingWrite(null);
  }, [draftKey]);
  const updateSql = (value: string) => {
    setSql(value);
    setPendingWrite(null);
    try {
      localStorage.setItem(draftKey, value);
    } catch {
      /* The editor remains usable when browser storage is unavailable. */
    }
  };
  const loadSchema = useCallback(
    async (signal?: AbortSignal) => {
      setSchemaLoading(true);
      setSchemaError("");
      try {
        const data = await api<{ tables: SchemaTable[] }>(
          `/api/connections/${encodeURIComponent(connection.id)}/schema`,
          { signal },
        );
        setTables(data.tables);
        setSelected(
          (current) =>
            data.tables.find(
              (table) => current && schemaTableId(table) === schemaTableId(current),
            ) ??
            data.tables[0] ??
            null,
        );
      } catch (cause) {
        if (!signal?.aborted) setSchemaError(errorMessage(cause));
      } finally {
        if (!signal?.aborted) setSchemaLoading(false);
      }
    },
    [connection.id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void loadSchema(controller.signal);
    return () => controller.abort();
  }, [loadSchema]);
  useEffect(
    () => () => {
      generation.current += 1;
      request.current?.abort();
    },
    [],
  );
  const filteredTables = useMemo(
    () =>
      tables.filter((table) =>
        [table.name, table.schema, table.database].some((value) =>
          value.toLowerCase().includes(search.toLowerCase()),
        ),
      ),
    [tables, search],
  );
  const relationshipSchemas = useMemo(
    () => [...new Set(tables.map((table) => table.schema))].sort((a, b) => a.localeCompare(b)),
    [tables],
  );
  useEffect(() => {
    setRelationshipSchema(selected?.schema ?? null);
  }, [selected?.schema]);
  const activeRelationshipSchema =
    relationshipSchema !== null && relationshipSchemas.includes(relationshipSchema)
      ? relationshipSchema
      : (selected?.schema ?? relationshipSchemas[0] ?? "");
  const relationshipTables = useMemo(
    () => tables.filter((table) => table.schema === activeRelationshipSchema),
    [tables, activeRelationshipSchema],
  );
  const completions = useMemo(
    () =>
      Object.fromEntries(
        tables
          .filter((table) => !querySchema || table.schema === querySchema)
          .map((table) => [
            `${table.schema}.${table.name}`,
            table.columns.map((column) => column.name),
          ]),
      ),
    [tables, querySchema],
  );
  function target(schema = querySchema, database = connection.database): QueryTarget {
    return {
      connectionId: connection.id,
      database,
      schema: schema || null,
      connectionRevision: connection.revision,
    };
  }
  async function execute(
    path: string,
    body: unknown,
    kind: "table" | "query",
    writeOperationId?: string,
  ) {
    if (active.current) return;
    active.current = true;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++generation.current;
    setBusy(true);
    setQueryError("");
    setOperation(null);
    setResultKind(kind);
    setQueryPage(0);
    setCancelling(false);
    setResultView("table");
    try {
      let state = await api<QueryOperation>(path, {
        method: "POST",
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (generation.current !== current) return;
      setOperation(state);
      while (state.status === "queued" || state.status === "running") {
        await pollingDelay(controller.signal);
        state = await api<QueryOperation>(`/api/query/${encodeURIComponent(state.operationId)}`, {
          signal: controller.signal,
        });
        if (generation.current !== current) return;
        setOperation(state);
      }
      if (state.status === "failed") setQueryError(state.error || "The database query failed.");
      if (state.status === "unknown")
        setQueryError(
          state.error || "The outcome is unknown. Check the operation before you run it again.",
        );
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === current) {
        if (writeOperationId) setOperation({ operationId: writeOperationId, status: "unknown" });
        setQueryError(
          writeOperationId
            ? `${errorMessage(cause)} The write outcome is unknown. Check operation ${writeOperationId} before you run the query again.`
            : errorMessage(cause),
        );
      }
    } finally {
      if (generation.current === current) {
        active.current = false;
        setBusy(false);
        setCancelling(false);
      }
    }
  }
  function browse(table: SchemaTable = selected!, nextPage = page, applyFilter = true) {
    if (!table || locked) return;
    setPage(nextPage);
    void execute(
      "/api/tables/data",
      {
        target: target(table.schema, table.database),
        table: table.name,
        page: nextPage,
        pageSize: 100,
        ...(sortColumn ? { sort: { column: sortColumn, direction: sortDirection } } : {}),
        ...(applyFilter && filterColumn
          ? { filter: { column: filterColumn, operator: "eq", value: filterValue } }
          : {}),
      },
      "table",
    );
  }
  function selectTable(table: SchemaTable) {
    if (locked) return;
    generation.current += 1;
    request.current?.abort();
    setBusy(false);
    setOperation(null);
    setQueryError("");
    setSelected(table);
    setPage(0);
    setSortColumn("");
    setFilterColumn("");
    setFilterValue("");
    setView("data");
    void execute(
      "/api/tables/data",
      { target: target(table.schema, table.database), table: table.name, page: 0, pageSize: 100 },
      "table",
    );
  }
  async function cancel() {
    if (!operation || cancelling) return;
    setCancelling(true);
    try {
      const state = await api<QueryOperation>(
        `/api/query/${encodeURIComponent(operation.operationId)}/cancel`,
        { method: "POST" },
      );
      setOperation(state);
    } catch (cause) {
      setQueryError(errorMessage(cause));
      setCancelling(false);
    }
  }
  async function checkStatus() {
    if (!operation || active.current) return;
    active.current = true;
    const current = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setQueryError("");
    try {
      let state = await api<QueryOperation>(
        `/api/query/${encodeURIComponent(operation.operationId)}`,
        { signal: controller.signal },
      );
      while (generation.current === current) {
        setOperation(state);
        if (state.status !== "queued" && state.status !== "running") break;
        await pollingDelay(controller.signal);
        state = await api<QueryOperation>(`/api/query/${encodeURIComponent(state.operationId)}`, {
          signal: controller.signal,
        });
      }
      if (
        generation.current === current &&
        (state.status === "failed" || state.status === "unknown")
      )
        setQueryError(
          state.error ||
            (state.status === "unknown"
              ? "The outcome is still unknown. Check the database before you run the query again."
              : "The database query failed."),
        );
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === current)
        setQueryError(`${errorMessage(cause)} The operation outcome is still unknown.`);
    } finally {
      if (generation.current === current) {
        active.current = false;
        setBusy(false);
        setCancelling(false);
      }
    }
  }
  async function run(text: string) {
    if (locked || active.current || preparingRef.current || !text.trim()) return;
    setView("console");
    if (queryMode === "read") {
      void execute("/api/query", { target: target(), sql: text, mode: "read" }, "query");
      return;
    }
    if (connection.readOnly) return;
    preparingRef.current = true;
    setPreparing(true);
    setQueryError("");
    const current = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    const approvedTarget = target();
    try {
      const approval = await api<Omit<PreparedWrite, "sql" | "target">>("/api/query/prepare", {
        method: "POST",
        body: JSON.stringify({ target: approvedTarget, sql: text }),
        signal: controller.signal,
      });
      if (generation.current === current)
        setPendingWrite({ ...approval, sql: text, target: approvedTarget });
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === current)
        setQueryError(errorMessage(cause));
    } finally {
      if (generation.current === current) {
        preparingRef.current = false;
        setPreparing(false);
      }
    }
  }
  function approveWrite(prepared: PreparedWrite) {
    if (
      prepared !== pendingWrite ||
      active.current ||
      connection.readOnly ||
      queryMode !== "write" ||
      !Number.isFinite(Date.parse(prepared.expiresAt)) ||
      Date.parse(prepared.expiresAt) <= Date.now()
    )
      return;
    if (JSON.stringify(prepared.target) !== JSON.stringify(target())) {
      setPendingWrite(null);
      setQueryError("The query target changed. Review the query again.");
      return;
    }
    setPendingWrite(null);
    void execute(
      "/api/query",
      {
        target: prepared.target,
        sql: prepared.sql,
        mode: "write",
        approvalToken: prepared.approvalToken,
        operationId: prepared.operationId,
        approvalId: prepared.approvalId,
      },
      "query",
      prepared.operationId,
    );
  }
  async function reviewRows(changes: GridMutationBatch): Promise<boolean> {
    if (
      !selected ||
      !operation?.result ||
      resultKind !== "table" ||
      active.current ||
      preparingRef.current ||
      rowReview ||
      connection.readOnly
    )
      return false;
    const scope: RowMutationScope = {
      target: target(selected.schema, selected.database),
      table: selected.name,
      columns: operation.result.columns,
    };
    preparingRef.current = true;
    setPreparing(true);
    setQueryError("");
    try {
      const prepared = await api<PreparedRowChanges>("/api/rows/prepare", {
        method: "POST",
        body: JSON.stringify({ ...scope, changes }),
      });
      return await new Promise<boolean>((resolve) => {
        rowReviewResolver.current = resolve;
        setRowReview({ scope, prepared });
      });
    } catch (cause) {
      setQueryError(errorMessage(cause));
      return false;
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  }
  function finishRows(allApplied: boolean, discard: boolean) {
    rowReviewResolver.current?.(allApplied);
    rowReviewResolver.current = null;
    setRowReview(null);
    if (discard) {
      setGridReset((value) => value + 1);
      setHasPendingRows(false);
      if (selected)
        void execute(
          "/api/tables/data",
          {
            target: target(selected.schema, selected.database),
            table: selected.name,
            page,
            pageSize: 100,
            ...(sortColumn ? { sort: { column: sortColumn, direction: sortDirection } } : {}),
            ...(filterColumn
              ? { filter: { column: filterColumn, operator: "eq", value: filterValue } }
              : {}),
          },
          "table",
        );
    }
  }
  const result = operation?.result;
  const showResult =
    (view === "data" && resultKind === "table") || (view === "console" && resultKind === "query");
  return (
    <div className="database-workspace">
      <aside className="schema-sidebar">
        <div className="schema-sidebar-heading">
          <span>
            <Database size={15} />
            {connection.database}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Refresh schema"
            onClick={() => void loadSchema()}
            disabled={schemaLoading || locked}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
        <div className="schema-search">
          <Input
            size="sm"
            prefix={<Search />}
            placeholder="Find a table..."
            aria-label="Find a table"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="schema-tree-wrap">
          {schemaLoading ? (
            <div className="panel-loading">
              <Spinner size="sm" label="Loading schema" />
              <span>Loading schema...</span>
            </div>
          ) : schemaError ? (
            <div className="schema-error" role="alert">
              <p>{schemaError}</p>
              <Button size="sm" onClick={() => void loadSchema()}>
                Retry
              </Button>
            </div>
          ) : filteredTables.length ? (
            <SchemaTree
              tables={filteredTables}
              selectedTable={selected}
              onSelect={selectTable}
              expandAll={!!search}
              renderMetadata={(table) => <span>{table.columns.length}</span>}
            />
          ) : (
            <p className="sidebar-empty">
              {search ? "No matching tables." : "No tables found in this database."}
            </p>
          )}
        </div>
        <div className="schema-sidebar-footer">
          {tables.length} tables<span>{engineName(connection.engine)}</span>
        </div>
      </aside>
      <section className="explorer-main">
        <RowOperationRecovery connectionId={connection.id} />
        <div className="explorer-topline">
          <div>
            <Table2 size={15} />
            <strong>
              {view === "console"
                ? "SQL console"
                : view === "relationships"
                  ? "Relationships"
                  : (selected?.name ?? "Database explorer")}
            </strong>
            {selected && view !== "console" && view !== "relationships" && (
              <span>{selected.schema}</span>
            )}
          </div>
          <span className="connection-access">
            <ShieldCheck size={12} /> {connection.readOnly ? "Read only" : "Approval for writes"}
          </span>
        </div>
        <nav className="explorer-tabs" aria-label="Explorer views">
          {(
            [
              { id: "data", label: "Data", icon: Table2 },
              { id: "structure", label: "Structure", icon: Layers },
              { id: "relationships", label: "Relationships", icon: Network },
              { id: "console", label: "SQL console", icon: Terminal },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              disabled={hasPendingRows || rowReview !== null}
              onClick={() => setView(tab.id)}
              aria-current={view === tab.id ? "page" : undefined}
              className={view === tab.id ? "active" : ""}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </nav>
        {view === "structure" ? (
          selected ? (
            <>
              <div className="structure-heading">
                <span>{selected.columns.length} columns</span>
                <span>{selected.type}</span>
              </div>
              <DatabaseGrid
                key={schemaTableId(selected)}
                label={`${selected.name} structure`}
                columns={[
                  { name: "Column", dataType: "text" },
                  { name: "Type", dataType: "text" },
                  { name: "Nullable", dataType: "text" },
                  { name: "Primary key", dataType: "text" },
                  { name: "Default", dataType: "text" },
                ]}
                rows={selected.columns.map((column) => [
                  column.name,
                  column.dataType,
                  column.nullable ? "Yes" : "No",
                  column.primaryKey ? "Yes" : "",
                  column.defaultValue ?? null,
                ])}
              />
            </>
          ) : (
            <EmptyPanel
              title="Select a table."
              description="Choose a table from the schema browser to inspect its columns."
            />
          )
        ) : view === "relationships" ? (
          <>
            <div className="structure-heading">
              <label htmlFor="relationship-schema">
                Schema{" "}
                <select
                  id="relationship-schema"
                  className="compact-select"
                  value={activeRelationshipSchema}
                  disabled={schemaLoading || relationshipSchemas.length === 0}
                  onChange={(event) => setRelationshipSchema(event.target.value)}
                >
                  {relationshipSchemas.length === 0 && <option value="">No schemas</option>}
                  {relationshipSchemas.map((schema) => (
                    <option key={schema} value={schema}>
                      {schema || "Default schema"}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                {relationshipTables.length} {relationshipTables.length === 1 ? "table" : "tables"}
              </span>
            </div>
            <SchemaDiagram
              key={JSON.stringify([
                activeRelationshipSchema,
                relationshipTables.map(schemaTableId),
              ])}
              tables={relationshipTables}
            />
          </>
        ) : (
          <>
            {view === "console" ? (
              <>
                <div className="query-toolbar">
                  <div>
                    <span className="query-file">
                      <FileCode2 size={14} />
                      Query.sql
                    </span>
                    <select
                      className="compact-select"
                      aria-label="Query schema"
                      value={querySchema}
                      disabled={locked}
                      onChange={(event) => {
                        setQuerySchema(event.target.value);
                        setPendingWrite(null);
                        setOperation(null);
                        setQueryError("");
                      }}
                    >
                      <option value="">Default schema</option>
                      {[...new Set(tables.map((table) => table.schema))]
                        .filter(Boolean)
                        .map((schema) => (
                          <option key={schema} value={schema}>
                            {schema}
                          </option>
                        ))}
                    </select>
                    {!connection.readOnly && (
                      <select
                        className="compact-select query-mode"
                        aria-label="Query access mode"
                        value={queryMode}
                        disabled={locked}
                        onChange={(event) => {
                          setQueryMode(event.target.value as "read" | "write");
                          setPendingWrite(null);
                        }}
                      >
                        <option value="read">Read only</option>
                        <option value="write">Write with approval</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAssistant((value) => !value)}
                      disabled={locked}
                      iconStart={<Wand2 />}
                    >
                      AI
                    </Button>
                    {busy && (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={cancelling}
                        onClick={() => void cancel()}
                        disabled={!operation}
                        iconStart={<Square />}
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => void run(selectedSql.trim() ? selectedSql : sql)}
                      disabled={locked || !sql.trim()}
                      loading={preparing}
                      iconStart={<Terminal />}
                    >
                      {queryMode === "write"
                        ? selectedSql.trim()
                          ? "Review selection"
                          : "Review write"
                        : selectedSql.trim()
                          ? "Run selection"
                          : "Run query"}
                    </Button>
                  </div>
                </div>
                {showAssistant && (
                  <SqlAssistant
                    target={target()}
                    disabled={locked}
                    onBusy={setGenerating}
                    onSettings={onAISettings}
                    onClose={() => setShowAssistant(false)}
                    onGenerated={(text, generatedTarget) => {
                      if (JSON.stringify(generatedTarget) === JSON.stringify(target())) {
                        updateSql(text);
                        setSelectedSql("");
                      } else setQueryError("The query target changed. Generate the SQL again.");
                    }}
                  />
                )}
                <SqlEditor
                  value={sql}
                  onChange={updateSql}
                  onSelectionChange={setSelectedSql}
                  onRun={(text) => void run(text)}
                  disabled={locked}
                  dialect={connection.engine === "postgres" ? "postgresql" : "mysql"}
                  schema={completions}
                />
                <div className="editor-status">
                  <span>
                    SQL · {engineName(connection.engine)} ·{" "}
                    {queryMode === "write" ? "Write approval required" : "Read only"}
                  </span>
                  <span>
                    Draft in this browser <kbd>⌘ / Ctrl + Enter</kbd>
                  </span>
                </div>
              </>
            ) : (
              <div className="table-toolbar">
                <div className="table-filter">
                  <select
                    className="compact-select"
                    aria-label="Filter column"
                    disabled={locked}
                    value={filterColumn}
                    onChange={(event) => setFilterColumn(event.target.value)}
                  >
                    <option value="">Filter column</option>
                    {selected?.columns.map((column) => (
                      <option key={column.name} value={column.name}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                  <span className="filter-equals">=</span>
                  <input
                    className="filter-value"
                    aria-label="Filter value"
                    disabled={locked}
                    placeholder="Value"
                    value={filterValue}
                    onChange={(event) => setFilterValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !busy) browse(selected!, 0);
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => browse(selected!, 0)}
                    disabled={!selected || locked}
                  >
                    Apply
                  </Button>
                </div>
                <div className="table-sort">
                  <select
                    className="compact-select"
                    aria-label="Sort column"
                    disabled={locked}
                    value={sortColumn}
                    onChange={(event) => setSortColumn(event.target.value)}
                  >
                    <option value="">Default order</option>
                    {selected?.columns.map((column) => (
                      <option key={column.name} value={column.name}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="compact-select sort-direction"
                    aria-label="Sort direction"
                    disabled={locked}
                    value={sortDirection}
                    onChange={(event) => setSortDirection(event.target.value)}
                  >
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => browse()}
                    disabled={!selected || locked}
                    aria-label="Load table rows"
                  >
                    <RefreshCw size={14} />
                  </Button>
                </div>
              </div>
            )}
            <div className="results-heading">
              <span>
                <Table2 size={14} />
                {view === "console" ? "Results" : "Table rows"}
              </span>
              <div className="result-view-controls">
                {view === "console" &&
                  showResult &&
                  result &&
                  result.columns.length > 0 &&
                  operation?.status === "succeeded" && (
                    <div className="result-view-switch" role="group" aria-label="Result view">
                      <button
                        type="button"
                        aria-pressed={resultView === "table"}
                        onClick={() => setResultView("table")}
                      >
                        Table
                      </button>
                      <button
                        type="button"
                        aria-pressed={resultView === "chart"}
                        onClick={() => setResultView("chart")}
                      >
                        Chart
                      </button>
                    </div>
                  )}
                <span>
                  {showResult && result
                    ? `${result.rowCount.toLocaleString()} rows${result.durationMs !== undefined ? ` · ${result.durationMs} ms` : ""}`
                    : busy
                      ? "Running..."
                      : ""}
                </span>
              </div>
            </div>
            {queryError && (
              <div className="query-error" role="alert">
                <strong>
                  {operation?.status === "unknown" ? "Outcome unknown" : "Query could not complete"}
                </strong>
                <p>{queryError}</p>
                {operation?.status === "unknown" && (
                  <Button size="sm" onClick={() => void checkStatus()} disabled={busy}>
                    Check operation status
                  </Button>
                )}
              </div>
            )}
            {busy ? (
              <div className="query-loading">
                <Spinner label="Running database query" />
                <p>{cancelling ? "Waiting for cancellation..." : "Running your query..."}</p>
              </div>
            ) : showResult && result ? (
              <>
                {!result.complete && (
                  <div className="result-notice">
                    The result reached its limit. Add a filter or a smaller LIMIT to inspect a
                    specific range.
                  </div>
                )}
                {result.columns.length ? (
                  view === "console" && resultView === "chart" ? (
                    <QueryResultChart
                      key={operation?.operationId}
                      columns={result.columns}
                      rows={result.rows}
                      complete={result.complete}
                    />
                  ) : (
                    <DatabaseGrid
                      key={operation?.operationId + ":" + queryPage}
                      resetKey={gridReset}
                      label={
                        view === "console" ? "Query results" : `${selected?.name ?? "Table"} rows`
                      }
                      columns={result.columns}
                      rows={
                        view === "console"
                          ? result.rows.slice(queryPage * 100, (queryPage + 1) * 100)
                          : result.rows
                      }
                      primaryKeyColumns={
                        view === "data"
                          ? selected?.columns
                              .filter((column) => column.primaryKey)
                              .map((column) => column.name)
                          : []
                      }
                      canWrite={
                        view === "data" && !connection.readOnly && selected?.type === "BASE TABLE"
                      }
                      allowAddRows={view === "data"}
                      pageIndex={view === "console" ? queryPage : page}
                      pageSize={100}
                      onReviewMutations={reviewRows}
                      onPendingChangesChange={setHasPendingRows}
                      onRefresh={view === "data" ? () => browse() : undefined}
                    />
                  )
                ) : (
                  <EmptyPanel
                    title="Query completed."
                    description={`${result.affectedRows ?? 0} rows affected. No table result was returned.`}
                  />
                )}
              </>
            ) : !queryError && operation?.status === "cancelled" ? (
              <EmptyPanel
                title="Query cancelled."
                description="The database operation has stopped."
              />
            ) : !queryError ? (
              <EmptyPanel
                title={
                  view === "console"
                    ? "Your results will appear here."
                    : selected
                      ? `Explore ${selected.name}.`
                      : "Choose a table to get started."
                }
                description={
                  view === "console"
                    ? "Write SQL above, then run the query or a selected statement."
                    : selected
                      ? "Load the rows to browse this table. You can add a filter or choose the sort order first."
                      : "Select a table from the schema browser, or open the SQL console."
                }
                action={
                  view === "data" && selected ? (
                    <Button size="sm" onClick={() => browse()} iconStart={<Table2 />}>
                      Load rows
                    </Button>
                  ) : undefined
                }
              />
            ) : null}
            <footer className="result-footer">
              <span>
                {operation ? (
                  <>
                    <span
                      title={operation.operationId}
                      className={`operation-dot ${operation.status}`}
                    />
                    {operation.status === "succeeded"
                      ? "Completed"
                      : operation.status[0].toUpperCase() + operation.status.slice(1)}
                  </>
                ) : (
                  "Ready"
                )}
              </span>
              <div>
                {view === "console" && resultView === "chart" ? (
                  <span>Chart uses the returned query result</span>
                ) : (
                  <>
                    <span>100 rows per page</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Previous page"
                      disabled={
                        locked || !showResult || (view === "console" ? queryPage === 0 : page === 0)
                      }
                      onClick={() =>
                        view === "console"
                          ? setQueryPage((value) => value - 1)
                          : browse(selected!, page - 1)
                      }
                    >
                      <ChevronLeft size={15} />
                    </Button>
                    <span>{(view === "console" ? queryPage : page) + 1}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Next page"
                      disabled={
                        locked ||
                        !showResult ||
                        !result ||
                        (view === "console"
                          ? (queryPage + 1) * 100 >= result.rows.length
                          : result.rows.length < 100)
                      }
                      onClick={() =>
                        view === "console"
                          ? setQueryPage((value) => value + 1)
                          : browse(selected!, page + 1)
                      }
                    >
                      <ChevronRight size={15} />
                    </Button>
                  </>
                )}
              </div>
            </footer>
          </>
        )}
      </section>
      {rowReview && <RowReview connection={connection} session={rowReview} onFinish={finishRows} />}
      {pendingWrite && (
        <WriteReview
          connection={connection}
          prepared={pendingWrite}
          onClose={() => setPendingWrite(null)}
          onApprove={approveWrite}
        />
      )}
    </div>
  );
}
function EmptyPanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-panel">
      <FolderOpen size={26} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function pollingDelay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const aborted = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, 800);
    signal.addEventListener("abort", aborted, { once: true });
  });
}
