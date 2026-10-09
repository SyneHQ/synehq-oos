import {
  DATABASE_CAPABILITIES,
  DATABASE_ENGINES,
  type ConnectionDraftInput,
  type DatabaseEngine,
} from "@synehq-oos/explorer-contracts";

export type ConnectionFieldName =
  | "label"
  | "host"
  | "port"
  | "database"
  | "username"
  | "password"
  | "authSource"
  | "serviceName"
  | "filePath"
  | "tlsCa";

export type ConnectionDraft = Record<ConnectionFieldName, string>;
export type ConnectionFieldErrors = Partial<Record<ConnectionFieldName, string>>;
export interface ConnectionField {
  name: ConnectionFieldName;
  label: string;
  required?: boolean;
  kind?: "password" | "number";
  placeholder?: string;
  hint?: string;
  wide?: boolean;
}

const host: ConnectionField = {
  name: "host",
  label: "Host",
  placeholder: "db.example.com",
  required: true,
};
const port: ConnectionField = { name: "port", label: "Port", kind: "number", required: true };
const database: ConnectionField = {
  name: "database",
  label: "Database",
  placeholder: "database_name",
  required: true,
  wide: true,
};
const username: ConnectionField = { name: "username", label: "Username", required: true };
const password: ConnectionField = { name: "password", label: "Password", kind: "password" };

const descriptions: Record<DatabaseEngine, string> = {
  clickhouse: "Columnar database",
  mysql: "Relational database",
  postgres: "Relational database",
  mongodb: "Document database",
  sqlite: "Local database file",
  oracle: "Relational database",
};

const fields: Record<DatabaseEngine, readonly ConnectionField[]> = {
  postgres: [host, port, database, username, password],
  mysql: [host, port, database, username, password],
  clickhouse: [
    host,
    { ...port, hint: "HTTPS port, usually 8443 or 443." },
    database,
    username,
    password,
  ],
  mongodb: [
    host,
    port,
    database,
    { ...username, required: false },
    password,
    {
      name: "authSource",
      label: "Authentication database",
      placeholder: "admin",
      hint: "The database that stores this user's credentials.",
      required: true,
      wide: true,
    },
  ],
  sqlite: [
    {
      name: "filePath",
      label: "Database file",
      placeholder: "reports/analytics.sqlite",
      hint: "Use an existing file inside this installation's SQLite data folder. Enter its relative path.",
      required: true,
      wide: true,
    },
  ],
  oracle: [
    host,
    { ...port, hint: "TCPS port, usually 2484." },
    {
      name: "serviceName",
      label: "Service name",
      placeholder: "FREEPDB1",
      hint: "Use the database service name, not the SID.",
      required: true,
      wide: true,
    },
    username,
    password,
  ],
};

export const DATABASE_CATALOG = DATABASE_ENGINES.map((engine) => ({
  engine,
  label: DATABASE_CAPABILITIES[engine].label,
  description: descriptions[engine],
  logo: `/database-icons/${engine}.png`,
  fields: fields[engine],
}));

export function databaseDefinition(engine: DatabaseEngine) {
  return DATABASE_CATALOG.find((item) => item.engine === engine)!;
}

export function engineName(engine: DatabaseEngine) {
  return DATABASE_CAPABILITIES[engine].label;
}

export function createConnectionDraft(engine: DatabaseEngine): ConnectionDraft {
  return {
    label: "",
    host: "",
    port: String(DATABASE_CAPABILITIES[engine].defaultPort),
    database: engine === "clickhouse" ? "default" : "",
    username: engine === "clickhouse" ? "default" : "",
    password: "",
    authSource: "admin",
    serviceName: "",
    filePath: "",
    tlsCa: "",
  };
}

export function validateConnectionDraft(
  engine: DatabaseEngine,
  draft: ConnectionDraft,
): ConnectionFieldErrors {
  const errors: ConnectionFieldErrors = {};
  if (!draft.label.trim()) errors.label = "Enter a connection name.";
  else if (draft.label.trim().length > 100) errors.label = "Use 100 characters or fewer.";
  for (const field of fields[engine]) {
    if (field.required && !draft[field.name].trim())
      errors[field.name] = `Enter ${field.label.toLowerCase()}.`;
  }
  if (
    engine !== "sqlite" &&
    (!/^\d+$/.test(draft.port) || Number(draft.port) < 1 || Number(draft.port) > 65535)
  ) {
    errors.port = "Enter a port from 1 to 65535.";
  }
  if (engine !== "sqlite" && draft.host.includes("://"))
    errors.host = "Enter the host name only, without a connection URL.";
  if (
    engine === "sqlite" &&
    (draft.filePath.trim().startsWith("/") ||
      /[\\:?#]/.test(draft.filePath) ||
      draft.filePath
        .trim()
        .split("/")
        .some((part) => !part || part === "." || part === ".."))
  ) {
    errors.filePath = "Use a relative path inside the SQLite data folder.";
  }
  if (engine === "mongodb" && draft.password && !draft.username.trim())
    errors.username = "Enter the username for this password.";
  return errors;
}

export function connectionPayload(
  engine: DatabaseEngine,
  draft: ConnectionDraft,
  allowWrites: boolean,
): ConnectionDraftInput {
  if (engine === "sqlite")
    return {
      label: draft.label.trim(),
      engine,
      filePath: draft.filePath.trim(),
      readOnly: !allowWrites,
    };
  return {
    label: draft.label.trim(),
    engine,
    host: draft.host.trim(),
    port: Number(draft.port),
    ...(engine === "oracle"
      ? { serviceName: draft.serviceName.trim() }
      : { database: draft.database.trim() }),
    username: draft.username.trim(),
    password: draft.password,
    tlsMode: "verify-full",
    tlsCa: draft.tlsCa.trim() || undefined,
    readOnly: !allowWrites,
    ...(engine === "mongodb" ? { authSource: draft.authSource.trim() } : {}),
  };
}
