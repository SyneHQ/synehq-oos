import {
  managedMode,
  managedConfig,
  checkManagedAuthority,
  type ManagedAuthority,
} from "../hakopod";
import { Prisma, PrismaClient, type Connection, type Execution } from "@prisma/client";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type {
  ConnectionSummary,
  OwnerSummary,
  OperationStatus,
} from "@synehq-oos/explorer-contracts";
import {
  encodeOperation,
  operationDigest as kelvoOperationDigest,
  validateResponse,
  validateAdmissionRejection,
  isMutatingOperation,
  type AdmissionRejection,
  type OperationRequest,
  type OperationResponse,
  type GrantClaims,
} from "@synehq-oos/kelvo-client";
import {
  activateEncryptionKey,
  decryptSecret,
  encryptSecret,
  existingInstallationId,
  initializeRuntimeKeys,
  keyDirectory,
  replaceSessionSecret,
  runtimeIdentity,
} from "../crypto/keyring";
import { hashPassword, verifyPassword } from "../crypto/password";
import { StoreError, unauthorized } from "./errors";
import { configureMetadataClient } from "./database";
import { connectionDraftSchema, connectionUpdateSchema } from "./connection-input";
import type {
  AiSettingsInput,
  AiSettingsSummary,
  BeginExecutionInput,
  ConnectionCredentials,
  ConnectionInput,
  ConnectionUpdate,
  ExecutionAuthority,
  ExecutionCustody,
  ExecutionScope,
  OwnerIdentity,
  QueryApprovalInput,
} from "./types";

type Db = PrismaClient | Prisma.TransactionClient;
export type ExecutionRecord = Execution;
const OWNER_ID = "owner";
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const APPROVAL_AGE_MS = 5 * 60 * 1000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const idSchema = z.string().min(1).max(128);
const credentialsSchema = z
  .object({
    host: z.string().max(253),
    password: z.string().max(8192),
    tlsCa: z.string().max(16384).optional(),
    tlsClientCert: z.string().max(16384).optional(),
    tlsClientKey: z.string().max(16384).optional(),
  })
  .strict();
const scopeSchema = z
  .object({
    connectionId: idSchema,
    connectionRevision: z.number().int().positive(),
    database: z.string().min(1).max(256),
    schema: z.string().max(256).nullable(),
    operationDigest: digestSchema,
    executionEpoch: idSchema,
  })
  .strict();
const terminalStatuses = new Set<OperationStatus>(["succeeded", "failed", "cancelled", "unknown"]);
function activeExecutions(ownerId: string): Prisma.ExecutionWhereInput {
  return {
    ownerId,
    OR: [
      { status: { in: ["queued", "running"] } },
      { status: "unknown", dispatchedAt: { not: null }, custodyCompletedAt: null },
    ],
  };
}

function summary(row: Connection, host: string): ConnectionSummary {
  return {
    id: row.id,
    label: row.label,
    engine: row.engine as ConnectionSummary["engine"],
    host,
    port: row.port,
    database: row.database,
    username: row.username,
    tlsMode: row.tlsMode as ConnectionSummary["tlsMode"],
    readOnly: row.readOnly,
    revision: row.revision,
    hasSecret: row.credentials !== null,
    ...(row.authSource ? { authSource: row.authSource } : {}),
    ...(row.serviceName ? { serviceName: row.serviceName } : {}),
    ...(row.filePath ? { filePath: row.filePath } : {}),
  };
}
function ownerSummary(row: { id: string; name: string; email: string }): OwnerSummary {
  return { id: row.id, name: row.name, email: row.email };
}
function scopeDigest(owner: OwnerIdentity, scope: ExecutionScope): string {
  return hash(
    JSON.stringify([
      owner.id,
      owner.sessionId,
      owner.authVersion,
      scope.connectionId,
      scope.connectionRevision,
      scope.database,
      scope.schema,
      scope.operationDigest,
      scope.executionEpoch,
    ]),
  );
}
function scopeOnly(value: ExecutionScope): ExecutionScope {
  return {
    connectionId: value.connectionId,
    connectionRevision: value.connectionRevision,
    database: value.database,
    schema: value.schema,
    operationDigest: value.operationDigest,
    executionEpoch: value.executionEpoch,
  };
}
async function audit(
  db: Db,
  actor: string,
  action: string,
  target: string,
  outcome = "success",
): Promise<void> {
  await db.actionLog.create({ data: { id: randomUUID(), actor, action, target, outcome } });
}

