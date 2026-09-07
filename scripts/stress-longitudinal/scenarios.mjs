/**
 * Hidden ground truth for longitudinal stress test.
 * Evaluator-only — never injected into AthleteOS prompts.
 */
export const BUILD_COMMIT = "occurrence-ledger-local";

export const HIDDEN = {
  A: {
    id: "A",
    phenomenon:
      "Becomes tentative / protective with shot selection when gaining control or leading in a match",
    occurrences: [
      { conversation: 2, episode: "League match — led 4-1 then guided forehand", seedHint: "A1" },
      { conversation: 6, episode: "Practice set — broke early then played safer", seedHint: "A2" },
      { conversation: 10, episode: "Club match — opponent under pressure then tried not to miss", seedHint: "A3" },
    ],
  },
  B: {
    id: "B",
    phenomenon:
      "Late-session timing/fatigue when warm-up or preparation was rushed or shortened",
    occurrences: [
      { conversation: 4, episode: "Tuesday practice — legs heavy late after 8-minute warm-up", seedHint: "B1" },
      { conversation: 9, episode: "Friday match — third-set timing lag after abbreviated prep", seedHint: "B2" },
      { conversation: 13, episode: "Morning session — body late when skipped proper warm-up", seedHint: "B3" },
    ],
  },
  C: {
    id: "C",
    phenomenon:
      "Pre-match overthinking / disrupted pre-point routine before important competitive moments",
    occurrences: [
      { conversation: 7, episode: "Before tournament match — mind racing through serve locations", seedHint: "C1" },
      { conversation: 12, episode: "College dual — routine broken, overthought return targets", seedHint: "C2" },
      { conversation: 15, episode: "Qualifier — skipped bounce ritual, head crowded before first serve", seedHint: "C3" },
    ],
  },
  sameEventTrap: {
    description: "Saturday match vs Rivera — one event referenced in three conversations",
    conversations: [3, 7, 11],
  },
  multiEvidenceTrap: {
    description:
      "Conversation 10 — three phrasings of the same A3 episode (must remain one occurrence)",
    conversation: 10,
  },
};

