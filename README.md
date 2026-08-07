# AthleteOS

**The intelligence that grows with you.**

AthleteOS is a Performance Operating System MVP. Authenticated athletes run typing-first discovery conversations with durable Postgres-backed memory, then review an evidence-backed reflection: observations, evidence, a working pattern, and a shared priority.

## What Phase 2 proves

1. **Clerk auth** for identity (sign-up / sign-in / sign-out). AthleteOS permissions live in Postgres, not Clerk Organizations.
2. **Athlete workspace** onboarding with `WorkspaceMembership` (`athlete` role; `coach` reserved).
3. **Neon Postgres + Drizzle** as system of record for conversations, messages, memory, reflections, patterns, and priorities.
4. Adaptive `/api/chat` (and reopen), `/api/memory`, `/api/insights` — workspace-scoped when `workspaceId` is present; anonymous demo still works at `/demo`.
5. Locked reflection screens (copy unchanged).
6. Split start-over: **new discovery conversation** vs **reset athlete workspace**.
7. One-time **legacy localStorage import** into the authenticated workspace.

## Tech stack

- Next.js App Router (v16) + React 19 + TypeScript
- Clerk (auth identity)
- Neon Postgres + Drizzle ORM / Drizzle Kit (SQL migrations)
- OpenAI Responses API + Zod

## Local setup

```bash
npm install
cp .env.example .env.local
# Fill Clerk + Neon + optional OpenAI keys in .env.local
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Path | Purpose |
|------|---------|
| `/` | Marketing + sign-in |
| `/sign-in`, `/sign-up` | Clerk |
| `/app` | Ensures Person + redirects to workspace or onboarding |
| `/app/onboarding` | Create athlete workspace |
| `/app/w/[workspaceId]` | Authenticated AthleteOS experience |
| `/demo` | Anonymous localStorage demo (no account) |

## Environment variables

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app

DATABASE_URL=           # pooled Neon URL (runtime)
DATABASE_URL_UNPOOLED=  # direct URL (migrations)
```

Configure Clerk redirect URLs for `http://localhost:3000` and your Vercel preview/production domains.

## Database migrations

```bash
npm run db:generate   # after schema changes
npm run db:migrate    # apply SQL under drizzle/
npm run db:studio     # optional Drizzle Studio
```

**Never** run `drizzle-kit push` against production. Use generated SQL migrations only.

## Authorization model

Every protected operation:

1. Clerk `auth()` → resolve/create `Person` by `clerkUserId`
2. Verify active `WorkspaceMembership` for the workspace
3. Perform repository/service work

Cross-workspace access returns `403` / `FORBIDDEN_WORKSPACE`. Client-supplied person IDs and roles are never trusted.

## API surface (Phase 2)

