# El Molino Ops Release Candidate — 2026-08-16

## Immutable release evidence

- Certification merge commit: `e0b86610fc4aaeed8b6ecad2235868cfd1abff5d`
- Certification CI run: `31974981914`
- CI result: PASS
- Type check: PASS
- Full regression suite: PASS
- Next.js production build: PASS
- Cloudflare OpenNext build: PASS
- Cloudflare worker validation: PASS
- Cloudflare workerd smoke test: PASS
- Known P0/P1 defects at certification: 0
- Previous production rollback candidate: `d2b61f9954de654d1651a7c4eb32abb9d5ab5db8`

## Release posture

The codebase is release-candidate certified for manager testing and a controlled staff pilot. Production replacement of the prior scheduling system remains evidence-gated by live staff pilot and staged-rollout thresholds in `PRODUCTION_READINESS.md`; those thresholds must not be waived or marked complete without real operating evidence.
