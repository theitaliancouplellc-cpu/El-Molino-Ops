# Incident and Rollback Runbook

## Severity

- **P0** — private-data exposure, authorization bypass, lost/duplicated approved schedule mutation, widespread login failure, unrecoverable data corruption, or incorrect schedule state presented as current.
- **P1** — major workflow unavailable for a meaningful portion of staff/managers with no safe workaround.
- **P2** — degraded workflow with a safe workaround.
- **P3** — cosmetic or low-impact usability issue.

## Immediate response

For P0/P1:

1. Stop staged rollout and new feature deployment.
2. Record release SHA, deployment ID, business date, affected roles, first known occurrence, and reproducible steps.
3. Preserve logs and audit evidence without copying secrets or unnecessary employee data.
4. If the issue can corrupt or misrepresent scheduling state, direct staff to the existing scheduling safety-net process until recovery is verified.
5. Prefer forward-fix when data already written by the release remains valid; otherwise roll back application code to the last known-good deployment and use the database recovery path only when required.
6. Re-run the complete critical-path certification before restoring rollout.

## Application rollback

- Identify the most recent production deployment that passed the release gate.
- Confirm its Git SHA and database compatibility.
- Promote/redeploy that known-good build.
- Verify login, employee schedule, manager schedule, requests, Shift Pool, notifications, and manager approval paths.
- Keep the failed release blocked until root cause and regression coverage exist.

## Database recovery

- Never manually delete or rewrite production rows as an improvised rollback.
- Use the application's backup/recovery preview and validation workflow.
- Confirm schema compatibility and conflict report before restore.
- Apply recovery as an atomic operation.
- Verify row counts, authoritative schedule state, approvals, and audit evidence after recovery.

## Recovery verification

Before declaring recovery complete:

- employee and manager authentication works;
- employee authorization boundary passes;
- current published schedule is correct;
- no duplicate approved shift ownership exists;
- requests/trades have valid state transitions;
- notification volume is normal;
- current production deployment is READY;
- critical CI/regression suite is green.

## Post-incident requirement

Every P0/P1 incident must result in a permanent regression test or an explicit automated/operational control that would detect the same class of failure before the next general-availability release.