import { neon } from "@neondatabase/serverless";

let sql: ReturnType<typeof neon> | null = null;

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for Sayana.");
  }
  if (!sql) sql = neon(url);
  return sql;
}

let ensured = false;

export async function ensureSchema() {
  if (ensured) return;
  const db = getSql();
  await db`
    CREATE TABLE IF NOT EXISTS sayana_people (
      id uuid PRIMARY KEY,
      clerk_user_id text UNIQUE,
      device_key text UNIQUE,
      email text,
      display_name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_sessions (
      id uuid PRIMARY KEY,
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      mode text NOT NULL,
      why text NOT NULL,
      overwhelmed boolean NOT NULL DEFAULT false,
      time_hint text NOT NULL,
      language_mix text,
      summary text,
      transcript text NOT NULL DEFAULT '',
      recorded_at timestamptz NOT NULL,
      time_zone text NOT NULL DEFAULT 'UTC',
      local_day text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS sayana_sessions_person_day_idx ON sayana_sessions (person_id, local_day)`;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_audio_assets (
      id uuid PRIMARY KEY,
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      session_id uuid NOT NULL REFERENCES sayana_sessions(id),
      mime text NOT NULL,
      duration_ms integer,
      byte_size integer,
      storage_key text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_session_stats (
      session_id uuid PRIMARY KEY REFERENCES sayana_sessions(id),
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      total_word_count integer NOT NULL,
      total_curse_count integer NOT NULL,
      word_counts jsonb NOT NULL DEFAULT '{}',
      curse_counts jsonb NOT NULL DEFAULT '{}'
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_next_steps (
      id uuid PRIMARY KEY,
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      session_id uuid REFERENCES sayana_sessions(id),
      local_day text NOT NULL,
      title text NOT NULL,
      due_hint text,
      person_name text,
      status text NOT NULL DEFAULT 'proposed',
      google_event_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS sayana_steps_person_day_idx ON sayana_next_steps (person_id, local_day)`;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_people_mentions (
      id uuid PRIMARY KEY,
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      name text NOT NULL,
      last_mentioned_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (person_id, name)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_open_loops (
      id uuid PRIMARY KEY,
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      title text NOT NULL,
      person_name text,
      status text NOT NULL DEFAULT 'open',
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (person_id, title)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_day_rollups (
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      local_day text NOT NULL,
      summary text NOT NULL DEFAULT '',
      dump_count integer NOT NULL DEFAULT 0,
      total_word_count integer NOT NULL DEFAULT 0,
      total_curse_count integer NOT NULL DEFAULT 0,
      curse_counts jsonb NOT NULL DEFAULT '{}',
      word_counts jsonb NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (person_id, local_day)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_events (
      id uuid PRIMARY KEY,
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      kind text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_push_subs (
      id uuid PRIMARY KEY,
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_reminders (
      id uuid PRIMARY KEY,
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      local_day text NOT NULL,
      body text NOT NULL,
      fire_at timestamptz NOT NULL,
      sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_audio_blobs (
      asset_id uuid PRIMARY KEY REFERENCES sayana_audio_assets(id),
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      body_b64 text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sayana_memory_items (
      id uuid PRIMARY KEY,
      person_id uuid NOT NULL REFERENCES sayana_people(id),
      session_id uuid REFERENCES sayana_sessions(id),
      local_day text NOT NULL,
      kind text NOT NULL,
      title text NOT NULL,
      due_hint text,
      person_name text,
      briefing_status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS sayana_memory_person_status_idx ON sayana_memory_items (person_id, briefing_status, local_day)`;
  ensured = true;
}
