-- CreateTable
CREATE TABLE "Instance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1 CHECK ("id" = 1),
    "installationId" TEXT NOT NULL,
    "initializedAt" DATETIME,
    "setupTokenHash" TEXT,
    "setupExpiresAt" DATETIME,
    "executionEpoch" TEXT NOT NULL,
    "maintenance" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceReason" TEXT,
    "historyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'owner' CHECK ("id" = 'owner'),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "OwnerSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OwnerSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "database" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tlsMode" TEXT NOT NULL DEFAULT 'verify-full',
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "credentials" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Connection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueryApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "connectionId" TEXT NOT NULL,
    "connectionRevision" INTEGER NOT NULL,
    "executionEpoch" TEXT NOT NULL,
    "scopeDigest" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Execution" (
    "operationId" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "connectionId" TEXT NOT NULL,
    "connectionRevision" INTEGER NOT NULL,
    "database" TEXT NOT NULL,
    "schema" TEXT,
    "executionEpoch" TEXT NOT NULL,
    "operationDigest" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL,
    "write" BOOLEAN NOT NULL,
    "approvalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "grantIssuedAt" INTEGER NOT NULL,
    "grantExpiresAt" INTEGER NOT NULL,
    "grantDigest" TEXT NOT NULL,
    "claimsJson" TEXT NOT NULL,
    "kelvoOperationId" TEXT,
    "workerId" TEXT,
    "workerOwner" TEXT,
    "claim" TEXT,
    "custodyCompletedAt" DATETIME,
    "sql" TEXT,
    "error" TEXT,
    "affectedRows" INTEGER,
    "durationMs" INTEGER,
    "dispatchedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'ai' CHECK ("id" = 'ai'),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "endpoint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "credentials" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SavedQuery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "database" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sql" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedQuery_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "windowStart" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Instance_installationId_key" ON "Instance"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE INDEX "OwnerSession_ownerId_revokedAt_idx" ON "OwnerSession"("ownerId", "revokedAt");

-- CreateIndex
CREATE INDEX "Connection_ownerId_deletedAt_idx" ON "Connection"("ownerId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueryApproval_operationId_key" ON "QueryApproval"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "QueryApproval_tokenHash_key" ON "QueryApproval"("tokenHash");

-- CreateIndex
CREATE INDEX "QueryApproval_connectionId_consumedAt_idx" ON "QueryApproval"("connectionId", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_kelvoOperationId_key" ON "Execution"("kelvoOperationId");

-- CreateIndex
CREATE INDEX "Execution_ownerId_createdAt_idx" ON "Execution"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Execution_connectionId_status_idx" ON "Execution"("connectionId", "status");

-- CreateIndex
CREATE INDEX "SavedQuery_ownerId_deletedAt_idx" ON "SavedQuery"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "ActionLog_createdAt_idx" ON "ActionLog"("createdAt");
