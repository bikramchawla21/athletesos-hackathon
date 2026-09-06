-- AthleteOS pilot health (no transcript content)
-- Run against the pilot Neon project in Neon SQL editor or:
--   psql "$DATABASE_URL_UNPOOLED" -f scripts/pilot-health.sql

WITH pilot_ws AS (
  SELECT id, pilot_marked_at, session_count, created_at
  FROM athlete_workspaces
  WHERE status = 'active'
),
completed AS (
  SELECT
    c.workspace_id,
    count(*)::int AS completed_sessions,
    max(c.updated_at) AS last_completed_at,
    count(*) FILTER (WHERE c.updated_at > now() - interval '7 days')::int AS completed_last_7d
  FROM conversations c
  WHERE c.status = 'completed' AND c.kind = 'athlete_discovery'
  GROUP BY c.workspace_id
),
feedback AS (
  SELECT DISTINCT ON (p.workspace_id)
    p.workspace_id,
    pf.response AS latest_feedback,
    pf.created_at AS latest_feedback_at
  FROM pattern_feedback pf
  JOIN patterns p ON p.id = pf.pattern_id
  ORDER BY p.workspace_id, pf.created_at DESC
),
failures AS (
  SELECT
    workspace_id,
    count(*) FILTER (WHERE name = 'transcription_failed')::int AS stt_failures,
    count(*) FILTER (WHERE name = 'tts_failed')::int AS tts_failures,
    count(*) FILTER (WHERE name = 'session_interrupted')::int AS interrupted,
    count(*) FILTER (WHERE name = 'session_started')::int AS sessions_started,
    count(*) FILTER (WHERE name = 'session_completed')::int AS sessions_completed_events
  FROM pilot_events
  WHERE created_at > now() - interval '30 days'
  GROUP BY workspace_id
)
SELECT
  w.id AS workspace_id,
  (w.pilot_marked_at IS NOT NULL) AS is_pilot,
  coalesce(c.completed_sessions, 0) AS completed_sessions,
  c.last_completed_at,
  coalesce(c.completed_last_7d, 0) AS completed_last_7d,
  f.latest_feedback,
  f.latest_feedback_at,
  coalesce(x.sessions_started, 0) AS sessions_started_30d,
  coalesce(x.sessions_completed_events, 0) AS sessions_completed_events_30d,
  coalesce(x.stt_failures, 0) AS stt_failures_30d,
  coalesce(x.tts_failures, 0) AS tts_failures_30d,
  coalesce(x.interrupted, 0) AS interrupted_30d
FROM pilot_ws w
LEFT JOIN completed c ON c.workspace_id = w.id
LEFT JOIN feedback f ON f.workspace_id = w.id
LEFT JOIN failures x ON x.workspace_id = w.id
ORDER BY is_pilot DESC, c.last_completed_at DESC NULLS LAST;
