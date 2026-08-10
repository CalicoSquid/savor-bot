# savor-bot 🌿

Savor community bot — drip-feeds organic activity (shares, likes, saves) to the community feed. Runs 24/7 on Render free tier with a password-protected web dashboard for monitoring and control.

---

## Dashboard

- **Pause / Resume** the bot instantly
- **Speed presets** — Quiet (slow), Normal, Active (fast) — multiplies all timing intervals
- **Activity log** — last 100 events in real time
- **URL pool** — add/remove/reset scrape URLs without touching the code
- **Stats** — active URLs, bot shares, bot user count

---

## Deploy to Render

### 1. Create the service

1. Go to [render.com](https://render.com) → New → **Background Worker**
2. Connect your GitHub repo (`savor-bot`)
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free

### 2. Set environment variables

In Render → Environment → Add the following:

| Variable | Value |
|---|---|
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `PEXELS_API_KEY` | Your Pexels API key |
| `BOT_ADMIN_PASSWORD` | Your chosen dashboard password |

### 3. Deploy

Click **Deploy**. Render will install deps and start the process. The dashboard will be live at your Render service URL (e.g. `https://savor-bot.onrender.com`).

---

## Migrate existing bot-urls.json

Run once after first deploy to import your existing URL pool into MongoDB:

```bash
MONGODB_URI=your_uri node scripts/migrate-urls.js /path/to/bot-urls.json
```

After that, manage URLs entirely through the dashboard.

---

## Local dev / dry run

```bash
cp .env.example .env   # fill in your vars
npm run dev            # runs with --dry-run (no writes)
```

---


## Organic bot personas

Bot accounts now keep a small persistent persona in MongoDB. The persona affects who acts, which recent recipes they prefer to like/save, which source sites they tend to share from, how often they present a fresh scrape as “Made with Savor”, and their stable public identity.

Public identity follows Savor signup behaviour: about 90% of bot display names are simply a first name, while a small minority use a surname initial, full name, first initial + surname, or initials to reflect occasional user-edited/Google-account outliers. Usernames use several ordinary patterns. Avatars are mixed too: some accounts keep the existing Gravatar fallback, some use a locally generated initials PNG, some use a Gravatar identicon, and some receive a stable non-face Pexels photo (pets, food, plants, landscapes, etc.). Existing custom avatars are never overwritten. Bot themes are distributed across the three free themes: Tangerine, Cornflower and Burgundy.

Consumed source URLs are now recorded in `BotUrl`, so a successfully shared URL cannot re-enter the feed even when its public `sourceUrl` is stripped for a “Made with Savor” share. The original hand-written Savor seed recipes are also one-shot only; they are not recycled after the bank is exhausted.

### Verify more recipe sources

The repo contains additional disabled candidates. First, safely re-run the existing seeder so any candidates added since the original deploy exist in MongoDB (existing rows are skipped):

```bash
node scripts/seed-sites.js
```

Then test disabled candidates from the same environment as the bot without changing anything:

```bash
npm run verify-sites
```

If the results look good, enable only candidates that actually return matching recipe URLs:

```bash
npm run verify-sites -- --enable
```

The bot’s persona source preferences already include these candidates, so newly enabled sources begin contributing automatically.

### Optional profile rollback

Persona creation records each bot's previous name, theme and avatar before changing it. If you want to restore those profile fields as well as rolling the code back, run this while the upgraded code is still deployed:

```bash
npm run rollback-personas
```

This only restores bot identity fields and removes persona records. It does not delete recipes, likes, saves or other activity that happened while the bot was running.

---

## Speed settings

| Setting | Share interval | Like interval | Save interval |
|---|---|---|---|
| 🐢 Quiet | 7.5–15 hrs | 50–112 mins | 87–175 mins |
| 🚶 Normal | 3–6 hrs | 20–45 mins | 35–70 mins |
| 🐇 Active | 72–144 mins | 8–18 mins | 14–28 mins |

Speed changes take effect on the **next scheduled action** (no restart needed).

---

## Architecture

```
src/
  index.js          — entry point (starts bot + dashboard)
  bot.js            — bot loop, scraper, actions
  server.js         — Express dashboard
  activityLog.js    — in-memory log (shared between bot and server)
  models/
    BotConfig.js    — speed/pause config in MongoDB
    BotUrl.js       — URL pool + permanent consumed tracking in MongoDB
    BotPersona.js   — persistent bot identity/taste/behaviour
    Recipe.js       — mirrors main server schema
    UserFB.js       — mirrors main server schema
  personas.js      — persona templates, weighting + organic avatar generation
  data/
    recipes.js      — hand-crafted Savor recipes + name pool
scripts/
  migrate-urls.js   — one-time import from bot-urls.json
  verify-sites.js   — test/optionally enable disabled sitemap sources
  rollback-personas.js — optional restoration of pre-persona bot identity fields
```
