"use strict";

const mongoose = require("mongoose");
const axios = require("axios");

const Recipe = require("./models/Recipe");
const UserFb = require("./models/UserFB");
const BotUrl = require("./models/BotUrl");
const BotConfig = require("./models/BotConfig");
const { FIRST_NAMES, SAVOR_RECIPES } = require("./data/recipes");
const { addEntry } = require("./activityLog");


// ── CLI flags ─────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");

// ── Timing config (ms) ────────────────────────────────────────────────────────
const SPEED_MULTIPLIERS = {
  quiet: 2.5,
  normal: 1.0,
  active: 0.4,
};

const BASE_TIMINGS = {
  shareMin: 180 * 60 * 1000,
  shareMax: 360 * 60 * 1000,
  likeMin: 20 * 60 * 1000,
  likeMax: 45 * 60 * 1000,
  saveMin: 35 * 60 * 1000,
  saveMax: 70 * 60 * 1000,
};

// Harvest runs independently of speed — always every 2–4 days
const HARVEST_MIN = 2 * 24 * 60 * 60 * 1000;
const HARVEST_MAX = 4 * 24 * 60 * 60 * 1000;
const HARVEST_PER_SITE = 30;

// ── Sitemap sources ───────────────────────────────────────────────────────────
const SITEMAPS = [
  // ── Confirmed working from Railway IP ─────────────────────────────────────
  {
    name: "BBC Good Food",
    url: "https://www.bbcgoodfood.com/sitemap.xml",
    index: true,
    childPattern: /sitemap[^"'<]*recipe/i,
    urlPattern: /bbcgoodfood\.com\/recipes\/[a-z0-9-]{5,}/,
  },
  {
    name: "Pinch of Yum",
    url: "https://pinchofyum.com/sitemap_index.xml",
    index: true,
    childPattern: /post-sitemap/i,
    urlPattern: /pinchofyum\.com\/[a-z0-9-]{5,}/,
  },

  // ── Worth trying — may work from Railway IP ────────────────────────────────
  {
    name: "AllRecipes",
    url: "https://www.allrecipes.com/sitemap.xml",
    index: true,
    childPattern: /sitemap[^"'<]*recipe/i,
    urlPattern: /allrecipes\.com\/recipe\/\d+/,
  },
  {
    name: "Simply Recipes",
    url: "https://www.simplyrecipes.com/sitemap_index.xml",
    index: true,
    childPattern: /post-sitemap/i,
    urlPattern: /simplyrecipes\.com\/recipes\//,
  },
  {
    name: "Budget Bytes",
    url: "https://www.budgetbytes.com/sitemap_index.xml",
    index: true,
    childPattern: /post-sitemap/i,
    urlPattern: /budgetbytes\.com\/[a-z0-9-]{5,}\//,
  },
  {
    name: "Cookie and Kate",
    url: "https://cookieandkate.com/sitemap_index.xml",
    index: true,
    childPattern: /post-sitemap/i,
    urlPattern: /cookieandkate\.com\/[a-z0-9-]{5,}\//,
  },
  {
    name: "Taste of Home",
    url: "https://www.tasteofhome.com/sitemap_index.xml",
    index: true,
    childPattern: /post-sitemap/i,
    urlPattern: /tasteofhome\.com\/recipes\/[a-z0-9-]{5,}\//,
  },
  {
    name: "Taste (AU)",
    url: "https://www.taste.com.au/sitemap_index.xml",
    index: true,
    childPattern: /recipe/i,
    urlPattern: /taste\.com\.au\/recipes\/[a-z0-9-]{5,}/,
  },
  {
    name: "Jamie Oliver",
    url: "https://www.jamieoliver.com/sitemap.xml",
    index: true,
    childPattern: /recipe/i,
    urlPattern: /jamieoliver\.com\/recipes\/[a-z0-9-]{5,}/,
  },
  {
    name: "BBC Food",
    url: "https://www.bbc.co.uk/food/sitemap.xml",
    index: false,
    childPattern: null,
    urlPattern: /bbc\.co\.uk\/food\/recipes\/[a-z0-9_]{5,}/,
  },
  {
    name: "Delish",
    url: "https://www.delish.com/sitemap.xml",
    index: true,
    childPattern: /recipe/i,
    urlPattern: /delish\.com\/cooking\/recipe-ideas\/[a-z0-9-]{5,}/,
  },
  {
    name: "Food Network",
    url: "https://www.foodnetwork.com/sitemap.xml",
    index: true,
    childPattern: /recipe/i,
    urlPattern: /foodnetwork\.com\/recipes\/[a-z0-9-]{5,}/,
  },
];

const BOT_COUNT = 10;
const MAX_FAIL_COUNT = 3;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(emoji, type, message, detail = "") {
  const ts = new Date().toISOString();
  console.log(`${ts}  ${emoji}  ${message}${detail ? `  — ${detail}` : ""}`);
  addEntry(type, message, detail);
}

async function getTimings() {
  const config = await BotConfig.get();
  const m = SPEED_MULTIPLIERS[config.speed] || 1.0;
  return {
    shareMin: BASE_TIMINGS.shareMin * m,
    shareMax: BASE_TIMINGS.shareMax * m,
    likeMin: BASE_TIMINGS.likeMin * m,
    likeMax: BASE_TIMINGS.likeMax * m,
    saveMin: BASE_TIMINGS.saveMin * m,
    saveMax: BASE_TIMINGS.saveMax * m,
  };
}

const is403 = (err) => err?.response?.status === 403 || err?.is403;
const is404 = (err) => err?.response?.status === 404 || err?.is404;

const getDomain = (url) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
};

// ── Pexels ────────────────────────────────────────────────────────────────────
async function fetchPexelsImage(query) {
  try {
    const res = await axios.get("https://api.pexels.com/v1/search", {
      headers: { Authorization: process.env.PEXELS_API_KEY },
      params: { query, per_page: 3, orientation: "landscape" },
      timeout: 8000,
    });
    const photos = res.data?.photos;
    if (!photos?.length) return { url: null, credit: null };
    const photo = photos[Math.floor(Math.random() * photos.length)];
    return {
      url: photo.src.large,
      credit: {
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
      },
    };
  } catch {
    return { url: null, credit: null };
  }
}

// ── URL management ────────────────────────────────────────────────────────────
async function markUrlFailed(urlStr) {
  const entry = await BotUrl.findOne({ url: urlStr });
  if (!entry) return;
  entry.failCount = (entry.failCount || 0) + 1;
  if (entry.failCount >= MAX_FAIL_COUNT) {
    entry.failed = true;
    log(
      "🚫",
      "warn",
      `URL permanently failed after ${MAX_FAIL_COUNT} attempts`,
      urlStr.slice(0, 60),
    );
  } else {
    log(
      "⚠️",
      "warn",
      `URL fail count: ${entry.failCount}/${MAX_FAIL_COUNT}`,
      urlStr.slice(0, 60),
    );
  }
  await entry.save();
}

async function markUrlSuccess(urlStr) {
  await BotUrl.findOneAndUpdate({ url: urlStr }, { failCount: 0 });
}

async function markUrlDead(urlStr) {
  await BotUrl.findOneAndUpdate(
    { url: urlStr },
    { failed: true, failCount: MAX_FAIL_COUNT },
  );
}

// ── Bot user management ───────────────────────────────────────────────────────
function assignMaxShares() {
  const roll = Math.random();
  if (roll < 0.3) return rand(1, 3);   // 30% casual — leaves quickly
  if (roll < 0.8) return rand(5, 20);  // 50% regular
  return rand(25, 60);                  // 20% power user
}

// Retire a bot user — flag as inactive rather than deleting, so shared
// recipes retain a valid user reference and display correctly in the feed.
async function retireBot(user) {
  log("👋", "info", `Bot @${user.username} retiring after ${user.shareCount} shares`);
  if (!DRY_RUN) {
    await UserFb.findByIdAndUpdate(user._id, {
      isSeedUser: false,
      maxShares: -1, // prevents re-retirement check from ever firing
    });
  }
  // Pool refills itself on next ensureBotUsers() call
}

async function ensureBotUsers() {
  // Active bots only: maxShares > 0 (retired bots have maxShares: -1)
  const existing = await UserFb.find({
    firebaseUID: /^bot_user_/,
    maxShares: { $gt: 0 },
  });

  if (existing.length >= BOT_COUNT) {
    log("👥", "info", `${existing.length} bot users ready`);
    return existing;
  }

  const needed = BOT_COUNT - existing.length;
  const usedNames = new Set(existing.map((u) => u.username));
  const created = [];

  log("👥", "info", `Creating ${needed} new bot users...`);

  for (let i = 0; i < needed; i++) {
    let firstName,
      username,
      attempts = 0;
    do {
      firstName = pick(FIRST_NAMES);
      username = `${firstName.toLowerCase().replace(/[^a-z]/g, "")}${rand(100, 9999)}`;
      attempts++;
      if (attempts > 50) break;
    } while (usedNames.has(username));

    usedNames.add(username);
    const index = existing.length + created.length;

    const user = new UserFb({
      firebaseUID: `bot_user_${username}_${Date.now()}_${index}`,
      username,
      email: `${username}.bot@savor.internal`,
      name: firstName,
      theme: "Tangerine",
      isSeedUser: true,
      shareCount: 0,
      maxShares: assignMaxShares(),
    });

    if (!DRY_RUN) await user.save();
    created.push(user);
    log(
      "  ✓",
      "info",
      `${firstName} (@${username}) — lifespan: ${user.maxShares} shares`,
    );
  }

  return [...existing, ...created];
}

// ── Scraper ───────────────────────────────────────────────────────────────────
async function scrapeUrl(url) {
  const res = await axios.post(
    `${process.env.RAILWAY_SCRAPER_URL}/bot/scrape`,
    { url },
    {
      headers: {
        "x-bot-secret": process.env.BOT_SCRAPE_SECRET,
        "Content-Type": "application/json",
      },
      timeout: 45000,
    },
  );

  if (!res.data?.ok || !res.data?.recipe) {
    throw new Error(res.data?.error || "No recipe returned");
  }

  const r = res.data.recipe;
  if (!r.name) throw new Error("No name extracted");
  if (!r.ingredients?.length) throw new Error("No ingredients");

  // If Railway returned no image, try Pexels
  const isDefaultImage = !r.image || r.image.startsWith("data:image/png;base64");
  let imageUrl = isDefaultImage ? null : r.image;
  let imageCredit = r.imageCredit || null;

  if (!imageUrl) {
    log("🖼️", "info", "No image from scraper — trying Pexels", r.name);
    const pexels = await fetchPexelsImage(r.name);
    imageUrl = pexels.url;
    imageCredit = pexels.credit;
  }

  return { ...r, image: imageUrl, imageCredit };
}

// ── URL Harvester ─────────────────────────────────────────────────────────────
async function fetchXml(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: BROWSER_HEADERS,
      responseType: "text",
    });
    return data;
  } catch {
    return null;
  }
}

