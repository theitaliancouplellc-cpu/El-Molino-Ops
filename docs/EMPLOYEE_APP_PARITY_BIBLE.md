# El Molino Staff — Employee Experience Parity Bible

Version: 1.0

## Mission

El Molino Staff is a dedicated employee product, not a reduced manager dashboard. It must give hourly restaurant employees the same operational confidence expected from mature scheduling software while preserving El Molino's own workflows, terminology, data model, and management controls.

The target is behavioral parity, not source-code or visual copying. A feature is not complete because a button exists. It reaches parity only when the employee workflow, manager counterpart, state transitions, security boundary, notifications, mobile behavior, failure handling, auditability, and permanent regression coverage are all complete.

## Release language

Every parity capability has one status:

- `MISSING`: no usable implementation.
- `STRUCTURE_EXISTS`: schema or partial surface exists but the workflow is incomplete.
- `FUNCTIONAL`: happy path works.
- `HARDENED`: happy path plus permissions, state constraints, idempotency, failure paths, and audit behavior are protected.
- `POLISHED`: hardened and employee-grade mobile UX, copy, loading/empty/error states, navigation, and accessibility are complete.
- `PARITY`: polished, regression-locked, production-observed, and behaviorally equivalent to the mature reference capability.
- `EXCEEDS_PARITY`: intentionally goes beyond the reference while retaining the parity contract.

No capability may be promoted by opinion alone. Promotion requires the acceptance evidence listed in `employee-app-parity-ledger.json`.

## Non-negotiable architecture

### 1. Employee and management are separate products

Employee accounts must never inherit management navigation, commands, financial administration, labor controls, publishing controls, audit consoles, incident systems, inventory, cash controls, or configuration tools. UI hiding is insufficient: database policies and authoritative RPCs must enforce the same boundary.

Employee navigation is intentionally compact:

`Home · Schedule · Requests · Team · More`

Specialized employee tools may deep-link from those surfaces, but they do not expand the primary navigation into a management-style menu.

### 2. Server authority for consequential actions

Any operation that changes responsibility, qualification, publication, payroll evidence, approval state, schedule ownership, or another employee's data must use a server-authoritative mutation boundary. Direct client table writes are acceptable only for low-risk records that are explicitly protected by RLS and immutable-field guards.

### 3. State machines, not free-form status fields

The application treats lifecycle status as a state machine. Illegal transitions fail at the database boundary even if a client is modified.

Employee onboarding:

`INVITED → ACCOUNT_CREATED → PROFILE_SUBMITTED → AWAITING_REVIEW → APPROVED → ACTIVE`

Review branches:

`AWAITING_REVIEW → CHANGES_REQUESTED → PROFILE_SUBMITTED`

`AWAITING_REVIEW → REJECTED`

Employment lifecycle after approval:

`ACTIVE → SUSPENDED → ACTIVE`

`ACTIVE|SUSPENDED → INACTIVE`

`INACTIVE → ACTIVE` only through a manager reactivation action.

Schedule requests:

`SUBMITTED → PENDING → APPROVED|DENIED|CANCELLED`

Shift offers:

`OPEN → ASSIGNED|WITHDRAWN|EXPIRED`

Shift bids/claims:

`PENDING → APPROVED|DENIED|WITHDRAWN|CANCELLED`

Published schedules are revisioned. Employees never read manager drafts as their employee schedule.

### 4. Unified event and notification model

Operational actions emit normalized events. Notification delivery is downstream of the event, not embedded ad hoc in every screen.

Core event names:

- `employee.profile_submitted`
- `employee.profile_approved`
- `employee.profile_changes_requested`
- `employee.profile_rejected`
- `employee.role_changed`
- `employee.status_changed`
- `schedule.published`
- `schedule.shift_changed`
- `schedule.shift_reminder`
- `schedule.open_shift_created`
- `shift_pool.offer_created`
- `shift_pool.offer_withdrawn`
- `shift_pool.bid_submitted`
- `shift_pool.bid_approved`
- `shift_pool.bid_denied`
- `trade.submitted`
- `trade.approved`
- `trade.denied`
- `availability.submitted`
- `availability.approved`
- `availability.denied`
- `time_off.submitted`
- `time_off.approved`
- `time_off.denied`
- `announcement.created`
- `announcement.acknowledgement_required`
- `training.assigned`
- `training.due_soon`
- `training.completed`
- `time_clock.correction_requires_attestation`
- `tips.finalized`

Every notification record has a category, event key, human title/body, deep link, structured data, read state, and deduplication identity where appropriate.

Delivery channels are adapters:

`in_app` is mandatory. `push`, `email`, and `sms` are optional channels controlled by preferences and infrastructure availability. Failure of an external channel must never erase the in-app event.

### 5. Deep links are contextual

