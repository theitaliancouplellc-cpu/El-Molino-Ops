# El Molino Ops — Autonomous Audit Checklist

Last updated: 2026-08-14 UTC

This file tracks verified findings and unresolved audit work. Items are only marked fixed after direct code/configuration verification.

## Frontend / mobile / PWA
- [ ] Re-test iPhone safe-area, keyboard/input, offline-cache invalidation, and service-worker update behavior with authenticated flows.

## AI conversation / routing
- [x] Model-first conversation architecture verified; phrase-matching conversation engine retired.
- [x] Direct Groq provider path added ahead of Vercel AI Gateway.
- [ ] Production Groq inference blocked until `GROQ_API_KEY` is configured; production `/api/ask` currently reports `groq: false`.
- [ ] Run authenticated end-to-end production conversation test after Groq credential is configured.

## Supabase / RLS / security
- [x] RLS enabled on all current public tables.
- [x] Removed unnecessary `TRUNCATE`, `TRIGGER`, and `REFERENCES` privileges from `anon` and `authenticated` on public tables.
- [x] Non-manager task updates are now restricted at the database trigger layer to completion-state fields; assignment, priority, recurrence, ownership, source and delete metadata cannot be rewritten by an assignee.
- [x] Non-manager comment updates can no longer rewrite identity/ownership/entity fields.
- [ ] Supabase Auth leaked-password protection remains disabled; requires Auth configuration change rather than database migration.
- [ ] Perform live employee-role RLS tests when a non-admin authenticated test identity exists; current project has only an admin profile.
- [ ] Review `ops_records_update` field-level mutation rights; current RLS allows creator/assignee updates with only location enforced in `WITH CHECK`, but intended employee-edit semantics need to be established before tightening.

## Storage / uploads
- [ ] Re-run signed URL, unauthorized file access, cross-location link, oversized upload, rollback-on-link-failure, and orphan-file tests.

## Auth / roles
- [ ] Validate manager cannot invite/promote admin and employee cannot mutate manager-only resources using real authenticated role sessions.

## Tasks / checklists
- [x] Assignee task mutation boundary hardened at database layer.
- [ ] Verify recurrence completion remains idempotent under double-submit/concurrent completion.
- [ ] Verify checklist item completion cannot be forged across checklist runs/locations.

## Calendar / recurrence / timezones
- [ ] Test DST spring-forward/fall-back cases and local-time preservation for recurring events.
- [ ] Verify recurrence expansion is bounded for malformed/very old rules.

## Notifications
- [ ] Verify notification update policy cannot mutate protected fields other than user-owned read state.
- [ ] Verify push subscription ownership and stale subscription cleanup.

## Search
- [ ] Verify search cannot surface non-approved knowledge or cross-location/private records.

## Files
- [ ] Verify entity-file link authorization for every supported entity type.

## Backups / restores
- [ ] Validate restore is staged/previewed, schema-compatible, and cannot overwrite production data without explicit confirmation.

## Concurrency
- [ ] Test duplicate task creation, dependency races, repeated completion, comment double-submit, and upload/link races.

## Performance
- [ ] Supabase currently reports many unused indexes; no indexes removed because the database is new and usage statistics are not mature enough to justify destructive optimization.

## Accessibility
- [ ] Run keyboard/focus/label/contrast audit on primary routes and modal/command interactions.

## CI / build
- [x] Latest application build passed the current 59-test suite before production deployment.
- [ ] Add database-security contract tests for task/comment field immutability to CI or a migration verification script.

## Deployment boundaries
- [x] Vercel AI Gateway card-verification failure identified; direct provider path added.
- [ ] Do not consider AI healthy until a real authenticated production inference succeeds.
