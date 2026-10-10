"use client";

import { applicationPath } from "../../paths";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FileCode2,
  FolderOpen,
  Info,
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
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  SelectInput,
  Spinner,
} from "@synehq-oos/ui";
import {
  DatabaseGrid,
  JsonDocumentView,
  CodeEditor,
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
import { DATABASE_CAPABILITIES, MAX_TABLE_WHERE_LENGTH } from "@synehq-oos/explorer-contracts";
import { api, errorMessage } from "./api";
import { signOutOwner } from "./auth-client";
import { Brand } from "./brand";
import { ConnectionForm } from "./connection-form";
import { DatabaseIcon } from "./database-icon";
import { DATABASE_CATALOG, engineName } from "./database-catalog";
import { waitForConnectionTest } from "./connection-test";
import { WriteReview, type PreparedWrite } from "./write-review";
import { AISettings } from "./ai-settings";
import { SqlAssistant } from "./sql-assistant";
import { RowReview, RowOperationRecovery, type RowReviewSession } from "./row-review";
import { MongoDocumentInsert, MongoInsertRecovery } from "./mongo-document-insert";
import type { MongoInsertScope } from "./mongo-insert";

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
  const [owner, setOwner] = useState<OwnerSummary | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [aiSettings, setAiSettings] = useState(false);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [managed, setManaged] = useState(false);
  const [canManage, setCanManage] = useState(true);
  const [managedScope, setManagedScope] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const [testState, setTestState] = useState<
    Record<string, { busy?: boolean; message: string; ok?: boolean }>
  >({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const connectionTests = useRef(new Map<string, AbortController>());
  useEffect(
    () => () => {
      for (const controller of connectionTests.current.values()) controller.abort();
    },
    [],
  );
  const connection = connections.find((item) => item.id === connectionId);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const session = await api<{
        owner: OwnerSummary | null;
        managed?: boolean;
        canManage?: boolean;
        scope?: string;
      }>("/api/session", { signal });
      if (!session.owner) {
        const setup = await api<{ initialized: boolean }>("/api/setup", { signal });
        window.location.replace(applicationPath(setup.initialized ? "/login/" : "/setup/"));
        return;
      }
      const data = await api<{ connections: ConnectionSummary[] }>("/api/connections", {
        signal,
      });
      setManaged(session.managed === true);
      setCanManage(session.canManage !== false);
      let visibleScope = session.scope ?? "";
      const scopedPath = /^\/synehq\/s\/([A-Za-z0-9_-]+)/.exec(window.location.pathname);
      if (session.managed && scopedPath) {
        try {
          const context = JSON.parse(atob(scopedPath[1].replaceAll("-", "+").replaceAll("_", "/")));
          if (typeof context.project === "string" && typeof context.environment === "string")
            visibleScope = `${context.project} / ${context.environment}${context.workspace ? ` / ${context.workspace.slice(0, 8)}` : ""}`;
        } catch {}
      }
      setManagedScope(visibleScope);
      setOwner(session.owner);
      setConnections(data.connections);
    } catch (cause) {
      if (!signal?.aborted) setError(errorMessage(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function leaveSession() {
    if (navigationLocked || signingOut) return;
    if (managed) {
      window.location.assign("/");
      return;
    }
    setSigningOut(true);
    setSignOutError("");
    try {
      await signOutOwner();
      window.location.replace(applicationPath("/login/"));
    } catch (cause) {
      setSignOutError(errorMessage(cause));
    } finally {
      setSigningOut(false);
    }
  }
  async function test(id: string) {
    if (connectionTests.current.has(id)) return;
    const controller = new AbortController();
    connectionTests.current.set(id, controller);
    setTestState((state) => ({ ...state, [id]: { busy: true, message: "Testing connection..." } }));
    try {
      const operation = await api<QueryOperation>(
        `/api/connections/${encodeURIComponent(id)}/test`,
        { method: "POST", signal: controller.signal },
      );
      await waitForConnectionTest(operation, controller.signal);
      setTestState((state) => ({ ...state, [id]: { ok: true, message: "Connection verified." } }));
    } catch (cause) {
      if (!controller.signal.aborted)
        setTestState((state) => ({ ...state, [id]: { ok: false, message: errorMessage(cause) } }));
    } finally {
      connectionTests.current.delete(id);
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
        {typeof window !== "undefined" && window.location.pathname.startsWith("/synehq/s/") && (
          <a href="/">Back to Hakopod</a>
        )}
      </div>
    );
  return (
    <div
      className="workspace"
      onClickCapture={(event) => {
        if (navigationLocked && (event.target as Element).closest("a")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <header className="workspace-header">
        <div className="header-context">
          <a
            className="header-brand"
            href={applicationPath("/connections")}
            aria-label="SyneHQ OOS home"
            aria-disabled={navigationLocked || undefined}
          >
            <Brand />
          </a>
          <span className="header-divider" aria-hidden="true" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="connection-switcher"
                disabled={navigationLocked}
                aria-label={
                  connection ? `Switch connection: ${connection.label}` : "Select a connection"
                }
              >
                {connection ? (
                  <DatabaseIcon engine={connection.engine} size={21} />
                ) : (
                  <Database size={18} />
                )}
                <span>{connection?.label ?? "Select connection"}</span>
                <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="connection-switcher-menu">
              <DropdownMenuLabel>Connections</DropdownMenuLabel>
              {connections.map((item) => (
                <DropdownMenuItem
                  asChild
                  key={item.id}
                  disabled={navigationLocked}
                  textValue={item.label}
                  className="connection-switcher-item"
                >
                  <a
                    href={applicationPath(`/explorer/${encodeURIComponent(item.id)}`)}
                    aria-current={connectionId === item.id ? "page" : undefined}
                  >
                    <DatabaseIcon engine={item.engine} size={24} />
                    <span className="connection-switcher-name">
                      {item.label}
                      <small>{engineName(item.engine)}</small>
                    </span>
                    {connectionId === item.id && <Check size={14} aria-hidden="true" />}
                  </a>
                </DropdownMenuItem>
              ))}
              {connections.length === 0 && (
                <p className="connection-switcher-empty">No saved connections.</p>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={navigationLocked || !canManage}
                icon={<Plus />}
                onSelect={() => setAdding(true)}
                aria-label={
                  canManage ? "Add connection" : "Hakopod permission required to add connections"
                }
              >
                Add connection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <nav className="header-nav" aria-label="Main navigation">
          <a
            href={applicationPath("/connections")}
            className={!connectionId ? "active" : ""}
            aria-current={!connectionId ? "page" : undefined}
            aria-disabled={navigationLocked || undefined}
          >
            Connections<span className="nav-count">{connections.length}</span>
          </a>
        </nav>
        {managed && (
          <span className="managed-scope" title={managedScope}>
            {managedScope}
          </span>
        )}
        <div className="header-actions">
          <Button
            size="sm"
            variant="primary"
            disabled={navigationLocked || !canManage}
            title={!canManage ? "Ask a Hakopod administrator to add connections." : undefined}
            iconStart={<Plus />}
            aria-label="Add connection"
            onClick={() => setAdding(true)}
          >
            <span className="header-action-label">Add connection</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={navigationLocked || !canManage}
            title={!canManage ? "Ask a Hakopod administrator to change AI settings." : undefined}
            iconStart={<Settings2 />}
            aria-label="AI settings"
            onClick={() => setAiSettings(true)}
          >
            <span className="header-action-label">AI settings</span>
          </Button>
          <span className="header-divider" aria-hidden="true" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="header-owner"
                disabled={navigationLocked || signingOut}
                aria-label={`${managed ? "Account" : "Owner"} menu: ${owner.name}`}
              >
                <span className="owner-avatar" aria-hidden="true">
                  {owner.name.slice(0, 1).toUpperCase()}
                </span>
                <ChevronDown size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="header-owner-menu">
              <DropdownMenuLabel className="header-owner-label">
                <strong>{owner.name}</strong>
                <span>{managed ? "Hakopod account" : "Installation owner"}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={navigationLocked || signingOut}
                icon={<LogOut />}
                onSelect={() => void leaveSession()}
              >
                {managed ? "Back to Hakopod" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {signOutError && (
        <div className="form-error" role="alert">
          {signOutError}
        </div>
      )}
      {error && connectionId && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {managed && !canManage && (
        <p className="managed-help">
          Your Hakopod role permits data access. Ask an administrator to add connections or change
          AI settings.
        </p>
      )}
      <main className="workspace-main">
        {connectionId ? (
          connection ? (
            <DatabaseWorkspace
              key={`${connection.id}:${connection.revision}`}
              connection={connection}
              initialView={initialView}
              onAISettings={() => {
                if (canManage) setAiSettings(true);
                else setError("Ask a Hakopod administrator to change AI settings.");
              }}
              onNavigationLock={setNavigationLocked}
            />
          ) : (
            <div className="page-empty">
              <Database />
              <h2>Connection not found.</h2>
              <p>The connection may have been removed.</p>
              <a href={applicationPath("/connections")}>Back to connections</a>
            </div>
          )
        ) : (
          <section className="connections-page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">YOUR DATA, IN ONE PLACE</p>
                <h1>Connections</h1>
                <p>Connect a database. Browse your data, or open the query console.</p>
              </div>
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
                <Button
                  variant="primary"
                  disabled={!canManage}
                  title={
                    !canManage ? "Managed databases appear here when they are ready." : undefined
                  }
                  iconEnd={<ArrowRight />}
                  onClick={() => setAdding(true)}
                >
                  Add a connection
                </Button>
                <div className="supported-engines">
                  {DATABASE_CATALOG.map((item) => (
                    <span key={item.engine}>
                      <DatabaseIcon engine={item.engine} size={18} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="connection-cards">
                {connections.map((item) => (
                  <article className="connection-card" key={item.id}>
                    <div className="connection-card-top">
                      <span className={`database-symbol ${item.engine}`}>
                        <DatabaseIcon engine={item.engine} size={38} />
                      </span>
                      <span className="connection-access">
                        <ShieldCheck size={12} />{" "}
                        {item.readOnly ? "Read only" : "Approval for writes"}
                      </span>
                    </div>
                    <h2>
                      <a href={applicationPath(`/explorer/${encodeURIComponent(item.id)}`)}>
                        {item.label}
                      </a>
                    </h2>
                    <p className="connection-engine">{engineName(item.engine)}</p>
                    <dl>
                      <div>
                        <dt>{item.engine === "oracle" ? "Service" : "Database"}</dt>
                        <dd>{item.serviceName ?? item.database}</dd>
                      </div>
                      <div>
                        <dt>{item.engine === "sqlite" ? "File" : "Host"}</dt>
                        <dd
                          title={
                            item.engine === "sqlite" ? item.filePath : `${item.host}:${item.port}`
                          }
                        >
                          {item.engine === "sqlite" ? item.filePath : `${item.host}:${item.port}`}
                        </dd>
                      </div>
                      <div>
                        <dt>Transport</dt>
                        <dd>
                          {item.engine === "sqlite"
                            ? "Local file"
                            : item.tlsMode === "verify-full"
                              ? "Verified TLS"
                              : "Local / no TLS"}
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
                      {canManage && !item.managed && (
                        <button
                          className="icon-button delete-connection"
                          disabled={deleting === item.id}
                          onClick={() => void remove(item)}
                          aria-label={`Remove ${item.label}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <a
                        className="open-connection"
                        href={applicationPath(`/explorer/${encodeURIComponent(item.id)}`)}
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
            setConnections((items) =>
              items.some((value) => value.id === item.id)
                ? items.map((value) => (value.id === item.id ? item : value))
                : [...items, item],
            );
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
  const capabilities = DATABASE_CAPABILITIES[connection.engine];
  const nativeCommands = capabilities.queryLanguage === "mongodb";
  const tableFilters = !nativeCommands;
  const consoleLabel = nativeCommands ? "MongoDB console" : "SQL console";
  const collectionLabel = nativeCommands ? "collection" : "table";
  const [tables, setTables] = useState<SchemaTable[]>([]);
  const [selected, setSelected] = useState<SchemaTable | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>(
    initialView === "relationships" && !capabilities.relationships ? "data" : initialView,
  );
  const [sql, setSql] = useState("");
  const [selectedSql, setSelectedSql] = useState("");
  const [querySchema, setQuerySchema] = useState("");
  const [relationshipSchema, setRelationshipSchema] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState("asc");
  const [whereInput, setWhereInput] = useState("");
  const [appliedWhere, setAppliedWhere] = useState("");
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
  const [addingDocument, setAddingDocument] = useState(false);
  const [unresolvedMongoInserts, setUnresolvedMongoInserts] = useState(false);
  const [mongoInsertNotice, setMongoInsertNotice] = useState("");
  const rowReviewResolver = useRef<((applied: boolean) => void) | null>(null);
  useEffect(() => {
    onNavigationLock(hasPendingRows || rowReview !== null || addingDocument);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    if (hasPendingRows || rowReview || addingDocument)
      window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      onNavigationLock(false);
    };
  }, [hasPendingRows, rowReview, addingDocument, onNavigationLock]);
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
    addingDocument ||
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
      schema: capabilities.schemas ? schema || null : null,
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
  function browse(table: SchemaTable = selected!, nextPage = page, where = appliedWhere) {
    if (!table || locked) return;
    setPage(nextPage);
    void execute(
      "/api/tables/data",
      {
        target: target(table.schema, table.database),
        table: table.name,
        page: nextPage,
        pageSize: 100,
        ...(!nativeCommands && sortColumn
          ? { sort: { column: sortColumn, direction: sortDirection } }
          : {}),
        ...(tableFilters && where ? { where } : {}),
      },
      "table",
    );
  }
  function refreshInsertedCollection(scope: MongoInsertScope) {
    if (!nativeCommands || scope.target.connectionId !== connection.id) return;
    setMongoInsertNotice(`Document added to ${scope.collection}.`);
    if (
      view !== "data" ||
      active.current ||
      scope.target.database !== selected?.database ||
      scope.collection !== selected?.name
    )
      return;
    setPage(0);
    void execute(
      "/api/tables/data",
      { target: scope.target, table: scope.collection, page: 0, pageSize: 100 },
      "table",
    );
  }
  function applyTableWhere() {
    if (!selected || locked) return;
    const where = whereInput.trim();
    setWhereInput(where);
    setAppliedWhere(where);
    browse(selected, 0, where);
  }
  function selectTable(table: SchemaTable) {
    if (locked) return;
    setMongoInsertNotice("");
    generation.current += 1;
    request.current?.abort();
    setBusy(false);
    setOperation(null);
    setQueryError("");
    setSelected(table);
    setPage(0);
    setSortColumn("");
    setWhereInput("");
    setAppliedWhere("");
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
    if (nativeCommands) {
      try {
        const command: unknown = JSON.parse(text);
        if (!command || typeof command !== "object" || Array.isArray(command)) throw new Error();
      } catch {
        setQueryError(
          "Enter a valid JSON command object. MongoDB shell expressions are not supported.",
        );
        return;
      }
    }
    const query = nativeCommands ? { command: text } : { sql: text };
    if (queryMode === "read") {
      void execute("/api/query", { target: target(), ...query, mode: "read" }, "query");
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
      const approval = await api<Omit<PreparedWrite, "sql" | "command" | "target">>(
        "/api/query/prepare",
        {
          method: "POST",
          body: JSON.stringify({ target: approvedTarget, ...query }),
          signal: controller.signal,
        },
      );
      if (generation.current === current)
        setPendingWrite({ ...approval, ...query, target: approvedTarget });
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
        ...(prepared.command !== undefined ? { command: prepared.command } : { sql: prepared.sql }),
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
      connection.readOnly ||
      !capabilities.rowWrites
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
            ...(appliedWhere ? { where: appliedWhere } : {}),
          },
          "table",
        );
    }
  }
  const result = operation?.result;
  const showResult =
    (view === "data" && resultKind === "table") || (view === "console" && resultKind === "query");
  const resultSummary = busy
    ? "Running..."
    : showResult && result
      ? `${result.rowCount.toLocaleString()} ${nativeCommands ? "documents" : "rows"}${result.durationMs !== undefined ? ` · ${result.durationMs} ms` : ""}`
      : "";
  const dataToolbarInGrid =
    !nativeCommands && view === "data" && !busy && showResult && !!result?.columns.length;
  const dataToolbar = (
    <>
      {tableFilters && (
        <form
          className="table-filter"
          aria-label="SQL table filter"
          onSubmit={(event) => {
            event.preventDefault();
            applyTableWhere();
          }}
        >
          <span className="filter-prefix" aria-hidden="true">
            WHERE
          </span>
          <input
            className="filter-value"
            aria-label="WHERE expression"
            disabled={!selected || locked}
            placeholder="column = 'value'"
            maxLength={MAX_TABLE_WHERE_LENGTH}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={whereInput}
            onChange={(event) => setWhereInput(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!selected || locked}>
            Apply
          </Button>
        </form>
      )}
      {!nativeCommands && (
        <div className="table-sort">
          <SelectInput
            className="compact-select"
            size="sm"
            aria-label="Sort column"
            disabled={!selected || locked}
            value={sortColumn}
            onValueChange={setSortColumn}
            options={[
              { value: "", label: "Default order" },
              ...(selected?.columns.map((column) => ({
                value: column.name,
                label: column.name,
              })) ?? []),
            ]}
          />
          <SelectInput
            className="compact-select sort-direction"
            size="sm"
            aria-label="Sort direction"
            disabled={!selected || locked}
            value={sortDirection}
            onValueChange={setSortDirection}
            options={[
              { value: "asc", label: "Asc" },
              { value: "desc", label: "Desc" },
            ]}
          />
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => browse()}
        disabled={!selected || locked}
        aria-label={nativeCommands ? "Load documents" : "Load table rows"}
        title={nativeCommands ? "Load documents" : "Load table rows"}
      >
        <RefreshCw size={14} />
      </Button>
      {nativeCommands && !connection.readOnly && capabilities.queryWrites && (
        <Button
          size="sm"
          iconStart={<Plus />}
          disabled={!selected || locked || unresolvedMongoInserts}
          onClick={() => {
            setMongoInsertNotice("");
            setAddingDocument(true);
          }}
        >
          Add document
        </Button>
      )}
      {nativeCommands && (
        <span
          className="table-toolbar-hint"
          tabIndex={0}
          aria-label="Use the MongoDB console to filter, sort, or aggregate documents."
          title="Use the MongoDB console to filter, sort, or aggregate documents."
        >
          <Info size={14} aria-hidden="true" />
        </span>
      )}
      <span className="table-result-summary" aria-live="polite">
        {resultSummary}
      </span>
    </>
  );
  return (
    <div className="database-workspace">
      <aside className="schema-sidebar">
        <div className="schema-sidebar-heading">
          <span>
            <DatabaseIcon engine={connection.engine} size={20} />
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
            placeholder={`Find a ${collectionLabel}...`}
            aria-label={`Find a ${collectionLabel}`}
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
              renderMetadata={
                nativeCommands ? undefined : (table) => <span>{table.columns.length}</span>
              }
            />
          ) : (
            <p className="sidebar-empty">
              {search
                ? `No matching ${collectionLabel}s.`
                : `No ${collectionLabel}s found in this database.`}
            </p>
          )}
        </div>
        <div className="schema-sidebar-footer">
          {tables.length} {collectionLabel}
          {tables.length === 1 ? "" : "s"}
          <span>{engineName(connection.engine)}</span>
        </div>
      </aside>
      <section className="explorer-main">
        {mongoInsertNotice && (
          <div className="result-notice" role="status">
            {mongoInsertNotice}
          </div>
        )}
        {capabilities.rowWrites && <RowOperationRecovery connectionId={connection.id} />}
        {nativeCommands && (
          <MongoInsertRecovery
            connectionId={connection.id}
            onPendingChange={setUnresolvedMongoInserts}
            onInserted={refreshInsertedCollection}
          />
        )}
        <div className="explorer-topline">
          <div>
            <Table2 size={15} />
            <strong>
              {view === "console"
                ? consoleLabel
                : view === "relationships"
                  ? "Relationships"
                  : (selected?.name ?? "Database explorer")}
            </strong>
            {selected && capabilities.schemas && view !== "console" && view !== "relationships" && (
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
              { id: "data", label: "Data", icon: nativeCommands ? Braces : Table2 },
              { id: "structure", label: "Structure", icon: Layers },
              { id: "relationships", label: "Relationships", icon: Network },
              { id: "console", label: consoleLabel, icon: Terminal },
            ] as const
          )
            .filter((tab) => tab.id !== "relationships" || capabilities.relationships)
            .map((tab) => (
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
          nativeCommands ? (
            <EmptyPanel
              title="Documents have flexible fields."
              description="MongoDB collections do not declare a fixed table schema. Open Data to inspect each document as Extended JSON."
            />
          ) : selected ? (
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
              {capabilities.schemas ? (
                <label htmlFor="relationship-schema">
                  Schema{" "}
                  <SelectInput
                    id="relationship-schema"
                    className="compact-select"
                    size="sm"
                    value={activeRelationshipSchema}
                    disabled={schemaLoading || relationshipSchemas.length === 0}
                    placeholder={schemaLoading ? "Loading schemas" : "No schemas"}
                    onValueChange={setRelationshipSchema}
                    options={relationshipSchemas.map((schema) => ({
                      value: schema,
                      label: schema || "Default schema",
                    }))}
                  />
                </label>
              ) : (
                <span>Database: {connection.database}</span>
              )}
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
                      {nativeCommands ? "Command.json" : "Query.sql"}
                    </span>
                    {capabilities.schemas && (
                      <SelectInput
                        className="compact-select"
                        size="sm"
                        aria-label="Query schema"
                        value={querySchema}
                        disabled={locked}
                        onValueChange={(value) => {
                          setQuerySchema(value);
                          setPendingWrite(null);
                          setOperation(null);
                          setQueryError("");
                        }}
                        options={[
                          { value: "", label: "Default schema" },
                          ...[...new Set(tables.map((table) => table.schema))]
                            .filter(Boolean)
                            .map((schema) => ({ value: schema, label: schema })),
                        ]}
                      />
                    )}
                    {!connection.readOnly && capabilities.queryWrites && (
                      <SelectInput
                        className="compact-select query-mode"
                        size="sm"
                        aria-label="Query access mode"
                        value={queryMode}
                        disabled={locked}
                        onValueChange={(value) => {
                          setQueryMode(value as "read" | "write");
                          setPendingWrite(null);
                        }}
                        options={[
                          { value: "read", label: "Read only" },
                          { value: "write", label: "Write with approval" },
                        ]}
                      />
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
                      onClick={() =>
                        void run(!nativeCommands && selectedSql.trim() ? selectedSql : sql)
                      }
                      disabled={locked || !sql.trim()}
                      loading={preparing}
                      iconStart={<Terminal />}
                    >
                      {queryMode === "write"
                        ? !nativeCommands && selectedSql.trim()
                          ? "Review selection"
                          : "Review write"
                        : nativeCommands
                          ? "Run command"
                          : selectedSql.trim()
                            ? "Run selection"
                            : "Run query"}
                    </Button>
                  </div>
                </div>
                {showAssistant && (
                  <SqlAssistant
                    target={target()}
                    language={capabilities.queryLanguage}
                    disabled={locked}
                    onBusy={setGenerating}
                    onSettings={onAISettings}
                    onClose={() => setShowAssistant(false)}
                    onGenerated={(text, generatedTarget) => {
                      if (JSON.stringify(generatedTarget) === JSON.stringify(target())) {
                        updateSql(text);
                        setSelectedSql("");
                      } else setQueryError("The query target changed. Generate the query again.");
                    }}
                  />
                )}
                {nativeCommands ? (
                  <>
                    <CodeEditor
                      value={sql}
                      onChange={updateSql}
                      onRun={(text) => void run(text)}
                      readOnly={locked}
                      language="json"
                      ariaLabel="MongoDB command editor"
                    />
                    <p className="native-command-help">
                      Enter a JSON command. Use find, find_one, aggregate, count, or list_indexes
                      for reads. Use Extended JSON for exact BSON values.
                      {!sql.trim() && (
                        <button
                          type="button"
                          className="native-command-example"
                          disabled={locked}
                          onClick={() =>
                            updateSql(
                              JSON.stringify(
                                {
                                  command: "find",
                                  collection: selected?.name ?? "collection_name",
                                  filter: {},
                                },
                                null,
                                2,
                              ),
                            )
                          }
                        >
                          Insert a find command
                        </button>
                      )}
                    </p>
                  </>
                ) : (
                  <SqlEditor
                    value={sql}
                    onChange={updateSql}
                    onSelectionChange={setSelectedSql}
                    onRun={(text) => void run(text)}
                    disabled={locked}
                    schema={completions}
                  />
                )}
                <div className="editor-status">
                  <span>
                    {nativeCommands ? "JSON command" : "SQL"} · {engineName(connection.engine)} ·{" "}
                    {queryMode === "write" ? "Write approval required" : "Read only"}
                  </span>
                  <span>
                    Draft in this browser <kbd>⌘ / Ctrl + Enter</kbd>
                  </span>
                </div>
              </>
            ) : dataToolbarInGrid ? null : (
              <div className="table-toolbar">{dataToolbar}</div>
            )}
            {view === "console" && (
              <div className="results-heading">
                <span>
                  {nativeCommands ? <Braces size={14} /> : <Table2 size={14} />}
                  Results
                </span>
                <div className="result-view-controls">
                  {!nativeCommands &&
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
                  <span>{resultSummary}</span>
                </div>
              </div>
            )}
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
                    The result reached its limit. Add a filter or lower the query limit to inspect a
                    specific range.
                  </div>
                )}
                {result.columns.length ? (
                  nativeCommands ? (
                    <JsonDocumentView
                      key={operation?.operationId + ":" + queryPage + ":" + page}
                      documents={(view === "console"
                        ? result.rows.slice(queryPage * 100, (queryPage + 1) * 100)
                        : result.rows
                      ).map((row) => row[0])}
                      startIndex={(view === "console" ? queryPage : page) * 100}
                    />
                  ) : view === "console" && resultView === "chart" ? (
                    <QueryResultChart
                      key={operation?.operationId}
                      columns={result.columns}
                      rows={result.rows}
                      complete={result.complete}
                      color="#cf3c00"
                      renderSelect={(props) => (
                        <SelectInput
                          className="compact-select chart-select"
                          size="sm"
                          aria-label={props.label}
                          value={props.value}
                          options={props.options}
                          onValueChange={props.onValueChange}
                          disabled={props.disabled}
                        />
                      )}
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
                        view === "data" &&
                        !connection.readOnly &&
                        capabilities.rowWrites &&
                        selected?.type === "BASE TABLE"
                      }
                      allowAddRows={view === "data" && capabilities.rowWrites}
                      pageIndex={view === "console" ? queryPage : page}
                      pageSize={100}
                      onReviewMutations={reviewRows}
                      onPendingChangesChange={setHasPendingRows}
                      className={view === "data" ? "data-grid-layout" : undefined}
                    >
                      {view === "data" ? dataToolbar : undefined}
                    </DatabaseGrid>
                  )
                ) : (
                  <EmptyPanel
                    title="Query completed."
                    description={
                      nativeCommands
                        ? `${result.affectedRows ?? 0} documents affected. No documents were returned.`
                        : `${result.affectedRows ?? 0} rows affected. No table result was returned.`
                    }
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
                      : `Choose a ${collectionLabel} to get started.`
                }
                description={
                  view === "console"
                    ? nativeCommands
                      ? "Enter a JSON command above, then select Run command."
                      : "Write SQL above, then run the query or a selected statement."
                    : selected
                      ? nativeCommands
                        ? "Load documents to inspect this collection. Use the console for native queries."
                        : tableFilters
                          ? "Load the rows to browse this table. You can add a filter or choose the sort order first."
                          : "Load the rows to browse this table. You can choose the sort order first."
                      : `Select a ${collectionLabel} from the browser, or open the ${consoleLabel}.`
                }
                action={
                  view === "data" && selected ? (
                    <Button
                      size="sm"
                      onClick={() => browse()}
                      iconStart={nativeCommands ? <Braces /> : <Table2 />}
                    >
                      {nativeCommands ? "Load documents" : "Load rows"}
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
                {!nativeCommands && view === "console" && resultView === "chart" ? (
                  <span>Chart uses the returned query result</span>
                ) : (
                  <>
                    <span>100 {nativeCommands ? "documents" : "rows"} per page</span>
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
      {addingDocument && selected && (
        <MongoDocumentInsert
          connection={connection}
          table={selected}
          onClose={() => setAddingDocument(false)}
          onInserted={(scope) => {
            setAddingDocument(false);
            refreshInsertedCollection(scope);
          }}
        />
      )}
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
