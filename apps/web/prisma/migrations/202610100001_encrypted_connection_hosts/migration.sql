-- The startup migration encrypts legacy hosts before marking version 1.
ALTER TABLE "Instance" ADD COLUMN "hostEncryptionVersion" INTEGER NOT NULL DEFAULT 0;
