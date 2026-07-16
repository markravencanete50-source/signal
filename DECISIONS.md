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

## 010 — Firestore repositories live in `lib/db/`, not `services/`

**Date:** 2026-07-16 · **Phase:** 1 · **Status:** accepted

The spec defines `services/` as "pure functions, no UI/HTTP" and lists `lib/` as
infrastructure (firebase-admin, cloudinary, resend, claude, crypto, auth). That
leaves Firestore reads and writes without a stated home: they are I/O, so they
cannot go in `services/` without breaking the purity rule that keeps services
testable with no emulator.

Chosen: **`lib/db/<collection>.ts`** holds the repositories (all Admin SDK
access, all document↔domain-type mapping). `services/` stays pure and receives
plain data. Route handlers and server actions compose the two: repo reads →
service computes → repo writes.

This is what makes the intent-score, coherence and anomaly engines unit-testable
as pure functions later, and keeps every privileged Admin SDK call in one
auditable layer.

## 011 — Meta Graph API version is pinned

**Date:** 2026-07-16 · **Phase:** 1 · **Status:** accepted

`GRAPH_VERSION = "v21.0"` in `adapters/meta-client.ts`. Unversioned Graph calls
silently track the latest version, so Meta can change behaviour underneath a
working deploy. Meta deprecates versions on roughly a 2-year cycle, so this
needs a deliberate periodic bump — cheap and reviewable in one constant, versus
debugging a publish that changed shape overnight.

## 013 — AI orchestration lives in `lib/ai/`, not `services/`

**Date:** 2026-07-16 · **Phase:** 2 · **Status:** accepted

The spec lists `ai` (and `coherence`) under `services/`, which it also defines as
"pure functions, no UI/HTTP". Those two can't both hold: every AI feature calls
the Claude API, which is HTTP. Same tension as DECISIONS #010 resolved for
Firestore.

Chosen: **AI orchestration lives in `lib/ai/`** (infrastructure, beside
`lib/claude.ts`, `lib/cloudinary.ts`, `lib/resend.ts`). `services/` stays pure —
`besttime`, `coherence` scoring math, `anomaly`, intent scoring — so those engines
remain unit-testable with no network. A pure service may be _fed_ an AI result
computed in `lib/ai/`, but never calls Claude itself.

The build rule "every AI output that recommends something ships its reasoning" is
enforced at the `lib/ai/` boundary: each function returns a typed object with a
`reasoning` field, and the zod schema makes it non-optional.

## 012 — `invites` collection added to the data model

**Date:** 2026-07-16 · **Phase:** 1 · **Status:** accepted

The spec's data model has no `invites` collection, but Phase 1 requires "member
invites via Resend (magic link)". A magic link needs somewhere to store the
token, the invited email, the target role and an expiry.

Chosen: a top-level `invites/{id}` collection, **client-deny-all** in rules, same
as `connections`. The token is a bearer credential — anyone holding the link gets
the role — so it is treated like one:

- 32 crypto-random bytes (`generatePublicToken()`), not a guessable id
- single-use (`acceptedAt` pins it), 7-day expiry
- **the accepting account must own the invited email address**, so a forwarded or
  leaked link doesn't grant access on its own
- readable only via the Admin SDK, looked up by token

A client-readable version would let any member list live tokens and self-promote
to owner, which is exactly the escalation the members rule prevents.

## 014 — Intent-score normalisation curve and missing-signal handling

**Date:** 2026-07-16 · **Phase:** 3 · **Status:** accepted

The spec gives the intent formula (weights 0.30/0.30/0.25/0.15) and says rates
are "normalised against the brand's trailing-90-day averages", but leaves two
things to judgement.

**Normalisation curve.** Chosen: a signal at the brand's 90-day average maps to
0.5 for that component; 2× the average (or better) saturates it at 1.0; zero maps
to 0. So an exactly-average post scores **50**, and a post that doubles every
signal scores **100**. This makes the score a bounded [0,100] read on "how far
above/below this brand's own baseline", which is the point — it's self-relative,
not an absolute benchmark. (The preview's illustrative "avg 71" is mock data, not
a formula constraint; the exit criterion is only that scores are computed.)

**Missing signals.** Facebook reports no saves or watch-completion. Treating
those as zero would unfairly tank every FB post. Instead the weights are
**re-normalised over only the signals a platform actually reports**, so a score
stays comparable within a platform. A brand's first posts (no 90-day baseline
yet) normalise any non-zero signal to 1 rather than dividing by zero.

Both choices are isolated in the pure `services/intent.ts` and unit-tested, so
the curve can be retuned without touching the sync engine.

