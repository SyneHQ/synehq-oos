# Operations

This guide applies to the Linux source installation in [Development](development.md). Replace its example paths and service names consistently.

Run operator commands as the dedicated service account. Load the installation environment first:

```sh
cd /opt/synehq-oos/source
set -a
. /etc/synehq-oos/runtime.env
set +a
umask 077
```

The source runtime started on the Linux validation host. Backup, restore, and upgrade qualification remain incomplete.

The [validation record](validation.md) separates completed database checks from pending operational checks.

## Files that belong together

| Path under `OOS_DATA_DIR`                           | Purpose                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `metadata.sqlite` and any `-wal` or `-shm` sidecars | Owner, connections, approvals, execution records, and audit data         |
| `keys/encryption-keyring.json`                      | AES keys for stored database credentials and provider keys               |
| `keys/session.key`                                  | Browser session signing secret                                           |
| `keys/service-signing.json`                         | Installation identity, Ed25519 service keys, and service token           |
| `keys/tls/`                                         | Internal CA and gateway, resolver, and worker certificates and keys      |
| `kelvo/`                                            | Durable operation ledger, requests, results, receipts, and audit records |
| `application.yml` and `kelvo.env`                   | Matching Kelvo configuration and service token environment               |
| `containment/` and `scratch/`                       | Process custody and scratch state used during execution                  |

Keep the runtime directory private. Key files require mode `0600`. Key directories require mode `0700`.

If `OOS_KEY_DIR` or `OOS_TLS_DIR` points outside the runtime directory, include those directories in the same backup.

The environment file, service units, source revision, and binary hashes also belong in the deployment record.

This backup does not contain customer databases. Restoring it does not undo a completed SQL write.

## Stop the installation

Finish or inspect active operations before maintenance. Keep any operation with an uncertain result for later reconciliation.

Stop admission first, then stop execution, then stop the resolver:

```sh
sudo systemctl stop synehq-oos-web.service
sudo systemctl stop synehq-oos-kelvo.service
sudo systemctl stop synehq-oos-resolver.service
sudo systemctl show -p ActiveState -p SubState -p MainPID synehq-oos-web.service synehq-oos-kelvo.service synehq-oos-resolver.service
```

All three services must be inactive with no running main process. Verify that the owned Kelvo cgroup has no remaining processes.

Do not copy a live runtime directory. The app metadata, Kelvo ledger, result files, and keyring must come from one stopped state.

## Create a backup

After all services stop, checkpoint the metadata WAL and check the SQLite file:

```sh
sqlite3 "$OOS_DATA_DIR/metadata.sqlite" 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;'
```

The checkpoint must report no busy reader or writer. The integrity check must return `ok`.

If either check fails, keep the services stopped and preserve the files. Do not remove a WAL file to force a clean result.

Create a private archive of the whole runtime directory. This example assumes the default paths:

Have the host administrator create the backup parent directory once:

```sh
sudo install -d -m 0700 -o synehq-oos -g synehq-oos /var/backups/synehq-oos
```

Then run the archive commands as the service account:

```sh
backup_dir=/var/backups/synehq-oos/backup-YYYYMMDD-HHMMSS
install -d -m 0700 "$backup_dir"
tar -C /var/lib/synehq-oos -cpf "$backup_dir/runtime.tar" runtime
cp /etc/synehq-oos/runtime.env "$backup_dir/runtime.env"
(cd "$backup_dir" && sha256sum runtime.tar runtime.env > SHA256SUMS)
chmod 0600 "$backup_dir/runtime.tar" "$backup_dir/runtime.env" "$backup_dir/SHA256SUMS"
```

Use a new directory for every backup. Record the OOS revision, Kelvo revision, and hashes of all three Kelvo binaries.

Archive the entire `kelvo/` directory, including `ledger/operations.sqlite` and any sidecars. Do not save only the operation database.

Copy the archive to protected backup storage. The archive contains the keys needed to decrypt stored credentials.

