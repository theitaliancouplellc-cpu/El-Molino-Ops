# El Molino Ops

Phone-first operations workspace for El Molino Taqueria — Johns Island.

## V1 scope

The first vertical slice is intentionally limited to:

1. Capture restaurant knowledge by station.
2. Approve location-specific knowledge.
3. Create procedure drafts from that knowledge.
4. Maintain a basic team roster and roles.
5. Use a grounded Ask El Molino surface that searches restaurant knowledge before model-powered AI is added.

## Current foundation

- Next.js + TypeScript frontend
- Supabase authentication, Postgres database and row-level security
- Johns Island location seeded
- Kitchen area seeded
- General Manager, Manager, Kitchen, Prep, Dish and Cashier roles seeded
- Knowledge, procedures, checklist templates/runs and team schema already created
- First account created in the app becomes the location admin

## Deliberately not in V1 yet

Toast analytics, hiring, vendors, maintenance, inventory, document generation, multimodal photo learning and external AI model routing are held out until the first Knowledge → Procedure → Checklist workflow is complete and usable.
