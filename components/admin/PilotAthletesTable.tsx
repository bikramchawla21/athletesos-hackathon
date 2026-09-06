"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type SerializedAthlete = {
  workspaceId: string;
  athleteLabel: string;
  email: string | null;
  activationAt: string | null;
  lastActivityAt: string | null;
  lastCompletedAt: string | null;
  sessionsCompleted: number;
  sessionsLast7d: number;
  sessionsLast14d: number;
  sessionsLast30d: number;
  totalConversations: number;
  userMessageCount: number;
  completedInsights: number;
  feedbackCount: number;
  feedbackNoCount: number;
  latestInsightAt: string | null;
  oldestEvidenceAt: string | null;
  longestMemoryAgeDays: number | null;
  crossSessionInsights: number;
  usageStatus: string;
  provenanceAvailable: boolean;
};

type SortKey =
  | "lastActivityAt"
  | "sessionsCompleted"
  | "sessionsLast7d"
  | "crossSessionInsights"
  | "longestMemoryAgeDays"
  | "feedbackNoCount"
  | "athleteLabel";

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function fmtStatus(status: string) {
  if (status === "active") return "Active";
  if (status === "at_risk") return "At risk";
  if (status === "inactive") return "Inactive";
  return "Never";
}

export function PilotAthletesTable({ athletes }: { athletes: SerializedAthlete[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("lastActivityAt");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const copy = [...athletes];
    copy.sort((a, b) => {
      const dir = asc ? 1 : -1;
      if (sortKey === "athleteLabel") {
        return a.athleteLabel.localeCompare(b.athleteLabel) * dir;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return (Date.parse(av) - Date.parse(bv)) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });
    return copy;
  }, [athletes, sortKey, asc]);

  function onSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>
              <button type="button" onClick={() => onSort("athleteLabel")}>
                Athlete
              </button>
            </th>
            <th>Status</th>
            <th>
              <button type="button" onClick={() => onSort("lastActivityAt")}>
                Last activity
              </button>
            </th>
            <th>Activated</th>
            <th>
              <button type="button" onClick={() => onSort("sessionsLast7d")}>
                7d
              </button>
            </th>
            <th>14d</th>
            <th>30d</th>
            <th>
              <button type="button" onClick={() => onSort("sessionsCompleted")}>
                Total done
              </button>
            </th>
            <th>Turns</th>
            <th>Insights</th>
            <th>
              <button type="button" onClick={() => onSort("crossSessionInsights")}>
                Cross-session
              </button>
            </th>
            <th>
              <button type="button" onClick={() => onSort("longestMemoryAgeDays")}>
                Longest mem
              </button>
            </th>
            <th>
              <button type="button" onClick={() => onSort("feedbackNoCount")}>
                “No”
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.workspaceId}>
              <td>
                <Link href={`/admin/pilot/${row.workspaceId}`}>
                  {row.athleteLabel}
                </Link>
                {row.email ? <div className="admin-muted">{row.email}</div> : null}
              </td>
              <td>
                <span className={`admin-status admin-status-${row.usageStatus}`}>
                  {fmtStatus(row.usageStatus)}
                </span>
              </td>
              <td>{fmtDate(row.lastActivityAt)}</td>
              <td>{fmtDate(row.activationAt)}</td>
              <td>{row.sessionsLast7d}</td>
              <td>{row.sessionsLast14d}</td>
              <td>{row.sessionsLast30d}</td>
              <td>{row.sessionsCompleted}</td>
              <td>{row.userMessageCount}</td>
              <td>{row.completedInsights}</td>
              <td>
                {row.provenanceAvailable
                  ? `${row.crossSessionInsights}/${row.completedInsights}`
                  : "Unavailable"}
              </td>
              <td>
                {row.longestMemoryAgeDays != null
                  ? `${row.longestMemoryAgeDays}d`
                  : "Unavailable"}
              </td>
              <td>{row.feedbackNoCount}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={13}>No athletes match this filter.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="admin-note">
        “Last activity” = latest of completed session, message, or pilot event —
        not a Clerk login timestamp (login events are not stored locally).
      </p>
    </div>
  );
}
