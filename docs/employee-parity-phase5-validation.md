# Employee Parity Phase 5 Validation

Phase 5 hardens the staff Home, Shift Pool, coverage, and reciprocal-trade experience.

## Enforced employee workflow

- Staff Home uses server-authoritative priority and Shift Pool snapshots.
- Dedicated employee routes are used for Requests, Shift Pool, Team, and Training.
- Shift pickup eligibility checks role qualification, overlap, approved time off, availability, shift-length limits, minimum rest, weekly-hour limits, and overtime.
- Open-shift eligibility is checked when requested and again when management approves it.
- Coverage and trade mutations use authoritative RPCs; authenticated clients cannot directly insert, update, or delete `shift_change_requests`.
- Reciprocal trades require the target coworker's explicit acceptance before management can approve them.
- Trade eligibility is recalculated for both employees immediately before the final swap.

## Production validation

Transactional tests were run against temporary identities and rolled back. They verified conflicting offer rejection, conflicting open-shift rejection, valid open-shift claiming, read-but-unacknowledged announcement priority, coworker trade acceptance, pre-acceptance manager blocking, final reciprocal ownership swap, and direct shift-change DML denial. Follow-up checks confirmed no test identities or records survived the rollback.

The latent PL/pgSQL output-column ambiguity in `staff_trade_candidates` was found during this validation and corrected by qualifying the source-shift query.
