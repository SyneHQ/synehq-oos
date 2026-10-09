import { z } from "zod";
import { DATABASE_CAPABILITIES, DATABASE_ENGINES } from "@synehq-oos/explorer-contracts";

const text = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine(
      (value) => value.isWellFormed() && !/[\0\r\n]/.test(value),
      "Remove control characters from this field.",
    );
export const connectionFieldsSchema = z
  .object({
    label: text(128).transform((value) => value.trim()),
    engine: z.enum(DATABASE_ENGINES),
    host: text(253)
      .transform((value) => value.trim())
      .optional(),
    port: z.number().int().min(0).max(65535).optional(),
    database: text(256)
      .transform((value) => value.trim())
      .optional(),
    username: text(256).optional(),
    password: text(8192).optional(),
    tlsMode: z.enum(["verify-full", "disable"]).optional(),
    tlsCa: z.string().max(16384).optional(),
    readOnly: z.boolean().optional(),
    authSource: text(256)
      .transform((value) => value.trim())
      .optional(),
    serviceName: text(256)
      .transform((value) => value.trim())
      .optional(),
    filePath: text(1024).optional(),
  })
  .strict();

export const connectionDraftSchema = connectionFieldsSchema
  .superRefine((input, context) => {
    const issue = (field: keyof typeof input, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    if (!input.label) issue("label", "Enter a connection name.");
    if (input.engine === "sqlite") {
      const path = input.filePath;
      if (
        !path ||
        path.startsWith("/") ||
        /[\\:?#]/.test(path) ||
        path.split("/").some((part) => !part || part === "." || part === "..")
      )
        issue(
          "filePath",
          "Enter a file path inside the managed SQLite directory, without an absolute path or parent segments.",
        );
      if (
        input.host ||
        input.port ||
        input.username ||
        input.password ||
        input.tlsCa ||
        input.authSource ||
        input.serviceName
      )
        issue("filePath", "SQLite uses a server file. Remove network and credential fields.");
      if (input.database && input.database !== "main")
        issue("database", "The SQLite database name must be main.");
      if (input.tlsMode && input.tlsMode !== "disable")
        issue("tlsMode", "SQLite uses a local server file, without TLS.");
    } else {
      if (!input.host || /[\s/@?#\\\x00]/.test(input.host))
        issue("host", "Enter a hostname or IP address, without a URL or credentials.");
      if (input.port === 0) issue("port", "Enter a port from 1 to 65535.");
      if (input.tlsMode && input.tlsMode !== "verify-full")
        issue("tlsMode", "Network database connections require verified TLS.");
      if (input.filePath) issue("filePath", "A server file path is only valid for SQLite.");
      if (input.engine !== "mongodb" && input.authSource)
        issue("authSource", "An authentication database is only valid for MongoDB.");
      if (input.engine !== "oracle" && input.serviceName)
        issue("serviceName", "A service name is only valid for Oracle.");
      if (input.engine === "oracle") {
        if (!input.serviceName) issue("serviceName", "Enter the Oracle service name.");
        if (input.database && input.database !== input.serviceName)
          issue("database", "The Oracle database target must match the service name.");
      } else if (!input.database) issue("database", "Enter a database name.");
      if (input.engine === "mysql" && input.username?.includes(":"))
        issue("username", "A MySQL username cannot contain a colon.");
    }
  })
  .transform((input) => ({
    ...input,
    host: input.engine === "sqlite" ? "" : input.host!,
    port:
      input.engine === "sqlite"
        ? 0
        : (input.port ?? DATABASE_CAPABILITIES[input.engine].defaultPort),
    database:
      input.engine === "sqlite"
        ? "main"
        : input.engine === "oracle"
          ? input.serviceName!
          : input.database!,
    username: input.engine === "sqlite" ? "" : (input.username ?? ""),
    password: input.password ?? "",
    tlsMode: input.engine === "sqlite" ? ("disable" as const) : ("verify-full" as const),
    readOnly: input.readOnly ?? true,
    authSource: input.engine === "mongodb" ? input.authSource || "admin" : undefined,
    serviceName: input.engine === "oracle" ? input.serviceName : undefined,
    filePath: input.engine === "sqlite" ? input.filePath : undefined,
    tlsCa: input.tlsCa || undefined,
  }));

export const connectionUpdateSchema = connectionFieldsSchema
  .partial()
  .extend({ revision: z.number().int().positive() })
  .strict();