function extractLocs(xml) {
  const matches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
  return matches.map((m) => m.replace(/<\/?loc>/g, "").trim());
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function harvestUrls() {
  log("🌾", "info", "Starting URL harvest...");

  const existing = new Set(
    (await BotUrl.find({}, "url").lean()).map((e) => e.url),
  );

  let totalAdded = 0;

  for (const site of SITEMAPS) {
    try {
      log("📡", "info", "Harvesting sitemap", site.name);

      let recipeUrls = [];

      if (site.index) {
        const indexXml = await fetchXml(site.url);
        if (!indexXml) {
          log("⚠️", "warn", "Could not fetch sitemap index", site.name);
          continue;
        }

        const childUrls = extractLocs(indexXml).filter((u) =>
          site.childPattern.test(u),
        );

        if (!childUrls.length) {
          log("⚠️", "warn", "No matching child sitemaps found", site.name);
          continue;
        }

        for (const childUrl of childUrls) {
          await sleep(1000 + rand(0, 1000));
          const childXml = await fetchXml(childUrl);
          if (!childXml) continue;
          const urls = extractLocs(childXml).filter((u) =>
            site.urlPattern.test(u),
          );
          recipeUrls.push(...urls);
        }
      } else {
        const xml = await fetchXml(site.url);
        if (!xml) {
          log("⚠️", "warn", "Could not fetch sitemap", site.name);
          continue;
        }
        recipeUrls = extractLocs(xml).filter((u) => site.urlPattern.test(u));
      }

      const fresh = recipeUrls.filter((u) => !existing.has(u));

      if (!fresh.length) {
        log("ℹ️", "info", "No new URLs found", site.name);
        continue;
      }

      const sample = shuffle(fresh).slice(0, HARVEST_PER_SITE);

      if (DRY_RUN) {
        log("🟡", "info", `[DRY RUN] Would add ${sample.length} URLs`, site.name);
        continue;
      }

      let added = 0;
      for (const url of sample) {
        try {
          await BotUrl.create({
            url,
            verified: new Date().toISOString().slice(0, 10),
            failed: false,
            failCount: 0,
            note: site.name,
          });
          existing.add(url);
          added++;
        } catch (err) {
          if (err.code !== 11000)
            log("⚠️", "warn", "Failed to insert URL", err.message);
        }
      }

      totalAdded += added;
      log(
        "✅",
        "info",
        `Added ${added} new URLs from ${site.name}`,
        `(${fresh.length} fresh found, ${recipeUrls.length} total in sitemap)`,
      );
    } catch (err) {
      log("❌", "error", `Harvest error for ${site.name}`, err.message);
    }

    await sleep(2000 + rand(0, 2000));
  }

  log(
    "🌾",
    "info",
    `Harvest complete — ${totalAdded} new URLs added across all sites`,
  );
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function doShare(botUsers) {
  const roll = Math.random();

  // 10% → hand-crafted Savor recipe
  if (roll < 0.1) {
    const savor = { ...pick(SAVOR_RECIPES) };
    const user = pick(botUsers);
    const pexels = await fetchPexelsImage(savor.name);
    savor.image = pexels.url;
    savor.imageCredit = pexels.credit;

    if (DRY_RUN) {
      log("🟡", "info", `[DRY RUN] Would share Savor recipe "${savor.name}"`, `by ${user.name}`);
      return;
    }

    try {
      const personal = new Recipe({
        ...savor,
        user: user._id,
        isShared: false,
        canShare: true,
      });
      await personal.save();
      const shared = new Recipe({
        ...savor,
        user: user._id,
        isShared: true,
        canShare: true,
        originalRecipeId: personal._id,
        originalAuthorId: user._id,
        sharedAt: new Date(),
      });
      await shared.save();
      personal.sharedVersionId = shared._id;
      await personal.save();
      user.recipes.push(personal._id);
      user.shareCount = (user.shareCount || 0) + 1;
      await user.save();
      log("🍴", "share", `Shared "${shared.name}"`, `by ${user.name} (@${user.username})`);
      if (user.shareCount >= user.maxShares) await retireBot(user);
    } catch (err) {
      log("❌", "error", `Failed to save Savor recipe "${savor.name}"`, err.message);
    }
    return;
  }

  // For both remaining paths we need a URL from the pool
  const available = await BotUrl.find({ verified: { $ne: null }, failed: false });
  if (!available.length) {
    log("ℹ️", "info", "No available URLs — add more via the dashboard");
    return;
  }

  const sharedUrls = await Recipe.distinct("sourceUrl", {
    isShared: true,
    sourceUrl: { $ne: null },
  });
  const fresh = available.filter((e) => !sharedUrls.includes(e.url));

  if (!fresh.length) {
    log("ℹ️", "info", "All URLs already shared — add more via the dashboard");
    return;
  }

  const entry = pick(fresh);
  const user = pick(botUsers);

  log("📡", "info", "Scraping", `${getDomain(entry.url)} for ${user.name}`);

  let recipeData;
  try {
    recipeData = await scrapeUrl(entry.url);
    await markUrlSuccess(entry.url);
  } catch (err) {
    if (is403(err)) {
      log("⏭️", "warn", "Rate limited — skipping this cycle", getDomain(entry.url));
    } else if (is404(err)) {
      log("🗑️", "warn", "URL is dead — marking failed", getDomain(entry.url));
      await markUrlDead(entry.url);
    } else {
      log("❌", "error", "Scrape failed", err.message);
      await markUrlFailed(entry.url);
    }
    return;
  }

  if (!recipeData?.name) {
    log("❌", "error", "No name extracted — skipping");
    await markUrlFailed(entry.url);
    return;
  }

  // 17% → "Made with Savor" — real scraped data, stripped to look user-typed
  if (roll < 0.27) {
    const pexels = await fetchPexelsImage(recipeData.name);
    recipeData.sourceUrl = null;
    recipeData.author = null;
    recipeData.image = pexels.url;
    recipeData.imageCredit = pexels.credit;
    recipeData.scrapedWithAI = true;
    log("🍴", "info", `Presenting as Made with Savor`, recipeData.name);
  }

  if (DRY_RUN) {
    log("🟡", "info", `[DRY RUN] Would share "${recipeData.name}"`, `by ${user.name} (@${user.username})`);
    return;
  }

  try {
    const personal = new Recipe({
      ...recipeData,
      user: user._id,
      isShared: false,
      canShare: true,
    });
    await personal.save();
    const shared = new Recipe({
      ...recipeData,
      user: user._id,
      isShared: true,
      canShare: true,
      originalRecipeId: personal._id,
      originalAuthorId: user._id,
      sharedAt: new Date(),
    });
    await shared.save();
    personal.sharedVersionId = shared._id;
    await personal.save();
    user.recipes.push(personal._id);
    user.shareCount = (user.shareCount || 0) + 1;
    await user.save();
    log("✅", "share", `Shared "${shared.name}"`, `by ${user.name} (@${user.username})`);
    if (user.shareCount >= user.maxShares) await retireBot(user);
  } catch (err) {
    log("❌", "error", `Failed to save "${recipeData?.name}"`, err.message);
  }
}

async function doLike(botUsers) {
  const user = pick(botUsers);
  const recipes = await Recipe.find({
    isShared: true,
    user: { $ne: user._id },
    _id: { $nin: user.likedRecipes },
  })
    .sort({ sharedAt: -1 })
    .limit(30);

  if (!recipes.length) {
    log("ℹ️", "info", "No unliked recipes available", `for ${user.username}`);
    return;
  }

  const recipe = pick(recipes);

  if (DRY_RUN) {
    log("🟡", "info", `[DRY RUN] Would like "${recipe.name}"`, `by ${user.name}`);
    return;
  }

  recipe.likedBy.push(user._id);
  await recipe.save();
  user.likedRecipes.push(recipe._id);
  await user.save();

  log("❤️", "like", `Liked "${recipe.name}"`, `by ${user.name} (@${user.username})`);
}

async function doSave(botUsers) {
  const user = pick(botUsers);
  const recipes = await Recipe.find({
    isShared: true,
    user: { $ne: user._id },
    _id: { $nin: user.savedRecipes },
  })
    .sort({ sharedAt: -1 })
    .limit(30);

  if (!recipes.length) {
    log("ℹ️", "info", "No unsaved recipes available", `for ${user.username}`);
    return;
  }

  const recipe = pick(recipes);

  if (DRY_RUN) {
    log("🟡", "info", `[DRY RUN] Would save "${recipe.name}"`, `by ${user.name} (@${user.username})`);
    return;
  }

  const alreadySaved = await Recipe.exists({
    user: user._id,
    sourceRecipeId: recipe._id,
  });
  if (alreadySaved) {
    log("ℹ️", "info", `Already saved "${recipe.name}" — skipping`, user.username);
    return;
  }

  const copy = new Recipe({
    ...recipe.toObject(),
    _id: new mongoose.Types.ObjectId(),
    user: user._id,
    sourceRecipeId: recipe._id,
    originalAuthorId: recipe.originalAuthorId || recipe.user,
    isShared: false,
    canShare: false,
    sharedVersionId: null,
    likedBy: [],
    saveCount: 0,
  });
  await copy.save();

  user.recipes.push(copy._id);
  user.savedRecipes.push(recipe._id);
  await user.save();

  recipe.saveCount = (recipe.saveCount || 0) + 1;
  await recipe.save();

  log("📦", "save", `Saved "${recipe.name}"`, `by ${user.name} (@${user.username})`);
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function startBot() {
  await mongoose.connect(process.env.MONGODB_URI);
  log("🗄️", "info", "Connected to MongoDB");

  const botUsers = await ensureBotUsers();
  if (!botUsers.length) {
    log("❌", "error", "No bot users available");
    process.exit(1);
  }

  const urlCount = await BotUrl.countDocuments({
    verified: { $ne: null },
    failed: false,
  });
  log("📋", "info", `${urlCount} available bot URLs`);

  // Startup cycle — likes and saves only
  log("🚀", "info", "Startup cycle — likes + saves...");
  await doLike(botUsers).catch((err) =>
    log("❌", "error", "Startup like error", err.message),
  );
  await doSave(botUsers).catch((err) =>
    log("❌", "error", "Startup save error", err.message),
  );

  const scheduleShare = async () => {
    const t = await getTimings();
    const delay = rand(t.shareMin, t.shareMax);
    log("🕐", "info", `Next share in ${Math.round(delay / 60000)} mins`);
    await sleep(delay);
    const cfg = await BotConfig.get();
    if (!cfg.paused) {
      const freshUsers = await ensureBotUsers();
      await doShare(freshUsers).catch((err) =>
        log("❌", "error", "Share error", err.message),
      );
    } else log("⏸️", "info", "Bot paused — skipping share");
    scheduleShare();
  };

  const scheduleLike = async () => {
    const t = await getTimings();
    const delay = rand(t.likeMin, t.likeMax);
    log("🕐", "info", `Next like in ${Math.round(delay / 60000)} mins`);
    await sleep(delay);
    const cfg = await BotConfig.get();
    if (!cfg.paused)
      await doLike(botUsers).catch((err) =>
        log("❌", "error", "Like error", err.message),
      );
    else log("⏸️", "info", "Bot paused — skipping like");
    scheduleLike();
  };

  const scheduleSave = async () => {
    const t = await getTimings();
    const delay = rand(t.saveMin, t.saveMax);
    log("🕐", "info", `Next save in ${Math.round(delay / 60000)} mins`);
    await sleep(delay);
    const cfg = await BotConfig.get();
    if (!cfg.paused)
      await doSave(botUsers).catch((err) =>
        log("❌", "error", "Save error", err.message),
      );
    else log("⏸️", "info", "Bot paused — skipping save");
    scheduleSave();
  };

  const scheduleHarvest = async () => {
    const delay = rand(HARVEST_MIN, HARVEST_MAX);
    log("🕐", "info", `Next URL harvest in ${Math.round(delay / 3600000)} hrs`);
    await sleep(delay);
    await harvestUrls().catch((err) =>
      log("❌", "error", "Harvest error", err.message),
    );
    scheduleHarvest();
  };

  scheduleShare();
  scheduleLike();
  scheduleSave();
  scheduleHarvest();

  // Run a harvest on startup if the URL pool is low
  if (urlCount < 20) {
    log("⚠️", "info", "URL pool is low — running initial harvest");
    harvestUrls().catch((err) =>
      log("❌", "error", "Initial harvest error", err.message),
    );
  }

  if (DRY_RUN) log("🟡", "info", "DRY RUN mode — no writes will occur");
  log("🌱", "info", "Bot running");
}

module.exports = { startBot, harvestUrls };