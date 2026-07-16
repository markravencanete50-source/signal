# Architecture decisions

Running log of choices that weren't fully determined by the build spec, plus the
reasoning behind them. Newest last. Per the build rules: when something is
ambiguous, prefer the option that keeps a future platform adapter or Stripe
billing drop-in trivial, record it here, and keep moving.

---

## 001 — Next.js 16 instead of the spec'd Next.js 15

**Date:** 2026-07-16 · **Phase:** 0 · **Status:** accepted (confirmed with Lee)

The spec locks Next.js 15, but `create-next-app@latest` now ships **16.2.10**;
15 is a major version behind on a product being built from scratch today.

Chosen: **Next.js 16**. App Router semantics the spec depends on (server
actions, route handlers, `(group)` segments, cron endpoints) are unchanged from
15, so nothing in the repository structure or phase plan is affected. Building a
new product on an already-superseded major would bank a migration for no gain.

Cost: some Firebase/Vercel guides still reference 15. Next 16 also carries real
breaking changes from 15 (the scaffold's own `AGENTS.md` says as much), so
`node_modules/next/dist/docs/` is the reference of record over training-data
recall.

## 002 — Tailwind v4 instead of the spec'd v3-style config

**Date:** 2026-07-16 · **Phase:** 0 · **Status:** accepted (confirmed with Lee)

The spec says "Tailwind CSS with `darkMode: 'class'`", which is v3 syntax and
implies a `tailwind.config.js`. The scaffold ships **Tailwind v4**, which is
CSS-first: no JS config, `@theme` instead.

Chosen: **Tailwind v4**. It's a better fit for this design system, not merely a
newer one — the entire token layer is already CSS variables, so `@theme inline`
maps them straight through with no duplication. Under v3 every token value would
exist twice (once in `tokens.css`, once in `tailwind.config.js`) and could drift.

`darkMode: 'class'` is preserved exactly, expressed in `globals.css` as:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

Same behaviour (class on `<html>`, driven by next-themes), different syntax.

## 003 — `@theme inline` rather than plain `@theme`

**Date:** 2026-07-16 · **Phase:** 0 · **Status:** accepted

`@theme` copies a token's _value_ at build time; `@theme inline` emits utilities
that reference `var(--token)` at runtime. Only the latter lets one `.dark` class
on `<html>` repaint the whole app. With plain `@theme`, `bg-surface` would bake
in the light hex and never flip.

Consequence: colour needs no `dark:` variants anywhere. `dark:` is reserved for
non-colour adjustments. This is what makes "components consume semantic tokens
ONLY, never raw hex" enforceable rather than aspirational.

## 004 — 15px root font size

**Date:** 2026-07-16 · **Phase:** 0 · **Status:** accepted

The preview sets `html { font-size: 15px }`. Tailwind's spacing and type scales
are rem-based, so this rescales the entire system ~6% to match the design 1:1.
Preview is design truth, so 15px stands. Flagged here because it looks like a
bug to anyone assuming a 16px root.

## 005 — Firestore rules deny ALL client access to `connections/*`

**Date:** 2026-07-16 · **Phase:** 0 · **Status:** accepted

Spec mandates it; recording the reasoning. `connections` holds AES-256-GCM
encrypted Meta tokens. The Admin SDK bypasses security rules entirely, so every
legitimate access path (publish, sync, refresh) is unaffected by a blanket deny.
Client-side reads have no use case even for an `owner`, so `allow read, write:
if false` costs nothing and removes the entire exfiltration surface. Encryption
is defence-in-depth behind that, not the primary control.

## 006 — Public reports and SmartLinks are server-rendered, not public Firestore reads

**Date:** 2026-07-16 · **Phase:** 0 · **Status:** accepted

`/r/[token]` and `/{slug}` are unauthenticated. The tempting rule —
`allow read: if resource.data.publicToken == <something>` — doesn't work:
Firestore rules can't authenticate the _reader_, so any public read rule on
`reports` exposes every document to anyone who can guess an ID, and rules cannot
express "only if you already know the token" for a query.

Instead both routes read via the Admin SDK server-side, look the token up, and
return only that document. Rules stay member-only. Token revocation then works
by deleting the field, with no rule change.

## 007 — Vercel Cron frequency requires the Pro plan

**Date:** 2026-07-16 · **Phase:** 0 · **Status:** accepted, needs Lee's confirmation

`vercel.json` schedules `/api/cron/publish` at `* * * * *` (every minute) as the
spec requires. **Vercel Hobby allows only 2 cron jobs, each at most once per
day.** This project declares 4 crons, one of them per-minute, so it needs
**Vercel Pro**.

The publish engine's correctness does not depend on the cadence — the cron is
just a clock, and the handler is idempotent with a transaction lock — so a lower
frequency degrades scheduling precision, not integrity. If Pro isn't wanted, the
fallback is an external scheduler (GitHub Actions `schedule:`, cron-job.org)
hitting the same endpoints with the `x-cron-secret` header. Nothing in the code
changes.

## 008 — `firestore.indexes.json` carries no comments

**Date:** 2026-07-16 · **Phase:** 0 · **Status:** accepted

Annotating each index with a `__comment__` key would document intent nicely, but
the Firebase CLI validates this file against a strict schema on deploy and can
reject unknown keys. A broken deploy isn't worth inline comments — index
rationale lives in the README's data model section instead.

## 009 — Auth: optimistic check in `proxy.ts`, real verification in a Data Access Layer

**Date:** 2026-07-16 · **Phase:** 0 (structure) / 1 (implementation) · **Status:** accepted

The spec says "Firebase session cookies (httpOnly), **verified in middleware**".
Two things about Next 16 make the literal reading wrong:

1. **`middleware.ts` no longer exists — it's `proxy.ts`** (root or `src/`, same
   level as `app/`). Functionality is unchanged; the name isn't. It also now runs
   on the **Node.js runtime**, where `middleware` was Edge-only.
2. Next's own auth guide is explicit: Proxy runs on _every_ route including
   prefetched ones, so it should only read the cookie (optimistic check) and
   never hit a database. It "should not be your only line of defense".

Calling `verifySessionCookie()` (an Admin SDK round-trip) in Proxy would fire on
every prefetch and still wouldn't protect server actions or route handlers, which
are reachable without ever passing through it.

Chosen split, which honours the spec's _intent_ — no unauthenticated request ever
reaches tenant data — while placing the check where it actually holds:

- **`src/proxy.ts`** — optimistic only: is a session cookie present? If not,
  redirect to `/login`. Cheap, no I/O, purely a UX redirect. Never trusted for
  authorisation.
- **`src/lib/auth/dal.ts`** — the real gate. `verifySession()` wraps
  `verifySessionCookie()` in React `cache()` so it runs once per render pass, and
  every server component, server action and route handler that touches tenant data
  calls it. Role guards (`requireRole(wsId, [...])`) build on it.

Firestore rules are the third, independent layer: even a bug in the DAL cannot
let workspace A read workspace B from the client.
