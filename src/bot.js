"use strict";

const mongoose = require("mongoose");
const axios = require("axios");

const Recipe = require("./models/Recipe");
const UserFb = require("./models/UserFB");
const BotUrl = require("./models/BotUrl");
const BotConfig = require("./models/BotConfig");
const { FIRST_NAMES, SAVOR_RECIPES } = require("./data/recipes");
const { addEntry } = require("./activityLog");
const { harvestAll } = require("./harvester");
const {
  ensurePersonas,
  makeDisplayName,
  makeUsername,
  scoreRecipeForPersona,
  scoreUrlForPersona,
  weightedPick,
} = require("./personas");


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

// Low-pool threshold — triggers an immediate harvest on startup and after each action cycle
const URL_POOL_LOW = 20;

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
const personaCache = new Map();
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

async function getRecentSourceDiversity(limit = 10) {
  const recent = await BotUrl.find(
    { consumedAt: { $ne: null }, consumedAs: { $in: ["source", "made-with-savor"] } },
    "url consumedAt",
  )
    .sort({ consumedAt: -1 })
    .limit(limit)
    .lean();

  const counts = new Map();
  const lastThree = new Set();
  recent.forEach((entry, index) => {
    const domain = getDomain(entry.url);
    counts.set(domain, (counts.get(domain) || 0) + 1);
    if (index < 3) lastThree.add(domain);
  });
  return { counts, lastThree };
}

function sourceDiversityWeight(entry, recent) {
  const domain = getDomain(entry.url);
  const count = recent.counts.get(domain) || 0;
  let weight = count === 0 ? 1.65 : count === 1 ? 0.8 : count === 2 ? 0.35 : 0.16;
  if (recent.lastThree.has(domain)) weight *= 0.12;
  return weight;
}

function groupUrlsBySource(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const domain = getDomain(entry.url);
    const key = domain || entry.note || String(entry._id);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        domain,
        label: entry.note || domain,
        entries: [],
      });
    }
    groups.get(key).entries.push(entry);
  }
  return Array.from(groups.values());
}

function sourceInventoryWeight(count) {
  // Inventory should determine how long a source remains usable, not how often
  // it wins selection. Give deeper pools only a tiny resilience bonus: roughly
  // 1.08x at 10 URLs, 1.16x at 100, capped at 1.20x.
  return 1 + Math.min(0.20, Math.log10(Math.max(1, count)) * 0.08);
}

function sourceGroupWeight(group, persona, recent) {
  const representative = group.entries[0];
  return (
    scoreUrlForPersona(representative, persona) *
    sourceDiversityWeight(representative, recent) *
    sourceInventoryWeight(group.entries.length)
  );
}

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

async function markUrlConsumed(entry, user, { sharedRecipeId = null, consumedAs = "source" } = {}) {
  await BotUrl.findByIdAndUpdate(entry._id, {
    consumedAt: new Date(),
    consumedBy: user?._id || null,
    consumedAs,
    sharedRecipeId,
    failCount: 0,
  });
}

async function backfillConsumedUrls() {
  if (DRY_RUN) return;
  const sharedUrls = await Recipe.distinct("sourceUrl", {
    isShared: true,
    sourceUrl: { $ne: null },
  });
  if (!sharedUrls.length) return;
  const result = await BotUrl.updateMany(
    { url: { $in: sharedUrls }, consumedAt: null },
    { $set: { consumedAt: new Date(), consumedAs: "legacy-shared" } },
  );
  if (result.modifiedCount) {
    log("🧹", "info", `Marked ${result.modifiedCount} legacy shared URLs as consumed`);
  }
}

// ── Bot user management ───────────────────────────────────────────────────────
function assignMaxShares() {
  const roll = Math.random();
  if (roll < 0.3) return rand(1, 3);   // 30% casual — leaves quickly
  if (roll < 0.8) return rand(5, 20);  // 50% regular
  return rand(25, 60);                  // 20% power user
}

async function hydratePersonas(users) {
  const missing = users.filter((user) => !personaCache.has(String(user._id)));
  if (missing.length) {
    const pairs = await ensurePersonas(missing, { dryRun: DRY_RUN });
    pairs.forEach(({ user, persona }) => personaCache.set(String(user._id), persona));
  }
  return users.map((user) => ({ user, persona: personaCache.get(String(user._id)) }));
}

function pickActor(pairs, affinityField) {
  return weightedPick(pairs, ({ persona }) => persona?.[affinityField] || 1);
}

