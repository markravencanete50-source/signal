# Signal

Multi-tenant social media management for agencies. Facebook and Instagram first,
architected so every future platform is a drop-in adapter.

The thing that makes it Signal rather than another scheduler: **no recommendation
without its reasoning**. Every AI output shows the signal it read, why that
matters, and what to do — and Pulse tells you whether a reach drop is your
content or the platform.

**`signal-preview-v2.html` in the repo root is the design source of truth.** If
code and preview disagree visually, the preview wins.

---

## Stack

| Concern     | Choice                                                       |
| ----------- | ------------------------------------------------------------ |
| Framework   | Next.js 16 (App Router, TypeScript strict)                   |
| Auth + data | Firebase Auth + Firestore                                    |
| Styling     | Tailwind v4, CSS-variable token system, `next-themes`        |
| Charts      | recharts (colours read from CSS vars, so they flip on theme) |
| Media       | Cloudinary (signed uploads, per-platform transforms)         |
| Email       | Resend + React Email                                         |
| AI          | Anthropic Claude — server-side only                          |
| Social      | Meta Graph API (FB Pages + IG Business)                      |
| Hosting     | Vercel + Vercel Cron                                         |

Two deliberate deviations from the original build spec (Next 16 over 15,
Tailwind v4 over v3) are recorded with reasoning in [`DECISIONS.md`](./DECISIONS.md).

---

## Setup

### 1. Prerequisites

- Node 22+
- A JDK (the Firestore emulator is a Java process) — `winget install EclipseAdoptium.Temurin.21.JDK`

### 2. Install and configure

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Every variable is documented in `.env.example`. Two need generating:

```bash
openssl rand -hex 32   # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32   # CRON_SECRET
```

> **`TOKEN_ENCRYPTION_KEY` must be 32 bytes of hex (64 characters).** Rotating it
> invalidates every stored Meta token and forces all brands to reconnect.

### 3. Run

```bash
npm run dev          # http://localhost:3005
npm run emulators    # Firebase Auth + Firestore emulators
npm run test:rules   # Firestore rules tests (boots the emulator itself)
npm run typecheck
npm run lint
npm run format
```