export const CONVERSATIONS = [
  {
    n: 1,
    tags: ["unrelated"],
    turns: [
      "Had a solid practice today. Worked crosscourt forehands for like forty minutes. Ball was coming through clean when I stayed low.",
      "Wind was annoying on the ad side. Kept misjudging depth on floaty balls. Nothing crazy, just messy.",
      "Ended with some serve-plus-one. First serve percentage felt okay. Think I’m sleeping alright this week.",
    ],
  },
  {
    n: 2,
    tags: ["A1", "distractor"],
    turns: [
      "Played a league match last night. Weird one. I got up 4-1 and suddenly started guiding the forehand instead of hitting through it.",
      "Also tried a new string tension, 52 instead of 50. Not sure I loved it. Felt a bit boardy on blocks.",
      "After that 4-1 lead I was mostly thinking about not giving the break back. Points got shorter, I got careful. Still won but it felt ugly.",
    ],
  },
  {
    n: 3,
    tags: ["same_event_trap_1", "distractor"],
    turns: [
      "Saturday I played Rivera at the club. Tough match. He kept changing pace and I got stuck reacting late on the backhand.",
      "Shoulder felt a little tight after — once, not like an injury thing. Just tight.",
      "That Rivera match is stuck in my head. Second set I had chances and didn’t take them. Slept badly that night too.",
    ],
  },
  {
    n: 4,
    tags: ["B1", "distractor"],
    turns: [
      "Tuesday practice. I only warmed up like eight minutes because I was late from class. First hour was fine.",
      "Late in the session my legs felt heavy and my timing on the return was just… late. Not sore exactly, just behind the ball.",
      "Coach had us do a lot of approach volumes. I argued with him once about drill order, whatever. The late timing thing bothered me more.",
    ],
  },
  {
    n: 5,
    tags: ["unrelated"],
    turns: [
      "Worked backhand slice today. Trying to keep it lower through the hitting zone.",
      "Footwork was poor in one drill when we switched to open-court recovery. Just that block though.",
      "Confidence was fine. Nothing big emotionally. Kind of a normal training day.",
    ],
  },
  {
    n: 6,
    tags: ["A2"],
    turns: [
      "Scrimmage set with Marcus. Once I broke early I stopped going through my shots and played safer. Like I was protecting the break.",
      "Movement was okay. Serve was mixed. I kept choosing the higher-percentage ball even when I had time to rip it.",
      "Not sure if that’s smart tennis or just me getting careful when I’m ahead. Felt different from when I’m chasing.",
    ],
  },
  {
    n: 7,
    tags: ["C1", "same_event_trap_2"],
    turns: [
      "Tournament tomorrow. Before practice points today my head was already listing serve spots — wide, body, T — like a checklist I couldn’t shut off.",
      "Also keep replaying that Saturday Rivera match. Specifically the game where I missed the easy forehand volley at 30-30. Same match, just another detail that bugs me.",
      "Skipped breakfast this morning which was dumb. But the pre-point overthinking before the tournament is what’s loudest.",
    ],
  },
  {
    n: 8,
    tags: ["unrelated", "distractor"],
    turns: [
      "Travel day. Just light hitting in a weird indoor court with low ceiling.",
      "Served unusually well for twenty minutes for no obvious reason. Then it went back to normal.",
      "Mostly tired from the trip. No drama. Short session.",
    ],
  },
  {
    n: 9,
    tags: ["B2"],
    turns: [
      "Friday match. I abbreviated the warm-up again — five minutes rally, couple serves — because the courts were late.",
      "First two sets were competitive. Third set my timing fell apart. Returns were late, first step slow, like my body arrived after the bounce.",
      "Wasn’t a fitness collapse exactly. More like I never got fully organized before we started and it showed late.",
    ],
  },
  {
    n: 10,
    tags: ["A3", "multi_evidence_trap"],
    turns: [
      "Club match today. I had him under pressure, then caught myself trying not to miss instead of finishing points.",
      "Same stretch — I got tight around 4-2. My forehand became tentative. I stopped accelerating through contact.",
      "Conditions were fine, not windy. Just that pocket of the match where I was ahead and got small with the swing.",
    ],
  },
  {
    n: 11,
    tags: ["same_event_trap_3", "distractor"],
    turns: [
      "Still thinking about Saturday versus Rivera. Remembered he kept hitting heavy to my backhand corner right after I missed that volley. Same match.",
      "Tried a different grip tape today. Minor thing.",
      "Practice intensity was okay. No big story besides that Rivera detail popping up again.",
    ],
  },
  {
    n: 12,
    tags: ["C2", "distractor"],
    turns: [
      "College dual meet. Before the first return game I overthought targets — deep middle, chip wide — and my bounce-hit ritual got messy.",
      "Once the point started I was fine-ish, but the first two return games felt noisy in my head.",
      "Unusually windy on court 3. That didn’t help. But the routine disruption was before the wind mattered.",
    ],
  },
  {
    n: 13,
    tags: ["B3"],
    turns: [
      "Morning session. Skipped a proper warm-up because I wanted extra serve reps. Felt okay early.",
      "By the last thirty minutes my body was late on everything — split step timing, contact point on the forehand, even simple volleys.",
      "I’m noticing this more when I cut corners before we start. Not every day, but when prep is thin.",
    ],
  },
  {
    n: 14,
    tags: ["unrelated", "distractor"],
    turns: [
      "New shoes. Got a blister on the right heel. Annoying.",
      "Otherwise just maintenance hitting. Worked kick serve out wide.",
      "Minor confidence dip after a few double faults in a row, then it passed. One-off.",
    ],
  },
  {
    n: 15,
    tags: ["C3"],
    turns: [
      "Qualifier match. I skipped my usual bounce ritual before the first couple serves. Head was crowded with score, opponent’s return stance, everything.",
      "Serve locations felt forced. Not mechanical — more like I was deciding too late under that pre-point noise.",
      "After I settled into a simpler routine mid-set it calmed down. The start was the problem.",
    ],
  },
  {
    n: 16,
    tags: ["blind_ordinary"],
    turns: [
      "Regular practice day. Mixed hitting, some points with the freshmen.",
      "Forehand felt a bit off in the first basket then normalized. Nothing special.",
      "Coach talked about scheduling next week. I’m mostly curious what you make of how training’s been going lately.",
    ],
  },
  {
    n: 17,
    tags: ["contextual_retrieval_A"],
    turns: [
      "Match this afternoon. Midway through the second set I was up a break and caught myself choosing safer shapes — higher arcs, less risk — even when I had looks to finish.",
      "Not panicked. Just… protective. Like finishing points suddenly felt optional.",
      "Wondering what you’d ask about from that stretch. I’m not sure how to think about it.",
    ],
  },
  {
    n: 18,
    tags: ["explicit_memory_query"],
    turns: [
      "Looking across what I’ve told you over time, is there anything you think I might be missing?",
      "You can be direct. I want the honest read from everything we’ve covered, not just today.",
      "If something keeps showing up in different forms, say so — carefully is fine.",
    ],
  },
];
