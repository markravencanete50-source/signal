<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Breaking changes already hit, so you don't rediscover them:

- **`middleware.ts` is now `proxy.ts`** (root or `src/`, beside `app/`), and it
  runs on the **Node.js** runtime, not Edge.
- Tailwind is **v4**: there is no `tailwind.config.js`. Theme config is CSS-first
  in `src/app/globals.css` via `@theme`.

# Signal — working rules

## Design

`signal-preview-v2.html` in the repo root is the **design source of truth**. If
code and preview disagree visually, the preview wins.

- **Never write a raw hex value in a component.** Colours come from semantic
  tokens only: `bg-surface`, `text-text-2`, `border-border`, `bg-accent-soft`…
  All tokens live in `src/styles/tokens.css`; that is the only file with hexes.
- **Don't add `dark:` variants for colour.** Tokens already flip via `.dark`
  (`@theme inline` → `var(--token)`). `dark:` is for non-colour tweaks only.
- Root font size is **15px** (matches the preview). Tailwind's scale is rem-based,
  so it rescales with it. For fixed chrome the preview specifies in px (a 36px
  icon button), use arbitrary values (`size-[36px]`) rather than drifting to the
  nearest rem step.
- Every data view needs loading (skeleton), empty (EmptyState + CTA) and error
  (retry) states. Keep focus visible. Respect `prefers-reduced-motion`.
- Theme is `next-themes` only. **No localStorage for app state.**

## Architecture

- **Adapters** (`src/adapters/`) are the only files that may import a platform
  SDK or call the Graph API.
- **Services** (`src/services/`) are pure functions over domain data — no HTTP,
  no UI. ESLint enforces no `fetch` here.
- No `any` in `services/`, `adapters/` or `lib/`. Zod-validate every API route input.
- Every engine must be **idempotent and safe to re-run**.
- Store aggregates; discard raw API payloads after processing.
- **Every AI output that recommends something must ship its reasoning.** Never a
  bare score, never a bare suggestion.

## Security

- **The Admin SDK bypasses Firestore rules entirely.** Any handler using
  `adminDb()` must authorise the caller itself first — rules will not save you.
- `connections/*` is client-deny-all. Meta tokens never reach a browser.
- `proxy.ts` is an optimistic UX redirect, **never** an authorisation boundary.
  Real checks go in the DAL, next to the data.
- Never commit `.env.local` or a service-account key. (`.gitignore` has a
  `!.env.example` negation — don't remove it, or the env contract stops shipping.)

## Verifying in the preview browser

The preview pane runs **hidden** (`document.visibilityState === "hidden"`), so
the browser throttles `requestAnimationFrame` — it never fires.

**Consequence: CSS transitions never advance.** Any transitioned property stays
frozen at its start value, so `getComputedStyle()` reports the _old_ value
indefinitely and it looks like a broken cascade. `body` has a 250ms
background/colour transition, so it is the usual victim.

When checking a themed value:

- Read a token (`getComputedStyle(el).getPropertyValue('--bg')`) or an
  untransitioned property — those update instantly.
- Or hard-reload in the target theme instead of toggling live.
- Don't "fix" a frozen transition. Confirm first with
  `document.visibilityState` / a `requestAnimationFrame` probe.

Screenshots frequently time out for the same reason (the renderer isn't
painting). Prefer `read_page` and computed-style probes as evidence.

## Process

- Conventional commits; feature branches; keep `CHANGELOG.md` current.
- Ambiguity → choose what keeps a future platform adapter or Stripe billing
  drop-in trivial, record it in `DECISIONS.md`, and continue.
- Before finishing: `npm run typecheck && npm run lint && npm run format:check`,
  and `npm run test:rules` if rules changed.
