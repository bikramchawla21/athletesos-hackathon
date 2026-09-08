# Sayana

Whatsup? Aur Bata.

A listen-first PWA. Your dumps stay in your vault. A friend’s account is another vault.

```bash
cd sayana
cp ../.env.local .env.local   # DATABASE_URL + OPENAI_API_KEY
npm install
npm run dev                   # http://localhost:3100
```

Install on the phone (Add to Home Screen) for lock-screen Web Push after you allow notifications.

## Data

See [DATA.md](DATA.md). Tables are prefixed `sayana_` so they never collide with AthleteOS on the same Neon database.
