# El Molino Ops — Autonomous Audit Checklist

This file is the persistent audit ledger for confirmed findings, verified fixes, unresolved blockers, and areas still requiring targeted testing. Do not count duplicates, cosmetic preferences, or unverified hypotheses as fixed defects.

## Frontend / mobile / PWA
- [ ] Re-test iPhone safe-area handling, keyboard/input viewport behavior, bottom navigation overlap, and PWA standalone launch after major UI changes.
- [ ] Verify service-worker update behavior cannot strand users on stale API/UI bundles.
- [ ] Verify offline/error states do not present destructive actions as completed.

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
- [ ] Review `ops_records_update` field-level authorization against intended creator/assignee edit semantics before tightening it.
- [ ] Add authenticated-role contract tests for cross-location reads/writes and field-level mutation guards.
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
- [ ] Verify backup export contains every production domain and preserves enough metadata for deterministic restore.
- [ ] Test restore idempotency, partial failure rollback, duplicate IDs, foreign-key ordering, and malformed archive handling using a staged non-production path.

## Concurrency
- [ ] Test double-submit creation, concurrent task completion, concurrent record edits, duplicate attachment links, and optimistic UI rollback.

## Performance
- [ ] Re-check advisors after meaningful schema/index changes.
- [ ] Do not remove currently unused indexes solely from young-database statistics; wait for representative workload data.
- [ ] Measure high-cardinality files/tasks/ops screens and API request sizes before optimizing.

## Accessibility
- [ ] Keyboard navigation, visible focus, dialog/confirmation focus trapping, form labeling, touch target size, reduced motion, and contrast audit remain to be run systematically.

## CI / build
- [x] Production build currently runs the automated test suite before Next.js build.
- [ ] Add database/RLS contract tests to CI where a disposable Supabase test environment can be safely provisioned.

## Deployment boundaries
- [ ] Avoid deployments for database-only or documentation-only audit work unless runtime verification specifically requires one.
- [ ] Verify environment-variable parity across Production/Preview/Development when AI provider credentials are introduced.

## Latest meaningful finding
A confirmed file-metadata authorization defect was fixed: the `files_manager_update` RLS policy allowed an original uploader to update the row, and no trigger prevented rewriting physical-file identity fields such as `storage_bucket`, `storage_path`, `uploaded_by`, filename, MIME type, size, kind, or creation time. A database trigger now makes those fields immutable while preserving legitimate mutable metadata/deletion workflows.
