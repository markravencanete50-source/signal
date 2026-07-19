# Changelog

All notable changes to Signal. Conventional commits; newest first.

## [Unreleased]

### Added — Planner AI suggestion tab (content ideas + paraphrase)

- **A fourth Composer variant tab, "✦ AI suggestion"**, alongside Shared caption /
  FB variant / IG variant. The writer types what they want to post and gets **at
  least 3 distinct caption options at once** — each with the angle it's going for
  ("no bare suggestion") — plus a **Paraphrase** tool that rewrites a pasted line
  into 3+ variants, each with a note on what changed. "Use this" drops the chosen
  text into the shared caption.
- New `lib/ai/content-suggest.ts` (`suggestPlannerContent`, `paraphraseContent`)
  over the existing `generateStructured` choke point, tuned to the active
  platform (IG/FB) and the brand's voice/pillars. Two writers-only, Zod-validated
  routes — `/api/ai/content-suggest` and `/api/ai/paraphrase` — that degrade with
  a 503 when no AI key is set, matching the rest of the AI surface.
- `ai-suggestion-panel.tsx` carries its own loading (skeleton), empty and error
  (retry) states.

### Added — Verify-after-publish (catches the silent-vanish failure)

- **The publish half no mainstream tool does** (from `docs/competitor-research-2026-07.md`,
  the category's #1 reliability complaint): Meta *accepting* a publish isn't proof
  the post *appeared*. A few minutes after every successful publish, Signal now
  re-fetches the post from Meta by its id to confirm it genuinely exists.
- New `verifyPublished` adapter method (`GET /{id}?fields=id`, shared helper in
  `meta-client.ts`); mock always confirms so demo mode stays quiet. Only Meta
  *explicitly* reporting the object gone (404 / code 100 subcode 33) counts as
  missing — rate-limits/5xx/dead-token are `transient` and retried, so a blip
  never raises a false alarm.
- `services/publish-verify.ts` (pure, 4 unit tests): 3-minute post-publish delay,
  5m/15m transient backoff, give-up cap. `lib/publish-verify.ts` engine +
  `/api/cron/verify` (on the same every-5-min tick as publish): confirms present
  posts, **alerts admins when one is missing** (state `missing`), retries then
  marks `unverified` when it can't reach Meta. New `posts.verification` field +
  composite index; the Planner chip shows a red "not found" marker on a missing
  post. Complements the existing retry pipeline (which handles *failed*
  publishes; this handles *claimed-successful* ones).

### Added — Token health monitor (proactive expiry warnings)

- **The category's #1 unmet need** (per the competitor research in
  `docs/competitor-research-2026-07.md`): tokens die silently and users only find
  out when the queue fails. Signal now warns *before* that happens.
- **Ground-truth from Meta.** New `checkTokenHealth` adapter method calls Graph
  `/debug_token` (shared `checkTokenHealthViaDebug` in `meta-client.ts`) to read
  a token's real validity plus both expiry clocks — the access token (~60d,
  refreshable) and the data-access grant (~90d, which a refresh CANNOT extend,
  only a reconnect can). More accurate than the estimate stored at connect time.
- **Graduated, deduped warnings.** `services/token-health.ts` (pure, unit-tested)
  computes the effective deadline and fires one notification per band (14/7/3/1
  days). `lib/token-health.ts` monitor: marks a revoked/invalid token `expired`
  immediately, records Meta's real data-access deadline, and notifies workspace
  admins. Runs in `/api/cron/tokens` **after** the refresh pass, so a
  still-refreshable token is renewed before it would ever warn.
- **Surfaced everywhere it matters.** Dashboard banner (red for dead, amber for
  expiring) listing the at-risk accounts; Settings connection card shows the true
  effective deadline plus a "checked Nh ago" line; `PublicConnection.daysUntilExpiry`
  now reflects the soonest of the two clocks. +10 unit tests (98 total).

### Fixed — "Publish now" is now synchronous (posts no longer silently go nowhere)

- **Root cause of the vanished post:** "Publish now" only scheduled the post for
  the current instant and waited for the publish cron — whose real clock is a
  GitHub Actions `*/5` schedule with a 5-minute floor that GitHub throttles for
  long stretches (one observed gap: hours). The post sat `scheduled` forever.
  `submitPost` now claims the post via a new transactional `claimPostById` and
  runs `publishPost` inline: same idempotent engine, same lock discipline (a
  racing cron tick can never double-publish), but the user gets the real
  outcome immediately — including the actual Meta error on failure, with the
  retry pipeline as backstop. Per the competitor research (docs/), silent
  publish failures are the #1 complaint across every tool in this category.
