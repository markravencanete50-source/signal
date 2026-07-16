# Changelog

All notable changes to Signal. Conventional commits; newest first.

## [Unreleased]

### Phase 1 — Auth, tenancy, shell

**Added**

- **Auth**: Firebase session cookies (httpOnly, mint/verify/revoke), a React
  `cache()`-memoised DAL (`verifySession`, `getRole`, `requireRole/Writer/Admin`,
  `requireBrandAccess`), `proxy.ts` optimistic redirect, and login/signup
  (email + Google) with a session-exchange route.
- **Tenancy**: server-side atomic workspace+owner bootstrap, brand CRUD with
  cascade delete, Resend magic-link invites (`invites` collection, bearer-token
  security, email-ownership check on accept), full team management (invite,
  role change, remove with session revocation).
- **Shell**: 236px grouped sidebar, topbar (brand switcher, search, sync,
  notifications, theme, avatar/account menu), responsive bottom nav + FAB +
  More sheet — all matching the preview, role-filtered via one nav model.
- **Adapters**: `PlatformAdapter` contract, registry, a deterministic
  MockAdapter (realistic data + latency + failures), and real Meta FB/IG
  adapters including the IG two-step container publish. Shared Graph client with
  typed errors and long-lived token exchange.
- **Meta OAuth**: HMAC-signed, browser-bound, single-use `state` (CSRF); callback
  re-authorises the caller and stores an AES-256-GCM-encrypted token. Settings →
  Connections with health cards (amber expiry warning) driven by
  `toPublicConnection` (token never crosses to the client).
- Onboarding, invite-accept, dashboard (honest empty states), settings
  (connections/team/brands), and phase-stub pages for every nav route with
  `requireTeamView` guards.
- Invite email (React Email), crypto module (encrypt/decrypt/token/safeEqual),
  repositories under `lib/db/`, and a workspace-context resolver.
- 35 Firestore rules tests (was 31): added `invites` lockout and member-`uid`
  forgery coverage.

**Fixed**

- A `"use server"` module may export only async functions — moved
  `ACTIVE_BRAND_COOKIE` out of `brand-actions.ts` into `brand-cookie.ts`.
- Renamed `useMockAdapters` → `isMockMode`; the `use` prefix tripped ESLint's
  rules-of-hooks in async server components.

**Changed**

- Added `invites` collection (DECISIONS #012), `lib/db/` repository layer
  (#010), pinned Graph API version (#011). Member docs now carry a `uid` field
  (enforced == doc id in rules) so a user's workspaces resolve via a
  collection-group query instead of scanning every tenant.

### Phase 0 — Foundation

**Added**

- Next.js 16 App Router scaffold, TypeScript strict + `noUncheckedIndexedAccess`.
- Design token system (`src/styles/tokens.css`) lifted verbatim from
  `signal-preview-v2.html`, mapped through Tailwind v4 `@theme inline` so one
  `.dark` class repaints the app with no `dark:` colour variants.
- `next-themes` (class strategy, system default, persisted) + topbar toggle.
- Space Grotesk + Inter via `next/font`; 15px root to match the preview.
- Firebase wiring: config-tolerant client SDK (`lib/firebase-client.ts`) and
  Admin SDK (`lib/firebase-admin.ts`).
- Lazily-validated server env contract (`lib/env.ts`, zod) + `.env.example`.
- `firestore.rules` with tenant isolation, a total client lockout on
  `connections/*`, and a constrained approve-only write for the `client` role.
- 14 composite indexes in `firestore.indexes.json`.
- 31 rules tests (`tests/rules/`) covering token lockout, cross-workspace
  isolation, client-role limits and privilege escalation — all passing against
  the emulator.
- GitHub Actions CI: lint · typecheck · format · rules tests · build.
- `vercel.json` with the four cron schedules.
- README (setup, security model, data model, Meta App Review checklist) and
  `DECISIONS.md`.

**Fixed**

- `.gitignore` `.env*` also swallowed `.env.example`, so the env contract would
  never have been committed. Added `!.env.example` negation, plus ignores for
  emulator artifacts and service-account keys.

**Changed**

- Next.js 16 instead of the spec'd 15, and Tailwind v4 instead of v3-style
  config. Both confirmed and recorded in `DECISIONS.md` (#001, #002).
- Auth verification moves from the spec'd "middleware" to an optimistic check in
  `proxy.ts` (Next 16's rename) plus real verification in a Data Access Layer —
  see `DECISIONS.md` #009.
- Workspace creation is server-side only; a client-side create cannot bootstrap
  its own owner membership without stranding the workspace (`DECISIONS.md` #005).
