"use strict";

const axios = require("axios");
const crypto = require("crypto");

const BotPersona = require("./models/BotPersona");

const IDENTITY_VERSION = 2;
const FREE_THEMES = ["Tangerine", "Tangerine", "Cornflower", "Burgundy"];

// Cohort targets matter more than pure per-user randomness when the visible
// population is only ~10 accounts. These ratios produce a mixed feed without
// letting one generated style dominate by chance.
const AVATAR_RATIOS = {
  gravatar: 0.30,
  initials: 0.20,
  image: 0.40,
  portrait: 0.10,
};

const IMAGE_TOPICS = [
  "golden retriever dog",
  "cat",
  "houseplant close up",
  "wildflowers close up",
  "coffee mug on table",
  "fresh bread loaf",
  "mountain landscape",
  "beach sunset",
  "garden flowers close up",
  "farmers market vegetables close up",
];

const PORTRAIT_TOPICS = [
  "casual portrait person outdoors",
  "candid portrait person cafe",
  "casual portrait person kitchen",
];

const LAST_INITIALS = "BCDFGHJKLMNPRSTVW".split("");
const LAST_NAMES = [
  "Bennett", "Brooks", "Carter", "Costa", "Dawson", "Evans", "Fischer", "Garcia",
  "Hughes", "Ito", "Jensen", "Khan", "Kim", "Lewis", "Martin", "Moreau", "Murphy",
  "Nielsen", "Novak", "Park", "Patel", "Reed", "Rossi", "Santos", "Silva", "Taylor",
  "Walker", "Wells", "Young", "Zimmer",
];

