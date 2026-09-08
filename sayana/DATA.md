# Sayana data dictionary

All tables are prefixed `sayana_`. Every row except lookup-free events is scoped by `person_id`. Mixing dumps across people is a bug.

| Table | Point of the row |
| --- | --- |
| sayana_people | Our UUID. Clerk id or device cookie is a login, not the moat. |
| sayana_sessions | One dump. Transcript, summary, mode, local day, timezone. |
| sayana_audio_assets | Audio metadata. `storage_key` like `vault:{id}` when bytes are kept. |
| sayana_audio_blobs | Raw rant bytes (base64) for a later replay board. No replay UI yet. |
| sayana_session_stats | Word histogram, per-type curse map, totalCurseCount = sum. |
| sayana_next_steps | Logistics from any dump, including overwhelm. Deduped per day. |
| sayana_memory_items | Extra extract kinds (commitment, decision, idea, person, question) for morning briefing approve/ignore. |
| sayana_people_mentions | Private graph of names said in rants. |
| sayana_open_loops | Recurring promises. |
| sayana_day_rollups | One summary + aggregates per local calendar day. |
| sayana_events | Append-only product log. |
| sayana_reminders | Lock-screen nudge schedule. |
| sayana_push_subs | Web Push endpoints. |

Export: `GET /api/v1/export` returns that person’s vault only.
