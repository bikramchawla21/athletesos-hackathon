import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthzError } from "@/server/authz/errors";
import { requireFounder } from "@/server/authz/founder";
import { isDatabaseConfigured } from "@/db/client";
import { loadPilotDashboard } from "@/server/services/pilot-dashboard-service";
import { PilotAthletesTable } from "@/components/admin/PilotAthletesTable";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ filter?: string; sort?: string }>;
};

function pct(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function fmtRet(r: { rate: number | null; eligible: number; retained: number }) {
  if (r.rate == null) return `n/a (${r.eligible} eligible)`;
  return `${pct(r.rate)} (${r.retained}/${r.eligible})`;
}

export default async function AdminPilotPage({ searchParams }: PageProps) {
  if (!isDatabaseConfigured()) {
    redirect("/demo?reason=database");
  }

  try {
    await requireFounder();
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/sign-in?redirect_url=/admin/pilot");
    }
    redirect("/app");
  }

  const params = await searchParams;
  const filter =
    params.filter === "active_7d" || params.filter === "inactive_7d"
      ? params.filter
      : "all";

  const { overview, athletes } = await loadPilotDashboard({ filter });

  return (
    <main className="admin-pilot">
      <header className="admin-pilot-header">
        <div>
          <p className="admin-eyebrow">Internal · read-only</p>
          <h1>AthleteOS Pilot</h1>
          <p className="admin-sub">
            Auto-derived from Neon + pilot events. Does not mutate AthleteMemory.
            As of {new Date(overview.asOf).toLocaleString()}.
          </p>
        </div>
        <Link className="admin-link" href="/app">
          Back to app
        </Link>
      </header>

      <section className="admin-metric-grid" aria-label="Pilot overview">
        <article>
          <h2>Athletes</h2>
          <ul>
            <li>
              <strong>{overview.athletesTotal}</strong> pilot athletes
            </li>
            <li>
              <strong>{overview.athletesActivated}</strong> activated
            </li>
            <li>
              <strong>{overview.athletesActive24h}</strong> active 24h
            </li>
            <li>
              <strong>{overview.athletesActive7d}</strong> active 7d
            </li>
            <li>
              <strong>{overview.athletesActive14d}</strong> active 14d
            </li>
          </ul>
        </article>
        <article>
          <h2>Usage</h2>
          <ul>
            <li>
              Sessions started: <strong>{overview.sessionsStarted}</strong>
            </li>
            <li>
              Sessions completed (events):{" "}
              <strong>{overview.sessionsCompletedEvents}</strong>
            </li>
            <li>
              Completion rate: <strong>{pct(overview.completionRate)}</strong>
            </li>
            <li>
              Conversations: <strong>{overview.totalConversations}</strong> (
              {overview.completedConversations} completed)
            </li>
            <li>
              Athlete turns: <strong>{overview.totalUserTurns}</strong>
            </li>
            <li>
              Avg completed / athlete:{" "}
              <strong>
                {overview.avgCompletedSessionsPerAthlete?.toFixed(1) ?? "—"}
              </strong>
            </li>
            <li>
              Avg sessions / active 7d:{" "}
              <strong>
                {overview.avgSessionsPerActiveAthlete7d?.toFixed(1) ?? "—"}
              </strong>
            </li>
          </ul>
        </article>
        <article>
          <h2>Retention</h2>
          <p className="admin-note">
            Dn = returned with a completed session on calendar day activation+n.
            Athletes younger than n days are excluded.
          </p>
          <ul>
            <li>D1: {fmtRet(overview.retention.d1)}</li>
            <li>D3: {fmtRet(overview.retention.d3)}</li>
            <li>D7: {fmtRet(overview.retention.d7)}</li>
            <li>D14: {fmtRet(overview.retention.d14)}</li>
            <li>D30: {fmtRet(overview.retention.d30)}</li>
          </ul>
        </article>
        <article>
          <h2>Intelligence</h2>
          <ul>
            <li>
              Cross-session: {pct(overview.intelligence.crossSessionRate)} (
              {overview.intelligence.crossSessionCount}/
              {overview.intelligence.withEvidenceCount} with evidence)
            </li>
            <li>
              Historical &gt;7d: {pct(overview.intelligence.historicalInsightRate)}
            </li>
            <li>
              Long-memory &gt;14d: {pct(overview.intelligence.longMemoryInsightRate)}
            </li>
            <li>
              Novel (“No”): {pct(overview.intelligence.novelInsightRate)} (
              {overview.intelligence.feedbackNo}/
              {overview.intelligence.feedbackYes +
                overview.intelligence.feedbackKindOf +
                overview.intelligence.feedbackNo}{" "}
              answered)
            </li>
            <li>
              Historical + novel:{" "}
              {pct(overview.intelligence.historicalNovelInsightRate)}
            </li>
          </ul>
          <p className="admin-note">
            Provenance requires Pass 8 message-linked pattern_evidence. Older
            reflections may show Unavailable.
          </p>
        </article>
        <article>
          <h2>Reliability</h2>
          <ul>
            <li>
              STT: {pct(overview.reliability.sttSuccessRate)} (
              {overview.reliability.sttSuccesses}/
              {overview.reliability.sttAttempts})
            </li>
            <li>
              TTS: {pct(overview.reliability.ttsSuccessRate)} (
              {overview.reliability.ttsSuccesses}/
              {overview.reliability.ttsAttempts})
            </li>
            <li>Interrupted while thinking: {overview.reliability.chatFailures}</li>
            <li>
              Interrupted while finalizing:{" "}
              {overview.reliability.finalizationFailures}
            </li>
          </ul>
        </article>
      </section>

      <section className="admin-table-section">
        <div className="admin-table-toolbar">
          <h2>Athletes</h2>
          <nav className="admin-filters" aria-label="Athlete filters">
            <Link
              href="/admin/pilot?filter=all"
              className={filter === "all" ? "is-active" : undefined}
            >
              All
            </Link>
            <Link
              href="/admin/pilot?filter=active_7d"
              className={filter === "active_7d" ? "is-active" : undefined}
            >
              Active last 7d
            </Link>
            <Link
              href="/admin/pilot?filter=inactive_7d"
              className={filter === "inactive_7d" ? "is-active" : undefined}
            >
              Inactive last 7d
            </Link>
          </nav>
        </div>
        <PilotAthletesTable athletes={serializeAthletes(athletes)} />
      </section>
    </main>
  );
}

function serializeAthletes(
  athletes: Awaited<ReturnType<typeof loadPilotDashboard>>["athletes"],
) {
  return athletes.map((a) => ({
    ...a,
    activationAt: a.activationAt?.toISOString() ?? null,
    lastActivityAt: a.lastActivityAt?.toISOString() ?? null,
    lastCompletedAt: a.lastCompletedAt?.toISOString() ?? null,
    latestInsightAt: a.latestInsightAt?.toISOString() ?? null,
    oldestEvidenceAt: a.oldestEvidenceAt?.toISOString() ?? null,
  }));
}