const PERSONA_TEMPLATES = [
  {
    key: "weeknight",
    cuisines: ["Italian", "Mexican", "Mediterranean"],
    categories: ["Main Course", "Pasta", "Dinner"],
    sources: ["RecipeTin Eats", "Pinch of Yum", "BBC Good Food", "Budget Bytes", "Once Upon a Chef"],
    shareAffinity: 1.25, likeAffinity: 0.8, saveAffinity: 1.35, madeWithSavorChance: 0.16,
  },
  {
    key: "plant-forward",
    cuisines: ["Mediterranean", "Middle Eastern", "Indian"],
    categories: ["Vegetarian", "Salad", "Soup"],
    sources: ["Minimalist Baker", "BBC Good Food", "Feasting at Home", "Love and Lemons", "Cookie and Kate", "101 Cookbooks"],
    shareAffinity: 0.8, likeAffinity: 1.15, saveAffinity: 1.45, madeWithSavorChance: 0.12,
  },
  {
    key: "baker",
    cuisines: ["British", "French", "American"],
    categories: ["Dessert", "Baking", "Breakfast"],
    sources: ["BBC Good Food", "Pinch of Yum", "Smitten Kitchen", "Joy the Baker", "Sally's Baking Addiction"],
    shareAffinity: 0.65, likeAffinity: 1.35, saveAffinity: 1.15, madeWithSavorChance: 0.24,
  },
  {
    key: "technique",
    cuisines: ["French", "Italian", "American"],
    categories: ["Main Course", "Sauce", "Side Dish"],
    sources: ["BBC Food", "RecipeTin Eats", "Serious Eats", "David Lebovitz", "Simply Recipes"],
    shareAffinity: 0.85, likeAffinity: 0.75, saveAffinity: 0.7, madeWithSavorChance: 0.08,
  },
  {
    key: "east-asian",
    cuisines: ["Japanese", "Korean", "Chinese", "Thai"],
    categories: ["Main Course", "Soup", "Noodles"],
    sources: ["RecipeTin Eats", "Just One Cookbook", "The Woks of Life", "My Korean Kitchen"],
    shareAffinity: 1.05, likeAffinity: 1.0, saveAffinity: 1.25, madeWithSavorChance: 0.14,
  },
  {
    key: "mediterranean",
    cuisines: ["Italian", "Greek", "Mediterranean", "Levantine"],
    categories: ["Main Course", "Salad", "Vegetarian"],
    sources: ["BBC Good Food", "RecipeTin Eats", "Feasting at Home", "The Mediterranean Dish"],
    shareAffinity: 0.95, likeAffinity: 1.25, saveAffinity: 0.95, madeWithSavorChance: 0.2,
  },
  {
    key: "comfort",
    cuisines: ["British", "American", "Italian"],
    categories: ["Main Course", "Soup", "Dessert"],
    sources: ["BBC Food", "Pinch of Yum", "Smitten Kitchen", "Damn Delicious"],
    shareAffinity: 1.15, likeAffinity: 1.4, saveAffinity: 0.8, madeWithSavorChance: 0.22,
  },
  {
    key: "adventurous",
    cuisines: ["Indian", "Thai", "Levantine", "North African", "Korean"],
    categories: ["Main Course", "Side Dish", "Soup"],
    sources: ["RecipeTin Eats", "BBC Food", "Serious Eats", "The Woks of Life"],
    shareAffinity: 1.35, likeAffinity: 0.7, saveAffinity: 0.75, madeWithSavorChance: 0.1,
  },
  {
    key: "brunch",
    cuisines: ["American", "French", "British"],
    categories: ["Breakfast", "Brunch", "Baking"],
    sources: ["BBC Good Food", "Pinch of Yum", "Joy the Baker"],
    shareAffinity: 0.7, likeAffinity: 1.2, saveAffinity: 1.3, madeWithSavorChance: 0.28,
  },
  {
    key: "low-fuss",
    cuisines: ["American", "Mexican", "Mediterranean"],
    categories: ["Main Course", "Vegetarian", "Lunch"],
    sources: ["Minimalist Baker", "RecipeTin Eats", "Gimme Delicious", "Skinnytaste", "EatingWell"],
    shareAffinity: 0.8, likeAffinity: 0.9, saveAffinity: 1.55, madeWithSavorChance: 0.18,
  },
  {
    key: "family",
    cuisines: ["British", "Italian", "American"],
    categories: ["Main Course", "Pasta", "Dessert"],
    sources: ["BBC Good Food", "RecipeTin Eats", "Damn Delicious", "Natasha's Kitchen", "Budget Bytes"],
    shareAffinity: 1.1, likeAffinity: 0.85, saveAffinity: 1.25, madeWithSavorChance: 0.2,
  },
  {
    key: "sweet-tooth",
    cuisines: ["Italian", "French", "American"],
    categories: ["Dessert", "Baking"],
    sources: ["BBC Good Food", "Minimalist Baker", "Joy the Baker", "Smitten Kitchen"],
    shareAffinity: 0.75, likeAffinity: 1.55, saveAffinity: 0.95, madeWithSavorChance: 0.3,
  },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesPreference(value, preferences) {
  const v = normalized(value);
  if (!v) return false;
  return (preferences || []).some((pref) => {
    const p = normalized(pref);
    return p && (v === p || v.includes(p) || p.includes(v));
  });
}

function sourceNameFromUrl(url) {
  const host = (() => {
    try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
    catch { return ""; }
  })();
  const map = [
    ["bbcgoodfood.com", "BBC Good Food"], ["bbc.co.uk", "BBC Food"],
    ["pinchofyum.com", "Pinch of Yum"], ["minimalistbaker.com", "Minimalist Baker"],
    ["recipetineats.com", "RecipeTin Eats"], ["smittenkitchen.com", "Smitten Kitchen"],
    ["loveandlemons.com", "Love and Lemons"], ["halfbakedharvest.com", "Half Baked Harvest"], ["ambitiouskitchen.com", "Ambitious Kitchen"],
    ["seriouseats.com", "Serious Eats"], ["davidlebovitz.com", "David Lebovitz"],
    ["gimmesomeoven.com", "Gimme Some Oven"], ["damndelicious.net", "Damn Delicious"],
    ["justonecookbook.com", "Just One Cookbook"], ["mykoreankitchen.com", "My Korean Kitchen"],
    ["closetcooking.com", "Closet Cooking"], ["joythebaker.com", "Joy the Baker"],
    ["feastingathome.com", "Feasting at Home"], ["thewoksoflife.com", "The Woks of Life"],
    ["gimmedelicious.com", "Gimme Delicious"],
    ["budgetbytes.com", "Budget Bytes"], ["cookieandkate.com", "Cookie and Kate"],
    ["themediterraneandish.com", "The Mediterranean Dish"], ["sallysbakingaddiction.com", "Sally's Baking Addiction"],
    ["skinnytaste.com", "Skinnytaste"], ["onceuponachef.com", "Once Upon a Chef"],
    ["natashaskitchen.com", "Natasha's Kitchen"], ["simplyrecipes.com", "Simply Recipes"],
    ["eatingwell.com", "EatingWell"], ["101cookbooks.com", "101 Cookbooks"],
  ];
  return map.find(([domain]) => host.includes(domain))?.[1] || host;
}

function weightedPick(items, weightFn) {
  if (!items?.length) return null;
  const weights = items.map((item) => Math.max(0.01, Number(weightFn(item)) || 0.01));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function scoreRecipeForPersona(recipe, persona) {
  let score = 1;
  if (matchesPreference(recipe.cuisine, persona.cuisines)) score += 4;
  if (matchesPreference(recipe.category, persona.categories)) score += 3;
  if (recipe.sourceUrl && matchesPreference(sourceNameFromUrl(recipe.sourceUrl), persona.sources)) score += 3;
  if (!recipe.sourceUrl) score += Math.max(0, (persona.madeWithSavorChance || 0.17) * 3);
  return score;
}

function scoreUrlForPersona(entry, persona) {
  let score = 1;
  // Older migrated BotUrl rows predate the `note` field, so fall back to the
  // domain-derived source name. This keeps persona source preferences working
  // for the existing pool as well as newly harvested URLs.
  const sourceName = entry.note || sourceNameFromUrl(entry.url);
  if (matchesPreference(sourceName, persona.sources)) score += 5;
  return score;
}

function makeDisplayName(firstName) {
  const first = String(firstName || "Savor").trim().split(/\s+/)[0];
  const last = pick(LAST_NAMES);
  const roll = Math.random();

  // Match how real Savor accounts are created: email/password asks for a first
  // name and Google usually supplies one too. Almost everyone therefore keeps
  // a simple first name; richer/odd profile names are rare user-edited outliers.
  if (roll < 0.90) return first;
  if (roll < 0.95) return `${first} ${pick(LAST_INITIALS)}.`;
  if (roll < 0.975) return `${first} ${last}`;
  if (roll < 0.99) return `${first.charAt(0).toUpperCase()}. ${last}`;
  return `${first.charAt(0).toUpperCase()}${pick(LAST_INITIALS)}`;
}

function makeUsername(firstName, displayName) {
  const base = firstName.toLowerCase().replace(/[^a-z0-9]/g, "") || "savoruser";
  const tokens = String(displayName || "")
    .replace(/[^a-zA-Z0-9. ]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const second = (tokens[1] || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const lastInitial = second ? second.charAt(0) : null;
  const firstInitial = base.charAt(0);
  const patterns = [
    () => `${base}${Math.floor(10 + Math.random() * 90)}`,
    () => `${base}${Math.floor(100 + Math.random() * 9900)}`,
    () => `${base}_${Math.floor(10 + Math.random() * 90)}`,
    () => lastInitial ? `${base}_${lastInitial}` : `${base}${Math.floor(10 + Math.random() * 90)}`,
    () => second.length > 1 ? `${base}.${second}` : `${base}${Math.floor(100 + Math.random() * 900)}`,
    () => second.length > 1 ? `${firstInitial}${second}` : `${base}${Math.floor(10 + Math.random() * 90)}`,
    () => lastInitial ? `${base}${lastInitial}${Math.floor(10 + Math.random() * 90)}` : `${base}${Math.floor(100 + Math.random() * 900)}`,
  ];
  return pick(patterns)();
}

async function fetchPexelsAvatar(topic) {
  if (!process.env.PEXELS_API_KEY) return null;
  try {
    const res = await axios.get("https://api.pexels.com/v1/search", {
      headers: { Authorization: process.env.PEXELS_API_KEY },
      params: { query: topic, per_page: 8, orientation: "square" },
      timeout: 8000,
    });
    const photos = res.data?.photos || [];
    if (!photos.length) return null;
    const photo = pick(photos);
    return photo.src?.medium || photo.src?.large || null;
  } catch {
    return null;
  }
}

function initialAvatarUrl(name) {
  const digest = crypto.createHash("sha1").update(String(name || "Savor")).digest("hex");
  const backgrounds = ["5B6F8C", "6D7C59", "8C6570", "6C6A8A", "A06A4B", "4F7A78", "7B6F5F", "7A5E76"];
  const bg = backgrounds[parseInt(digest.slice(0, 2), 16) % backgrounds.length];
  const label = encodeURIComponent(String(name || "S").trim());
  // UI Avatars returns a normal anti-aliased text avatar. Keep the text
  // close to the normal Google-style proportion while retaining clear circular padding
  // in Savor's cropped Community avatar.
  return `https://ui-avatars.com/api/?name=${label}&size=256&background=${bg}&color=FAFAF7&length=1&font-size=0.50&bold=false&format=png`;
}

function isSimpleFirstName(name) {
  const value = String(name || "").trim();
  return !!value && !/\s/.test(value) && !/^[A-Z]{2,3}$/.test(value);
}

function makeOutlierDisplayName(firstName) {
  const first = String(firstName || "Savor").trim().split(/\s+/)[0];
  const roll = Math.random();
  if (roll < 0.55) return `${first} ${pick(LAST_INITIALS)}.`;
  if (roll < 0.80) return `${first} ${pick(LAST_NAMES)}`;
  if (roll < 0.95) return `${first.charAt(0).toUpperCase()}. ${pick(LAST_NAMES)}`;
  return `${first.charAt(0).toUpperCase()}${pick(LAST_INITIALS)}`;
}

function desiredAvatarCounts(total) {
  const kinds = Object.keys(AVATAR_RATIOS);
  const raw = kinds.map((kind) => ({
    kind,
    exact: total * AVATAR_RATIOS[kind],
  }));
  const counts = Object.fromEntries(raw.map(({ kind, exact }) => [kind, Math.floor(exact)]));
  let left = total - Object.values(counts).reduce((sum, n) => sum + n, 0);
  raw
    .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)))
    .forEach(({ kind }) => {
      if (left > 0) {
        counts[kind]++;
        left--;
      }
    });
  return counts;
}

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function upgradeIdentityCohort(pairs, { dryRun = false } = {}) {
  const legacy = pairs.filter(({ persona }) => Number(persona.identityVersion || 1) < IDENTITY_VERSION);
  if (!legacy.length) return;

  const desired = desiredAvatarCounts(pairs.length);
  const already = {};
  for (const { persona } of pairs) {
    if (Number(persona.identityVersion || 1) >= IDENTITY_VERSION) {
      already[persona.avatarKind] = (already[persona.avatarKind] || 0) + 1;
    }
  }

  const slots = [];
  for (const kind of Object.keys(AVATAR_RATIOS)) {
    const deficit = Math.max(0, (desired[kind] || 0) - (already[kind] || 0));
    for (let i = 0; i < deficit; i++) slots.push(kind);
  }
  while (slots.length < legacy.length) {
    slots.push(weightedPick(Object.keys(AVATAR_RATIOS), (kind) => AVATAR_RATIOS[kind]));
  }
  const assigned = shuffle(slots).slice(0, legacy.length);

  for (let i = 0; i < legacy.length; i++) {
    const { user, persona } = legacy[i];
    const baseName = persona.previousName || user.name || user.username || "Savor user";

    // Remove only the identity v1 avatar/name so the upgraded policy can be
    // applied cleanly. previous* fields are the untouched pre-persona rollback.
    user.name = baseName;
    user.avatar = persona.previousAvatar || null;
    persona.displayName = makeDisplayName(baseName);
    persona.avatarKind = assigned[i];
    persona.avatarTopic = null;
    persona.identityVersion = IDENTITY_VERSION;

    if (!dryRun) await persona.save();
  }
}

async function ensureVisibleNameOutliers(pairs, { dryRun = false } = {}) {
  if (pairs.length < 6) return;
  const target = Math.max(1, Math.round(pairs.length * 0.10));
  const outliers = pairs.filter(({ persona }) => !isSimpleFirstName(persona.displayName));
  let needed = target - outliers.length;
  if (needed <= 0) return;

  const candidates = shuffle(pairs.filter(({ persona }) => isSimpleFirstName(persona.displayName)));
  for (const { user, persona } of candidates) {
    if (needed <= 0) break;
    const baseName = persona.previousName || user.name || persona.displayName;
    persona.displayName = makeOutlierDisplayName(baseName);
    if (!dryRun) await persona.save();
    needed--;
  }
}

function buildPersona(user) {
  const template = pick(PERSONA_TEMPLATES);
  const currentName = String(user.name || user.username || "Savor user").trim();
  // Newly-created bots may already have a richer display name so their username
  // can be derived from it. Preserve that; legacy first-name-only bots get the
  // new mixed display-name treatment on first persona assignment.
  const displayName = (/\s/.test(currentName) || /^[A-Z]{2,3}$/.test(currentName))
    ? currentName
    : makeDisplayName(currentName);
  return {
    user: user._id,
    templateKey: template.key,
    displayName,
    previousName: user.name || null,
    previousAvatar: user.avatar || null,
    previousTheme: user.theme || null,
    identityVersion: IDENTITY_VERSION,
    avatarKind: weightedPick(Object.keys(AVATAR_RATIOS), (kind) => AVATAR_RATIOS[kind]),
    avatarTopic: null,
    theme: pick(FREE_THEMES),
    cuisines: [...template.cuisines],
    categories: [...template.categories],
    sources: [...template.sources],
    shareAffinity: template.shareAffinity,
    likeAffinity: template.likeAffinity,
    saveAffinity: template.saveAffinity,
    madeWithSavorChance: template.madeWithSavorChance,
  };
}

async function applyIdentity(user, persona, { dryRun = false } = {}) {
  let changed = false;
  let personaChanged = false;

  if (persona.displayName && user.name !== persona.displayName) {
    user.name = persona.displayName;
    changed = true;
  }
  if (["Tangerine", "Cornflower", "Burgundy"].includes(user.theme) && user.theme !== persona.theme) {
    user.theme = persona.theme;
    changed = true;
  }

  // Refresh v4's smaller UI-Avatars rendering in place. This changes only
  // existing initials avatars and does not reroll the cohort identity mix.
  if (persona.avatarKind === "initials" && user.avatar?.includes("ui-avatars.com") && !user.avatar.includes("font-size=0.50")) {
    user.avatar = initialAvatarUrl(persona.displayName);
    changed = true;
  }

  if (!user.avatar && persona.avatarKind !== "gravatar") {
    if (persona.avatarKind === "initials") {
      user.avatar = initialAvatarUrl(persona.displayName);
    } else if (persona.avatarKind === "image" || persona.avatarKind === "portrait") {
      const topics = persona.avatarKind === "portrait" ? PORTRAIT_TOPICS : IMAGE_TOPICS;
      const topic = persona.avatarTopic || pick(topics);
      const photo = await fetchPexelsAvatar(topic);
      persona.avatarTopic = topic;
      personaChanged = true;
      if (photo) user.avatar = photo;
      else {
        // A failed photo lookup should still keep the cohort visually varied.
        // Smooth text is a better fallback than a generated geometric identicon.
        persona.avatarKind = "initials";
        personaChanged = true;
        user.avatar = initialAvatarUrl(persona.displayName);
      }
    }
    changed = !!user.avatar || changed;
  }

  if (!dryRun) {
    if (changed) await user.save();
    if (personaChanged && persona._id) await persona.save();
  }
  return user;
}

async function ensurePersona(user, { dryRun = false } = {}) {
  const [pair] = await ensurePersonas([user], { dryRun });
  return pair.persona;
}

async function ensurePersonas(users, { dryRun = false } = {}) {
  const pairs = [];
  for (const user of users) {
    let persona = await BotPersona.findOne({ user: user._id });
    if (!persona) {
      const data = buildPersona(user);
      persona = dryRun ? new BotPersona(data) : await BotPersona.create(data);
    }
    pairs.push({ user, persona });
  }

  // v4 is a one-time identity-only upgrade. Taste/behaviour templates remain
  // untouched; only the visible name/avatar policy is refreshed.
  await upgradeIdentityCohort(pairs, { dryRun });
  await ensureVisibleNameOutliers(pairs, { dryRun });

  for (const { user, persona } of pairs) {
    await applyIdentity(user, persona, { dryRun });
  }
  return pairs;
}

module.exports = {
  PERSONA_TEMPLATES,
  ensurePersona,
  ensurePersonas,
  makeDisplayName,
  makeUsername,
  matchesPreference,
  scoreRecipeForPersona,
  scoreUrlForPersona,
  sourceNameFromUrl,
  weightedPick,
};
