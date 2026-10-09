ALTER TABLE "Connection" ADD COLUMN "authSource" TEXT;
ALTER TABLE "Connection" ADD COLUMN "serviceName" TEXT;
ALTER TABLE "Connection" ADD COLUMN "filePath" TEXT;
ALTER TABLE "Connection" ADD COLUMN "draftExpiresAt" DATETIME;
ALTER TABLE "Connection" ADD COLUMN "draftSessionId" TEXT;
ALTER TABLE "Execution" ADD COLUMN "fileSnapshotJson" TEXT;