// Retire a bot user — flag as inactive rather than deleting, so shared
// recipes retain a valid user reference and display correctly in the feed.
async function retireBot(user) {
  log("👋", "info", `Bot @${user.username} retiring after ${user.shareCount} shares`);
  personaCache.delete(String(user._id));
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
    await hydratePersonas(existing);
    log("👥", "info", `${existing.length} bot users ready`);
    return existing;
  }

  const needed = BOT_COUNT - existing.length;
  const usedNames = new Set(await UserFb.distinct("username"));
  const created = [];

  log("👥", "info", `Creating ${needed} new bot users...`);

  for (let i = 0; i < needed; i++) {
    let firstName,
      displayName,
      username,
      attempts = 0;
    do {
      firstName = pick(FIRST_NAMES);
      displayName = makeDisplayName(firstName);
      username = makeUsername(firstName, displayName);
      attempts++;
      if (attempts > 50) {
        username = `${firstName.toLowerCase().replace(/[^a-z]/g, "")}${Date.now()}${i}`;
        break;
      }
    } while (usedNames.has(username));

    usedNames.add(username);
    const index = existing.length + created.length;

    const user = new UserFb({
      firebaseUID: `bot_user_${username}_${Date.now()}_${index}`,
      username,
      email: `${username}.bot@savor.internal`,
      name: displayName,
      theme: "Tangerine",
      isSeedUser: true,
      shareCount: 0,
      maxShares: assignMaxShares(),
    });

    if (!DRY_RUN) await user.save();
    created.push(user);
  }

  const allUsers = [...existing, ...created];
  const pairs = await hydratePersonas(allUsers);
  const createdIds = new Set(created.map((user) => String(user._id)));
  pairs
    .filter(({ user }) => createdIds.has(String(user._id)))
    .forEach(({ user, persona }) => {
      log(
        "  ✓",
        "info",
        `${user.name} (@${user.username}) — ${persona.templateKey}, ${persona.avatarKind}, lifespan: ${user.maxShares} shares`,
      );
    });

  return allUsers;
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

