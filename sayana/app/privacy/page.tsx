import { Nav } from "@/components/Nav";

export default function PrivacyPage() {
  return (
    <main className="shell">
      <Nav current="privacy" />
      <h1>Privacy</h1>
      <section className="card">
        <h2>Where memory lives</h2>
        <p>
          Your vault is Postgres rows plus audio metadata, keyed by your Sayana person id. A friend’s login or
          device cookie is a different id. Dumps do not mix.
        </p>
        <p>
          Speech is sent over HTTPS to Sayana, then to OpenAI’s API for transcription and extract — not a public
          ChatGPT thread. Subprocessors: Neon (database), Vercel (host), OpenAI (STT/chat), Clerk if you sign in
          with it, Google only if you connect Calendar later.
        </p>
      </section>
      <section className="card">
        <h2>How you can tell</h2>
        <p>
          <a href="/api/v1/export">Export your vault (JSON)</a>. Delete is account-scoped. Recap and share cards
          only read your id. We don’t sell rants or put them in ads.
        </p>
        <p className="quiet">
          Honesty: hosted transcription has to read the audio. This is not zero-knowledge encryption. Operators
          with production access could in theory touch data, like any hosted app. We don’t use your rants in
          marketing.
        </p>
      </section>
      <section className="card">
        <h2>Lock-screen reminders</h2>
        <p>
          After you install Sayana and allow notifications, remaining Today steps can show as a normal OS
          notification (Android lock screen; iPhone needs Add to Home Screen, iOS 16.4+, permission inside the
          installed PWA).
        </p>
      </section>
    </main>
  );
}
