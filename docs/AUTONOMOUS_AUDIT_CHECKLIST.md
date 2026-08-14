# El Molino Ops — Autonomous Audit Checklist

This file is the persistent audit ledger for confirmed findings, verified fixes, unresolved blockers, and areas still requiring targeted testing. Do not count duplicates, cosmetic preferences, or unverified hypotheses as fixed defects.

## Frontend / mobile / PWA
- [ ] Re-test iPhone safe-area handling, keyboard/input viewport behavior, bottom navigation overlap, and PWA standalone launch after major UI changes.
- [x] Service-worker static caching now falls back to an already-cached asset when the network returns a non-2xx response, preventing a stale client from crashing on removed Next.js chunks during a deployment transition.
- [x] Document navigations remain network-only and fail closed to explicit offline HTML; destructive changes are not accepted by the offline fallback.
- [ ] Verify service-worker update behavior across two real sequential builds on an installed iPhone PWA.

## AI conversation / routing
- [ ] Production inference remains blocked until a real provider credential is installed. Direct Groq support exists in code, but production must report `groq: true` before Ask AI is considered healthy.
- [ ] After provider activation, run end-to-end conversational tests with multi-turn context, slang, corrections, topic changes, restaurant-specific retrieval, and write-action confirmation.
- [ ] Verify provider failure/fallback behavior with real 401/403/429/5xx responses without exposing provider internals to users.

## Supabase / RLS / security
- [x] Removed unnecessary authenticated/anon TRUNCATE/TRIGGER/REFERENCES privileges from public tables.
- [x] Restricted non-manager task updates to completion-state fields at the database layer.
- [x] Hardened comment identity/location metadata against unauthorized rewrites.
- [x] Hardened checklist run item identity, parent/template references, and created_at against rewrites.
- [x] Fixed discussion-message UPDATE source-location isolation for managers/authors.
- [x] Hardened file identity and storage metadata against UPDATE tampering (`id`, location, uploader, physical storage reference, original filename/type/size/kind, created_at).
- [x] Hardened `ops_records` row identity so authenticated users, including managers/admins, cannot rewrite `id` or `created_at`; the existing non-manager field guard remains intact for location/kind/sensitivity/priority/assignment/ownership/archive/delete fields.
- [ ] Add authenticated-role contract tests for cross-location reads/writes and field-level mutation guards. Current production data has no employee profile/ops record pair suitable for a non-destructive role-mutation replay.
- [ ] Supabase Auth leaked-password protection is disabled; requires Auth configuration, not a normal SQL migration.

## Storage / uploads
- [x] Storage object insert paths are constrained to current location + authenticated user folder.
- [x] Storage read requires a matching accessible `files` row.
- [x] File database rows can no longer be repointed to a different bucket/path or falsified physical-file identity via UPDATE.
- [ ] Test orphan cleanup/rollback when object upload succeeds but metadata/link creation fails.
- [ ] Test signed URL expiration, deleted file recovery, and cross-location attachment access end-to-end.

## Auth / roles
- [x] Existing last-admin and self-privilege-change guards are installed on profiles.
- [ ] Verify invitation role escalation, invite reuse/expiry, and location reassignment paths with authenticated role tests.
- [ ] Enable leaked-password protection in Supabase Auth when configuration access is available.

## Tasks / checklists
- [x] Assignee task mutation is limited at the database layer to permitted completion-state fields.
- [x] Checklist run item structural identity is immutable after creation.
- [ ] Exercise concurrent completion/reopen updates and dependency checks for lost-update/race behavior.

## Calendar / recurrence / timezones
- [x] Existing tests cover supported recurrence grammar, weekly BYDAY expansion, month-boundary behavior, impossible monthly dates, and bounded parsing.
- [ ] Test DST transitions and location-local date rendering against America/New_York boundaries.
- [ ] Test edit/delete semantics for recurring events and long-horizon recurrence expansion limits.

## Notifications
- [x] Notification identity/content/location metadata is guarded from recipient-side rewrites; read state remains mutable.
- [ ] Test duplicate notification generation, concurrent mark-read, stale badge counts, and href validation end-to-end.

## Search
- [ ] Test query escaping, large result sets, location isolation, stale/deleted result suppression, and search consistency across files/tasks/knowledge/ops records.

## Files / backups / restores
- [x] Backup dry-run now rejects exports whose own `errors` array reports failed or safety-capped table exports, so a partial backup cannot be mistaken for a restorable complete backup.
- [x] Backup dry-run rejects malformed export-status metadata instead of ignoring it.
- [ ] Verify backup export contains every production domain and preserves enough metadata for deterministic restore.
- [ ] Test restore idempotency, partial failure rollback, duplicate IDs, foreign-key ordering, and malformed archive handling using a staged non-production path.

## Concurrency
- [ ] Test double-submit creation, concurrent task completion, concurrent record edits, duplicate attachment links, and optimistic UI rollback.

## Performance
- [x] Removed the Supabase `auth_rls_initplan` warning from `discussion_messages_author_update` by evaluating `auth.uid()` through a scalar subquery once per statement while preserving the same authorization semantics.
- [x] Re-ran security and performance advisors after the `ops_records` identity migration; no new security/RLS warning was introduced and the performance advisor still reports only young-database unused-index informational notices.
- [ ] Do not remove currently unused indexes solely from young-database statistics; wait for representative workload data.
- [ ] Measure high-cardinality files/tasks/ops screens and API request sizes before optimizing.

## Accessibility
- [ ] Keyboard navigation, visible focus, dialog/confirmation focus trapping, form labeling, touch target size, reduced motion, and contrast audit remain to be run systematically.

## CI / build
- [x] Production build currently runs the automated test suite before Next.js build.
- [x] Added a PWA service-worker contract test covering cached fallback on non-2xx static responses and fail-closed offline document navigation.
- [x] Added targeted backup-integrity contracts for exporter-reported table failures, malformed export-status metadata, and valid complete exports.
- [ ] Add database/RLS contract tests to CI where a disposable Supabase test environment can be safely provisioned.

## Deployment boundaries
- [x] This audit pass made no manual Vercel deployment; database and GitHub/CI validation were preferred.
- [ ] Verify environment-variable parity across Production/Preview/Development when AI provider credentials are introduced.

## Latest meaningful findings
1. The browser backup exporter intentionally records failed table exports and 100,000-row safety-cap failures in the backup root `errors` array, but the restore dry-run validator did not inspect that field. A structurally valid but incomplete export could therefore pass validation. The validator now treats any exporter-reported error as blocking and also rejects malformed export-status metadata.
2. Targeted tests now cover partial exports, malformed export status, and valid complete exports; CI is running typecheck/build verification for the change.
3. Existing unresolved blockers remain unchanged: production AI still lacks a real provider credential, authenticated cross-role mutation tests still need a safe disposable role fixture, and Supabase leaked-password protection still requires Auth configuration access.
