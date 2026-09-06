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
| `POST /api/workspaces/:id/reset` | **Hard-deletes** workspace performance history (messages, memory, patterns, reflections, priorities). Keeps Person/membership. Not an archive. |
| `POST /api/conversations` | Start conversation + opening message |
| `GET /api/conversations/:id?workspaceId=` | Load messages + memory + report |
| `POST /api/conversations/:id/continue` | Reopen continuation |
| `POST /api/chat` | With `workspaceId`: persist + context builders; without: anonymous demo. Voice PWA sets `client: "voice_pwa"` (prompt + `model_operations.entityIds.inputSource=voice`). |
| `POST /api/memory` | Workspace: load/merge/persist memory items (archives prior active items) |
| `POST /api/insights` | Workspace: persist reflection/pattern/priority transactionally |
| `POST /api/transcribe` | Auth STT; raw audio ephemeral; transcript not written here |
| `POST /api/speech` | Auth TTS; generated audio ephemeral |
| `POST /api/legacy-import` | Idempotent import of `athletesos:v1` payload |

## Pilot / product data durability

Neon Postgres is the **canonical** historical record for AthleteOS. Vercel logs, browser state, OpenAI logs, and temporary audio are **not** the system of record.

**Durable:** Person, workspace, memberships, conversations, messages (text), memory_items (+ sources), patterns (+ evidence/feedback), reflections, priorities, model_operations, timeline_events.

**Ephemeral by design:** raw microphone audio, generated TTS audio.

**Voice turns:** STT transcript → `messages.content` via `/api/chat` (same path as typed). Provenance `inputSource=voice` is recorded on `model_operations.entityIds` when `client: "voice_pwa"` (no messages schema migration).

**Supersede vs delete (normal paths):** memory_items → `archived`; reflections → `superseded`; priorities → `archived`/`replaced`. Messages are append-only.

**Known hard wipe:** `POST /api/workspaces/:id/reset` permanently deletes workspace history. Treat as pilot-risk; prefer new conversation for a fresh reflection day.

### Neon backup / recovery (ops)

Configured outside this repo (Neon Console → project Settings → Instant restore):

| Capability | Notes |
|------------|--------|
| Point-in-time / instant restore | Neon history window (Free: up to 6h; Launch/Scale: default often 1 day, up to 7–30 days by plan) |
| Deleted project recovery | Neon typically allows ~7 days to undelete a project |
| Logical export | `pg_dump` / `pg_restore` supported; not automated in-app |
| Workspace reconstruction | Technically: query by `workspaceId` → conversations → messages → memory_items/sources → reflections/patterns/priorities. No admin export UI yet. |

**Never** run `drizzle-kit push` or destructive migrations against the pilot/production database casually. Prefer additive SQL migrations. Automated tests do **not** connect to Neon.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test                 # insights + hardening + memory + authz
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

