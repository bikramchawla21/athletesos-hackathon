import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { ensureSchema, getSql } from "@/db/client";

const DEVICE_COOKIE = "sayana_device";

export type VaultPerson = { id: string; clerkUserId: string | null };

export async function requirePerson(): Promise<VaultPerson> {
  await ensureSchema();
  const db = getSql();
  const jar = await cookies();
  let deviceKey = jar.get(DEVICE_COOKIE)?.value;
  if (!deviceKey) {
    deviceKey = randomUUID();
    jar.set(DEVICE_COOKIE, deviceKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  }

  const existing = await db`
    SELECT id FROM sayana_people WHERE device_key = ${deviceKey} LIMIT 1
  `;
  if (existing[0]) {
    return { id: String(existing[0].id), clerkUserId: null };
  }
  const id = randomUUID();
  await db`
    INSERT INTO sayana_people (id, device_key)
    VALUES (${id}, ${deviceKey})
  `;
  return { id, clerkUserId: null };
}
