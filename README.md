# AthleteOS

**The intelligence that grows with you.**

AthleteOS is a hackathon MVP for a new category: the **Performance Operating System**. It conducts an adaptive discovery conversation, develops a working understanding of the athlete, and turns that understanding into an evidence-backed performance priority.

## What this scaffold proves

1. A calm, typing-first discovery conversation.
2. Variable follow-up questions generated from the athlete's latest input and full conversation context.
3. Reflection before recommendation.
4. A structured insight loop:
   - Today, here's what I noticed
   - Here's what led me to that thought
   - The strongest pattern I see
   - What should we focus on?
5. A fallback demo mode when no API key is configured.

## Tech stack

- Next.js App Router
- TypeScript
- OpenAI Responses API
- Structured Outputs for the insight report
- Vercel-ready deployment

## Run locally

```bash
npm install
cp .env.example .env.local
# Add your OpenAI API key to .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

```env
OPENAI_API_KEY=replace_me
OPENAI_MODEL=gpt-5.6-luna
```

The application still runs without an API key using deterministic demo responses, but variable follow-up prompts require a valid key.

## How adaptive follow-ups work

The browser sends the full conversation to `/api/chat`. The model is instructed to:

- reflect a meaningful detail,
- ask one question at a time,
- follow the athlete's threads rather than a fixed questionnaire,
- check and correct its understanding,
- avoid generic coaching advice.

When the athlete selects **Share what you've noticed**, `/api/insights` converts the conversation into a structured reflection report.

## Deploy

1. Push this folder to a GitHub repository.
2. Import the repository into Vercel.
3. Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in Vercel project settings.
4. Deploy.

## Safety and scope

This prototype does not provide medical diagnosis, injury clearance, mental-health treatment, or emergency guidance. It is a performance reflection and decision-support experience.
