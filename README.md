# savor-bot 🌿

Savor community bot — drip-feeds organic activity (shares, likes, saves) to the community feed. Runs 24/7 on Render free tier with a password-protected web dashboard for monitoring and control.

---

## Dashboard

- **Pause / Resume** the bot instantly
- **Speed presets** — Quiet (slow), Normal, Active (fast) — multiplies all timing intervals
- **Activity log** — last 100 events in real time
- **URL pool** — paginated inventory view (25/50/100 rows), search, status/source filters, per-source counts, failed-URL retry, and manual URL add/remove
- **Pool safety** — consumed URLs are shown as protected history; destructive full-pool reset is tucked into a clearly labelled danger zone
- **Recipe sources** — enable/disable, preview, and manually trigger a harvest across all enabled sources
- **Stats** — total/active/used/failed/pending URL counts, bot shares, bot user count

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
| `RAILWAY_SCRAPER_URL` | Base URL of the existing Savor scraper/API |
| `BOT_SCRAPE_SECRET` | Secret accepted by the existing `/bot/scrape` endpoint |
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

Public identity follows Savor signup behaviour: about 90% of bot display names are simply a first name, while a small minority use a surname initial, full name, first initial + surname, or initials to reflect occasional user-edited/Google-account outliers. Because the active population is small, the cohort enforces a minimum outlier floor: with 10 active bots, at least one will use an outlier display-name format instead of leaving that entirely to chance. Usernames use several ordinary patterns.

Avatar assignment is also cohort-balanced instead of purely random: roughly 30% retain the normal Gravatar fallback, 20% use clean text initials, 40% use casual non-face Pexels images (pets, food, plants, places, etc.), and 10% use casual portrait photography. The initials use UI Avatars at a 50% font proportion with normal anti-aliased text and circular padding rather than the old pixel-font generator. Existing v4 initials URLs are refreshed in place without rerolling anyone's avatar type. Geometric identicons are no longer used. If a Pexels avatar lookup fails, that account falls back to clean initials rather than an identicon. Bot themes remain distributed across the three free themes: Tangerine, Cornflower and Burgundy.

Identity policy version 2 upgrades existing v3 personas once on first startup. It restores the recorded pre-persona bot name/avatar, reapplies only the visible identity policy, and leaves the persona's cuisine/source/activity behaviour untouched. This is what makes the improved avatar mix and visible name outlier take effect on bots that were already assigned persistent v3 personas.

Consumed source URLs are now recorded in `BotUrl`, so a successfully shared URL cannot re-enter the feed even when its public `sourceUrl` is stripped for a “Made with Savor” share. The original hand-written Savor seed recipes are also one-shot only; they are not recycled after the bank is exhausted.

### Recipe source discovery v5

The harvester no longer requires every publisher to have a hand-maintained sitemap structure and URL regex. Existing regexes remain optional high-confidence hints, but discovery now works in layers:

```text
site/homepage
  → robots.txt Sitemap declarations
  → common sitemap endpoints
  → recursive sitemap indexes (including .xml.gz)
  → RSS/Atom discovery
  → bounded recipe/archive link fallback
  → Schema.org Recipe validation where a URL is not already high-confidence
  → existing Savor /bot/scrape endpoint remains the final importer
```

This means a new source can be added from the dashboard with just a **name + website URL**. The old URL/child regex fields are still available as optional advanced hints, so the currently working sources are not thrown away.

The share picker also applies a source-diversity brake using the bot's last 10 consumed source URLs. A domain that has just appeared repeatedly is heavily down-weighted; unseen domains get a boost. This changes selection only — it does not alter Recipe or User schemas.

### Source-first sharing v6

External shares now choose the **source first, then a recipe within that source**. The existing URL pool is preserved in full; no migration, reset, or replacement is performed. A publisher with 400 unused URLs therefore does not receive 400 times the baseline selection opportunity of a publisher with 20 URLs.

Source selection is weighted by the bot persona plus the existing recent-source diversity brake. Inventory depth receives only a small capped bonus (about 1.08x at 10 unused URLs, 1.16x at 100, capped at 1.20x), so a healthy backlog helps a little without allowing large legacy pools to swamp newly enabled publishers. After a source wins, one of its unused URLs is selected uniformly.

Older migrated `BotUrl` rows may have an empty `note`; persona source preferences now fall back to the URL domain for those rows, so the existing pool participates correctly without a database migration.

### URL dashboard v7

The dashboard no longer downloads and renders the entire Mongo URL collection every 15 seconds. `/api/urls` is server-side paginated and defaults to **25 active URLs per page**. The pool can be searched and filtered by status or source, with 25/50/100 row page sizes. Summary counters show Total, Active, Used, Failed and Pending inventory; the source dropdown shows active/total counts per publisher.

Consumed URLs are intentionally presented as history rather than ordinary reset/delete rows because those records are the duplicate-prevention ledger. Failed URLs keep an explicit Retry action; active/pending URLs can still be removed. The pre-existing full-pool reset remains available only inside a labelled danger zone and warns that it also removes consumed history. Recipe Sources also exposes a **Harvest enabled sources** button backed by the existing `/api/harvest` route.

No URL documents are migrated, replaced or deleted by this dashboard upgrade. It is a management/API presentation change only.

The seed script now includes additional disabled homepage-only candidates. Re-run it safely (existing rows are skipped):

```bash
node scripts/seed-sites.js
```

Then diagnose disabled candidates from the **deployed bot environment**:

```bash
npm run verify-sites
```

The report separates discovery from the final Savor scrape, for example:

```text
Smitten Kitchen
  sitemaps          4 fetched / 620 URLs
  feeds             1 fetched / 20 URLs
  recipe schema     4/7 checked
  candidates        5
  Savor scrape      ✓ recipe name
```

To inspect enabled and disabled sources together:

```bash
npm run verify-sites -- --all
```

Only after a disabled source both discovers candidates **and** successfully passes `/bot/scrape`, enable it automatically:

```bash
npm run verify-sites -- --enable
```

`--enable` stays conservative: if scraper credentials are unavailable or the final Savor scrape fails, the source remains disabled.

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
  verify-sites.js   — diagnose discovery vs Savor scrape; optionally enable passing sources
  rollback-personas.js — optional restoration of pre-persona bot identity fields
```