Restart the same installation after the backup completes:

```sh
sudo systemctl start synehq-oos-resolver.service
sudo systemctl start synehq-oos-kelvo.service
sudo systemctl start synehq-oos-web.service
```

Check sign-in, connection testing, and a read query. A backup is not qualified until a separate restore check passes.

## Restore a backup

Use the source and binary versions recorded with the backup. Keep browser access closed throughout the restore.

1. Stop all three services and verify that their processes are gone.
2. Verify the backup hashes.
3. Preserve the current runtime directory under a different name.
4. Restore the complete runtime archive and matching environment.
5. Restore any external key directories from the same backup.
6. Restore private ownership and permissions.

Example commands for the default paths:

```sh
cd /var/backups/synehq-oos/backup-YYYYMMDD-HHMMSS
sha256sum -c SHA256SUMS
sudo mv /var/lib/synehq-oos/runtime /var/lib/synehq-oos/runtime.before-restore-YYYYMMDD-HHMMSS
sudo tar -C /var/lib/synehq-oos -xpf /var/backups/synehq-oos/backup-YYYYMMDD-HHMMSS/runtime.tar
sudo cp /var/backups/synehq-oos/backup-YYYYMMDD-HHMMSS/runtime.env /etc/synehq-oos/runtime.env
sudo chown -R synehq-oos:synehq-oos /var/lib/synehq-oos/runtime
sudo chown synehq-oos:synehq-oos /etc/synehq-oos/runtime.env
sudo chmod -R go-rwx /var/lib/synehq-oos/runtime
sudo chmod 0600 /etc/synehq-oos/runtime.env
```

Do not run `init` with a new keyring to repair an incomplete restore. The metadata and runtime keys must retain their installation identity.

Reload the restored environment in the service account's terminal. Then invalidate restored authority:

```sh
cd /opt/synehq-oos/source
node --import tsx apps/web/scripts/operator.ts restore-authority
```

This command changes the execution epoch, revokes sessions, invalidates pending approvals, and replaces the session secret.

It marks restored queued or running app operations as `unknown`. It does not repeat them. Kelvo also does not replay an interrupted running write.

Check the customer database before deciding whether to submit any affected SQL again. Database changes can be newer than the app backup.

Start the resolver and Kelvo before reopening the web app. Check logs for identity, certificate, ledger, or containment errors.

Kelvo rejects stale containment identities after a service hierarchy changes. A restored containment record must not authorize cleanup of an unrelated process.

If containment recovery fails, keep the service stopped. Verify the recorded trees are gone, preserve the old containment directory, and provision a fresh private directory.

Preserve the `kelvo/` durable state during this repair. Do not delete the ledger or results to bypass a recovery error.

After the internal services start, open the web app and sign in again. Test a connection and run a read query before permitting writes.

## Recover the owner password

Stop the web app and allow existing database work to finish. For the simplest controlled recovery, stop all three services.

Run this command in an interactive service-account terminal:

```sh
node --import tsx apps/web/scripts/operator.ts owner-recover
```

The command changes the existing owner's password. It revokes sessions and pending approvals. It does not create a second owner.

Restart the services and sign in with the new password. Never place the password in a command argument or environment file.

## Rotate encryption keys

Connection hosts share the encrypted payload with database passwords. Rotation includes both fields.

### Upgrade older connection records

The container encrypts existing connection hosts before opening its listeners. It also clears the old host column, including deleted records.

The migration preserves connection IDs and revisions. It keeps the same target, so it does not invalidate saved queries.

Stop older processes and resolve unfinished operations before upgrading. Keep enough free disk space for SQLite to rebuild the metadata file.

For a source installation, apply the reviewed schema migrations with `npm run db:deploy`. Then run `node dist/operator.mjs init` with the matching build and configuration.

The migration rebuilds SQLite pages and truncates its write-ahead log. A failed conversion blocks startup and can resume with the same image and keys.

Existing backups, filesystem snapshots, and storage-level copies can still contain old plain hosts. This migration does not erase those copies.

