"use strict";

const axios = require("axios");
const BotUrl = require("./models/BotUrl");
const BotSite = require("./models/BotSite");
const { addEntry } = require("./activityLog");

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function log(emoji, type, message, detail = "") {
  const ts = new Date().toISOString();
  console.log(`${ts}  ${emoji}  ${message}${detail ? `  — ${detail}` : ""}`);
  addEntry(type, message, detail);
}

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
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fetch fresh candidate URLs from a single BotSite document.
 * Does NOT write to the database — returns the raw array.
 *
 * @param {BotSite} site
 * @param {Set<string>} existingUrls  - already-known URLs to exclude
 * @param {number} limit              - max URLs to return
 * @returns {Promise<string[]>}
 */
async function fetchCandidatesFromSite(site, existingUrls, limit = 30) {
  const urlRegex   = site.urlRegex();
  const childRegex = site.childRegex();

  let recipeUrls = [];

  if (site.index) {
    const indexXml = await fetchXml(site.url);
    if (!indexXml) {
      log("⚠️", "warn", "Could not fetch sitemap index", site.name);
      return [];
    }

    const childUrls = extractLocs(indexXml).filter(
      (u) => childRegex && childRegex.test(u),
    );

    if (!childUrls.length) {
      log("⚠️", "warn", "No matching child sitemaps found", site.name);
      return [];
    }

    for (const childUrl of childUrls) {
      await sleep(1000 + rand(0, 1000));
      const childXml = await fetchXml(childUrl);
      if (!childXml) continue;
      const urls = extractLocs(childXml).filter((u) => urlRegex.test(u));
      recipeUrls.push(...urls);
    }
  } else {
    const xml = await fetchXml(site.url);
    if (!xml) {
      log("⚠️", "warn", "Could not fetch sitemap", site.name);
      return [];
    }
    recipeUrls = extractLocs(xml).filter((u) => urlRegex.test(u));
  }

  const fresh = recipeUrls.filter((u) => !existingUrls.has(u));
  return shuffle(fresh).slice(0, limit);
}

/**
 * Save an array of URL strings to BotUrl, tagged with the site name.
 * Skips duplicates silently.
 *
 * @param {string[]} urls
 * @param {string} siteName
 * @returns {Promise<number>} count actually inserted
 */
async function saveUrlsToPool(urls, siteName) {
  let added = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const url of urls) {
    try {
      await BotUrl.create({
        url,
        verified: today,
        failed: false,
        failCount: 0,
        note: siteName,
      });
      added++;
    } catch (err) {
      if (err.code !== 11000)
        log("⚠️", "warn", "Failed to insert URL", err.message);
    }
  }
  return added;
}

/**
 * Auto-harvest: run all enabled sites, add up to HARVEST_PER_SITE URLs each.
 */
async function harvestAll(perSite = 30) {
  log("🌾", "info", "Starting auto-harvest...");

  const sites = await BotSite.find({ enabled: true });
  if (!sites.length) {
    log("ℹ️", "info", "No enabled sites — add sites via the dashboard");
    return;
  }

  const existing = new Set(
    (await BotUrl.find({}, "url").lean()).map((e) => e.url),
  );

  let totalAdded = 0;

  for (const site of sites) {
    try {
      log("📡", "info", "Harvesting", site.name);
      const candidates = await fetchCandidatesFromSite(site, existing, perSite);

      if (!candidates.length) {
        log("ℹ️", "info", "No new URLs found", site.name);
      } else {
        const added = await saveUrlsToPool(candidates, site.name);
        candidates.forEach((u) => existing.add(u));
        totalAdded += added;
        log("✅", "info", `Added ${added} URLs from ${site.name}`);
      }

      await BotSite.findByIdAndUpdate(site._id, { lastHarvested: new Date() });
    } catch (err) {
      log("❌", "error", `Harvest error — ${site.name}`, err.message);
    }

    await sleep(2000 + rand(0, 2000));
  }

  log("🌾", "info", `Auto-harvest complete — ${totalAdded} URLs added`);
}

/**
 * Preview harvest: fetch up to `limit` fresh candidates from one site.
 * Returns raw URL strings — caller decides what to save.
 */
async function previewHarvest(siteId, limit = 20) {
  const site = await BotSite.findById(siteId);
  if (!site) throw new Error("Site not found");

  const existing = new Set(
    (await BotUrl.find({}, "url").lean()).map((e) => e.url),
  );

  log("🔍", "info", `Preview harvest (${limit} max)`, site.name);
  const candidates = await fetchCandidatesFromSite(site, existing, limit);
  log("🔍", "info", `Preview found ${candidates.length} fresh URLs`, site.name);
  return { site, candidates };
}

module.exports = { harvestAll, previewHarvest, saveUrlsToPool };