| Route | Notes |
|-------|--------|
| `POST/GET /api/workspaces` | Create / list athlete workspaces |
| `POST /api/workspaces/:id/reset` | Archive performance data (keeps account) |
| `POST /api/conversations` | Start conversation + opening message |
| `GET /api/conversations/:id?workspaceId=` | Load messages + memory + report |
| `POST /api/conversations/:id/continue` | Reopen continuation |
| `POST /api/chat` | With `workspaceId`: persist + context builders; without: anonymous demo |
| `POST /api/memory` | Workspace: load/merge/persist memory items |
| `POST /api/insights` | Workspace: persist reflection/pattern/priority transactionally |
| `POST /api/legacy-import` | Idempotent import of `athletesos:v1` payload |

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test                 # insights + hardening + memory + authz + coach + pwa
npm run test:pwa
npm run test:authz
npm run db:generate
npm run db:migrate
```

## Deploy (Vercel + Neon + Clerk)

1. Create a Neon project; copy pooled + unpooled connection strings.
2. Create a Clerk application; add production/preview redirect URLs.
3. In Vercel, set all env vars above for Production (and Preview).
4. Run migrations against Neon (`DATABASE_URL_UNPOOLED`) before or as a release step: `npm run db:migrate`.
5. Deploy. Without `OPENAI_API_KEY`, AI routes use demo mode; without Clerk/DB, use `/demo` only.

## Product loop

Welcome → discovery → **Share what you’ve noticed** → four reflection screens → completion → **Continue our conversation** or **New conversation** / **Reset athlete workspace**.

Anonymous `/demo` still uses `localStorage` key `athletesos:v1`. Authenticated workspaces use Neon as SoR; localStorage is only for one-time legacy import.

## Phase 3: Coach pilot

Athlete invites one coach via a copyable invite URL. Coach accepts (email must match), completes concise onboarding, adds shared/private observations, reviews patterns, and co-approves a shared priority.

### Invitation setup

1. Athlete opens Team panel on `/app/w/[workspaceId]`.
2. Enter coach email → **Invite coach**.
3. Copy the one-time invite URL (`/invite/[token]`) and share securely.
4. Coach signs in with the **same email**, opens the link, accepts.
5. Coach is redirected to onboarding, then `/app/coach/w/[workspaceId]`.

Tokens are stored as SHA-256 hashes, expire in 7 days, and can be revoked. Acceptance is idempotent. Removing a coach revokes membership immediately.

### Visibility

| Level | Athlete | Coach |
|-------|---------|-------|
| `athlete_private` | yes | no |
| `coach_private` | no | author only |
| `workspace` | yes | yes |

Private coach notes never appear in athlete-visible observation lists or athlete AI contexts.

### Shared priority activation

Both athlete and coach must **approve**. AI never auto-activates. Historical priorities are preserved via `replaced` / `archived`.

### Migrations

```bash
npm run db:migrate   # applies 0000 + 0001_coach_pilot
```

### Rollback

Reverse `0001_coach_pilot.sql` only on a staging clone first (enum/table drops). Prefer feature-flagging coach routes over destructive rollback in production.

Still out of scope: multi-coach teams, other roles, email vendor (optional Resend later), coach messaging/calendars.

## Progressive Web App (Phase 1)

AthleteOS is installable as a lightweight PWA for the athlete–coach pilot. Product behavior is unchanged; this layer adds installability, an honest offline fallback, and safe update prompts.

### Architecture

| Piece | Location | Role |
|-------|----------|------|
| Web app manifest | [`app/manifest.ts`](app/manifest.ts) | `standalone`, icons, `start_url: /` |
| Icons | [`public/icons/`](public/icons/), [`public/favicon.png`](public/favicon.png) | 192, 512, maskable 512, Apple touch |
| Service worker | [`public/sw.js`](public/sw.js) | Conservative shell caching only |
| Offline page | [`public/offline.html`](public/offline.html) | Explicit offline message |
| Client UX | [`components/PwaProvider.tsx`](components/PwaProvider.tsx) | Register SW (production), install help, update banner |
| Helpers | [`lib/pwa.ts`](lib/pwa.ts) | Standalone / iOS / install-prompt rules |
| Pilot guide | [`docs/pilot-install.md`](docs/pilot-install.md) | Short iPhone / Android install steps |

### Caching rules

| Request | Strategy |
|---------|----------|
| `/_next/static/*`, `/icons/*`, favicon, `/offline.html` | Cache-first |
| HTML navigations | Network-only; on failure serve `/offline.html` |
| `/api/*`, `/sign-in`, `/sign-up`, Clerk paths | Network-only — **never** cached |
| Mutations / personalized JSON | Not stored in the service worker |

API responses also send `Cache-Control: private, no-store` via [`next.config.ts`](next.config.ts).

### Offline limitations

- No offline AI chat, workspace writes, or coach observations.
- Unsent composer text stays in the input until you send; failed sends keep retry UI without faking success.
- Demo `localStorage` is unrelated to the service-worker cache.

### Development registration

The service worker registers only when `NODE_ENV === "production"` (e.g. `npm run build && npm start`). `next dev` does not register it.

### Unregister / clear the service worker

1. Chrome/Edge DevTools → Application → Service Workers → Unregister.
2. Or in the browser console on your origin:

```js
navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
```

Bump `CACHE_VERSION` in `public/sw.js` when intentionally invalidating the shell cache.

### Device checklist

- [ ] iPhone Safari: open → sign in → Add to Home Screen → launch standalone → workspace action → offline fallback → Update banner after redeploy
- [ ] Android Chrome: install → launch → sign in → workspace action → offline fallback → update
- [ ] Mobile browser without install still works
- [ ] Desktop unchanged

Clerk production domains must allow the installed origin (same as normal web).