Set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` in `.env.local` to point the client
SDK at the local emulators.

### 4. Demo without Meta

`USE_MOCK_ADAPTERS=true` (the default) swaps the Graph API for a MockAdapter that
returns realistic data with realistic latency. Every engine — publish, sync,
anomaly detection, AI — runs identically against it, so the whole product is
demoable before App Review clears.

---

## Vercel

Set every variable from `.env.example` in **Project → Settings → Environment
Variables**, scoped to **all** environments.

> Scoping a variable to Production only will crash Preview builds. `lib/env.ts`
> validates lazily to soften this, but the client Firebase config genuinely needs
> to exist in Preview for auth to work there.

### Cron requires the Pro plan

`vercel.json` declares four cron jobs, one of them every minute:

| Route               | Schedule    | Job                                           |
| ------------------- | ----------- | --------------------------------------------- |
| `/api/cron/publish` | `* * * * *` | Publish due posts, retry failures             |
| `/api/cron/sync`    | `0 * * * *` | Pull insights, score intent, detect anomalies |
| `/api/cron/tokens`  | `0 3 * * *` | Refresh tokens expiring within 10 days        |
| `/api/cron/digest`  | `0 8 * * 1` | Weekly client digest email                    |

**Vercel Hobby allows only 2 cron jobs at once-per-day each**, so this needs
**Vercel Pro**. Publishing correctness does not depend on the cadence — the
handler is idempotent and transaction-locked, so a slower clock costs scheduling
precision, not integrity. Alternative: point any external scheduler at the same
routes with the `x-cron-secret` header. See `DECISIONS.md` #007.

---

## Security model

Three independent layers. A bug in one does not breach the system.

1. **`src/proxy.ts`** — optimistic redirect only (is a session cookie present?).
   Never trusted for authorisation. Next 16 renamed `middleware.ts` → `proxy.ts`.
2. **`src/lib/auth`** — the real gate. `verifySession()` verifies the Firebase
   session cookie via the Admin SDK, memoised per render with React `cache()`.
   Every server component, action and route handler touching tenant data calls it.
3. **`firestore.rules`** — enforces tenant isolation independently of app code.

Non-negotiables, all covered by tests in `tests/rules/`:

- **`connections/*` denies all client access** — no exceptions, not even for an
  owner. It holds AES-256-GCM encrypted Meta tokens. The Admin SDK bypasses rules,
  so every legitimate access is unaffected. Tokens never reach a browser.
- Every read/write is validated against `workspaces/{wsId}/members/{uid}`.
- The `client` role is read-only, except approve/reject on a post awaiting them —
  constrained so it cannot smuggle a caption edit through an approval.
- Cron routes require `x-cron-secret`; the Meta webhook verifies `X-Hub-Signature-256`.
- Cloudinary uploads are signed server-side, foldered by `workspaceId`.
- Public report/approval tokens are 32 crypto-random bytes and revocable.
- `auditLogs` are append-only and server-written; a tamperable audit log is worse
  than none.

> The Admin SDK ignores security rules entirely. Any handler using it must
> authorise the caller itself first.

---

## Data model

Flat top-level collections, workspace-scoped **by field** (`workspaceId`) rather
than by path — so authorisation is a field check against the caller's membership
doc, not a path prefix.

Composite indexes live in `firestore.indexes.json`. It carries no comments
because the Firebase CLI validates it strictly on deploy (`DECISIONS.md` #008), so
the rationale is here:

| Collection      | Index                            | Serves                                     |
| --------------- | -------------------------------- | ------------------------------------------ |
| `posts`         | `brandId, status, scheduledAt`   | Planner calendar; a brand's due posts      |
| `posts`         | `status, scheduledAt`            | Publish cron — all due posts, oldest first |
| `posts`         | `workspaceId, status`            | Approvals queue, failed-post banner        |
| `inboxItems`    | `brandId, status, receivedAt`    | Inbox, newest first                        |
| `inboxItems`    | `brandId, sentiment, receivedAt` | Leads / Needs-care filters                 |
| `postMetrics`   | `brandId, syncedAt`              | Sync engine, analytics                     |
| `postMetrics`   | `brandId, platform, intentScore` | Top posts, best-time bucketing             |
| `mediaAssets`   | `workspaceId, createdAt`         | Media library grid                         |
| `mediaAssets`   | `workspaceId, tags[], createdAt` | Tag filters                                |
| `metricsDaily`  | `brandId, platform, date`        | Analytics time series                      |
| `connections`   | `status, tokenExpiresAt`         | Token refresh cron                         |
| `autolists`     | `enabled, nextRunAt`             | Autolist scheduler                         |
| `anomalies`     | `workspaceId, detectedAt`        | Pulse anomaly log                          |
| `notifications` | `userId, createdAt`              | Notification bell                          |

Deploy rules and indexes:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

---

## Design system

Tokens live in `src/styles/tokens.css` and are the only place a hex value may
appear. Components consume **semantic tokens only** via Tailwind utilities
(`bg-surface`, `text-text-2`, `border-border`).

`globals.css` maps them through `@theme inline`, which emits utilities that
reference `var(--token)` at runtime. That indirection is what lets one `.dark`
class on `<html>` repaint the entire app — so **colour needs no `dark:` variants
anywhere**. Reserve `dark:` for non-colour tweaks.

- Fonts: Space Grotesk (headings, metric numbers) + Inter (UI/body), via `next/font`.
- Root font size is **15px**, matching the preview. Tailwind's scale is rem-based,
  so this rescales the system to the design. It is not a bug (`DECISIONS.md` #004).
- Theme: `next-themes`, class strategy, system preference respected and persisted.
  This is the only sanctioned use of localStorage — no app state there.
- Every data view ships loading (skeleton), empty (EmptyState + CTA) and error
  (retry) states. Focus must stay visible. `prefers-reduced-motion` is respected.

---

## Architecture rules

1. **Preview is design truth.** If code and preview disagree, the preview wins.
2. **Adapters are the only files that may touch the Graph API.** Services never
   touch HTTP or UI — they're pure functions over data.
3. **Every AI output that recommends something ships its reasoning.** Never a bare
   score, never a bare suggestion.
4. Store aggregates; discard raw API payloads after processing.
5. All engines are idempotent and safe to re-run.
6. No `any` in `services/` or `adapters/`. Zod-validate every API route input.
7. Conventional commits, feature branches, running `CHANGELOG.md`.
8. Ambiguity → pick the option that keeps a future adapter or Stripe drop-in
   trivial, record it in `DECISIONS.md`, keep moving.

---

## Meta App Review checklist

Publishing to real Pages/IG accounts needs App Review. Until it clears, run with
`USE_MOCK_ADAPTERS=true` — everything is demoable.

**Before you submit**

- [ ] **Business verification** completed (Meta Business Manager). Slowest step —
      start it first; it can take days and needs company documents.
- [ ] App type is **Business**, linked to a verified Business account.
- [ ] Privacy policy URL — publicly reachable, describes what Signal stores
      (aggregated metrics, captions, media) and for how long.
- [ ] Terms of service URL.
- [ ] **Data deletion callback** URL (or instructions URL) — required. Meta calls
      it when a user requests deletion.
- [ ] App icon (1024×1024) and category set.

**Permissions to request** — justify each in terms of the user-facing feature:

| Scope                       | Justification                               |
| --------------------------- | ------------------------------------------- |
| `pages_show_list`           | Let the user pick which Page to connect     |
| `pages_read_engagement`     | Page insights for Analytics                 |
| `pages_manage_posts`        | Publish and schedule to the Page            |
| `instagram_basic`           | Resolve the IG Business account             |
| `instagram_content_publish` | Publish posts and Reels                     |
| `instagram_manage_insights` | Reach, saves, watch time for intent scoring |
| `instagram_manage_comments` | Unified Inbox: read and reply               |

**Screencast** — the most common rejection cause. It must show, in one take, a
real login through Facebook Login for Business, granting each requested scope,
then the feature that scope enables actually working (e.g. publish a post → show
it live on the Page). Narrate which permission each step exercises.

**Technical prerequisites**

- [ ] Instagram account is **Business** (not Creator/personal) and linked to the FB Page.
- [ ] Valid OAuth redirect URI whitelisted for every environment (including Preview).
- [ ] Short-lived → long-lived token exchange happens immediately on connect (60-day token).
- [ ] Webhook endpoint verifies `X-Hub-Signature-256` and answers the GET challenge.
- [ ] Test with **Test Users** or real tester-role accounts before submitting.

**Known IG publishing constraints**

- Publishing is two-step: create a media container from a **public** URL (hence
  Cloudinary), poll `status_code` until `FINISHED`, then publish. It is not one call.
- Rate limit: 25 API-published posts per IG account per 24 hours.
- The container URL must be publicly fetchable by Meta — signed/expiring URLs fail.