Notifications do not send employees to generic landing pages when a precise destination exists. A schedule change links to the affected week and, where possible, the shift. A time-off decision links to the request. A training assignment links to the course. An announcement links to the announcement.

### 6. Privacy by minimum necessary disclosure

Employees may see coworker identity and shift information only where a legitimate employee workflow requires it, such as an eligible shift trade or Shift Pool offer. They must never receive coworker wage rates, tip totals, payroll evidence, disciplinary records, private contact details, manager notes, admin metadata, or other protected profile fields.

## Product contracts

### Employee Home

Purpose: answer “What matters to me right now?” in one screen.

Required order of importance:

1. next shift, role, date/time, break summary, countdown, and shift note;
2. schedule publication/change alert;
3. unread critical announcement;
4. pending employee request decisions;
5. Shift Pool opportunity or pending bid/trade status;
6. required/due training;
7. time-clock state when the El Molino clock is active;
8. recent finalized personal tip information;
9. lower-priority notifications.

Home must never expose restaurant-wide financial or staffing administration.

### Employee Schedule

Employees see only their published/authorized shifts. Required behavior:

- current week plus previous/next navigation;
- explicit `Today`/`This week` recovery;
- role, start/end, scheduled/net hours, breaks, notes, and status;
- clear day-off empty state;
- published revision context;
- changed-shift visual emphasis after a schedule-change deep link;
- Offer Up, Need Coverage, and eligible Trade actions;
- no manager draft, Auto Schedule, coverage configuration, labor budget, publishing, or manager approval UI.

Schedule publication supports:

- `everyone` — notify all scheduled employees;
- `changed_only` — after an earlier publication, notify only employees whose assignments changed since the prior publication;
- `none` — publish silently while retaining the publication event.

All three modes are audited.

### Requests Hub

The employee requests product has four conceptual areas:

- recurring availability;
- temporary availability;
- time off;
- shift changes / history.

Every request shows status, submission timestamp, effective dates, manager response when appropriate, and cancellation eligibility. Employees cannot mutate a final decision by editing the client.

Recurring availability supports `Any time`, `Unavailable`, and one or more available windows per day as the model evolves. Temporary availability has an explicit date range and never destroys the employee's permanent pattern.

Time off supports full-day and partial-day requests, category, dates/times, reason, status, manager note, blackout/minimum-notice policy checks, and conflict-aware approval.

### Shift Pool

The Shift Pool is an employee marketplace governed by manager authority and schedule safety.

Employee views:

- Up for Grabs;
- Open Shifts;
- My Offers;
- My Bids;
- Trades.

Eligibility is computed before allowing a pickup/bid when practical. It includes qualification, schedule overlap, approved time off, availability, minimum rest, weekly-hour/overtime rules, and any configured compliance constraints.

The UI must repeatedly preserve the responsibility rule: offering a shift does not remove the employee's responsibility until the schedule is actually reassigned.

### Trades

Trade selection is a matching workflow, not a blind form. The employee sees reciprocal candidates only when both employees are qualified for the other's role and basic schedule constraints can be satisfied. Manager approval remains authoritative.

### Notifications

The employee receives a dedicated Notification Center with:

- unread badge;
- all/category filters;
- chronological event history;
- read/unread state;
- mark one / mark all read;
- safe deep links;
- empty/error/loading states;
- category and event identity;
- preference-aware external delivery while retaining in-app history.

### Notification Preferences

Per-user preferences are stored separately from operational events. Initial categories:

- schedule publications and changes;
- shift reminders;
- Shift Pool / trades;
- availability and time off;
- team announcements;
- training;
- time clock;
- tips.

In-app history remains on for required operational events. External channels may be disabled by the employee unless a future restaurant/legal policy explicitly requires otherwise.

### Shift Reminders

Reminder generation is idempotent per shift version. If the shift changes, a new version can generate a new reminder. Reminders must never fire for cancelled/reassigned/inactive-employee shifts.

### Team Communication

Messages are two-way communication. Announcements are authoritative manager broadcasts.

Announcements support audience targeting, priority, expiration, read state, and optional acknowledgement. Employee-visible audience labels must not reveal private roster metadata.

Manager-on-duty routing is contextual. The employee requests help without needing to know which manager should receive it; routing resolves the appropriate scheduled/current manager with a deterministic fallback.

### Training

Employee Home surfaces due work. Employees can see only their own assignments/progress plus employee-visible course content. Training administration, assignment management, answer keys, and organization-wide completion analytics remain management-only.

### Time Clock

Employee UI contains only the employee's current clock state, punch actions when enabled, scheduled context, own punch history, and required attestations. Manager corrections, wage reports, payroll closure/reopen controls, other employees' punches, and audit administration are prohibited from employee surfaces and employee data policies.

### Tips

Employee UI contains only the authenticated employee's finalized distributions/history and an understandable calculation explanation where appropriate. Pool configuration, contribution editing, all-employee reports, run generation, finalization, cancellation, and financial administration are manager-only.