export class AppStore {
  constructor(
    readonly db: PrismaClient,
    readonly keys = keyDirectory(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async importManagedConnections(input: unknown): Promise<void> {
    const config = managedConfig();
    const body = z
      .object({
        version: z.literal(1),
        scope: z.literal(config.scope),
        connections: z
          .array(
            z
              .object({
                source: z.string().regex(/^[a-f0-9]{32}$/),
                fingerprint: digestSchema,
                connection: connectionDraftSchema,
              })
              .strict(),
          )
          .max(64),
      })
      .strict()
      .parse(input);
    if (new Set(body.connections.map((item) => item.source)).size !== body.connections.length)
      throw new StoreError(400, "Duplicate managed database source.");
    const instance = await this.getInstance();
    await this.transaction(async (tx) => {
      const current = await tx.instance.findUniqueOrThrow({ where: { id: 1 } });
      if (
        (current.managedScope && current.managedScope !== config.scope) ||
        (!current.managedScope && current.initializedAt)
      )
        throw new StoreError(409, "Use a separate installation for this Hakopod scope.");
      if (!current.managedScope) {
        await tx.owner.create({
          data: {
            id: OWNER_ID,
            name: "Hakopod",
            email: "managed@localhost",
            passwordHash: "managed-login-only",
          },
        });
        await tx.instance.update({
          where: { id: 1 },
          data: {
            managedScope: config.scope,
            initializedAt: this.clock(),
            setupTokenHash: null,
            setupExpiresAt: null,
          },
        });
      }
      const retained = await tx.connection.findMany({ where: { managedSource: { not: null } } });
      for (const item of body.connections) {
        const previous = retained.find((row) => row.managedSource === item.source);
        if (previous?.managedFingerprint === item.fingerprint && !previous.deletedAt) continue;
        const id = previous?.id ?? randomUUID();
        const { host, password, tlsCa, ...fields } = item.connection;
        const credentials = encryptSecret(
          { host, password, tlsCa },
          { installationId: instance.installationId, recordId: id, purpose: "connection" },
          this.keys,
        );
        const data = {
          ...fields,
          host: "",
          credentials,
          managedSource: item.source,
          managedFingerprint: item.fingerprint,
          deletedAt: null,
        };
        if (previous) {
          await tx.connection.update({
            where: { id },
            data: { ...data, revision: { increment: 1 } },
          });
          await tx.queryApproval.updateMany({
            where: { connectionId: id, consumedAt: null },
            data: { consumedAt: this.clock() },
          });
        } else await tx.connection.create({ data: { id, ownerId: OWNER_ID, ...data } });
        await audit(tx, "hakopod-controller", "connection.sync", id);
      }
      for (const previous of retained) {
        if (
          previous.deletedAt ||
          body.connections.some((item) => item.source === previous.managedSource)
        )
          continue;
        await tx.connection.update({
          where: { id: previous.id },
          data: { deletedAt: this.clock(), revision: { increment: 1 } },
        });
        await tx.queryApproval.updateMany({
          where: { connectionId: previous.id, consumedAt: null },
          data: { consumedAt: this.clock() },
        });
        await audit(tx, "hakopod-controller", "connection.unlink", previous.id);
      }
    });
  }

  async managedIdentity(ticket: string): Promise<OwnerIdentity> {
    const authority = await checkManagedAuthority(ticket);
    const instance = await this.getInstance();
    if (instance.managedScope !== authority.scope)
      throw new StoreError(403, "This explorer belongs to another scope.");
    const owner = await this.db.owner.findUniqueOrThrow({ where: { id: OWNER_ID } });
    const now = this.clock();
    const managedTicket = encryptSecret(
      { ticket },
      {
        installationId: instance.installationId,
        recordId: authority.session,
        purpose: "hakopod-session",
      },
      this.keys,
    );
    const previous = await this.db.ownerSession.findUnique({ where: { id: authority.session } });
    if (
      previous &&
      (previous.managedActor !== authority.actor ||
        (previous.revokedAt && previous.authVersion === owner.authVersion))
    )
      unauthorized();
    let refresh =
      !previous ||
      previous.authVersion !== owner.authVersion ||
      now.getTime() - previous.lastSeenAt.getTime() >= 60_000;
    if (!refresh && previous?.managedTicket) {
      const retained = z.object({ ticket: z.string() }).parse(
        decryptSecret(
          previous.managedTicket,
          {
            installationId: instance.installationId,
            recordId: authority.session,
            purpose: "hakopod-session",
          },
          this.keys,
        ),
      );
      refresh = retained.ticket !== ticket;
    }
    if (refresh)
      await this.db.ownerSession.upsert({
        where: { id: authority.session },
        create: {
          id: authority.session,
          ownerId: OWNER_ID,
          authVersion: owner.authVersion,
          managedActor: authority.actor,
          managedTicket,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
        },
        update: {
          managedTicket,
          authVersion: owner.authVersion,
          revokedAt: null,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
        },
      });
    return {
      id: OWNER_ID,
      name: authority.name,
      email: authority.email,
      actor: authority.actor,
      canManage: authority.canManage,
      canWrite: authority.canWrite,
      sessionId: authority.session,
      authVersion: owner.authVersion,
    };
  }

  private async managedPermission(
    db: Db,
    identity: Pick<OwnerIdentity, "sessionId">,
    source?: string | null,
    fingerprint?: string | null,
    write = false,
    manage = false,
  ): Promise<ManagedAuthority | undefined> {
    if (!managedMode()) return;
    const session = await db.ownerSession.findUnique({ where: { id: identity.sessionId } });
    const instance = await db.instance.findUniqueOrThrow({ where: { id: 1 } });
    if (
      !session?.managedTicket ||
      !session.managedActor ||
      instance.managedScope !== managedConfig().scope
    )
      unauthorized();
    const { ticket } = z.object({ ticket: z.string() }).parse(
      decryptSecret(
        session.managedTicket,
        {
          installationId: instance.installationId,
          recordId: session.id,
          purpose: "hakopod-session",
        },
        this.keys,
      ),
    );
    const authority = await checkManagedAuthority(ticket, source, fingerprint, write, manage);
    if (authority.actor !== session.managedActor || authority.session !== session.id)
      unauthorized();
    return authority;
  }

  private async sessionActor(db: Db, sessionId: string, fallback: string): Promise<string> {
    return (
      (await db.ownerSession.findUnique({ where: { id: sessionId } }))?.managedActor ?? fallback
    );
  }

  private connectionSummary(row: Connection, owner?: OwnerIdentity): ConnectionSummary {
    if (!row.credentials) throw new StoreError(503, "Connection credentials are unavailable.");
    const installationId = existingInstallationId(this.keys);
    if (!installationId) throw new StoreError(503, "Connection credentials are unavailable.");
    const credentials = credentialsSchema.parse(
      decryptSecret(
        row.credentials,
        {
          installationId,
          recordId: row.id,
          purpose: "connection",
        },
        this.keys,
      ),
    );
    return {
      ...summary(row, credentials.host),
      ...(row.managedSource ? { managed: true } : {}),
      readOnly: row.readOnly || (managedMode() && owner?.canWrite !== true),
    };
  }

  /** Convert legacy hosts before listeners open. Interrupted conversion can resume. */
  private async migrateConnectionHosts(installationId: string): Promise<void> {
    const instance = await this.db.instance.findUniqueOrThrow({ where: { id: 1 } });
    if (instance.hostEncryptionVersion === 1) return;
    if (instance.hostEncryptionVersion !== 0)
      throw new StoreError(503, "Host encryption requires a newer application version.");
    await this.transaction(async (tx) => {
      const locked = await tx.instance.updateMany({
        where: {
          id: 1,
          hostEncryptionVersion: 0,
          OR: [{ maintenance: false }, { maintenanceReason: "host-encryption" }],
        },
        data: { maintenance: true, maintenanceReason: "host-encryption" },
      });
      if (locked.count !== 1)
        throw new StoreError(503, "Finish maintenance before migrating connection hosts.");
      if (await tx.execution.count({ where: activeExecutions(OWNER_ID) }))
        throw new StoreError(
          503,
          "Resolve unfinished operations before migrating connection hosts.",
        );
      let cursor: string | undefined;
      for (;;) {
        const rows = await tx.connection.findMany({
          orderBy: { id: "asc" },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!rows.length) break;
        for (const row of rows) {
          if (row.deletedAt) {
            await tx.connection.update({
              where: { id: row.id },
              data: { host: "", credentials: null },
            });
            continue;
          }
          if (!row.credentials)
            throw new StoreError(503, "Connection credentials are unavailable.");
          const scope = { installationId, recordId: row.id, purpose: "connection" };
          const stored = decryptSecret(row.credentials, scope, this.keys);
          const migrated = credentialsSchema.safeParse(stored);
          const credentials = migrated.success
            ? migrated.data
            : {
                ...credentialsSchema.omit({ host: true }).parse(stored),
                host: row.host,
              };
          await tx.connection.update({
            where: { id: row.id },
            data: {
              host: "",
              credentials: encryptSecret(credentialsSchema.parse(credentials), scope, this.keys),
            },
          });
        }
        cursor = rows[rows.length - 1].id;
      }
    });
    // Remove old SQLite pages and WAL entries before marking conversion complete.
    await this.db.$executeRawUnsafe("VACUUM");
    const checkpoint = await this.db.$queryRawUnsafe<Array<{ busy: number | bigint }>>(
      "PRAGMA wal_checkpoint(TRUNCATE)",
    );
    if (Number(checkpoint[0]?.busy) !== 0)
      throw new StoreError(
        503,
        "Close other metadata connections before completing host encryption.",
      );
    await this.transaction(async (tx) => {
      await tx.instance.update({
        where: { id: 1 },
        data: {
          hostEncryptionVersion: 1,
          maintenance: false,
          maintenanceReason: null,
        },
      });
      await audit(tx, "local-operator", "connection.hosts.encrypt", installationId);
    });
  }

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    await configureMetadataClient(this.db);
    return this.db.$transaction(work, {
      maxWait: 10_000,
      timeout: 10_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  async getInstance() {
    await configureMetadataClient(this.db);
    const instance = await this.db.instance.findUnique({ where: { id: 1 } });
    if (!instance)
      throw new StoreError(
        503,
        "Initialize the installation with the local command.",
        "INITIALIZATION_REQUIRED",
      );
    runtimeIdentity(instance.installationId, this.keys);
    return instance;
  }

  async initializeMetadata(): Promise<{ installationId: string }> {
    await configureMetadataClient(this.db);
    const existing = await this.db.instance.findUnique({ where: { id: 1 } });
    if (existing) {
      runtimeIdentity(existing.installationId, this.keys);
      await this.migrateConnectionHosts(existing.installationId);
      return { installationId: existing.installationId };
    }
    if ((await this.db.owner.count()) || (await this.db.connection.count())) {
      throw new StoreError(
        503,
        "Installation metadata is incomplete. Restore a validated backup.",
        "RECOVERY_REQUIRED",
      );
    }
    const installationId = existingInstallationId(this.keys) ?? randomUUID();
    initializeRuntimeKeys(installationId, this.keys);
    await this.transaction(async (tx) => {
      await tx.instance.create({
        data: { id: 1, installationId, executionEpoch: randomUUID(), hostEncryptionVersion: 1 },
      });
      await audit(tx, "local-operator", "installation.initialize", installationId);
    });
    return { installationId };
  }

  async setupStatus(): Promise<{
    initialized: boolean;
    allowSignup: boolean;
    recoveryRequired: boolean;
  }> {
    await configureMetadataClient(this.db);
    const instance = await this.db.instance.findUnique({ where: { id: 1 } });
    const owner = await this.db.owner.findUnique({ where: { id: OWNER_ID } });
    return {
      initialized: Boolean(instance?.initializedAt),
      allowSignup: process.env.ALLOW_SIGNUP !== "false" && !instance?.initializedAt,
      recoveryRequired:
        Boolean(
          instance?.initializedAt && (!owner || owner.deletedAt || owner.status !== "active"),
        ) || Boolean(!instance && owner),
    };
  }

  async issueSetupToken(): Promise<{ token: string; expiresAt: Date }> {
    await this.getInstance();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.clock().getTime() + 30 * 60 * 1000);
    await this.transaction(async (tx) => {
      const claimed = await tx.instance.updateMany({
        where: { id: 1, initializedAt: null, maintenance: false },
        data: { setupTokenHash: hash(token), setupExpiresAt: expiresAt },
      });
      if (claimed.count !== 1) throw new StoreError(409, "Initial setup is already complete.");
      await audit(tx, "local-operator", "setup.token.issue", "instance");
    });
    return { token, expiresAt };
  }

  async createOwner(input: {
    token: string;
    email: string;
    name: string;
    password: string;
  }): Promise<OwnerSummary> {
    if (process.env.ALLOW_SIGNUP === "false")
      throw new StoreError(403, "Web setup is disabled. Use the local owner setup command.");
    return this.completeOwnerSetup(input, false);
  }

  /** This method is for the local interactive CLI. It is never a web route. */
  async createOwnerLocally(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<OwnerSummary> {
    return this.completeOwnerSetup({ ...input, token: "" }, true);
  }

  private async completeOwnerSetup(
    input: { token: string; email: string; name: string; password: string },
    local: boolean,
  ): Promise<OwnerSummary> {
    const body = z
      .object({
        token: z.string().max(256),
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        name: z.string().trim().min(1).max(128),
        password: z.string(),
      })
      .strict()
      .parse(input);
    const instance = await this.getInstance();
    const tokenHash = hash(body.token);
    if (instance.initializedAt || instance.maintenance)
      throw new StoreError(409, "Initial setup is already complete or unavailable.");
    if (
      !local &&
      (!/^[A-Za-z0-9_-]{43}$/.test(body.token) ||
        !instance.setupTokenHash ||
        !instance.setupExpiresAt ||
        instance.setupExpiresAt <= this.clock() ||
        !timingSafeEqual(
          Buffer.from(tokenHash, "hex"),
          Buffer.from(instance.setupTokenHash, "hex"),
        ))
    ) {
      throw new StoreError(403, "The setup token is invalid or expired.");
    }
    const passwordHash = await hashPassword(body.password);
    return this.transaction(async (tx) => {
      const now = this.clock();
      const claimed = await tx.instance.updateMany({
        where: {
          id: 1,
          initializedAt: null,
          maintenance: false,
          ...(local ? {} : { setupTokenHash: tokenHash, setupExpiresAt: { gt: now } }),
        },
        data: { initializedAt: now, setupTokenHash: null, setupExpiresAt: null },
      });
      if (claimed.count !== 1)
        throw new StoreError(409, "Another request completed setup or the token expired.");
      const owner = await tx.owner.create({
        data: { id: OWNER_ID, email: body.email, name: body.name, passwordHash },
      });
      await audit(tx, OWNER_ID, "owner.create", OWNER_ID);
      return ownerSummary(owner);
    });
  }

  private async takeLoginAttempt(): Promise<boolean> {
    return this.transaction(async (tx) => {
      const now = this.clock(),
        cutoff = new Date(now.getTime() - 5 * 60 * 1000);
      await tx.loginThrottle.upsert({
        where: { id: "owner-password" },
        create: { id: "owner-password", count: 0, windowStart: now },
        update: {},
      });
      await tx.loginThrottle.updateMany({
        where: { id: "owner-password", windowStart: { lte: cutoff } },
        data: { count: 0, windowStart: now },
      });
      return (
        (
          await tx.loginThrottle.updateMany({
            where: { id: "owner-password", count: { lt: 10 } },
            data: { count: { increment: 1 } },
          })
        ).count === 1
      );
    });
  }

  async authenticateOwner(email: string, password: string): Promise<OwnerIdentity | null> {
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      typeof password !== "string" ||
      Buffer.byteLength(password) > 1024 ||
      !(await this.takeLoginAttempt())
    )
      return null;
    const owner = await this.db.owner.findUnique({ where: { id: OWNER_ID } });
    const instance = await this.db.instance.findUnique({ where: { id: 1 } });
    if (
      !owner ||
      owner.deletedAt ||
      owner.status !== "active" ||
      !instance?.initializedAt ||
      instance.maintenance
    )
      return null;
    const valid = await verifyPassword(password, owner.passwordHash);
    if (!valid || owner.email !== email.trim().toLowerCase()) return null;
    return this.transaction(async (tx) => {
      const current = await tx.owner.findFirst({
        where: {
          id: OWNER_ID,
          authVersion: owner.authVersion,
          passwordHash: owner.passwordHash,
          deletedAt: null,
          status: "active",
        },
      });
      const activeInstance = await tx.instance.findFirst({
        where: { id: 1, initializedAt: { not: null }, maintenance: false },
      });
      if (!current || !activeInstance) return null;
      const now = this.clock();
      const session = await tx.ownerSession.create({
        data: {
          id: randomUUID(),
          ownerId: OWNER_ID,
          authVersion: owner.authVersion,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + SESSION_AGE_MS),
        },
      });
      await tx.loginThrottle.deleteMany({ where: { id: "owner-password" } });
      await audit(tx, OWNER_ID, "owner.login", session.id);
      return { ...ownerSummary(owner), authVersion: owner.authVersion, sessionId: session.id };
    });
  }

  private async checkOwner(
    db: Db,
    identity: Pick<OwnerIdentity, "id" | "authVersion" | "sessionId">,
    allowMaintenance = false,
    checkManaged = true,
  ): Promise<OwnerIdentity> {
    await configureMetadataClient(this.db);
    if (
      identity.id !== OWNER_ID ||
      !Number.isSafeInteger(identity.authVersion) ||
      typeof identity.sessionId !== "string" ||
      identity.sessionId.length > 128
    )
      unauthorized();
    const now = this.clock();
    const owner = await db.owner.findFirst({
      where: { id: OWNER_ID, authVersion: identity.authVersion, status: "active", deletedAt: null },
    });
    const session = await db.ownerSession.findFirst({
      where: {
        id: identity.sessionId,
        ownerId: OWNER_ID,
        authVersion: identity.authVersion,
        revokedAt: null,
        expiresAt: { gt: now },
        lastSeenAt: { gt: new Date(now.getTime() - SESSION_IDLE_MS) },
      },
    });
    const instance = await db.instance.findUnique({ where: { id: 1 } });
    if (!owner || !session || !instance?.initializedAt) unauthorized();
    if (Boolean(instance.managedScope) !== managedMode()) unauthorized();
    if (instance.maintenance && !allowMaintenance)
      throw new StoreError(503, "The installation is in maintenance mode.", "MAINTENANCE");
    const authority = checkManaged
      ? await this.managedPermission(db, { sessionId: session.id })
      : undefined;
    return {
      ...ownerSummary(owner),
      ...(authority
        ? {
            actor: authority.actor,
            name: authority.name,
            email: authority.email,
            canManage: authority.canManage,
            canWrite: authority.canWrite,
          }
        : {}),
      authVersion: owner.authVersion,
      sessionId: session.id,
    };
  }

  async assertOwnerIdentity(
    identity: Pick<OwnerIdentity, "id" | "authVersion" | "sessionId">,
  ): Promise<OwnerIdentity> {
    const owner = await this.checkOwner(this.db, identity);
    const now = this.clock();
    await this.db.ownerSession.updateMany({
      where: {
        id: owner.sessionId,
        revokedAt: null,
        lastSeenAt: { lt: new Date(now.getTime() - 60_000) },
      },
      data: { lastSeenAt: now },
    });
    return owner;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.transaction(async (tx) => {
      await tx.ownerSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: this.clock() },
      });
      await tx.queryApproval.updateMany({
        where: { sessionId, consumedAt: null },
        data: { consumedAt: this.clock() },
      });
      await audit(tx, OWNER_ID, "owner.logout", sessionId);
    });
  }

