# AthleteOS

**The intelligence that grows with you.**

AthleteOS is a hackathon MVP of a **Performance Operating System**. It runs a typing-first discovery conversation, builds a working understanding of an athlete, and turns that understanding into an evidence-backed reflection: observations, evidence, a working pattern, and a shared priority.

## What this MVP proves

1. A calm, white, spacious welcome and discovery conversation.
2. Adaptive follow-ups via `/api/chat` (OpenAI), with deterministic **demo mode** when no API key is set.
3. Reflection before recommendation — no premature coaching plan.
4. Structured insight loop rendered on locked screens:
   - Today, here’s what I noticed.
   - Here’s what led me to that thought.
   - The strongest pattern I see.
   - If we worked on only one thing together…
5. Honest failures when an API key is configured (no silent fake “live” success).
6. Basic crisis-safe replies that refuse to act as a therapist, doctor, or emergency service.
7. Structured athlete memory with anonymous same-browser persistence (`localStorage`), updated at controlled checkpoints via `/api/memory`.

## Tech stack

- Next.js App Router (v16) + React 19 + TypeScript
- OpenAI Responses API
- Zod validation / structured JSON for reflection reports
- Vercel-ready deployment

## Local setup

```bash
npm install
cp .env.example .env.local
# Optional: set a real OPENAI_API_KEY in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy from [`.env.example`](.env.example):

```env
OPENAI_API_KEY=replace_me
OPENAI_MODEL=gpt-4.1
```

| Variable | Required | Notes |
|----------|----------|--------|
| `OPENAI_API_KEY` | No for demo | If missing or set to `replace_me`, chat and insights run in **demo mode**. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4.1`. |

`.env`, `.env.local`, and `.env*.local` are gitignored. Never commit secrets.

## Demo fallback behavior

When there is **no usable API key**:

- `/api/chat` returns a deterministic, input-aware demo reply with `demoMode: true`.
- `/api/insights` returns a schema-valid demo `ReflectionReport` with `demoMode: true` (only if the transcript has enough athlete signal).
- `/api/memory` returns a schema-valid demo `AthleteMemory` update with `demoMode: true`.

When a **real API key is configured** and the provider fails (timeout, invalid output after one repair, network error):

- The API returns an error (`502` / validation as appropriate).
- The UI shows the error and a **Retry** control.
- Demo content is **not** silently substituted as a live success.

## API behavior

### `POST /api/chat`

Body: `{ "messages": Message[], "memory"?: AthleteMemory | null, "report"?: ReflectionReport | null, "mode"?: "chat" | "reopen" }`

- Validates the request; rejects empty user content in normal chat mode.
- `mode: "reopen"` generates a short context-aware continuation from memory + latest priority (no new user turn required).
- Optional validated `memory` informs natural references and hidden coverage routing (never shown as percentages).
- Crisis / self-harm heuristics return a fixed safe reply (no model call).
- Otherwise: OpenAI discovery reply, or demo reply without a key.
- When a real API key is configured, provider failures return `502` — never a silent demo success.
- Success: `{ "reply": string, "demoMode": boolean, "safety"?: boolean }`

### `POST /api/insights`

Body: `{ "messages": Message[], "memory": AthleteMemory }`

- Requires enough athlete context (≥3 user turns and enough text); otherwise `422` `insufficient_context`.
- Uses validated memory as internal grounding (never invents beyond transcript + memory).
- Builds a `ReflectionReport` (observations, evidence, pattern, shared priority, focus areas, closing).
- Validates model JSON with Zod; repairs once on schema failure.
- Success: `{ "report": ReflectionReport, "demoMode": boolean }`

### `POST /api/memory`

Body: `{ "memory": AthleteMemory, "messages": Message[], "report"?: ReflectionReport | null, "reason": "checkpoint" | "pre_insights" | "correction" | "session_complete" }`

- Merges grounded updates into structured athlete memory (claims must cite message ids).
- Validates with Zod; repairs once on schema failure; strips unknown message-id citations.
- Success: `{ "memory": AthleteMemory, "demoMode": boolean }`

## Scripts

```bash
npm run dev          # local development
npm run build        # production build
npm run start        # serve production build
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm test             # insights + hardening + memory tests
npm run test:insights
npm run test:hardening
npm run test:memory
```

## Deploy to Vercel

1. Push this repository to GitHub (already: `bikramchawla21/athletesos-hackathon`).
2. Import the repo in [Vercel](https://vercel.com/new).
3. Framework preset: Next.js (default).
4. Add environment variables for **Production** (and Preview if used):
   - `OPENAI_API_KEY` = a real key (`sk-…`). Required for live adaptive replies.
   - `OPENAI_MODEL` = `gpt-4.1` (optional).
5. Redeploy after changing env vars.

Without a usable `OPENAI_API_KEY`, chat runs in **demo mode** (badge: “Discovery · Demo mode”) with deterministic question fallbacks. Demo mode never silently pretends to be live. When a key is set and OpenAI fails, the API returns `502` / `OPENAI_REQUEST_FAILED` — not fake success.

CLI alternative (if Vercel CLI is installed and authenticated):

```bash
npx vercel --prod
```

## Product loop (judge path)

Welcome → discovery conversation → **Share what you’ve noticed** → generating → four reflection screens → **Let’s begin** → completion (“Thank you for trusting me…”) → **Continue our conversation** (preserves transcript/memory/report + reopen message) or **Start over** (confirm, then clear all AthleteOS browser state).

Anonymous same-browser persistence uses `localStorage` key `athletesos:v1` (messages, AthleteMemory, latest reflection, UI stage, relationship stage, session count). No API keys are stored in the browser.

## Safety and scope

AthleteOS is **not** medical care, therapy, diagnosis, injury clearance, or emergency guidance. Crisis-related messages receive a short safety redirect toward human / emergency help.

Out of scope for this MVP: user accounts, cloud persistence, vector databases, embeddings, knowledge-graph visualization, coach dashboard, wearables, voice, notifications, calendar plans, analytics, gamification, separate AI agents, visible confidence scores, long-term database memory (browser `localStorage` only).