## 015 — `coherenceScores` cache collection (per brand per day)

**Date:** 2026-07-16 · **Phase:** 4 · **Status:** accepted

The spec says the coherence score is "cached per brand per day". The data model
has no collection for it, and it's a derived AI result, not tenant content.

Chosen: a `coherenceScores/{brandId}_{YYYY-MM-DD}` cache doc, written by the
coherence engine, read by Studio and the Dashboard. Deterministic id = at most
one Claude coherence call per brand per day regardless of how many times the
views render. Rules: member-read, server-write-only (same shape as the other
derived-analytics collections). A stale doc simply isn't read the next day; no
eviction needed.

## 016 — Reports store a point-in-time snapshot; digest cron runs daily

**Date:** 2026-07-16 · **Phase:** 5 · **Status:** accepted

A report is a captured moment, not a live query. On create/refresh it computes
per-brand aggregates from already-synced Firestore data and stores them on the
report doc (`snapshot`), plus a Claude-generated `narrative`. The public
`/r/{token}` page renders from that document alone — no Graph API call on view
(DECISIONS #005) and no public Firestore read (resolved by token via the Admin
SDK, DECISIONS #006). `refreshReport` overwrites the snapshot in place and is
idempotent, so a view, a manual refresh, and the cron all share one path.

The digest supports any weekday, so its cron was moved from Monday-only
(`0 8 * * 1`) to **daily at 08:00 UTC** (`0 8 * * *`); each report fires on its
own configured weekday, and `digest.lastSentAt` guards against a same-day
double-send. PDF export is the browser's own print-to-PDF over print CSS
(`print:hidden` chrome, `break-inside-avoid` sections) rather than a second
server render path.

## 017 — SmartLink public pages live at `/s/{slug}`, not root `/{slug}`

**Date:** 2026-07-17 · **Phase:** 5 · **Status:** accepted

The preview shows a link-in-bio at `signal.link/{slug}` (root). Serving it at the
literal root would either (a) require `proxy.ts` to redirect signed-out visitors
to /login — breaking a public page — or (b) exclude all root single-segment paths
from the proxy, which is fragile and mixes public and authed routes at the same
level.

Chosen: a dedicated public prefix `/s/{slug}`, excluded from the proxy matcher
alongside the other no-auth surfaces (`/r/`, `/approve/`). Same pattern, same
guarantees: resolved server-side by slug via the Admin SDK, collection
client-deny-all. Click-throughs go via `/api/click` (under the already-excluded
`/api/*`), which is the ONLY writer of click counters — a client-writable counter
could be inflated at will, so both `smartlinks` and `smartlinkClicks` deny all
client access. The redirect target is read from the stored link, never from a
query param, so the endpoint can't be coerced into an open redirect. Post
attribution rides a `?ref={postId}` param that `recordClick` validates against the
SmartLink's own workspace before crediting, so a forged ref can't write into
another tenant's attribution.

## 018 — Autolists auto-retire on real score; RSS queues drafts, evergreen publishes

**Date:** 2026-07-17 · **Phase:** 6 · **Status:** accepted

An autolist's promise is that it _won't_ blindly recycle. So an evergreen item
carries the id of the post it last produced; on the next cycle the engine reads
that post's real synced intent score and, if it's below the list's threshold,
retires the item (flagged for a Studio rework) rather than re-posting it. An item
with no score yet is never retired on a guess.

Evergreen items publish automatically (they're the brand's own approved content);
RSS entries are queued as **drafts**, not auto-published — third-party content
gets a human check, and Claude rewrites each entry per platform. Due autolists are
claimed under a transaction that advances `nextRunAt` before any post is created,
so overlapping cron ticks can't double-publish. Pure scheduling/selection lives in
`services/autolist.ts` and is unit-tested; the engine only does I/O.

## 019 — Competitor tracking is Instagram-only, via Business Discovery

**Date:** 2026-07-17 · **Phase:** 6 · **Status:** accepted

"Public data only" has a hard platform limit: Instagram exposes another business/
creator account's public numbers through Business Discovery (queried with our own
IG user id), but Facebook has no public equivalent for Pages we don't manage. So
`fetchPublicProfile` is real on the IG adapter, returns null on the FB adapter,
and is deterministic in the mock — and the competitor engine simply skips any
competitor whose platform isn't connected for that brand rather than inventing
numbers. Snapshots are stored per date (idempotent) in a `snapshots` subcollection;
the latest reading + 30-day growth are denormalised onto the parent so the table
renders in one read. The comparison insight is client-loaded so the table never
blocks on a Claude call, and both the table and the insight read the same
`buildCompetitorRows` so their numbers can't disagree.
