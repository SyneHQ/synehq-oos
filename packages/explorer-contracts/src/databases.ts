export const DATABASE_ENGINES = [
  "clickhouse",
  "mysql",
  "postgres",
  "mongodb",
  "sqlite",
  "oracle",
] as const;
export type DatabaseEngine = (typeof DATABASE_ENGINES)[number];

export const DATABASE_CAPABILITIES = {
  clickhouse: {
    label: "ClickHouse",
    defaultPort: 8443,
    queryLanguage: "sql",
    schemas: true,
    relationships: false,
    rowWrites: false,
    queryWrites: true,
  },
  mysql: {
    label: "MySQL",
    defaultPort: 3306,
    queryLanguage: "sql",
    schemas: true,
    relationships: true,
    rowWrites: true,
    queryWrites: true,
  },
  postgres: {
    label: "PostgreSQL",
    defaultPort: 5432,
    queryLanguage: "sql",
    schemas: true,
    relationships: true,
    rowWrites: true,
    queryWrites: true,
  },
  mongodb: {
    label: "MongoDB",
    defaultPort: 27017,
    queryLanguage: "mongodb",
    schemas: false,
    relationships: false,
    rowWrites: false,
    queryWrites: true,
  },
  sqlite: {
    label: "SQLite",
    defaultPort: 0,
    queryLanguage: "sql",
    schemas: false,
    relationships: true,
    rowWrites: false,
    queryWrites: true,
  },
  oracle: {
    label: "Oracle",
    defaultPort: 2484,
    queryLanguage: "sql",
    schemas: true,
    relationships: true,
    rowWrites: false,
    queryWrites: true,
  },
} as const satisfies Record<
  DatabaseEngine,
  {
    label: string;
    defaultPort: number;
    queryLanguage: "sql" | "mongodb";
    schemas: boolean;
    relationships: boolean;
    rowWrites: boolean;
    queryWrites: boolean;
  }
>;

export interface ConnectionDraftInput {
  label: string;
  engine: DatabaseEngine;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  tlsMode?: "verify-full" | "disable";
  tlsCa?: string;
  readOnly?: boolean;
  authSource?: string;
  serviceName?: string;
  filePath?: string;
}
