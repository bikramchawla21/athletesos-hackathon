# AthleteOS pilot operations (Pass 7)

Operational guide for a 10–20 athlete voice PWA pilot. Not a product feature doc.

## Environment separation

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled Neon URL used by the running app (`db/client.ts`) |
| `DATABASE_URL_UNPOOLED` | Direct Neon URL for Drizzle migrations |
| `ATHLETEOS_ENV` | `development` \| `preview` \| `production` (falls back to `VERCEL_ENV` / `NODE_ENV`) |
| `ATHLETEOS_ALLOW_PROD_MIGRATE` | Temporary `1` to migrate when env is production — unset after success |
| `ATHLETEOS_ALLOW_NEON_MIGRATE` | Temporary `1` to migrate a Neon URL from local/dev — unset after success |
| `ALLOW_PILOT_WORKSPACE_RESET` | Must be `1` to allow hard workspace reset in production |

**Rule:** local/dev and pilot/production must use **separate Neon projects**.  
Tests under `scripts/test-*.mjs` are offline/static — they do **not** connect to Neon.

```bash
# Local non-Neon
ATHLETEOS_ENV=development npm run db:migrate

# Intentional Neon (local/dev branch) — temporary allow, then unset
ATHLETEOS_ALLOW_NEON_MIGRATE=1 npm run db:migrate

# Production/pilot Neon — temporary allow, then unset
ATHLETEOS_ENV=production ATHLETEOS_ALLOW_PROD_MIGRATE=1 npm run db:migrate
```

`npm run db:migrate` runs through `scripts/db-migrate-guard.mjs` (not raw `drizzle-kit migrate`). Neon URLs are refused unless an allow flag is set.
## Pilot cohort identification

Column: `athlete_workspaces.pilot_marked_at` (nullable timestamp).

Mark intentional pilots (no emails in source code):

```sql
UPDATE athlete_workspaces
SET pilot_marked_at = now(), updated_at = now()
WHERE id = '<workspace-uuid>' AND pilot_marked_at IS NULL;
```

Or: `node --experimental-strip-types scripts/mark-pilot-workspace.mjs <workspaceId>`

## Canonical athlete data vs pilot events

| Canonical (product SoR) | Pilot analytics |
|-------------------------|-----------------|
| `conversations`, `messages` | `pilot_events` |
| `memory_items`, `patterns`, `reflections` | names like `session_started`, `tts_failed` |
| `pattern_feedback` | `insight_feedback` event (also stored as feedback) |

Events store **ids + metrics only** — never transcripts or audio.

## Metrics → data sources

| Metric | How to derive |
|--------|----------------|
| Activation | First `conversations.status='completed'` **or** `pilot_events.name='athlete_activated'` |
| D1/D3/D7/D14 retention | Distinct days with completed conversations after first completion |
| Reflection frequency | Completed conversations / week per workspace |
| Completion rate | `session_completed` / `session_started` (same workspace) |
| STT reliability | `transcription_succeeded` / (`succeeded`+`failed`) |
| TTS reliability | `tts_succeeded` / (`succeeded`+`failed`) |
| Insight discovery | `pattern_feedback.response` or `insight_feedback` props.answer |
| Conversation depth | user message count per completed conversation |
| Session duration | optional: `latencyMs` on TTS success from stop→speak; or message created_at span |

Founder health: `npm run pilot:health` (prints SQL + optional query when `DATABASE_URL` set).

## Backup / recovery (Neon)

**Verified from repo:** Neon is the configured Postgres provider; no in-repo backup cron or dump scripts.

**Manual verification required in Neon console for the pilot project:**

1. Point-in-time recovery (PITR) / history retention enabled?
2. Branching available for restore drills?
3. Who has project admin access?

**If accidental deletion / bad migration:** restore via Neon PITR or branch restore (console). Repo cannot perform this.

**Export:** founder can `pg_dump` via Neon connection string, or export tables with SQL. Deletion/export product UI is not built; data is keyed by `workspace_id` / `person_id` so export/delete is structurally possible later.

## Dangerous operations

| Path | Risk |
|------|------|
| `POST /api/workspaces/:id/reset` | Hard-deletes workspace history. **Blocked in production** unless `ALLOW_PILOT_WORKSPACE_RESET=1`. Pilot-marked workspaces always require that flag in production. |
| `drizzle-kit push` | Never use on pilot DB (README). |
| Migrations with DROP/TRUNCATE | Prefer additive migrations only while pilot history exists. `0001` had enum swaps — do not re-run destructively. |

## Cost visibility (approx)

| Capability | Model / route | Where to estimate |
|------------|---------------|-------------------|
| STT | `gpt-4o-mini-transcribe` via `/api/transcribe` | OpenAI usage dashboard (audio minutes) |
| Chat / insights / synthesis | `OPENAI_MODEL` (default `gpt-4.1`) via `/api/chat`, `/api/insights`, `/api/memory` | Token usage in OpenAI + `model_operations` row counts |
| TTS | `gpt-4o-mini-tts` via `/api/speech` | OpenAI TTS characters / minutes |

Rough pilot estimate: ~N completed sessions × (few chat turns + 1 insights + 1–2 TTS) for 10–20 athletes × weeks. Use OpenAI billing + `pilot_events` volume — no in-app billing.

## Latency (stop talking → AthleteOS speaks)

Sequential today: upload → STT → chat → TTS. Dominant costs are STT + chat + TTS. No unsafe parallelization added in Pass 7.

## iPhone manual device checklist

See [docs/pilot-iphone-checklist.md](./pilot-iphone-checklist.md).

## PWA updates

`public/sw.js` caches shell only (`athleteos-shell-v2`). APIs/auth are network-only. `PwaProvider` shows “A new version is ready” → user taps Update → `SKIP_WAITING` + reload.