### More / Account

Contains personal profile, verified roles, notification preferences, security/password, employee documents/policies, training entry point, own time-clock history, own tip history, help/support, and sign-out.

Verified roles are visibly distinguished from any requested future changes.

## UX quality contract

Every employee surface must implement:

- loading state;
- actionable error state;
- meaningful zero/empty state;
- pending/disabled mutation state;
- safe-area support on iPhone;
- at least 44px primary tap targets;
- no horizontal overflow at 320px CSS viewport width;
- readable light/dark theme behavior through shared tokens;
- keyboard focus visibility;
- semantic button/link usage;
- accessible labels for icon-only controls;
- no desktop tables as the primary mobile presentation.

Copy must tell the employee what happened and who remains responsible. Internal implementation terms such as RPC, row policy, revision token, or database state must not leak into normal employee-facing copy.

## Degraded-network contract

Read-only employee essentials may use a last-known-good local snapshot:

- next shift;
- published weekly schedule;
- critical announcement text previously loaded.

Mutations never pretend to succeed offline. They remain visibly pending only if the product implements a durable retry queue; otherwise the action fails clearly and the employee retries when connected.

## Audit contract

Consequential events record actor, employee/subject, location, timestamp, state transition, and stable object identity. Schedule publication and responsibility transfers must be explainable after the fact.

Employee-facing history may intentionally show a subset. Management audit records remain protected.

## Regression gates

No employee-parity PR may merge unless all existing CI gates pass plus permanent tests verify at minimum:

1. employee routes cannot surface management/admin products;
2. employee command/search cannot surface management actions;
3. employee schedule never exposes manager draft controls;
4. employee schedule query is scoped to the authenticated employee for personal schedule views;
5. unapproved self-declared roles never become scheduling qualifications;
6. profile approval is single-authority and duplicate approval cannot create duplicate employee identities;
7. publication mode validation is server authoritative;
8. first publication cannot use changed-only mode;
9. changed-only publication derives recipients from change evidence;
10. notification update policies prevent users from rewriting notification identity/content;
11. schedule and request notification links remain staff-safe;
12. employee financial views cannot query manager-wide payroll/tip evidence;
13. finalized/terminal requests cannot be arbitrarily reopened by the employee client;
14. backup/recovery includes new parity-critical tables;
15. ledger JSON remains schema-valid and every capability has an acceptance owner/status.

## Implementation order

### Phase 0 — Governance

Create and lock this Bible, the machine-readable parity ledger, and regression test that validates the ledger. This prevents random feature accumulation.

### Phase 1 — Trust foundation

1. normalize notification event identity and category;
2. add Notification Center;
3. add notification preferences;
4. harden notification RLS/update fields;
5. add/verify employee-safe deep links;
6. audit employee data visibility and close privacy leaks;
7. ensure backup/recovery covers new tables.

### Phase 2 — Identity and lifecycle

1. formalize onboarding state transitions;
2. add active/suspended/inactive lifecycle where missing;
3. manager review preserves claimed-vs-approved roles and audit trail;
4. prevent duplicate/mis-linked identities;
5. expose verified roles to employee account UI.

### Phase 3 — Scheduling and requests

1. polish published revision experience;
2. highlight changed shifts from notifications;
3. unify recurring/temporary availability and request history;
4. complete partial-day time off and policy feedback;
5. strengthen Shift Pool eligibility and status UX;
6. strengthen trade matching and request lifecycle.

### Phase 4 — Team and training

1. employee-safe announcement center;
2. acknowledgement workflow;
3. manager-on-duty routing;
4. unread/due signals on Home;
5. employee training due-state integration.

### Phase 5 — Time and money separation

1. employee-only time-clock surface;
2. employee-only finalized-tip history;
3. payroll/tip privacy regression tests;
4. remove any remaining manager controls from employee-capable routes.

### Phase 6 — Product polish

1. mobile/accessibility pass;
2. meaningful empty/error/loading states;
3. last-known-good published schedule cache;
4. reconnect/refresh behavior;
5. performance budgets for employee startup and navigation.

### Phase 7 — Delivery adapters

1. in-app reminders;
2. native/browser push when infrastructure is approved;
3. email/SMS adapters if selected;
4. delivery retry/observability without duplicating in-app events.

### Phase 8 — Production proving

Use test employees and managers to execute every workflow against a staging/test location, attack illegal state transitions, verify RLS with direct API attempts, validate mobile layouts, run backup/restore rehearsal, then promote each ledger item only with evidence.

## Definition of employee-app parity

The employee app reaches overall `PARITY` only when every `P0` and `P1` ledger capability is at least `PARITY`, there are no open security/privacy findings, the production regression suite passes, and a real end-to-end rehearsal confirms onboarding → published schedule → request → shift change → notification → time/training/tip/time-clock employee workflows without management-surface leakage.