// ── URL Harvester (delegated to harvester.js) ─────────────────────────────────
async function checkAndHarvestIfLow() {
  const count = await BotUrl.countDocuments({ verified: { $ne: null }, failed: false, consumedAt: null });
  if (count < URL_POOL_LOW) {
    log("⚠️", "info", `URL pool low (${count}) — triggering auto-harvest`);
    harvestAll().catch((err) => log("❌", "error", "Auto-harvest error", err.message));
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function doShare(botUsers) {
  const pairs = await hydratePersonas(botUsers);
  const actor = pickActor(pairs, "shareAffinity");
  if (!actor) return;
  const { user, persona } = actor;

  // Hand-crafted Savor recipes are one-shot seeds. Once the original bank is
  // exhausted, all future "Made with Savor" shares come from fresh source URLs.
  const sharedNames = await Recipe.distinct("name", { isShared: true });
  const unsharedSavor = SAVOR_RECIPES.filter((recipe) => !sharedNames.includes(recipe.name));
  if (unsharedSavor.length && Math.random() < 0.1) {
    const chosen = weightedPick(unsharedSavor, (recipe) => scoreRecipeForPersona(recipe, persona));
    const savor = { ...chosen };
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

  const available = await BotUrl.find({
    verified: { $ne: null },
    failed: false,
    consumedAt: null,
  });
  if (!available.length) {
    log("ℹ️", "info", "No unused URLs — add or harvest more via the dashboard");
    return;
  }

  // Keep compatibility with the pre-consumedAt database. External recipes that
  // were shared by older bot versions are still excluded immediately.
  const sharedUrls = new Set(await Recipe.distinct("sourceUrl", {
    isShared: true,
    sourceUrl: { $ne: null },
  }));
  const fresh = available.filter((entry) => !sharedUrls.has(entry.url));
  if (!fresh.length) {
    log("ℹ️", "info", "All unused URLs already appear in the feed — harvest more");
    return;
  }

  // Source-first selection: every available publisher gets one lottery ticket
  // regardless of whether it has 12 unused URLs or 400. Persona preference and
  // recent-source diversity decide which publisher is chosen; inventory depth
  // only adds a small capped resilience bonus. Once the source is selected, pick
  // one unused URL from that source uniformly.
  const recentSources = await getRecentSourceDiversity(10);
  const sourceGroups = groupUrlsBySource(fresh);
  const chosenSource = weightedPick(
    sourceGroups,
    (group) => sourceGroupWeight(group, persona, recentSources),
  );
  const entry = pick(chosenSource.entries);
  log(
    "📡",
    "info",
    "Scraping",
    `${chosenSource.label} (${chosenSource.entries.length} unused) for ${user.name}`,
  );

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

  // Catch legacy duplicates where an older bot stripped sourceUrl before the
  // URL itself could be remembered. We cannot reconstruct those old URLs, but
  // we can stop them the first time they are encountered again.
  const escapedName = recipeData.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const duplicateName = await Recipe.exists({
    isShared: true,
    sourceUrl: null,
    scrapedWithAI: true,
    name: { $regex: `^${escapedName}$`, $options: "i" },
  });
  if (duplicateName) {
    if (!DRY_RUN) await markUrlConsumed(entry, user, { consumedAs: "legacy-duplicate" });
    log("♻️", "info", `Skipping duplicate recipe "${recipeData.name}"`, getDomain(entry.url));
    return;
  }

  const madeWithSavor = Math.random() < (persona.madeWithSavorChance || 0.17);
  if (madeWithSavor) {
    const pexels = await fetchPexelsImage(recipeData.name);
    recipeData.sourceUrl = null;
    recipeData.author = null;
    recipeData.image = pexels.url;
    recipeData.imageCredit = pexels.credit;
    recipeData.scrapedWithAI = true;
    log("🍴", "info", "Presenting as Made with Savor", recipeData.name);
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
    try {
      await markUrlConsumed(entry, user, {
        sharedRecipeId: shared._id,
        consumedAs: madeWithSavor ? "made-with-savor" : "source",
      });
    } catch (consumeErr) {
      // The share itself succeeded. Keep that success truthful; on a later
      // cycle the legacy duplicate guard can still consume this URL by name.
      log("⚠️", "warn", "Shared recipe but could not mark URL consumed", consumeErr.message);
    }
    log("✅", "share", `Shared "${shared.name}"`, `by ${user.name} (@${user.username})`);
    if (user.shareCount >= user.maxShares) await retireBot(user);
  } catch (err) {
    log("❌", "error", `Failed to save "${recipeData?.name}"`, err.message);
  }
}

async function doLike(botUsers) {
  const pairs = await hydratePersonas(botUsers);
  const actor = pickActor(pairs, "likeAffinity");
  if (!actor) return;
  const { user, persona } = actor;
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

  const recipe = weightedPick(recipes, (candidate) => scoreRecipeForPersona(candidate, persona));

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
  const pairs = await hydratePersonas(botUsers);
  const actor = pickActor(pairs, "saveAffinity");
  if (!actor) return;
  const { user, persona } = actor;
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

  const recipe = weightedPick(recipes, (candidate) => scoreRecipeForPersona(candidate, persona));

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
  await backfillConsumedUrls();
  if (!botUsers.length) {
    log("❌", "error", "No bot users available");
    process.exit(1);
  }

  const urlCount = await BotUrl.countDocuments({
    verified: { $ne: null },
    failed: false,
    consumedAt: null,
  });
  log("📋", "info", `${urlCount} unused bot URLs`);

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
    if (!cfg.paused) {
      const freshUsers = await ensureBotUsers();
      await doLike(freshUsers).catch((err) =>
        log("❌", "error", "Like error", err.message),
      );
    }
    else log("⏸️", "info", "Bot paused — skipping like");
    scheduleLike();
  };

  const scheduleSave = async () => {
    const t = await getTimings();
    const delay = rand(t.saveMin, t.saveMax);
    log("🕐", "info", `Next save in ${Math.round(delay / 60000)} mins`);
    await sleep(delay);
    const cfg = await BotConfig.get();
    if (!cfg.paused) {
      const freshUsers = await ensureBotUsers();
      await doSave(freshUsers).catch((err) =>
        log("❌", "error", "Save error", err.message),
      );
    }
    else log("⏸️", "info", "Bot paused — skipping save");
    scheduleSave();
  };

  const scheduleHarvest = async () => {
    const delay = rand(HARVEST_MIN, HARVEST_MAX);
    log("🕐", "info", `Next URL harvest in ${Math.round(delay / 3600000)} hrs`);
    await sleep(delay);
    await harvestAll().catch((err) =>
      log("❌", "error", "Harvest error", err.message),
    );
    scheduleHarvest();
  };

  scheduleShare();
  scheduleLike();
  scheduleSave();
  scheduleHarvest();

  // Run a harvest on startup if the URL pool is low
  if (urlCount < URL_POOL_LOW) {
    log("⚠️", "info", "URL pool low on startup — triggering harvest");
    harvestAll().catch((err) =>
      log("❌", "error", "Initial harvest error", err.message),
    );
  }

  if (DRY_RUN) log("🟡", "info", "DRY RUN mode — no writes will occur");
  log("🌱", "info", "Bot running");
}

module.exports = { startBot, harvestAll, checkAndHarvestIfLow };