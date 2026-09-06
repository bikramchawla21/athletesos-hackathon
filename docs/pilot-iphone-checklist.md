# iPhone PWA pilot checklist (founder)

Run on a physical iPhone after each deploy. Safari + Add to Home Screen.

## Install / auth

1. Open production URL in **Safari** (not Chrome).
2. Sign in with a pilot athlete account.
3. Share → **Add to Home Screen** → open from icon (standalone).
4. Confirm home copy is exactly: **Talk about how your day went.**
5. Force-quit and reopen from Home Screen — still signed in (Clerk session).

## Voice loop

6. Tap mic → allow microphone if prompted.
7. Speak ~10–20s about training → stop.
8. Confirm status moves through understanding → AthleteOS speaks.
9. Reply once more (second turn).
10. When asked “Anything else from today?”, say “No, that’s it.” **or** tap **Done**.
11. Confirm finalizing → spoken synthesis plays.
12. Answer **Did you already know this?** (or skip).
13. Confirm **Done for today.**

## Failure / retry

14. Enable Airplane Mode mid-upload → see retry; disable Airplane → retry without re-recording if possible.
15. If TTS fails: confirm text/retry audio works and conversation is still saved.
16. Background the app during listening, return, continue or retry.

## Data / next day

17. Close app. Reopen. Confirm finished or recoverable mid-session (last assistant text if unfinished).
18. Start a **new** talk session — memory should still feel continuous; conversation is new.
19. Open History (classic) — prior messages/reflection still present.

## Update

20. After a new Vercel deploy, reopen PWA — if update banner appears, tap **Update**, confirm app still works.

## Isolation spot-check

21. Sign in as Athlete B on another device/account — zero access to Athlete A content.

**Note:** This checklist is for founder hardware validation. Automated CI does not replace it.