- **Cron resilience:** the hourly GitHub schedule now also sweeps publish, so a
  *scheduled* post is never more than ~an hour late even when `*/5` stalls.

### Fixed — timezone correctness (UTC serverless clock vs the user's browser)

- Dashboard greeting/date, Today's queue times and "today" window, and the
  Planner's day bucketing + today-ring were all computed server-side in UTC —
  for a UTC+8 user that meant "18:24" for a 02:24 AM action, evening greetings
  at 2 AM, and posts appearing on the wrong calendar day. All user-clock maths
  now runs client-side (new `useHydrated` hook — `useSyncExternalStore`-based
  so the strict no-setState-in-effect lint stays satisfied); servers only fetch
  generously-buffered windows.

### Added — Planner views, click-to-edit everywhere, published-post editing

- **Month / Week / Day views** with URL state (`?view=&date=`), local-time
  grids, a Today button, and per-view navigation. Week shows chip times; Day is
  a time-ordered agenda (and the natural mobile layout). Legacy `?month=` URLs
  still resolve.
- **Click-to-edit actually works now**: the calendar already linked to
  `/planner/compose?edit=<id>` but the composer ignored the param and opened
  blank. The composer now loads the post (captions, media, pillar, schedule),
  routes saves through `updatePost`, and keeps every intent (draft / schedule /
  publish / approval). Dashboard queue rows link to edit too.
- **Published posts open in a live-post mode**: edit the Facebook caption in
  place (new optional `updateCaption` on the adapter interface — FB implements
  it via the Graph API, Instagram has no caption-edit endpoint so its adapter
  omits it and the UI says so), plus View-on-Facebook/Instagram permalinks.

### Changed — mobile + motion polish

- Calendar grids scroll horizontally on narrow screens instead of crushing;
  composer paddings tightened on mobile; queue rows/chips gained hover states.
- New shared keyframes (`modalIn`, `fadeSlideIn`): composer entrance, calendar
  view transitions, and a route-level fade-up via `(app)/template.tsx` — all
  `motion-safe:` so prefers-reduced-motion users see none of it.

### Docs — competitor research

- `docs/competitor-research-2026-07.md`: 9-agent sweep of Buffer, Hootsuite,
  Later, Metricool, SocialBee, Postiz, Mixpost + a general pain-point sweep,
  synthesized into a prioritized zero-API-cost roadmap for Signal.

### Added — Meta App Review prerequisites: legal pages, webhook endpoint, app icon

- **Public legal pages** `/privacy` and `/terms` — required by App Review and
  reachable signed-out (added to the `proxy.ts` matcher exclusions, alongside a
  shared `LegalDoc` shell). The privacy policy mirrors what the app actually does:
  encrypted connection tokens, aggregated metrics (raw payloads discarded), media
  via Cloudinary, and caption text sent to AI providers. Contact
  (markravencanete50@gmail.com), effective date (18 July 2026) and governing
  jurisdiction (the Philippines) are set; swap the contact to a domain address
  once Signal has one.
- **Meta webhook** `/api/webhooks/meta` — GET answers the `hub.challenge`
  verification handshake when `hub.verify_token` matches `META_WEBHOOK_VERIFY_TOKEN`
  (previously defined in `env.ts` but unused); POST verifies `X-Hub-Signature-256`
  (HMAC-SHA256 over the raw body, constant-time) before acknowledging. New
  `verifyHubSignature` helper in `lib/meta/` with unit tests. Events aren't routed
  yet — the sync engine polls comments — but the endpoint passes verification,
  which is what review checks. Verified end-to-end: challenge echo, wrong-token
  403, unsigned/forged POST 401, valid-HMAC POST 200.
- **App icon** — `public/brand/icon.svg` (full-bleed indigo gradient + the white
  line-chart mark from `components/ui/icons.tsx`, centred) rasterised to
  `public/brand/app-icon-{1024,512,180}.png` via `scripts/render-icon.mjs` (uses
  the bundled `sharp`). The 1024² is the size Meta App Review requires.
- README App Review checklist updated (privacy, terms, data-deletion and webhook
  items checked with their routes); `.env.example` documents the webhook URL.

### Fixed — slow feature switching + opaque Cloudinary upload error

- **Instant navigation.** Added `app/(app)/loading.tsx` — the App Router had no
  Suspense boundary, so every feature switch blocked on the destination page's
  server query before rendering. A neutral skeleton now shows immediately (shell
  persists); nested segments inherit it, so one file covers every view.
