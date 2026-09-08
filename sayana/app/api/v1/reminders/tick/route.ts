import { NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/db/client";
import webpush from "web-push";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no vapid" });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@sayana.app", publicKey, privateKey);
  await ensureSchema();
  const db = getSql();
  const due = await db`
    SELECT r.id, r.person_id, r.body, s.endpoint, s.p256dh, s.auth
    FROM sayana_reminders r
    JOIN sayana_push_subs s ON s.person_id = r.person_id
    WHERE r.sent_at IS NULL AND r.fire_at <= now()
    LIMIT 40
  `;
  let sent = 0;
  for (const row of due) {
    try {
      await webpush.sendNotification(
        {
          endpoint: String(row.endpoint),
          keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
        },
        String(row.body),
      );
      await db`UPDATE sayana_reminders SET sent_at = now() WHERE id = ${String(row.id)}`;
      sent += 1;
    } catch {
      /* ignore dead subs */
    }
  }
  return NextResponse.json({ ok: true, sent });
}
