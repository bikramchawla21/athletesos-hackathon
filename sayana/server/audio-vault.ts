import { getSql } from "@/db/client";

/** Neon HTTP payload stays small; bigger rants keep metadata only. */
export const MAX_VAULT_AUDIO_BYTES = 2_000_000;

export async function persistAudioBlob(opts: {
  assetId: string;
  personId: string;
  bytes: Buffer;
}): Promise<string | null> {
  if (opts.bytes.length === 0 || opts.bytes.length > MAX_VAULT_AUDIO_BYTES) return null;
  const db = getSql();
  try {
    await db`
      INSERT INTO sayana_audio_blobs (asset_id, person_id, body_b64)
      VALUES (${opts.assetId}, ${opts.personId}, ${opts.bytes.toString("base64")})
    `;
    return `vault:${opts.assetId}`;
  } catch {
    return null;
  }
}