- **Clearer upload failures.** The media uploader now surfaces Cloudinary's actual
  error (e.g. "Invalid Signature") instead of a generic "rejected" message —
  making a credentials/config problem diagnosable rather than a mystery.

### Changed — Email (Resend) is now optional

- **Email degrades gracefully**, like AI and billing. `RESEND_API_KEY`/`EMAIL_FROM`
  are optional in `env.ts`; `sendEmail` skips delivery (with a `console.warn`) when
  they're unset instead of throwing, so invites/approvals/digests still complete
  and their links still generate — only the email goes unsent. This lets the app
  run fully before a verified sending domain exists (Resend's free tier can't send
  to real recipients without one). New `isEmailConfigured()` gate.

### Added — Free scheduler (GitHub Actions) + APP_URL resiliency

- **`.github/workflows/cron.yml`** — free replacement for the dropped Vercel crons
  (Hobby plan can't run them). Pings the six authenticated cron routes on schedule
  with `x-cron-secret`; `workflow_dispatch` triggers any route manually. Cadences
  match the original `vercel.json` except publish runs every 5 min (GitHub's cron
  floor). Needs a `CRON_SECRET` Actions secret and an optional `APP_URL` variable.
- **`APP_URL` now falls back** to `https://${VERCEL_PROJECT_PRODUCTION_URL}` (the
  stable production host) when unset, so links resolve instead of the env failing
  to parse. Explicit `APP_URL` still wins and must match the Meta OAuth redirect.

### Changed — LLM provider swap (Groq + OpenRouter, free-tier)

- **Replaced Anthropic Claude with Groq (primary) + OpenRouter (fallback)** to run
  AI at zero cost. `lib/claude.ts` → `lib/llm.ts`; both providers speak the OpenAI
  protocol, so one `openai` client drives both. Public surface
  (`generateStructured`, `isAiConfigured`, `AiUnavailableError`) is unchanged —
  the eight `lib/ai/*` builders only changed an import path. Added
  `createChatStream` (Ask Signal streaming) and `generateVisionStructured`
  (watermark guard). Every call runs through `withFallback`: when Groq hits its
  free-tier daily token cap, the request transparently retries on OpenRouter.
- `env.ts`: `ANTHROPIC_API_KEY` → optional `GROQ_API_KEY` + `OPENROUTER_API_KEY`
  (AI degrades gracefully with neither set, like Stripe). `.env.example` updated.
- Added `.npmrc` (`legacy-peer-deps=true`) for `openai@5`'s stale `zod` peer, and
  `react-is` as a direct dependency (recharts needs it but doesn't declare it).

### Phase 10 — Global search

**Added**

- **Global search** — the topbar box is live (it had been a disabled placeholder).
  Pure ranker (`services/search.ts`, unit-tested): prefix > word-start > substring,
  title weighted over subtitle over keywords. Server-only gatherer (`lib/search.ts`)
  fetches a bounded, workspace-scoped set of brands, posts, media and reports,
  normalises them to one shape and ranks in memory — no external search service
  (the stack is locked; an agency's dataset is small enough). `GET /api/search?q=`
  is session+workspace scoped, so results are always the caller's own tenant.
- Topbar `GlobalSearch` client component: debounced fetch (AbortController drops
  stale responses), grouped dropdown (Brands / Posts / Media / Reports), full
  keyboard nav (↑/↓/Enter/Esc). Selecting a brand-scoped result switches the
  active brand before navigating, so a hit in another brand lands you correctly.
  Added `listPostsForWorkspace` to the posts repo.

### Phase 9 — Notifications & audit UI

**Added**

- **Notifications bell**: the topbar bell is now a real dropdown (server-rendered
  list, bounded at 50) with an unread dot, per-item link navigation, and
  mark-read / mark-all-read via session-scoped server actions. Unread is derived
  in-memory (`readAt` absent) — deliberately not a `where readAt == null` query,
  since Firestore's `== null` misses docs where the field was never written.
  Repo gains `markNotificationRead` (ownership-checked) and `markAllNotificationsRead`.
- **Audit log**: append-only `auditLogs` writer (`lib/db/audit.ts`, server-only)
  wired into the security/billing-relevant mutations — brand create/delete, member
  invite / role-change / remove, connection connect (OAuth) and revoke (Meta
  deauthorize), and plan changes (Stripe webhook, logged only on a real
  transition). Admin-only viewer at **Settings → Audit log** (the tab is hidden
  from non-admins and the page re-checks `requireRole(ADMIN_ROLES)`), listing
  actor / action / target / time. Composite index + rules read-coverage added.

### Phase 8 — Stripe billing

**Added**

- **Plans + gating** (`services/plans.ts`, pure, unit-tested): Free (1 brand, 3
  seats) and Pro (unlimited), with the limits in one place so a tier is a one-line
  change. Enforced server-side in the brand-create and invite actions — a Free
  workspace is blocked from a 2nd brand or a 4th seat with an upgrade prompt.
- **Stripe integration** (`lib/stripe.ts` — the only file importing the SDK,
  lazy + config-gated like `lib/claude`; `lib/billing.ts` the business layer).
  Subscription Checkout and the customer Portal via admin-only server actions
  (card details entered on Stripe, never in-app). Signature-verified
  `/api/webhooks/stripe` syncs `checkout.session.completed` and subscription
  lifecycle events to the workspace's plan/status via the Admin SDK — idempotent.
- **Billing settings** (Settings → Billing): current plan, usage vs limits, and
  Upgrade / Manage buttons; degrades to an "unconfigured" state when the Stripe
  keys are unset (billing is optional, mirroring how AI degrades without a key).
- Workspace gains billing fields (`stripeCustomerId`, `stripeSubscriptionId`,
  `subscriptionStatus`, `currentPeriodEnd`). **Security:** the workspace update
  rule now locks every billing field — a client-side update may touch only `name`
  and `settings`, so an admin can't self-upgrade to Pro or forge a subscription
  status; all billing writes go through the webhook (Admin SDK). Verified by rules
  tests (53 total).

### Phase 7 — Production hardening

**Added**

- **Meta token-refresh cron** (`lib/token-refresh.ts`, `/api/cron/tokens` — daily;
  the route the vercel.json entry pointed at was missing and 404'd). Refreshes
  long-lived tokens within 7 days of expiry via the adapter, re-encrypts and
  stores them, and — on a genuine failure (auth error or already expired) — marks
  the connection `expired` and notifies the workspace admins to reconnect. A
  transient failure is left active to retry. Idempotent; integration-tested.
- **Meta App Review compliance callbacks**: `/api/meta/deauthorize` and
  `/api/meta/data-deletion`, both public and authenticated solely by verifying
  Meta's `signed_request` HMAC-SHA256 signature (`lib/meta/signed-request.ts`,
  constant-time compare, unit-tested). Deauthorize revokes the user's
  connections; data-deletion removes them, logs the request under a confirmation
  code, and returns the required `{ url, confirmation_code }` pointing at a public
  status page (`/data-deletion/[code]`). OAuth now records the authorising Meta
  user id on the connection so these callbacks can target the right rows.

**Verified**

- Ran the emulator suites (Java now available): **49 rules tests** — confirming
  the Phase 5/6 reports/smartlinks deny-all security fix holds — and **6
  integration tests** including the new token-refresh end-to-end. Made
  `test:integration` run sequentially (`--no-file-parallelism`) so the three
  suites don't overload a single shared emulator.

### Phase 6 — Inbox, Autolists, Competitors

**Added**

- **Inbox**: unified comments + mentions across FB + IG, sentiment-sorted, with
  filter chips (All / Leads / Needs care). AI-drafted replies grounded in the
  brand's own recent captions (`lib/ai/reply.ts`, `/api/ai/reply`), each shipping
  its one-line reasoning. Replies post back through the adapter using the brand's
  decrypted connection token (the only Graph touchpoint); assign / archive status
  actions. Sidebar Inbox badge now live (open count for the active brand).
- **Autolists**: evergreen queues + RSS-to-social (`lib/db/autolists.ts`,
  `lib/autolist-engine.ts`, `/api/cron/autolists`, hourly). Evergreen cycles a
  queue on a day cadence and **auto-retires** any item that scored below its
  intent threshold last cycle — flagging it for a Studio rework instead of blindly
  re-posting. RSS pulls new entries, rewrites each per platform with Claude, and
  queues them as drafts. Claim-under-transaction lock makes the run idempotent;
  pure scheduling/selection logic is unit-tested (`services/autolist.ts`).
- **Competitors**: tracked profiles with daily public-data snapshots
  (`lib/db/competitors.ts`, `lib/competitor-engine.ts`, `/api/cron/competitors`).
  New adapter method `fetchPublicProfile` — IG via Business Discovery, mock
  deterministic, FB unsupported (returns null). Comparison table (you vs tracked:
  followers, 30d growth, posts/wk, engagement) with a grounded AI insight loaded
  client-side (`lib/ai/competitor-insight.ts`, `/api/ai/competitor-insight`).

**Security fix**

- Removed duplicate `reports` / `smartlinks` Firestore rule blocks that granted
  member read + write. Firestore ORs duplicate `match` statements, so those
  silently overrode the Phase 5 deny-all — any workspace member could read every
  report/SmartLink public token and inflate click counters. Both are now deny-all
  (Admin-SDK only), as intended; rules tests cover it.

### Phase 5 — Approvals, Reports, SmartLink

**Added**

- **Approvals**: one-click client sign-off with no login. The composer's "Request
  approval" mints a single-use 32-byte token and emails the workspace's client(s)
  (`emails/approval-request.tsx`); the public `/approve/[token]` page confirms the
  decision (two-step, so email-scanner prefetches can't auto-approve). Decisions
  move the post (approve → scheduled/draft, changes → draft), clear the token, and
  notify the workspace. Team-side Approvals view with "Send reminder" and "Mark
  approved on behalf" (`lib/db/approvals.ts`); live sidebar count.
- **Reports**: builder (period + brands) that snapshots STORED metrics
  (`lib/reports/snapshot.ts`) and has Claude narrate them
  (`lib/ai/narrative.ts`) — grounded, and every recommendation ships its reason.
  White-label public `/r/[token]` page rendered from the stored snapshot (no auth,
  no live Graph call), with "Save as PDF" via print CSS. Reports carry a
  post-attributed SmartLink section (populated once Task #22 lands).
- **Weekly digest**: per-report schedule (weekday + recipient) and a daily
  `/api/cron/digest` that re-snapshots, regenerates the narrative, and emails it
  (`emails/digest.tsx`). Idempotent — a report already sent today is skipped.
- Firestore `reports` collection is client-deny-all (public token, Admin-SDK
  only); composite indexes for the reports list, digest-due query, and the
  recently-decided approvals query.
- **SmartLink**: per-brand link-in-bio (`lib/db/smartlinks.ts`). Team editor with
  live phone preview, drag-to-reorder links, featured (accent) button, and per-link
  click counts. Public `/s/{slug}` page (no auth, Admin-SDK by slug). Click
  redirect `/api/click` increments counters server-side and 302s to the STORED
  destination (never a query param — no open redirect). A `?ref={postId}` on a
  visit attributes the click to that post (validated against the SmartLink's
  workspace), and those aggregates feed the report's "SmartLink clicks by post"
  section. `smartlinks` + `smartlinkClicks` are client-deny-all.

### Phase 4 — Studio, Ask Signal, Best Time

**Added**

- **Grounding layer** (`lib/ai/brand-context.ts`): assembles a compact data pack
  from the brand's real synced metrics and renders it into prompts, emitting ONLY
  numbers that are actually present. This is what makes "never invent numbers"
  enforceable — a metric the brand lacks never reaches the model.
- **`/api/ai/suggest`**: 3 scored next-post suggestions, each with a full
  signal→why→action reasoning chain grounded in the data pack; includes
  retire/convert recommendations for underperforming series.
- **`/api/ai/ask`** (Ask Signal): streaming grounded Q&A. Answers reach / next-post
  / comparison questions from the brand's data and declines out-of-data questions
  rather than inventing.
- **Coherence engine** (`lib/ai/coherence.ts`): Claude scores the last 12 captions
  0–100 for niche clarity, cached per brand per day (`coherenceScores` collection).
- **Studio view**: coherence ring, pillar-balance bar (actual vs target),
  client-loaded suggestion cards with reasoning chains + "Draft it", and "Generate
  this week's plan" (5 best-time drafts).
- **Ask Signal**: floating chat panel matching the preview, token-streamed
  responses, suggested question chips, mounted app-wide.
- **Best-time chips** wired into the Composer (from the pure `besttime` engine over
  the brand's own metrics, labelled personalised vs generic); "Draft it" prefills
  the Composer via `?caption=`.
- Pure `services/pillars.ts` with unit tests.

**Verification**

- 27 unit + 35 rules tests pass. A grounding unit test proves the data pack omits
  absent metrics (the mechanism behind "cites actual numbers"); typecheck / lint /
  format / build green. Live-AI exit checks (grounded suggestions, Ask Signal
  answer/decline) require an Anthropic key.

**Changed**

- Added `coherenceScores` collection + rules (DECISIONS #015).

### Phase 3 — Analytics, Intent, Pulse

**Added**

- **Sync engine** (`/api/cron/sync`, hourly): per active connection, pulls
  account insights → `metricsDaily` and re-fetches metrics for posts <14 days old
  → `postMetrics` with a computed intent score; ingests new comments → `inboxItems`
  with batched Claude sentiment classification (positive/neutral/negative/**lead**).
  Then per workspace runs cross-brand anomaly detection and notifies. Idempotent
  via deterministic doc ids.
- **Intent scoring** (pure `services/intent.ts`): the spec's weighted formula,
  normalised so an exactly-average post scores 50 and a 2×-baseline post 100, with
  weights re-normalised over the signals a platform actually reports (so Facebook
  posts aren't tanked for lacking saves/watch-time). Weights are per-workspace.
- **Anomaly detection** (pure `services/anomaly.ts`): a >40% reach drop (7-day avg
  vs prior 7) flagged `platform_side` when ≥2 brands drop at once, else
  `content_side` — the "is it you, or is it the algorithm?" verdict, with a
  human-readable reasoning string.
- **Analytics view**: theme-aware recharts reach/engagement chart (colours are CSS
  variables, so they flip with the theme), intent-by-format bars, follower split,
  and a score-ringed post table, with 7/30/90-day ranges.
- **Dashboard**: real metric cards + SVG sparklines, today's queue, top posts, and
  a fresh-anomaly banner.
- **Pulse**: per-platform status cards, the anomaly log timeline with verdicts +
  reasoning, native-format-guard stats, and the admin-editable platform-changes
  feed (`platformChanges` collection).
- Metrics/anomalies/inbox/platform-changes repositories; `lib/ai/sentiment.ts`;
  `services/analytics.ts` (pure shaping) with unit tests.

**Verification**

- 24 unit + 35 rules + 4 integration tests pass. The Phase 3 exit criterion — a
  simulated cross-brand reach drop producing a `platform_side` anomaly — is proven
  by a sync integration test.

**Changed**

- Added `platformChanges` collection + rules (admin-editable, member-readable) and
  four query indexes (inbox by receivedAt, platform-changes, metricsDaily desc).
  Intent-score normalisation choices recorded in DECISIONS #014.

### Phase 2 — Composer, Planner, Publishing, Media

**Added**

- **Publish engine** (`/api/cron/publish`, every minute): claims due posts with a
  per-post Firestore transaction lock (`scheduled → publishing`), publishes each
  enabled variant via the adapter, records permalink + external id. Retry backoff
  5m/15m then `failed`, with an in-app notification and a Resend failure email to
  brand admins. Idempotent — proven by an integration test that publishes a post
  end-to-end against the mock adapter and confirms the lock blocks a re-claim.
- **Composer** (`/planner/compose`): platform toggles, shared/FB/IG caption
  variants, live per-platform char limits, media picker, AI hashtag chips
  (`/api/ai/caption`), predicted intent-score ring (`/api/ai/score`), and four
  submit actions (draft / request approval / schedule / publish now). Media is
  re-validated server-side against each platform's specs.
- **Planner**: month calendar of real posts, status-coloured chips, platform
  filter, month navigation, and HTML5 drag-to-reschedule (authorised + refuses to
  move published posts).
- **Media library**: signed Cloudinary uploads (image + video) straight from the
  browser, tag filters, usage badges, and the **native-format guard** — video
  frames are checked for TikTok/CapCut watermarks (Claude vision) and a cropped
  re-export is recorded so publishing uses the clean version.
- **AI** (`lib/ai/`): caption + score, each returning reasoning (never a bare
  number); `lib/claude.ts` as the single Anthropic choke point; graceful 503
  degradation when `ANTHROPIC_API_KEY` is unset.
- Pure services (`besttime`, `publish-policy`) with unit tests needing no
  emulator; posts/media/notifications repositories; `lib/cloudinary.ts` (signed
  uploads + per-platform transforms); cron-secret auth; intent ring UI.

**Fixed**

- `claimDuePosts` returned the pre-increment `attempts`, so the publish engine
  would have computed retry timing against a stale count. Caught by the
  integration test.
- `firebase-admin` now initialises without a service-account key when
  `FIRESTORE_EMULATOR_HOST` is set, so emulator dev and the integration tests run
  without real credentials.

**Changed**

- AI orchestration lives in `lib/ai/` rather than `services/` (DECISIONS #013),
  keeping services pure. Added `posts(brandId, scheduledAt)` index for the
  Planner range query.

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
