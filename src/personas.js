"use strict";

const axios = require("axios");
const crypto = require("crypto");
const zlib = require("zlib");

const BotPersona = require("./models/BotPersona");

const FREE_THEMES = ["Tangerine", "Tangerine", "Cornflower", "Burgundy"];
const AVATAR_KINDS = [
  "gravatar", "gravatar", "gravatar",
  "initials", "initials", "initials",
  "photo", "photo", "photo",
  "identicon",
];
const PHOTO_TOPICS = [
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
    sources: ["RecipeTin Eats", "Pinch of Yum", "BBC Good Food"],
    shareAffinity: 1.25, likeAffinity: 0.8, saveAffinity: 1.35, madeWithSavorChance: 0.16,
  },
  {
    key: "plant-forward",
    cuisines: ["Mediterranean", "Middle Eastern", "Indian"],
    categories: ["Vegetarian", "Salad", "Soup"],
    sources: ["Minimalist Baker", "BBC Good Food", "Feasting at Home", "Love and Lemons"],
    shareAffinity: 0.8, likeAffinity: 1.15, saveAffinity: 1.45, madeWithSavorChance: 0.12,
  },
  {
    key: "baker",
    cuisines: ["British", "French", "American"],
    categories: ["Dessert", "Baking", "Breakfast"],
    sources: ["BBC Good Food", "Pinch of Yum", "Smitten Kitchen", "Joy the Baker"],
    shareAffinity: 0.65, likeAffinity: 1.35, saveAffinity: 1.15, madeWithSavorChance: 0.24,
  },
  {
    key: "technique",
    cuisines: ["French", "Italian", "American"],
    categories: ["Main Course", "Sauce", "Side Dish"],
    sources: ["BBC Food", "RecipeTin Eats", "Serious Eats", "David Lebovitz"],
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
    sources: ["BBC Good Food", "RecipeTin Eats", "Feasting at Home"],
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
    sources: ["Minimalist Baker", "RecipeTin Eats", "Gimme Delicious"],
    shareAffinity: 0.8, likeAffinity: 0.9, saveAffinity: 1.55, madeWithSavorChance: 0.18,
  },
  {
    key: "family",
    cuisines: ["British", "Italian", "American"],
    categories: ["Main Course", "Pasta", "Dessert"],
    sources: ["BBC Good Food", "RecipeTin Eats", "Damn Delicious"],
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

const FONT = {
  A:["01110","10001","10001","11111","10001","10001","10001"], B:["11110","10001","10001","11110","10001","10001","11110"],
  C:["01111","10000","10000","10000","10000","10000","01111"], D:["11110","10001","10001","10001","10001","10001","11110"],
  E:["11111","10000","10000","11110","10000","10000","11111"], F:["11111","10000","10000","11110","10000","10000","10000"],
  G:["01111","10000","10000","10111","10001","10001","01111"], H:["10001","10001","10001","11111","10001","10001","10001"],
  I:["11111","00100","00100","00100","00100","00100","11111"], J:["00111","00010","00010","00010","10010","10010","01100"],
  K:["10001","10010","10100","11000","10100","10010","10001"], L:["10000","10000","10000","10000","10000","10000","11111"],
  M:["10001","11011","10101","10101","10001","10001","10001"], N:["10001","11001","10101","10011","10001","10001","10001"],
  O:["01110","10001","10001","10001","10001","10001","01110"], P:["11110","10001","10001","11110","10000","10000","10000"],
  Q:["01110","10001","10001","10001","10101","10010","01101"], R:["11110","10001","10001","11110","10100","10010","10001"],
  S:["01111","10000","10000","01110","00001","00001","11110"], T:["11111","00100","00100","00100","00100","00100","00100"],
  U:["10001","10001","10001","10001","10001","10001","01110"], V:["10001","10001","10001","10001","10001","01010","00100"],
  W:["10001","10001","10001","10101","10101","11011","10001"], X:["10001","10001","01010","00100","01010","10001","10001"],
  Y:["10001","10001","01010","00100","00100","00100","00100"], Z:["11111","00001","00010","00100","01000","10000","11111"],
};

const COLORS = [
  [91,111,140], [109,124,89], [140,101,112], [108,106,138],
  [160,106,75], [79,122,120], [123,111,95], [122,94,118],
];

const crcTable = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function createInitialAvatarDataUri(name) {
  const size = 128;
  const initial = (name || "S").trim().charAt(0).toUpperCase();
  const glyph = FONT[initial] || FONT.S;
  const digest = crypto.createHash("sha1").update(name || "Savor").digest();
  const bg = COLORS[digest[0] % COLORS.length];
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      rgba[i] = bg[0]; rgba[i + 1] = bg[1]; rgba[i + 2] = bg[2]; rgba[i + 3] = 255;
    }
  }

  const scale = 13;
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const ox = Math.floor((size - glyphW) / 2);
  const oy = Math.floor((size - glyphH) / 2);
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      if (glyph[gy][gx] !== "1") continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const x = ox + gx * scale + px;
          const y = oy + gy * scale + py;
          const i = (y * size + x) * 4;
          rgba[i] = 250; rgba[i + 1] = 250; rgba[i + 2] = 247; rgba[i + 3] = 255;
        }
      }
    }
  }

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

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
  if (matchesPreference(entry.note, persona.sources)) score += 5;
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

function gravatarIdenticon(email) {
  const hash = crypto.createHash("md5").update(String(email || "").trim().toLowerCase()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=400&d=identicon&r=g`;
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
    avatarKind: pick(AVATAR_KINDS),
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

  if (!user.avatar && persona.avatarKind !== "gravatar") {
    if (persona.avatarKind === "initials") {
      user.avatar = createInitialAvatarDataUri(persona.displayName);
    } else if (persona.avatarKind === "identicon") {
      user.avatar = gravatarIdenticon(user.email);
    } else if (persona.avatarKind === "photo") {
      const topic = persona.avatarTopic || pick(PHOTO_TOPICS);
      const photo = await fetchPexelsAvatar(topic);
      persona.avatarTopic = topic;
      personaChanged = true;
      if (photo) user.avatar = photo;
      else {
        persona.avatarKind = "initials";
        personaChanged = true;
        user.avatar = createInitialAvatarDataUri(persona.displayName);
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
  let persona = await BotPersona.findOne({ user: user._id });
  if (!persona) {
    const data = buildPersona(user);
    persona = dryRun ? new BotPersona(data) : await BotPersona.create(data);
  }
  await applyIdentity(user, persona, { dryRun });
  return persona;
}

async function ensurePersonas(users, { dryRun = false } = {}) {
  const pairs = [];
  for (const user of users) {
    const persona = await ensurePersona(user, { dryRun });
    pairs.push({ user, persona });
  }
  return pairs;
}

module.exports = {
  PERSONA_TEMPLATES,
  createInitialAvatarDataUri,
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