  async recoverOwnerPassword(password: string): Promise<void> {
    await this.getInstance();
    const passwordHash = await hashPassword(password);
    await this.transaction(async (tx) => {
      const instance = await tx.instance.findUnique({ where: { id: 1 } });
      if (!instance?.initializedAt)
        throw new StoreError(409, "Complete initial setup before using password recovery.");
      const result = await tx.owner.updateMany({
        where: { id: OWNER_ID, deletedAt: null },
        data: { passwordHash, authVersion: { increment: 1 }, status: "active" },
      });
      if (result.count !== 1)
        throw new StoreError(
          503,
          "The owner record is missing. Restore a validated metadata backup.",
          "RECOVERY_REQUIRED",
        );
      await tx.ownerSession.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: this.clock() },
      });
      await tx.queryApproval.updateMany({
        where: { consumedAt: null },
        data: { consumedAt: this.clock() },
      });
      await tx.loginThrottle.deleteMany();
      await audit(tx, "local-operator", "owner.password.recover", OWNER_ID);
    });
  }

  async changeOwnerPassword(
    owner: OwnerIdentity,
    currentPassword: string,
    nextPassword: string,
  ): Promise<void> {
    await this.checkOwner(this.db, owner);
    const current = await this.db.owner.findUniqueOrThrow({ where: { id: OWNER_ID } });
    if (!(await verifyPassword(currentPassword, current.passwordHash)))
      throw new StoreError(403, "The current password is incorrect.");
    const passwordHash = await hashPassword(nextPassword);
    await this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const result = await tx.owner.updateMany({
        where: { id: OWNER_ID, authVersion: owner.authVersion, passwordHash: current.passwordHash },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      if (result.count !== 1) unauthorized();
      await tx.ownerSession.updateMany({
        where: { ownerId: OWNER_ID, revokedAt: null },
        data: { revokedAt: this.clock() },
      });
      await tx.queryApproval.updateMany({
        where: { consumedAt: null },
        data: { consumedAt: this.clock() },
      });
      await audit(tx, OWNER_ID, "owner.password.change", OWNER_ID);
    });
  }

  private async connection(
    db: Db,
    owner: OwnerIdentity,
    id: string,
    expectedRevision?: number,
    allowDraft = false,
    checkManaged = true,
  ): Promise<Connection> {
    idSchema.parse(id);
    const row = await db.connection.findFirst({
      where: { id, ownerId: owner.id, deletedAt: null },
    });
    if (!row) throw new StoreError(404, "Connection not found.");
    if (checkManaged)
      await this.managedPermission(db, owner, row.managedSource, row.managedFingerprint);
    if (row.draftExpiresAt && (!allowDraft || row.draftSessionId !== owner.sessionId))
      throw new StoreError(404, "Connection not found.");
    if (row.draftExpiresAt && row.draftExpiresAt <= this.clock())
      throw new StoreError(
        410,
        "This connection test expired. Test the connection again.",
        "CONNECTION_TEST_EXPIRED",
      );
    if (expectedRevision !== undefined && row.revision !== expectedRevision)
      throw new StoreError(
        409,
        "The connection changed. Refresh it before continuing.",
        "CONNECTION_CHANGED",
      );
    return row;
  }

  async listConnections(owner: OwnerIdentity): Promise<ConnectionSummary[]> {
    await this.checkOwner(this.db, owner);
    await this.cleanupConnectionDrafts(owner);
    return (
      await this.db.connection.findMany({
        where: { ownerId: owner.id, deletedAt: null, draftExpiresAt: null },
        orderBy: { label: "asc" },
      })
    ).map((row) => this.connectionSummary(row, owner));
  }

  async getConnection(owner: OwnerIdentity, id: string): Promise<ConnectionSummary> {
    await this.checkOwner(this.db, owner);
    return this.connectionSummary(await this.connection(this.db, owner, id), owner);
  }

  async createConnection(owner: OwnerIdentity, input: ConnectionInput): Promise<ConnectionSummary> {
    return this.createConnectionRecord(owner, input, false);
  }

  async createConnectionDraft(
    owner: OwnerIdentity,
    input: ConnectionInput,
  ): Promise<ConnectionSummary & { expiresAt: string }> {
    await this.cleanupConnectionDrafts(owner);
    const connection = await this.createConnectionRecord(owner, input, true);
    const row = await this.db.connection.findUniqueOrThrow({ where: { id: connection.id } });
    return { ...connection, expiresAt: row.draftExpiresAt!.toISOString() };
  }

  private async createConnectionRecord(
    owner: OwnerIdentity,
    input: ConnectionInput,
    draft: boolean,
  ): Promise<ConnectionSummary> {
    const body = connectionDraftSchema.parse(input);
    const instance = await this.getInstance(),
      id = randomUUID();
    const { host, password = "", tlsCa, ...fields } = body;
    const credentials = encryptSecret(
      { host, password, tlsCa },
      { installationId: instance.installationId, recordId: id, purpose: "connection" },
      this.keys,
    );
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      await this.managedPermission(tx, owner, null, null, false, true);
      if (
        draft &&
        (await tx.connection.count({
          where: { ownerId: owner.id, deletedAt: null, draftExpiresAt: { not: null } },
        })) >= 32
      )
        throw new StoreError(
          429,
          "Too many connection tests are retained. Wait for them to expire or complete.",
          "CONNECTION_TEST_LIMIT",
        );
      const row = await tx.connection.create({
        data: {
          id,
          ownerId: owner.id,
          ...fields,
          host: "",
          credentials,
          ...(draft
            ? {
                draftExpiresAt: new Date(this.clock().getTime() + 15 * 60 * 1000),
                draftSessionId: owner.sessionId,
              }
            : {}),
        },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        draft ? "connection.test-draft.create" : "connection.create",
        id,
      );
      return this.connectionSummary(row);
    });
  }

  async saveTestedConnection(
    owner: OwnerIdentity,
    draftId: string,
    operationId: string,
  ): Promise<ConnectionSummary> {
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      await this.managedPermission(tx, owner, null, null, false, true);
      const retained = await tx.connection.findFirst({
        where: { id: idSchema.parse(draftId), ownerId: owner.id },
      });
      if (!retained || retained.deletedAt)
        throw new StoreError(
          404,
          "This connection test no longer exists. Test the connection again.",
          "CONNECTION_TEST_GONE",
        );
      const connection = await this.connection(tx, owner, draftId, undefined, true);
      const execution = await tx.execution.findFirst({
        where: {
          operationId,
          ownerId: owner.id,
          sessionId: owner.sessionId,
          authVersion: owner.authVersion,
          connectionId: draftId,
          connectionRevision: connection.revision,
          database: connection.database,
          status: "succeeded",
          receiptJson: { not: null },
          write: false,
        },
      });
      if (
        !execution ||
        (JSON.parse(execution.requestJson) as OperationRequest).kind !== "connection.test"
      )
        throw new StoreError(
          409,
          "This exact connection has no successful test. Test it before saving.",
          "CONNECTION_TEST_REQUIRED",
        );
      const instance = await tx.instance.findUniqueOrThrow({ where: { id: 1 } });
      if (execution.executionEpoch !== instance.executionEpoch)
        throw new StoreError(
          409,
          "The installation state changed. Test the connection again.",
          "CONNECTION_TEST_REQUIRED",
        );
      if (!connection.draftExpiresAt) return this.connectionSummary(connection);
      const saved = await tx.connection.update({
        where: { id: draftId },
        data: { draftExpiresAt: null, draftSessionId: null },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        "connection.create",
        draftId,
      );
      return this.connectionSummary(saved);
    });
  }

  async cleanupConnectionDrafts(owner: OwnerIdentity): Promise<void> {
    await this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const expired = await tx.connection.findMany({
        where: { ownerId: owner.id, deletedAt: null, draftExpiresAt: { lte: this.clock() } },
        take: 100,
      });
      for (const connection of expired) {
        if (
          await tx.execution.count({
            where: { ...activeExecutions(owner.id), connectionId: connection.id },
          })
        )
          continue;
        await tx.connection.update({
          where: { id: connection.id },
          data: {
            deletedAt: this.clock(),
            host: "",
            credentials: null,
            revision: { increment: 1 },
          },
        });
        await audit(
          tx,
          await this.sessionActor(tx, owner.sessionId, owner.id),
          "connection.test-draft.expire",
          connection.id,
        );
      }
    });
  }

  async updateConnection(
    owner: OwnerIdentity,
    id: string,
    input: ConnectionUpdate,
  ): Promise<ConnectionSummary> {
    const update = connectionUpdateSchema.parse(input);
    const instance = await this.getInstance();
    const managed = await this.db.connection.findUnique({ where: { id } });
    if (managed?.managedSource) throw new StoreError(403, "Change this connection in Hakopod.");
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      await this.managedPermission(tx, owner, null, null, false, true);
      const current = await this.connection(tx, owner, id, update.revision);
      const { revision, password, tlsCa, ...changes } = update;
      if (changes.engine && changes.engine !== current.engine)
        throw new StoreError(
          400,
          "Create and test a new connection to change its database engine.",
        );
      const {
        id: _id,
        revision: _revision,
        hasSecret: _hasSecret,
        ...previousFields
      } = this.connectionSummary(current);
      const {
        password: _password,
        tlsCa: _tlsCa,
        ...normalized
      } = connectionDraftSchema.parse({ ...previousFields, ...changes, password, tlsCa });
      const fields = {
        ...normalized,
        host: "",
        authSource: normalized.authSource ?? null,
        serviceName: normalized.serviceName ?? null,
        filePath: normalized.filePath ?? null,
      };
      const secretFields = { host: normalized.host, password, tlsCa };
      let credentials = current.credentials;
      if (Object.values(secretFields).some((value) => value !== undefined)) {
        if (!credentials) throw new StoreError(503, "Connection credentials are unavailable.");
        const scope = {
          installationId: instance.installationId,
          recordId: id,
          purpose: "connection",
        };
        const previous = credentialsSchema.parse(decryptSecret(credentials, scope, this.keys));
        const changes = Object.fromEntries(
          Object.entries(secretFields).filter(([, value]) => value !== undefined),
        );
        credentials = encryptSecret({ ...previous, ...changes }, scope, this.keys);
      }
      const changed = await tx.connection.updateMany({
        where: { id, ownerId: owner.id, revision, deletedAt: null },
        data: { ...fields, credentials, revision: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new StoreError(409, "The connection changed. Refresh it before continuing.");
      await tx.queryApproval.updateMany({
        where: { connectionId: id, consumedAt: null },
        data: { consumedAt: this.clock() },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        "connection.update",
        id,
      );
      return this.connectionSummary(await tx.connection.findUniqueOrThrow({ where: { id } }));
    });
  }

  async deleteConnection(owner: OwnerIdentity, id: string): Promise<void> {
    const managed = await this.db.connection.findUnique({ where: { id } });
    if (managed?.managedSource) throw new StoreError(403, "Change this connection in Hakopod.");
    await this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      await this.managedPermission(tx, owner, null, null, false, true);
      await this.connection(tx, owner, id);
      await tx.connection.update({
        where: { id },
        data: { deletedAt: this.clock(), host: "", credentials: null, revision: { increment: 1 } },
      });
      await tx.queryApproval.updateMany({
        where: { connectionId: id, consumedAt: null },
        data: { consumedAt: this.clock() },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        "connection.delete",
        id,
      );
    });
  }

  async decryptConnection(
    owner: OwnerIdentity,
    id: string,
    expectedRevision?: number,
  ): Promise<ConnectionSummary & ConnectionCredentials> {
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const row = await this.connection(tx, owner, id, expectedRevision, true);
      const instance = await tx.instance.findUniqueOrThrow({ where: { id: 1 } });
      if (!row.credentials) throw new StoreError(503, "Connection credentials are unavailable.");
      const credentials = credentialsSchema.parse(
        decryptSecret(
          row.credentials,
          { installationId: instance.installationId, recordId: id, purpose: "connection" },
          this.keys,
        ),
      );
      return { ...summary(row, credentials.host), ...credentials };
    });
  }

  private async checkScope(
    db: Db,
    owner: OwnerIdentity,
    scope: ExecutionScope & { write?: boolean },
  ): Promise<Connection> {
    scopeSchema.parse(scopeOnly(scope));
    await this.checkOwner(db, owner, false, false);
    const row = await this.connection(
      db,
      owner,
      scope.connectionId,
      scope.connectionRevision,
      true,
      false,
    );
    await this.managedPermission(
      db,
      owner,
      row.managedSource,
      row.managedFingerprint,
      scope.write ?? false,
    );
    const instance = await db.instance.findUniqueOrThrow({ where: { id: 1 } });
    if (instance.executionEpoch !== scope.executionEpoch)
      throw new StoreError(
        409,
        "This operation belongs to an old installation state.",
        "EXECUTION_EPOCH_CHANGED",
      );
    // Selecting another database requires its own stored connection and reviewed credentials.
    if (scope.database !== row.database)
      throw new StoreError(403, "The operation database does not match this connection.");
    return row;
  }

  async createQueryApproval(
    owner: OwnerIdentity,
    input: QueryApprovalInput,
  ): Promise<{ token: string; expiresAt: Date; approvalId: string; operationId: string }> {
    const scope = scopeOnly(input);
    const approvalId = idSchema.parse(input.approvalId),
      operationId = idSchema.parse(input.operationId);
    const token = randomBytes(32).toString("base64url"),
      expiresAt = new Date(this.clock().getTime() + APPROVAL_AGE_MS);
    await this.transaction(async (tx) => {
      const connection = await this.checkScope(tx, owner, { ...scope, write: true });
      if (connection.draftExpiresAt)
        throw new StoreError(403, "Save a verified connection before approving a write.");
      if (connection.readOnly)
        throw new StoreError(403, "Enable writes for this connection before approving a write.");
      await tx.queryApproval.create({
        data: {
          id: approvalId,
          operationId,
          tokenHash: hash(token),
          ownerId: owner.id,
          sessionId: owner.sessionId,
          authVersion: owner.authVersion,
          connectionId: scope.connectionId,
          connectionRevision: scope.connectionRevision,
          executionEpoch: scope.executionEpoch,
          scopeDigest: scopeDigest(owner, scope),
          expiresAt,
        },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        "query.approval.issue",
        scope.connectionId,
      );
    });
    return { token, expiresAt, approvalId, operationId };
  }

  async checkQueryApproval(
    owner: OwnerIdentity,
    input: QueryApprovalInput & { token: string },
  ): Promise<void> {
    return this.transaction(async (tx) => {
      const scope = scopeOnly(input);
      await this.checkScope(tx, owner, scope);
      const existing = await tx.execution.findUnique({ where: { operationId: input.operationId } });
      if (
        existing &&
        existing.ownerId === owner.id &&
        existing.sessionId === owner.sessionId &&
        existing.authVersion === owner.authVersion &&
        existing.approvalId === input.approvalId &&
        scopeDigest(owner, existing) === scopeDigest(owner, scope)
      )
        return;
      const approval = await tx.queryApproval.findFirst({
        where: {
          id: input.approvalId,
          operationId: input.operationId,
          tokenHash: hash(input.token),
          ownerId: owner.id,
          sessionId: owner.sessionId,
          authVersion: owner.authVersion,
          scopeDigest: scopeDigest(owner, scope),
          executionEpoch: scope.executionEpoch,
          consumedAt: null,
          expiresAt: { gt: this.clock() },
        },
      });
      if (!approval)
        throw new StoreError(
          403,
          "The approval expired, changed, or was already consumed.",
          "APPROVAL_INVALID",
        );
    });
  }

  async beginExecution(
    owner: OwnerIdentity,
    input: BeginExecutionInput,
  ): Promise<{ created: boolean; record: ExecutionRecord }> {
    const body = scopeSchema
      .extend({
        operationId: idSchema,
        requestJson: z
          .string()
          .min(2)
          .max(256 * 1024),
        write: z.boolean(),
        approvalToken: z.string().max(256).optional(),
        approvalId: idSchema.optional(),
        grantIssuedAt: z.number().int().positive(),
        grantExpiresAt: z.number().int().positive(),
        grantDigest: digestSchema,
        claimsJson: z.string().min(2).max(16384),
        sql: z.string().max(100_000).optional(),
      })
      .strict()
      .parse(input);
    const request = JSON.parse(body.requestJson) as OperationRequest;
    const claims = JSON.parse(body.claimsJson) as GrantClaims;
    if (Buffer.byteLength(body.requestJson) > 256 * 1024)
      throw new StoreError(413, "The operation request is too large.");
    if (
      encodeOperation(request) !== body.requestJson ||
      kelvoOperationDigest(request) !== body.operationDigest
    )
      throw new StoreError(
        400,
        "The operation digest does not match its canonical stored request.",
      );
    if (
      (body.write || request.idempotency_key !== "") &&
      request.idempotency_key !== body.operationId
    )
      throw new StoreError(400, "The operation ID does not match its idempotency key.");
    if (
      request.connection.id !== body.connectionId ||
      request.connection.database !== body.database ||
      (request.connection.schema ?? null) !== body.schema ||
      isMutatingOperation(request.kind) !== body.write ||
      (request.approval_id ?? null) !== (body.approvalId ?? null)
    )
      throw new StoreError(400, "The stored operation scope does not match the request.");
    if (
      claims.jti !== body.operationId ||
      claims.subject?.id !== owner.id ||
      claims.connection_id !== body.connectionId ||
      claims.request_sha256 !== body.operationDigest ||
      claims.operation !== request.kind ||
      claims.iat !== body.grantIssuedAt ||
      claims.exp !== body.grantExpiresAt ||
      (body.write
        ? claims.authorization?.kind !== "approved_change" ||
          claims.authorization.approval_id !== body.approvalId ||
          claims.authorization.approved_sha256 !== body.operationDigest
        : claims.authorization?.kind !== "read")
    ) {
      throw new StoreError(400, "The grant claims do not match the stored operation.");
    }
    const { connectionId, connectionRevision, database, schema, operationDigest, executionEpoch } =
      body;
    const scope: ExecutionScope = {
      connectionId,
      connectionRevision,
      database,
      schema,
      operationDigest,
      executionEpoch,
    };
    return this.transaction(async (tx) => {
      const connection = await this.checkScope(tx, owner, { ...scope, write: body.write });
      if (connection.draftExpiresAt && request.kind !== "connection.test")
        throw new StoreError(403, "A connection test draft cannot execute queries.");
      if (
        connection.engine === "mongodb" &&
        ["query.read", "statement.execute"].includes(request.kind)
      )
        throw new StoreError(400, "MongoDB requires a native command.");
      if (connection.engine !== "mongodb" && request.spec.native)
        throw new StoreError(400, "Native MongoDB commands require a MongoDB connection.");
      if (
        (connection.engine === "mongodb" || connection.engine === "sqlite") &&
        body.schema !== null
      )
        throw new StoreError(400, "This database does not accept a SQL schema target.");
      const existing = await tx.execution.findUnique({ where: { operationId: body.operationId } });
      if (existing) {
        if (
          existing.ownerId !== owner.id ||
          existing.sessionId !== owner.sessionId ||
          existing.authVersion !== owner.authVersion ||
          existing.operationDigest !== body.operationDigest ||
          existing.requestJson !== body.requestJson ||
          existing.executionEpoch !== body.executionEpoch ||
          existing.connectionId !== body.connectionId ||
          existing.connectionRevision !== body.connectionRevision ||
          existing.write !== body.write ||
          existing.database !== body.database ||
          existing.schema !== body.schema ||
          existing.approvalId !== (body.approvalId ?? null)
        )
          throw new StoreError(409, "The operation ID already belongs to another request.");
        return { created: false, record: existing };
      }
      const now = this.clock(),
        seconds = Math.floor(now.getTime() / 1000);
      if (
        body.grantIssuedAt > seconds + 10 ||
        body.grantExpiresAt <= seconds ||
        body.grantExpiresAt - body.grantIssuedAt > 300
      )
        throw new StoreError(400, "The operation grant is expired or exceeds its lifetime limit.");
      const expired = await tx.execution.findMany({
        where: {
          ownerId: owner.id,
          status: "queued",
          dispatchedAt: null,
          grantExpiresAt: { lte: seconds },
        },
        select: { operationId: true },
      });
      for (const row of expired) {
        await tx.execution.update({
          where: { operationId: row.operationId },
          data: {
            status: "failed",
            error: "The operation grant expired before dispatch.",
            completedAt: now,
          },
        });
        await audit(
          tx,
          await this.sessionActor(tx, owner.sessionId, owner.id),
          "query.expired-before-dispatch",
          row.operationId,
          "failed",
        );
      }
      // A transport deadline does not prove that the database operation stopped.
      const active = activeExecutions(owner.id);
      if (
        (await tx.execution.count({ where: { ...active, connectionId: body.connectionId } })) >= 1
      )
        throw new StoreError(
          429,
          "This connection has an active operation. Wait for its outcome or confirmed cleanup.",
          "CONNECTION_BUSY",
        );
      if ((await tx.execution.count({ where: active })) >= 2)
        throw new StoreError(
          429,
          "This installation has two active operations. Wait for one to complete.",
          "INSTALLATION_BUSY",
        );
      if (body.write) {
        if (connection.readOnly) throw new StoreError(403, "This connection is read-only.");
        if (!body.approvalToken || !body.approvalId)
          throw new StoreError(
            403,
            "Confirm the exact operation before executing a write.",
            "APPROVAL_REQUIRED",
          );
        const consumed = await tx.queryApproval.updateMany({
          where: {
            id: body.approvalId,
            operationId: body.operationId,
            tokenHash: hash(body.approvalToken),
            ownerId: owner.id,
            sessionId: owner.sessionId,
            authVersion: owner.authVersion,
            scopeDigest: scopeDigest(owner, scope),
            executionEpoch: body.executionEpoch,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1)
          throw new StoreError(
            403,
            "The approval expired, changed, or was already consumed.",
            "APPROVAL_INVALID",
          );
      } else if (body.approvalToken || body.approvalId)
        throw new StoreError(400, "A read-only operation cannot consume a write approval.");
      const instance = await tx.instance.findUniqueOrThrow({ where: { id: 1 } });
      const { approvalToken: _approval, sql, ...recordData } = body;
      const record = await tx.execution.create({
        data: {
          ...recordData,
          ownerId: owner.id,
          sessionId: owner.sessionId,
          authVersion: owner.authVersion,
          sql: instance.historyEnabled ? (sql ?? null) : null,
        },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        body.write ? "query.write.approved" : "query.read.request",
        body.operationId,
      );
      return { created: true, record };
    });
  }

  async claimExecutionDispatch(owner: OwnerIdentity, operationId: string): Promise<boolean> {
    return this.transaction(async (tx) => {
      const record = await tx.execution.findUnique({ where: { operationId } });
      if (!record || record.ownerId !== owner.id || record.sessionId !== owner.sessionId)
        throw new StoreError(404, "Operation not found.");
      await this.checkScope(tx, owner, record);
      if (
        record.authVersion !== owner.authVersion ||
        record.grantExpiresAt <= Math.floor(this.clock().getTime() / 1000)
      )
        throw new StoreError(403, "The operation authority expired.");
      return (
        (
          await tx.execution.updateMany({
            where: { operationId, status: "queued", dispatchedAt: null },
            data: { status: "running", dispatchedAt: this.clock() },
          })
        ).count === 1
      );
    });
  }

  private async liveExecution(db: Db, localId: string): Promise<ExecutionRecord> {
    const row = await db.execution.findUnique({ where: { operationId: localId } });
    if (
      !row ||
      !row.dispatchedAt ||
      !["running", "unknown"].includes(row.status) ||
      row.custodyCompletedAt
    )
      throw new StoreError(403, "The operation is not authorized for credential resolution.");
    if (row.grantExpiresAt <= Math.floor(this.clock().getTime() / 1000))
      throw new StoreError(403, "The operation grant expired.");
    await this.checkScope(
      db,
      {
        id: row.ownerId,
        sessionId: row.sessionId,
        authVersion: row.authVersion,
        name: "",
        email: "",
      },
      row,
    );
    return row;
  }

  async authorizeExecution(authority: ExecutionAuthority): Promise<ExecutionRecord> {
    return this.transaction((tx) => this.authorizeExecutionIn(tx, authority));
  }

  private async authorizeExecutionIn(
    tx: Db,
    authority: ExecutionAuthority,
  ): Promise<ExecutionRecord> {
    const row = await this.liveExecution(tx, authority.operationId);
    if (
      row.ownerId !== authority.id ||
      row.authVersion !== authority.authVersion ||
      row.sessionId !== authority.sessionId ||
      row.connectionId !== authority.connectionId ||
      row.connectionRevision !== authority.connectionRevision ||
      row.executionEpoch !== authority.executionEpoch ||
      row.operationDigest !== authority.operationDigest ||
      row.database !== authority.database ||
      row.schema !== authority.schema
    )
      throw new StoreError(403, "The operation authority does not match its request.");
    return row;
  }

  async bindExecutionFileSnapshot(
    authority: ExecutionAuthority,
    snapshotJson: string,
  ): Promise<ExecutionRecord> {
    if (snapshotJson.length > 8192)
      throw new StoreError(400, "The snapshot binding exceeds the limit.");
    JSON.parse(snapshotJson);
    return this.transaction(async (tx) => {
      await tx.$executeRaw`UPDATE "Instance" SET "id" = "id" WHERE "id" = 1`;
      const row = await this.authorizeExecutionIn(tx, authority);
      const connection = await tx.connection.findUniqueOrThrow({ where: { id: row.connectionId } });
      if (connection.engine !== "sqlite" || row.database !== "main" || row.schema !== null)
        throw new StoreError(403, "Only a SQLite operation can retain a file snapshot.");
      if (row.fileSnapshotJson) return row;
      return tx.execution.update({
        where: { operationId: row.operationId },
        data: { fileSnapshotJson: snapshotJson },
      });
    });
  }

  async publishExecutionFile<T>(
    authority: ExecutionAuthority,
    custody: ExecutionCustody,
    snapshotJson: string,
    publish: (authorityValidUntil: number) => Promise<T>,
  ): Promise<T> {
    return this.transaction(async (tx) => {
      // Acquire the metadata write lock before checking revocable authority.
      await tx.$executeRaw`UPDATE "Instance" SET "id" = "id" WHERE "id" = 1`;
      const row = await this.authorizeExecutionIn(tx, authority);
      if (!row.write || row.fileSnapshotJson !== snapshotJson || !this.custodyMatches(row, custody))
        throw new StoreError(403, "The publication does not match the approved operation.");
      const session = await tx.ownerSession.findUniqueOrThrow({ where: { id: row.sessionId } });
      const authorityValidUntil = Math.floor(
        Math.min(
          row.grantExpiresAt * 1000,
          session.expiresAt.getTime(),
          session.lastSeenAt.getTime() + SESSION_IDLE_MS,
        ) / 1000,
      );
      const result = await publish(authorityValidUntil);
      await audit(
        tx,
        await this.sessionActor(tx, row.sessionId, row.ownerId),
        "sqlite.publication",
        row.operationId,
      );
      return result;
    });
  }

  async getExecutionForResolver(localId: string): Promise<ExecutionRecord> {
    idSchema.parse(localId);
    return this.transaction((tx) => this.liveExecution(tx, localId));
  }

  /** The private mTLS completion handler verifies custody before using this retained record. */
  async getExecutionByKelvoId(remoteId: string): Promise<ExecutionRecord> {
    await configureMetadataClient(this.db);
    const row = await this.db.execution.findUnique({
      where: { kelvoOperationId: idSchema.parse(remoteId) },
    });
    if (!row) throw new StoreError(404, "Operation not found.");
    return row;
  }

  async setKelvoOperationId(
    owner: OwnerIdentity,
    localId: string,
    remoteId: string,
    digest: string,
  ): Promise<ExecutionRecord> {
    idSchema.parse(remoteId);
    digestSchema.parse(digest);
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const row = await tx.execution.findFirst({
        where: { operationId: localId, ownerId: owner.id },
      });
      if (!row || row.operationDigest !== digest || !row.dispatchedAt)
        throw new StoreError(403, "The submit response does not match a dispatched operation.");
      if (row.admissionRejectionJson) throw new StoreError(409, "This operation was not admitted.");
      if (row.kelvoOperationId && row.kelvoOperationId !== remoteId)
        throw new StoreError(409, "The operation already has a different Kelvo ID.");
      if (row.kelvoOperationId === remoteId) return row;
      if (
        (
          await tx.execution.updateMany({
            where: { operationId: localId, kelvoOperationId: null },
            data: { kelvoOperationId: remoteId },
          })
        ).count !== 1
      )
        throw new StoreError(409, "The Kelvo operation ID changed.");
      return tx.execution.findUniqueOrThrow({ where: { operationId: localId } });
    });
  }

  private custodyMatches(row: ExecutionRecord, custody: ExecutionCustody): boolean {
    return (
      row.kelvoOperationId === custody.kelvoOperationId &&
      row.operationDigest === custody.requestDigest &&
      row.grantDigest === custody.grantDigest &&
      row.workerId === custody.workerId &&
      row.workerOwner === custody.workerOwner &&
      row.claim === custody.claim
    );
  }

  async bindExecutionCustody(localId: string, input: ExecutionCustody): Promise<ExecutionRecord> {
    const custody = z
      .object({
        kelvoOperationId: idSchema,
        requestDigest: digestSchema,
        grantDigest: digestSchema,
        workerId: idSchema,
        workerOwner: idSchema,
        claim: z.string().min(1).max(4096),
      })
      .strict()
      .parse(input);
    return this.transaction(async (tx) => {
      const row = await this.liveExecution(tx, localId);
      if (row.operationDigest !== custody.requestDigest || row.grantDigest !== custody.grantDigest)
        throw new StoreError(403, "The worker custody does not match the approved request.");
      if (row.kelvoOperationId && row.kelvoOperationId !== custody.kelvoOperationId)
        throw new StoreError(409, "The worker operation does not match the submitted Kelvo ID.");
      if (row.workerId !== null || row.workerOwner !== null || row.claim !== null) {
        if (!this.custodyMatches(row, custody))
          throw new StoreError(409, "This operation is already assigned to another worker claim.");
        return row;
      }
      const changed = await tx.execution.updateMany({
        where: {
          operationId: localId,
          kelvoOperationId: row.kelvoOperationId,
          workerId: null,
          workerOwner: null,
          claim: null,
          custodyCompletedAt: null,
        },
        data: {
          kelvoOperationId: custody.kelvoOperationId,
          workerId: custody.workerId,
          workerOwner: custody.workerOwner,
          claim: custody.claim,
        },
      });
      if (changed.count !== 1) throw new StoreError(409, "The worker custody changed.");
      return tx.execution.findUniqueOrThrow({ where: { operationId: localId } });
    });
  }

  async completeExecutionCustody(
    localId: string,
    custody: ExecutionCustody,
  ): Promise<ExecutionRecord> {
    return this.transaction(async (tx) => {
      const row = await tx.execution.findUnique({ where: { operationId: localId } });
      if (!row || !this.custodyMatches(row, custody))
        throw new StoreError(403, "The completion does not match the worker custody.");
      if (row.custodyCompletedAt) return row;
      return tx.execution.update({
        where: { operationId: localId },
        data: { custodyCompletedAt: this.clock() },
      });
    });
  }

  async getExecution(owner: OwnerIdentity, operationId: string): Promise<ExecutionRecord> {
    await this.checkOwner(this.db, owner);
    const row = await this.db.execution.findFirst({ where: { operationId, ownerId: owner.id } });
    if (!row) throw new StoreError(404, "Operation not found.");
    return row;
  }

  async listExecutions(owner: OwnerIdentity): Promise<ExecutionRecord[]> {
    await this.checkOwner(this.db, owner);
    return this.db.execution.findMany({
      where: { ownerId: owner.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async listActiveExecutions(
    owner: OwnerIdentity,
  ): Promise<Pick<ExecutionRecord, "operationId">[]> {
    await this.checkOwner(this.db, owner);
    return this.db.execution.findMany({
      where: activeExecutions(owner.id),
      select: { operationId: true },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
  }

  async recordAdmissionRejection(
    owner: OwnerIdentity,
    operationId: string,
    rejection: AdmissionRejection,
  ): Promise<ExecutionRecord> {
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const current = await tx.execution.findFirst({ where: { operationId, ownerId: owner.id } });
      if (!current?.dispatchedAt)
        throw new StoreError(409, "The admission rejection has no matching submission.");
      const evidence = validateAdmissionRejection(
        rejection,
        current.operationDigest,
        current.grantDigest,
      );
      if (current.admissionRejectionJson) {
        if (!isDeepStrictEqual(JSON.parse(current.admissionRejectionJson), evidence))
          throw new StoreError(409, "The confirmed admission rejection changed.");
        return current;
      }
      if (
        current.kelvoOperationId ||
        current.receiptJson ||
        current.workerId ||
        current.claim ||
        ["succeeded", "failed", "cancelled"].includes(current.status)
      )
        throw new StoreError(
          409,
          "The operation has evidence that conflicts with this admission rejection.",
        );
      const record = await tx.execution.update({
        where: { operationId },
        data: {
          admissionRejectionJson: JSON.stringify(evidence),
          status: "failed",
          completedAt: this.clock(),
          error:
            "Kelvo did not admit this operation because capacity is unavailable. No database operation ran.",
        },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        "query.not-admitted",
        operationId,
        "failed",
      );
      return record;
    });
  }

  async recordExecutionReceipt(
    owner: OwnerIdentity,
    operationId: string,
    response: OperationResponse,
  ): Promise<ExecutionRecord> {
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const current = await tx.execution.findFirst({ where: { operationId, ownerId: owner.id } });
      if (!current?.kelvoOperationId || !current.dispatchedAt)
        throw new StoreError(409, "The receipt has no matching dispatched operation.");
      if (current.admissionRejectionJson)
        throw new StoreError(409, "This operation was not admitted.");
      const request = JSON.parse(current.requestJson) as OperationRequest;
      const state = validateResponse(
        response,
        current.operationDigest,
        current.kelvoOperationId,
        request.kind,
      );
      const receipt = state.receipt;
      if (!receipt) throw new StoreError(400, "The operation has no final receipt.");
      if (current.receiptJson) {
        if (!isDeepStrictEqual(JSON.parse(current.receiptJson), state))
          throw new StoreError(409, "The confirmed operation receipt changed.");
        return current;
      }
      const status =
        receipt.outcome === "completed"
          ? "succeeded"
          : receipt.outcome === "cancelled_before_start"
            ? "cancelled"
            : receipt.outcome === "outcome_unknown"
              ? "unknown"
              : "failed";
      if (
        ["succeeded", "failed", "cancelled"].includes(current.status) &&
        current.status !== status
      )
        throw new StoreError(409, "The operation already has a final outcome.");
      const error =
        status === "unknown"
          ? "The database effect is unknown. Check the database before you run this operation again."
          : status === "failed"
            ? `The database operation failed (${receipt.error_code}).`
            : null;
      const now = this.clock();
      const record = await tx.execution.update({
        where: { operationId },
        data: {
          receiptJson: JSON.stringify(state),
          status,
          error,
          affectedRows: receipt.affected_rows ?? null,
          durationMs: Math.max(0, now.getTime() - current.createdAt.getTime()),
          completedAt: now,
        },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        `query.${status}`,
        operationId,
        status,
      );
      return record;
    });
  }

  async updateExecution(
    owner: OwnerIdentity,
    operationId: string,
    input: { status: OperationStatus; error?: string; affectedRows?: number; durationMs?: number },
  ): Promise<ExecutionRecord> {
    const update = z
      .object({
        status: z.enum(["queued", "running", "succeeded", "failed", "cancelled", "unknown"]),
        error: z.string().max(2048).optional(),
        affectedRows: z.number().int().nonnegative().safe().optional(),
        durationMs: z.number().int().nonnegative().safe().optional(),
      })
      .strict()
      .parse(input);
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const current = await tx.execution.findFirst({ where: { operationId, ownerId: owner.id } });
      if (!current) throw new StoreError(404, "Operation not found.");
      if (current.receiptJson) {
        if (update.status !== current.status)
          throw new StoreError(409, "The operation already has a confirmed receipt.");
        return current;
      }
      if (update.status === "queued" || update.status === "running")
        throw new StoreError(409, "Execution cannot return to a dispatchable state.");
      if (
        ["succeeded", "failed", "cancelled"].includes(current.status) &&
        update.status !== current.status
      )
        throw new StoreError(409, "The operation already has a final outcome.");
      const record = await tx.execution.update({
        where: { operationId },
        data: {
          ...update,
          error: update.error ?? null,
          completedAt: terminalStatuses.has(update.status) ? this.clock() : null,
        },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        `query.${update.status}`,
        operationId,
        update.status,
      );
      return record;
    });
  }

  async getAiSettings(owner: OwnerIdentity): Promise<AiSettingsSummary | null> {
    await this.checkOwner(this.db, owner);
    const row = await this.db.aiSettings.findFirst({ where: { id: "ai", deletedAt: null } });
    return row
      ? {
          enabled: row.enabled,
          endpoint: row.endpoint,
          model: row.model,
          hasSecret: row.credentials !== null,
          revision: row.revision,
        }
      : null;
  }

  async saveAiSettings(owner: OwnerIdentity, input: AiSettingsInput): Promise<AiSettingsSummary> {
    const body = z
      .object({
        enabled: z.boolean(),
        endpoint: z.string().url().max(2048),
        model: z.string().trim().min(1).max(256),
        apiKey: z.string().max(8192).nullable().optional(),
        revision: z.number().int().positive().optional(),
      })
      .strict()
      .parse(input);
    const endpoint = new URL(body.endpoint);
    if (
      !["https:", "http:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      throw new StoreError(
        400,
        "Use an HTTP or HTTPS endpoint without URL credentials, query parameters, or fragments.",
      );
    }
    const instance = await this.getInstance();
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      await this.managedPermission(tx, owner, null, null, false, true);
      const current = await tx.aiSettings.findUnique({ where: { id: "ai" } });
      if (current && body.revision !== current.revision)
        throw new StoreError(409, "AI settings changed. Refresh before saving.");
      if (!current && body.revision !== undefined)
        throw new StoreError(409, "AI settings do not exist yet.");
      const credentials =
        body.apiKey === undefined
          ? (current?.credentials ?? null)
          : body.apiKey === null || body.apiKey === ""
            ? null
            : encryptSecret(
                { apiKey: body.apiKey },
                { installationId: instance.installationId, recordId: "ai", purpose: "ai-provider" },
                this.keys,
              );
      const row = await tx.aiSettings.upsert({
        where: { id: "ai" },
        create: {
          id: "ai",
          enabled: body.enabled,
          endpoint: body.endpoint,
          model: body.model,
          credentials,
        },
        update: {
          enabled: body.enabled,
          endpoint: body.endpoint,
          model: body.model,
          credentials,
          deletedAt: null,
          revision: { increment: 1 },
        },
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        "ai.settings.change",
        "ai",
      );
      return {
        enabled: row.enabled,
        endpoint: row.endpoint,
        model: row.model,
        hasSecret: row.credentials !== null,
        revision: row.revision,
      };
    });
  }

  async decryptAiSettings(
    owner: OwnerIdentity,
  ): Promise<AiSettingsSummary & { apiKey: string | null }> {
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const row = await tx.aiSettings.findFirst({
        where: { id: "ai", deletedAt: null, enabled: true },
      });
      if (!row)
        throw new StoreError(409, "AI is disabled or has no configured provider.", "AI_DISABLED");
      const instance = await tx.instance.findUniqueOrThrow({ where: { id: 1 } });
      const value = row.credentials
        ? z
            .object({ apiKey: z.string().min(1).max(8192) })
            .strict()
            .parse(
              decryptSecret(
                row.credentials,
                { installationId: instance.installationId, recordId: "ai", purpose: "ai-provider" },
                this.keys,
              ),
            )
        : null;
      return {
        enabled: row.enabled,
        endpoint: row.endpoint,
        model: row.model,
        hasSecret: row.credentials !== null,
        revision: row.revision,
        apiKey: value?.apiKey ?? null,
      };
    });
  }

  async listSavedQueries(owner: OwnerIdentity) {
    await this.checkOwner(this.db, owner);
    return this.db.savedQuery.findMany({
      where: { ownerId: owner.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
  }

  async saveQuery(
    owner: OwnerIdentity,
    input: { id?: string; connectionId: string; database: string; title: string; sql: string },
  ) {
    const body = z
      .object({
        id: idSchema.optional(),
        connectionId: idSchema,
        database: z.string().min(1).max(256),
        title: z.string().trim().min(1).max(128),
        sql: z.string().min(1).max(100_000),
      })
      .strict()
      .parse(input);
    return this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const connection = await this.connection(tx, owner, body.connectionId);
      if (connection.database !== body.database)
        throw new StoreError(400, "The snippet database does not match its connection.");
      const id = body.id ?? randomUUID();
      if (
        body.id &&
        !(await tx.savedQuery.findFirst({ where: { id, ownerId: owner.id, deletedAt: null } }))
      )
        throw new StoreError(404, "SQL snippet not found.");
      const { id: _id, ...fields } = body;
      const row = await tx.savedQuery.upsert({
        where: { id },
        create: { id, ownerId: owner.id, ...fields },
        update: fields,
      });
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        "query.snippet.save",
        id,
      );
      return row;
    });
  }

  async deleteSavedQuery(owner: OwnerIdentity, id: string): Promise<void> {
    await this.transaction(async (tx) => {
      await this.checkOwner(tx, owner);
      const changed = await tx.savedQuery.updateMany({
        where: { id, ownerId: owner.id, deletedAt: null },
        data: { deletedAt: this.clock() },
      });
      if (changed.count !== 1) throw new StoreError(404, "SQL snippet not found.");
      await audit(
        tx,
        await this.sessionActor(tx, owner.sessionId, owner.id),
        "query.snippet.delete",
        id,
      );
    });
  }

  async rotateSecrets(resume = false): Promise<{ connections: number; ai: number }> {
    const instance = await this.getInstance();
    if (!resume) {
      const locked = await this.db.instance.updateMany({
        where: { id: 1, maintenance: false },
        data: { maintenance: true, maintenanceReason: "key-rotation" },
      });
      if (locked.count !== 1)
        throw new StoreError(
          409,
          "Maintenance is already active. Use the explicit resume command after inspection.",
        );
      activateEncryptionKey(instance.installationId, this.keys);
    } else if (!instance.maintenance || instance.maintenanceReason !== "key-rotation")
      throw new StoreError(409, "There is no interrupted key rotation to resume.");
    let connections = 0,
      ai = 0;
    for (const row of await this.db.connection.findMany({
      where: { credentials: { not: null } },
    })) {
      const scope = {
        installationId: instance.installationId,
        recordId: row.id,
        purpose: "connection",
      };
      const next = encryptSecret(
        decryptSecret(row.credentials!, scope, this.keys),
        scope,
        this.keys,
      );
      const changed = await this.db.connection.updateMany({
        where: { id: row.id, revision: row.revision, credentials: row.credentials },
        data: { credentials: next },
      });
      if (changed.count !== 1)
        throw new StoreError(
          409,
          "A connection changed during rotation. Maintenance remains active.",
        );
      connections += 1;
    }
    for (const row of await this.db.aiSettings.findMany({
      where: { credentials: { not: null } },
    })) {
      const scope = {
        installationId: instance.installationId,
        recordId: row.id,
        purpose: "ai-provider",
      };
      const next = encryptSecret(
        decryptSecret(row.credentials!, scope, this.keys),
        scope,
        this.keys,
      );
      if (
        (
          await this.db.aiSettings.updateMany({
            where: { id: row.id, revision: row.revision, credentials: row.credentials },
            data: { credentials: next },
          })
        ).count !== 1
      )
        throw new StoreError(
          409,
          "AI settings changed during rotation. Maintenance remains active.",
        );
      ai += 1;
    }
    await this.transaction(async (tx) => {
      await audit(tx, "local-operator", "secrets.rotate", instance.installationId);
      await tx.instance.update({
        where: { id: 1 },
        data: { maintenance: false, maintenanceReason: null },
      });
    });
    return { connections, ai };
  }

  /** Run after restoring metadata and Kelvo state, before allowing browser access. */
  async invalidateRestoredAuthority(): Promise<void> {
    const instance = await this.getInstance();
    await this.transaction(async (tx) => {
      await tx.instance.update({
        where: { id: 1 },
        data: {
          maintenance: true,
          maintenanceReason: "restore",
          executionEpoch: randomUUID(),
          setupTokenHash: null,
          setupExpiresAt: null,
        },
      });
      await tx.owner.updateMany({
        where: { id: OWNER_ID },
        data: { authVersion: { increment: 1 } },
      });
      await tx.ownerSession.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: this.clock() },
      });
      await tx.queryApproval.updateMany({
        where: { consumedAt: null },
        data: { consumedAt: this.clock() },
      });
      await tx.execution.updateMany({
        where: { status: { in: ["queued", "running"] } },
        data: {
          status: "unknown",
          error:
            "Restored operation. Check the database outcome. This operation will not be replayed.",
          completedAt: this.clock(),
        },
      });
      await audit(tx, "local-operator", "installation.restore.invalidate", instance.installationId);
    });
    replaceSessionSecret(this.keys);
    await this.db.instance.update({
      where: { id: 1 },
      data: { maintenance: false, maintenanceReason: null },
    });
  }
}
