import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthzError } from "@/server/authz/errors";
import { requireFounder } from "@/server/authz/founder";
import { isDatabaseConfigured } from "@/db/client";
import { loadPilotAthleteDetail } from "@/server/services/pilot-dashboard-service";
import { EvidenceReveal } from "@/components/admin/EvidenceReveal";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

export default async function AdminPilotAthletePage({ params }: PageProps) {
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

  const { workspaceId } = await params;
  const detail = await loadPilotAthleteDetail(workspaceId);
  if (!detail) notFound();

  const { athlete, sessions, insights, timeline } = detail;
  const completed = sessions.filter((s) => s.status === "completed");
  const avgTurns =
    completed.length === 0
      ? 0
      : completed.reduce((s, c) => s + c.userTurns, 0) / completed.length;
  const completionRate =
    detail.sessionsStarted > 0
      ? detail.sessionsCompletedEvents / detail.sessionsStarted
      : null;

  return (
    <main className="admin-pilot">
      <header className="admin-pilot-header">
        <div>
          <p className="admin-eyebrow">Internal athlete detail · read-only</p>
          <h1>{athlete.athleteLabel}</h1>
          {athlete.email ? <p className="admin-sub">{athlete.email}</p> : null}
        </div>
        <Link className="admin-link" href="/admin/pilot">
          All athletes
        </Link>
      </header>

      <section className="admin-metric-grid">
        <article>
          <h2>Usage</h2>
          <ul>
            <li>Activated: {fmt(athlete.activationAt)}</li>
            <li>Last activity: {fmt(athlete.lastActivityAt)}</li>
            <li>Last completed session: {fmt(athlete.lastCompletedAt)}</li>
            <li>Sessions completed: {athlete.sessionsCompleted}</li>
            <li>Conversations: {athlete.totalConversations}</li>
            <li>Avg turns / completed session: {avgTurns.toFixed(1)}</li>
            <li>
              Event completion rate:{" "}
              {completionRate == null ? "—" : `${Math.round(completionRate * 100)}%`}
            </li>
            <li>Interrupted events: {detail.interruptedSessions}</li>
          </ul>
        </article>
        <article>
          <h2>Insights</h2>
          <ul>
            <li>Completed insights: {athlete.completedInsights}</li>
            <li>Feedback answered: {athlete.feedbackCount}</li>
            <li>“No” count: {athlete.feedbackNoCount}</li>
            <li>
              Cross-session:{" "}
              {athlete.provenanceAvailable
                ? `${athlete.crossSessionInsights}/${athlete.completedInsights}`
                : "Unavailable (no message-linked evidence yet)"}
            </li>
            <li>
              Longest memory age:{" "}
              {athlete.longestMemoryAgeDays != null
                ? `${athlete.longestMemoryAgeDays} days`
                : "Unavailable"}
            </li>
          </ul>
        </article>
      </section>

      <section className="admin-detail-block">
        <h2>Insights + evidence audit</h2>
        {insights.length === 0 ? <p>No reflections yet.</p> : null}
        {insights.map((insight) => (
          <article key={insight.reflectionId} className="admin-insight-card">
            <h3>{insight.title}</h3>
            <p>Generated: {fmt(insight.generatedAt)}</p>
            <p>Feedback: {insight.feedback ?? "—"}</p>
            {insight.provenance.available ? (
              <>
                <p>
                  Supporting evidence: {insight.provenance.supportingEvidenceCount}{" "}
                  pieces · {insight.provenance.supportingConversationCount}{" "}
                  conversations
                </p>
                <p>
                  Oldest evidence: {fmt(insight.provenance.oldestSupportingEvidenceAt)}{" "}
                  ({insight.provenance.memoryReferenceAgeDays}d earlier)
                </p>
                <p>Bucket: {insight.provenance.bucket.replace("_", "–")}</p>
                <p>
                  Cross-session: {insight.provenance.crossSession ? "Yes" : "No"}
                </p>
                <ul className="admin-evidence-timeline">
                  {insight.evidenceTimeline.map((e) => (
                    <li key={`${e.conversationId}-${e.createdAt.toISOString()}`}>
                      {fmt(e.createdAt)} — conversation {e.conversationId.slice(0, 8)}…
                    </li>
                  ))}
                </ul>
                {insight.patternId ? (
                  <EvidenceReveal
                    workspaceId={workspaceId}
                    patternId={insight.patternId}
                  />
                ) : null}
              </>
            ) : (
              <p className="admin-note">
                Provenance unavailable — this reflection predates message-linked
                pattern_evidence (or has no user messages). Labels in
                ReflectionReport remain; oldest-evidence metrics are not inferred.
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="admin-detail-block">
        <h2>Sessions</h2>
        <ul>
          {sessions.map((s) => (
            <li key={s.conversationId}>
              {fmt(s.updatedAt)} — {s.status} — {s.userTurns} athlete turns
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-detail-block">
        <h2>Timeline</h2>
        <ul>
          {timeline.map((t, i) => (
            <li key={`${t.at.toISOString()}-${i}`}>
              {fmt(t.at)} — {t.label}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