Older images cannot read the new encrypted host payload. Use a matching backup and its keys if you must restore an older image.

### Run rotation

Create a coordinated backup first. Stop all three services before rotation.

Run:

```sh
node --import tsx apps/web/scripts/operator.ts rotate-keys
```

The command creates a new active AES key and encrypts stored connection and provider credentials again. Old keys remain in the keyring.

Retain old keys while retained backups need them. Rotation does not change database passwords, the service signing key, or TLS certificates.

If rotation fails, the installation remains in maintenance mode. Preserve the files and inspect the error before resuming:

```sh
node --import tsx apps/web/scripts/operator.ts resume-key-rotation
```

Use the resume command only for an interrupted rotation. Do not remove the maintenance state by editing SQLite.

Restart the services after the command succeeds. Test a database connection and optional AI generation, then create a new backup.

## Service signing identity

The service signing key binds retained operations to the installation. It is separate from the AES keyring and browser session secret.

There is no operator command for service signing rotation. A signing-key change requires a controlled migration of Kelvo authority and retained state.

Do not replace `service-signing.json`, change installation identifiers, or delete durable state as an encryption-key rotation shortcut.

## Check TLS expiry

`configure.ts` creates a local CA for 3,650 days. Gateway, resolver, and worker certificates expire after 365 days.

The script keeps existing certificate pairs. Running it again does not renew a complete pair.

Check each leaf certificate before expiry:

```sh
openssl x509 -in "$OOS_TLS_DIR/gateway.crt" -noout -enddate
openssl x509 -in "$OOS_TLS_DIR/resolver.crt" -noout -enddate
openssl x509 -in "$OOS_TLS_DIR/worker.crt" -noout -enddate
openssl x509 -in "$OOS_TLS_DIR/ca.crt" -noout -enddate
openssl x509 -in "$OOS_TLS_DIR/gateway.crt" -noout -checkend 2592000
```

`-checkend 2592000` fails if the certificate expires within 30 days. Apply the same check to the resolver, worker, and CA certificates.

To renew leaf certificates with the current CA, stop the services and create a backup. Preserve both files of each old leaf pair:

```sh
tls_archive="$OOS_DATA_DIR/tls-before-renewal-YYYYMMDD-HHMMSS"
install -d -m 0700 "$tls_archive"
mv "$OOS_TLS_DIR/gateway.crt" "$OOS_TLS_DIR/gateway.key" "$tls_archive/"
mv "$OOS_TLS_DIR/resolver.crt" "$OOS_TLS_DIR/resolver.key" "$tls_archive/"
mv "$OOS_TLS_DIR/worker.crt" "$OOS_TLS_DIR/worker.key" "$tls_archive/"
node --import tsx deploy/configure-cli.ts
openssl verify -CAfile "$OOS_TLS_DIR/ca.crt" "$OOS_TLS_DIR/gateway.crt" "$OOS_TLS_DIR/resolver.crt" "$OOS_TLS_DIR/worker.crt"
```

Keep `ca.key` and `ca.crt` unchanged for this procedure. Restart the services and test a connection after verification succeeds.

CA replacement requires a coordinated trust change on all internal TLS clients and servers. It is separate from leaf renewal.

## Upgrade the source installation

1. Preserve the current source revision, configuration, binary hashes, and a coordinated backup.
2. Build the selected OOS and Kelvo revisions in the isolated Linux environment.
3. Review migration SQL before applying it to the installation.
4. Stop the services and deploy the reviewed metadata migrations.
5. Generate the Prisma client for the deployed schema.
6. Run `configure.ts` if the adapter binary or its path changed.
7. Start the resolver, Kelvo, and web app, then check the complete read workflow.

Retained Kelvo authority must keep its identifiers, signing key, write mode, and resolver policy. Changing those fields is not a routine binary upgrade.

A rollback after a schema change must use a compatible source and metadata snapshot. Do not treat an old app binary as a database rollback.
