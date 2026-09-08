import type { ModeDecision, SessionMode } from "./types";
import { hourInZone, timeHintFromHour } from "./time-hint";

const LISTEN_RE =
  /\b(just listen|don't need advice|do not need advice|no advice|overwhelmed|i can't|i cannot|i'm drowning|im drowning|leave me|bas sun|advice mat|mat bata|thak gaya|thak gayi|bahut ho gaya)\b/i;

export function decideMode(input: {
  transcript: string;
  recordedAt: Date;
  timeZone: string;
  voiceOverwhelmed?: boolean;
}): ModeDecision {
  const hour = hourInZone(input.recordedAt, input.timeZone);
  const timeHint = timeHintFromHour(hour);
  const wordsHit = LISTEN_RE.test(input.transcript);
  const clockHit = timeHint === "late_night";
  const voiceHit = Boolean(input.voiceOverwhelmed);
  const overwhelmed = wordsHit || voiceHit || (clockHit && wordsHit);

  let why: ModeDecision["why"] = "words";
  const signals = [wordsHit, voiceHit, clockHit].filter(Boolean).length;
  if (signals > 1) why = "mixed";
  else if (voiceHit) why = "voice";
  else if (clockHit && !wordsHit) why = "clock";

  const mode: SessionMode = overwhelmed && !/\b(i have to|i need to|mujhe .+ karna)\b/i.test(input.transcript)
    ? "listen"
    : wordsHit || voiceHit
      ? "listen"
      : "next_steps";

  // Spoken mode can be listen while we still extract logistics later.
  const spokenListen = wordsHit || voiceHit || clockHit;
  return {
    mode: spokenListen ? "listen" : mode,
    confidence: spokenListen ? 0.72 : 0.6,
    why,
    overwhelmed: spokenListen,
    timeHint,
  };
}
