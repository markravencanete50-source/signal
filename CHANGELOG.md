# Changelog

All notable changes to Signal. Conventional commits; newest first.

## [Unreleased]

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
