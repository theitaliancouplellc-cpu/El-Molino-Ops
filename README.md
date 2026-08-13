# El Molino Ops

Phone-first operations workspace for El Molino Taqueria — Johns Island.

## Current foundation

- Next.js + TypeScript frontend
- Supabase authentication, Postgres database, storage and row-level security
- Johns Island location and role-based access
- Knowledge, procedures, checklist templates/runs, tasks, discussions, files/media, operations records, calendar, menu catalog and team workflows
- Manager and employee workspaces
- Shift opening / mid-shift / closing execution
- Maintenance, incident, inventory, training, food-safety and operational record modules
- Saved/recent records, attachments, command/search palette and admin diagnostics
- Backup export plus restore dry-run validation
- Ask El Molino with local grounded fallback and free-provider rotation architecture
- PWA/offline support with cache recovery and iPhone safe-area handling

## Quality gates

Production builds run the full automated test suite before Next.js compilation. The regression suite currently includes dedicated adversarial rounds for conversational AI behavior, cross-app edge cases, permissions/concurrency/offline behavior, RLS/PWA/backup/accessibility hardening, and a 100-case intermediate workflow pass covering menu integrity, manager dashboard accuracy, procedure lifecycle, shift execution and Files & Media behavior.

## External integrations

External services that require third-party credentials or authorization remain optional connection points. The application is designed to degrade safely when those services are unavailable instead of exposing raw provider or infrastructure errors to restaurant users.
