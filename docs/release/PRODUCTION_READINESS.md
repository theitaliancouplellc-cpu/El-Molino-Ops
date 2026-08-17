# El Molino Ops Production Readiness

## Release principle

A release is production-ready only when feature behavior, authorization, data integrity, mobile usability, recovery, and operating procedures are all verified. Passing a build is necessary but not sufficient.

## Release classes

- **Development** — feature work may be incomplete.
- **Release candidate** — feature-complete for the intended scope; no known P0/P1 defect; full CI green.
- **Pilot certified** — release candidate plus the complete automated certification matrix and controlled real-user pilot evidence.
- **General availability** — pilot certified plus staged rollout completed without stop conditions.

## P0 release gates

### Authentication and authorization

- Employee, manager, and admin login/logout paths work.
- Expired or revoked sessions cannot continue protected operations.
- Employee accounts cannot reach manager/admin routes.
- Employee A cannot read or mutate Employee B private schedule, requests, tips, timecards, messages, setup claims, or other private records.
- Employee clients do not receive wages, payroll evidence, cash-management data, or manager-only configuration.
- Sensitive mutations use authoritative server RPCs rather than client-side table writes.

### Schedule lifecycle

- Draft schedules remain invisible to staff.
- Publishing creates the employee-visible schedule state.
- Schedule revisions identify affected employees.
- Employee deep links land on the relevant week.
- Cached schedules are explicitly stale/read-only and never masquerade as current.
- Reconnect refreshes authoritative server state.

### Requests and shift changes

- Time off and availability follow legal state transitions.
- Coverage requests preserve shift responsibility until authoritative reassignment.
- Open-shift claims reject role, overlap, time-off, availability, rest, shift-length, weekly-hour, and configured overtime conflicts.
- Reciprocal trades require coworker acceptance before manager approval.
- Manager approval revalidates eligibility immediately before mutation.
- Duplicate submit/retry is safe.
- Competing claims cannot both win.
- Stale approvals cannot overwrite newer authoritative state.

### Notifications and communications

- Schedule publication, schedule revision, trade, request decision, announcement, and acknowledgment events have deterministic in-app records.
- Notification deep links are employee-safe.
- Duplicate event delivery cannot create a notification storm.
- Required announcements remain outstanding until acknowledged.
- Push enrollment is a user-gesture device action and push subscription evidence is RPC-only.
- Closed-app push uses privacy-safe generic lock-screen copy rather than raw notification/database text.
- Push delivery is deduplicated per notification/device, retries transient failures with bounded backoff, and retires expired subscriptions.
- Push dispatch is authenticated independently from the public function URL and private VAPID material remains server-only.

### Mobile and accessibility

- 320px, 375px, and 430px employee layouts do not horizontally overflow.
- Interactive controls provide at least 44px touch targets where applicable.
- Inputs use mobile-safe font sizing.
- Safe-area insets are supported.
- Keyboard focus is visible.
- Critical controls have accessible names.
- Reduced-motion preference is respected.
- 200% text/zoom does not hide critical actions.

### Network resilience

- Normal, slow, intermittent, and offline states are distinguishable.
- Offline schedule viewing uses only last-known-good employee-scoped schedule data.
- Offline mutation attempts are blocked rather than queued as false success.
- Reconnect refreshes current state.

### Data integrity and recovery

- Backup manifest includes employee parity-critical data.
- Restore is previewed and validated before application.
- Restore is all-or-nothing for a requested recovery operation.
- Audit evidence exists for consequential manager and employee state transitions.
- Rollback/forward-fix procedure is documented.
- Push endpoints and encryption keys are treated as runtime device credentials rather than portable backup data.

### Build and runtime

- Type check passes.
- Full regression suite passes.
- Next.js production build passes.
- Cloudflare OpenNext build passes.
- Cloudflare worker validation and workerd smoke test pass.
- Production deployment reports READY.
- Live health reports the exact immutable release SHA that the deployment workflow certified.

## Automated acceptance thresholds

- 0 known P0/P1 defects.
- 100% pass for authorization and critical schedule/request contracts.
- 100% pass for transactional concurrency scenarios exercised by the certification suite.
- 0 cross-user/cross-role data exposure findings.
- 0 lost or duplicated approved schedule mutations in certification testing.

## Pilot certification

### Dogfood

Use at least 3 managers and 5 trusted staff for 3 operating days while the existing scheduling process remains the safety net. Required tasks:

- sign in and recover a session;
- find next shift and weekly schedule;
- receive a schedule publication/change in app and as an enabled-device push while the app is closed;
- open a push alert and land on the employee-safe destination;
- submit availability and time off;
- offer/request coverage for a shift;
- claim an eligible open shift;
- complete one reciprocal trade through coworker acceptance and manager approval;
- receive/read an announcement and complete any required acknowledgment;
- test offline schedule viewing and reconnect;
- report confusing, slow, broken, or misleading behavior.

No P0/P1 issue may remain open after dogfood.

### Closed pilot

Use 10–20 staff across FOH, BOH, and management for at least 7 operating days. Require real workflow usage, not passive installs.

Acceptance thresholds:

- critical task completion >=95%;
- successful critical mutations >=99%, excluding deliberate validation rejections;
- 0 cross-user authorization incidents;
- 0 duplicated/lost approved schedule changes;
- no unresolved P0/P1 defect.

### Staged rollout

Roll out 25% -> 50% -> 100%. Hold each stage through at least one schedule publication/change cycle.

Stop immediately for:

- authorization or private-data leakage;
- widespread login/session failure;
- lost or duplicated schedule mutation;
- notification storm;
- material increase in server errors;
- stale schedule presented as current;
- unrecoverable database inconsistency.

## Evidence record

For every release candidate record:

- immutable Git commit SHA;
- CI run URL/result;
- production deployment ID/result;
- database migration set;
- automated certification result;
- dogfood dates and participant count;
- closed-pilot dates and participant count;
- P0/P1 defect count at release;
- rollback target;
- final go/no-go decision.

General availability is permitted only after all automated gates pass and the real-user pilot thresholds are met.
