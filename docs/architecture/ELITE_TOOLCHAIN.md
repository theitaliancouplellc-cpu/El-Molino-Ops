# El Molino Ops Elite Production Toolchain

This document assigns every connected tool a bounded responsibility. The scheduling app must never depend on unnecessary vendors at runtime. Core production systems remain GitHub, Supabase, the primary hosting platform, and observability. Other tools support design, testing, training, operations, documentation, or future commercialization.

## Core production control plane

- **GitHub** — canonical source, pull requests, immutable release SHAs, CI, security/reliability regression gates, deployment workflows, rollback source.
- **Supabase** — authoritative workforce, schedule, request, messaging, time-clock, tip, audit, and notification data; authentication; RLS; transactional RPCs; recovery migrations.
- **Vercel** — current primary production hosting and preview environment; deployment/runtime telemetry and fallback while Cloudflare authentication is incomplete.
- **PostHog** — privacy-safe product analytics, error tracking, session-level UX evidence, staged feature flags, pilot metrics, funnels, and release health. Never capture passwords, tokens, wages, tips, message bodies, or unnecessary PII.
- **Linear** — execution control plane for production work, release blockers, defects, milestones, pilot evidence, and ownership.

## Design and product quality

- **Figma** — canonical product design system, employee/manager mobile flows, scheduling interaction prototypes, component states, responsive behavior, accessibility annotations, and visual acceptance criteria before major UI implementation.
- **Canva** — staff-facing onboarding cards, quick-reference guides, launch posters/QR instructions, training handouts, and branded internal communication assets. It is not the application design source of truth.
- **Files / Library** — durable evidence store for uploaded audits, restaurant procedures, screenshots, pilot artifacts, exports, policies, and acceptance evidence used during implementation and certification.

## Restaurant workflow integrations

- **Google Calendar** — optional employee schedule/calendar export, manager operational calendar, approved time-off calendar views, training/event synchronization. Supabase remains authoritative for scheduling.
- **Gmail** — controlled onboarding, recovery, manager escalation, pilot feedback, and exceptional notification fallback. It must not become the primary schedule notification channel.
- **Google Contacts** — controlled recipient resolution for management communications; never use contacts as the employee identity authority.
- **Google Drive / Docs / Sheets / Slides** — restaurant operating documents, training source material, policy drafts, pilot reports, archival exports, and executive review material. Structured operational state remains in Supabase.
- **Microsoft SharePoint / OneDrive** — alternate enterprise document archive/integration for ownership or corporate environments that operate in Microsoft 365. No dual-write operational database.
- **Notion** — product/operations knowledge base, decision records, SOPs, release notes, architecture summaries, and human-readable implementation context. GitHub remains canonical for code and migrations.
- **Airtable** — optional structured staging/import workspace for hiring pipelines, inventory/setup catalogs, or migration review. Never a second authoritative schedule database.

## API and integration engineering

- **3Min API** — lightweight external REST facade or webhook relay for bounded integrations that should not directly expose Supabase. Use only when a dedicated API boundary materially simplifies a partner integration.
- **Replit** — isolated prototype/sandbox for disposable experiments or reproduction cases. Never the production source of truth and never a forked substitute for the GitHub application.

## Training and adoption media

- **HeyGen** — short role-specific onboarding/training explainers using approved scripts.
- **AI Video Maker** — rapid training/demo clips for employee workflows and rollout communication.
- **Invideo** — polished onboarding, launch, and internal training videos.
- **Instavar Remotion Templates** — deterministic programmatic release/tutorial clips from structured scripts and screenshots when repeatable video output is useful.
- **VideoZero** — visual explanations of complex workflow logic such as shift trades, approvals, availability, or scheduling constraints for training and QA communication.
- **DataCamp** — targeted engineering/analytics learning and reference when the project requires a technique not yet standardized internally; never a runtime dependency.

## Future business/commercial roles only

- **Stripe** — only if El Molino Ops later becomes a paid multi-restaurant SaaS product; subscriptions, invoices, billing portal, and payment state. No role in current employee scheduling operations.
- **Wix** — only for a future public marketing/help site, not the authenticated workforce product.
- **Apollo.io** — only for future B2B sales/prospecting if the application is commercialized to other restaurants. No staff or production scheduling access.
- **CloudX** — only if a future public product has a legitimate advertising/publisher use case. It has no place in the internal workforce app and must not receive employee data.

## Release architecture

1. GitHub PR + exact-head CI must pass.
2. Supabase migrations are transactional, permission-reviewed, and rollback/forward-fix documented.
3. Preview deployment is exercised before production.
4. Production deployment publishes an immutable release SHA.
5. PostHog/runtime telemetry validates errors, task completion, and pilot health.
6. Linear tracks any P0/P1 defect as a release blocker.
7. Rollout progresses through pilot and staged cohorts; feature flags provide kill switches for high-risk features.
8. Cloudflare can become the primary/secondary production edge after account authorization, but the application must remain deployable without a ChatGPT Cloudflare connector.

## Non-negotiable rule

A connected plugin does not automatically receive runtime access or employee data. Each integration gets the minimum data and permission necessary for its assigned job. Irrelevant tools remain outside the production trust boundary.
