-- Existing standalone sessions and connections keep NULL managed fields.
ALTER TABLE "OwnerSession" ADD COLUMN "managedActor" TEXT;
ALTER TABLE "OwnerSession" ADD COLUMN "managedTicket" TEXT;
ALTER TABLE "Connection" ADD COLUMN "managedSource" TEXT;
ALTER TABLE "Connection" ADD COLUMN "managedFingerprint" TEXT;
CREATE UNIQUE INDEX "Connection_managedSource_key" ON "Connection"("managedSource");
ALTER TABLE "Instance" ADD COLUMN "managedScope" TEXT;
