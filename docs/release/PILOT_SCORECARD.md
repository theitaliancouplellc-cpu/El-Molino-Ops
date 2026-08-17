# Staff Pilot Scorecard

## Participant record

Record participant role, device/browser, pilot dates, and whether they are management or staff. Do not place passwords, PINs, wages, tip amounts, or other sensitive data in this document.

## Required employee tasks

For each participant, record Pass / Fail / Confusing / Not Applicable and a short note.

1. Sign in.
2. Find the next scheduled shift from Home.
3. Open the full published weekly schedule.
4. Navigate to a different week and back.
5. Receive and open a schedule publication/change notification in app.
6. Enable push alerts on the participant's device from Notification Preferences.
7. Close/background the app, receive a real push update, tap it, and verify it opens the correct employee-safe destination.
8. Submit availability.
9. Submit time off.
10. Offer a shift or request coverage.
11. View Shift Pool eligibility information.
12. Claim an eligible open shift when one is available.
13. Participate in a reciprocal trade when applicable.
14. Read an announcement.
15. Acknowledge a required announcement when assigned.
16. Open assigned training.
17. View personal time-clock state/history.
18. View personal finalized tip information where available.
19. Go offline after loading a schedule and verify the saved schedule is clearly marked read-only/stale.
20. Reconnect and verify authoritative data refreshes.
21. Sign out and sign back in.

## Required manager tasks

1. Review/approve employee onboarding identity and roles.
2. Build and publish a schedule.
3. Modify a previously published shift and notify affected staff.
4. Review availability/time-off requests.
5. Review coverage/open-shift claims.
6. Review a coworker-accepted reciprocal trade.
7. Verify ineligible/stale approval cannot be forced through.
8. Publish an announcement and verify recipient acknowledgment state.
9. Review timecard and tip workflows without exposing manager-only information to staff accounts.
10. Verify the audit trail for consequential actions.

## Defect severity

- P0 — security/privacy breach, lost/duplicated approved schedule mutation, incorrect schedule presented as current, unrecoverable corruption, widespread login outage.
- P1 — critical scheduling/request workflow unavailable without a safe workaround, or enabled staff devices systematically fail to receive required closed-app alerts.
- P2 — material inconvenience with a safe workaround.
- P3 — cosmetic/usability issue.

## Exit criteria

### Dogfood exit

- At least 3 managers and 5 staff participated for 3 operating days.
- Every critical employee and manager task was exercised at least once.
- No P0/P1 issue remains open.

### Closed-pilot exit

- 10–20 participants across FOH, BOH, and management used the app for at least 7 operating days.
- Critical task completion >=95%.
- Successful critical mutations >=99%, excluding deliberate policy/eligibility rejections.
- 0 cross-user data exposure incidents.
- 0 lost or duplicated approved schedule mutations.
- 0 unresolved P0/P1 defects.

### General availability

- 25%, then 50%, then 100% rollout completed.
- Each stage survived at least one schedule publication/change cycle.
- No rollout stop condition was triggered.
