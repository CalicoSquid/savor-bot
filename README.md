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
    BotUrl.js       — URL pool in MongoDB
    Recipe.js       — mirrors main server schema
    UserFB.js       — mirrors main server schema
  data/
    recipes.js      — hand-crafted Savor recipes + name pool
scripts/
  migrate-urls.js   — one-time import from bot-urls.json
```
