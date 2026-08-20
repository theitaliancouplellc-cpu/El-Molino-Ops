# Staff Release Candidate Checklist

This checklist is the immutable evidence record for a Staff release candidate. It does not replace automated gates or real-user pilot evidence.

## Candidate identity

- Release candidate SHA:
- PR number:
- Certified PR head SHA:
- Certified base/main SHA:
- Candidate date/time (UTC):
- Release owner:

## Released Staff scope

The candidate must expose only currently released Staff product surfaces. At this stage that means the Staff experience centered on Home, Schedule, Requests, Messages, More, on-demand App Guide/tutorials, and deterministic Report a Problem support. Unreleased future modules remain fail-closed.

- [ ] Staff primary navigation is Home · Schedule · Requests · Messages · More.
- [ ] Training remains unreleased unless a later independently certified release explicitly changes that boundary.
- [ ] Time Clock remains unreleased unless a later independently certified release explicitly changes that boundary.
- [ ] Tips/earnings/financial surfaces remain unreleased unless a later independently certified release explicitly changes that boundary.
- [ ] Staff Ask AI remains unreleased unless a later independently certified release explicitly changes that boundary.
- [ ] Unknown/future Staff routes fail closed.

## Exact-head pre-merge certification

Record immutable run IDs/URLs and do not reuse evidence from a different SHA.

- [ ] Web CI — exact candidate head — PASS
  - Run:
- [ ] Mobile CI — exact candidate head — PASS
  - Run:
- [ ] Exact-SHA Cloudflare staging certification — exact candidate head — PASS
  - Run:
- [ ] Branch is up to date with protected `main` at merge time.
- [ ] PR merge uses GitHub merge commit, not squash/rebase.
- [ ] Expected-head protection succeeds.

## Production release evidence

- [ ] GitHub merge commit is verified/signed.
- [ ] Merge commit has exactly two expected parents: certified base + certified PR head.
- [ ] Merged-PR provenance gate — PASS.
- [ ] Immutable main source proof — PASS.
- [ ] Production build + regression suite — PASS.
- [ ] Cloudflare package-limit gate — PASS.
- [ ] Release-gate Worker deployment — PASS.
- [ ] Release-gate health/root-runtime — PASS.
- [ ] Runtime-tail evidence — PASS with no runtime failure.
- [ ] Production Worker deployment — PASS.
- [ ] Production `/api/health` returns HTTP 200.
- [ ] Production response body release SHA equals exact merge SHA.
- [ ] `x-el-molino-release` header equals exact merge SHA.
- [ ] Required production health checks are green.
- [ ] Disaster Recovery Rehearsal — PASS.
- [ ] Independent Cloudflare Production Evidence — PASS.
- [ ] Stable commit status `Cloudflare Production = success`.

## Native repository governance

- [ ] GitHub reports `main` protected.
- [ ] Active default-branch ruleset requires PR-based updates.
- [ ] Required status checks are source-bound to GitHub Actions.
- [ ] Required branch-up-to-date rule is enabled.
- [ ] Force pushes are blocked.
- [ ] Branch deletion is restricted.
- [ ] Bypass list is empty.
- [ ] Allowed merge method preserves the two-parent merge provenance model.

## Real-account functional smoke

Do not mark these from simulated/build-only evidence.

- [ ] Real Staff account login/logout verified.
- [ ] Real manager/admin account login/logout verified.
- [ ] Staff cannot render or navigate to unreleased/manager-only surfaces.
- [ ] Staff can view authoritative published schedule.
- [ ] Staff can complete released request flows.
- [ ] Staff can send/receive released messaging flows.
- [ ] App Guide completes on a real Staff session.
- [ ] Staff Report a Problem submits successfully.
- [ ] Manager review queue receives and processes the support report.
- [ ] Background/foreground and reconnect behavior verified.

## Physical-device matrix

Record device model, OS version, app/browser build, and result.

### iOS

- [ ] Small-width iPhone class
- [ ] Standard-width iPhone class
- [ ] Large-width iPhone class

### Android

- [ ] Small-width Android class
- [ ] Standard-width Android class
- [ ] Large-width Android class

For each representative device verify portrait layout, safe areas, keyboard behavior, touch targets, 200% text/zoom where supported, reduced motion, offline/reconnect, and no horizontal overflow.

## Pilot decision

- Dogfood dates:
- Managers participating:
- Staff participating:
- P0 defects open:
- P1 defects open:
- Critical task completion rate:
- Critical mutation success rate:
- Authorization incidents:
- Lost/duplicated approved mutations:

Decision:

- [ ] NO-GO — evidence incomplete or stop condition present.
- [ ] DOGFOOD CERTIFIED — 3 managers + 5 staff, 3 operating days, no unresolved P0/P1.
- [ ] CLOSED PILOT CERTIFIED — 10–20 participants, at least 7 operating days, thresholds met.
- [ ] GENERAL AVAILABILITY — 25% → 50% → 100% rollout completed through required schedule cycles without stop conditions.

## Notes

Never convert unavailable evidence into a PASS. Use `UNVERIFIED`, `BLOCKED`, or `NOT APPLICABLE` with a written reason when evidence does not exist.
