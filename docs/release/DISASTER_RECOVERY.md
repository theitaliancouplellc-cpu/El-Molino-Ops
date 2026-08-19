# El Molino Ops Disaster Recovery Contract

## Purpose

This document separates three different claims that must not be conflated:

1. **Portable backup contract validity** — whether an El Molino Ops JSON backup is complete enough for the application recovery engine to accept it.
2. **Production restore safety** — whether an administrator can stage, preview, and apply missing data through the guarded restore RPCs without overwriting existing live rows.
3. **Offsite snapshot availability** — whether a recent independent copy of production database data and storage object bytes actually exists outside the primary failure domain.

The repository currently proves the first two controls. It does **not** by itself prove the third.

## Portable JSON backup contract

The canonical portable contract is defined by `lib/backup-manifest.ts` and validated by `lib/round4-hardening.ts`.

A complete portable backup must match the current backup format and schema version, contain a valid schema fingerprint and location id, contain the exact required table set, report no export errors, stay within row/file safety limits, and contain no cross-location or duplicate-id rows.

The portable JSON contract intentionally excludes credential/configuration or ephemeral tables listed in `BACKUP_EXCLUSIONS`. It also explicitly declares `storage.objects_included: false`.

**Storage object bytes are therefore not recoverable from the portable JSON file alone.** File metadata may exist in database rows, but missing binary objects require a separate storage recovery mechanism.

## Production restore path

`app/admin/restore/page.tsx` is the human recovery surface. It uses server-side restore RPCs to create a restore session, stage table chunks, obtain a server preview, and apply only after an explicit administrator confirmation.

The production database functions independently enforce administrator/location/session ownership and restore-session state. The final apply path is server-controlled and transactional. The UI is not treated as the authorization boundary.

A production restore is a deliberate incident action. It is never executed by the scheduled recovery rehearsal.

## Automated recovery rehearsal

`.github/workflows/recovery-rehearsal.yml` runs weekly and can also be dispatched manually. It has only `contents: read`, checks out the exact workflow SHA without persisted credentials, installs locked dependencies, executes the backup/recovery regression contracts, then runs `scripts/recovery-rehearsal.ts`.

The rehearsal creates synthetic data only. It exercises the real portable validation code and requires all of these cases to behave correctly:

- a structurally complete current portable backup is accepted;
- stale schema versions are rejected;
- missing required tables are rejected;
- invalid storage scope is rejected;
- cross-location rows are rejected;
- duplicate record ids are rejected;
- invalid schema fingerprints are rejected;
- backups reporting export errors are rejected.

The workflow carries no Supabase, database, service-role, or Cloudflare credentials and has no live restore RPC path. It cannot restore, modify, or delete production data.

Each run writes a sanitized `recovery-rehearsal-<sha>` artifact retained for 90 days. The artifact records the exact repository SHA, backup contract version, scenario results, and explicit booleans showing that production data was not accessed and no live restore was executed.

## What the rehearsal does not prove

A green recovery rehearsal does **not** prove any of the following:

- that a recent production database snapshot exists;
- that Supabase managed backups or point-in-time recovery are enabled for this project;
- that a copy exists in a separate provider/account/failure domain;
- that storage object bytes have been copied or can be restored;
- a production RPO or RTO;
- that a destructive end-to-end restore has been performed in an isolated clone of production.

Those remain operational DR requirements, not source-code facts.

## Required next maturity steps

Before El Molino Ops can claim mature disaster recovery, operations must establish and independently verify:

- a recurring production database snapshot/export with defined retention;
- an offsite or separate-failure-domain copy;
- a corresponding storage-object backup/replication mechanism;
- periodic restore drills into an isolated environment using a real snapshot;
- measured restore duration and data-loss window before assigning formal RTO/RPO targets.

Until those are proven, recovery evidence should be described as **portable-contract rehearsal**, not as a successful production disaster-recovery drill.
