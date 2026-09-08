import { NextResponse } from "next/server";
import { requirePerson } from "@/server/auth";

export async function GET() {
  const person = await requirePerson();
  return NextResponse.json({
    personId: person.id,
    clerk: Boolean(person.clerkUserId),
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "",
  });
}
