"use strict";

const axios = require("axios");
const zlib = require("zlib");
const BotUrl = require("./models/BotUrl");
const BotSite = require("./models/BotSite");
const { addEntry } = require("./activityLog");

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const MAX_SITEMAPS = 36;
const MAX_DISCOVERED_URLS = 1400;
const MAX_SCHEMA_CHECKS = 64;
const MAX_ARCHIVE_PAGES = 4;

function log(emoji, type, message, detail = "") {
  const ts = new Date().toISOString();
  console.log(`${ts}  ${emoji}  ${message}${detail ? `  — ${detail}` : ""}`);
  addEntry(type, message, detail);
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function stripCdata(value) {
  return String(value || "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

async function fetchText(url, { timeout = 15000, accept = BROWSER_HEADERS.Accept } = {}) {
  try {
    const res = await axios.get(url, {
      timeout,
      headers: { ...BROWSER_HEADERS, Accept: accept },
      responseType: "arraybuffer",
      maxContentLength: 25 * 1024 * 1024,
      maxBodyLength: 25 * 1024 * 1024,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    let buf = Buffer.from(res.data);
    if ((buf[0] === 0x1f && buf[1] === 0x8b) || /gzip/i.test(res.headers?.["content-type"] || "")) {
      try { buf = zlib.gunzipSync(buf); } catch { /* axios may already have decompressed it */ }
    }
    return { text: buf.toString("utf8"), finalUrl: res.request?.res?.responseUrl || url, status: res.status };
  } catch (error) {
    return { text: null, finalUrl: url, status: error?.response?.status || null, error };
  }
}

function extractTag(block, tag) {
  const match = String(block || "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(stripCdata(match[1].trim())) : "";
}

function extractSitemapEntries(xml) {
  const blocks = String(xml || "").match(/<sitemap\b[\s\S]*?<\/sitemap>/gi) || [];
  return blocks
    .map((block) => ({ loc: extractTag(block, "loc"), lastmod: extractTag(block, "lastmod") }))
    .filter((entry) => entry.loc);
}

function extractUrlEntries(xml) {
  const blocks = String(xml || "").match(/<url\b[\s\S]*?<\/url>/gi) || [];
  if (blocks.length) {
    return blocks
      .map((block) => ({ loc: extractTag(block, "loc"), lastmod: extractTag(block, "lastmod") }))
      .filter((entry) => entry.loc);
  }
  // Some very simple sitemaps omit conventional formatting. Keep a fallback.
  const locs = String(xml || "").match(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi) || [];
  return locs.map((raw) => ({ loc: decodeEntities(stripCdata(raw.replace(/^<loc(?:\s[^>]*)?>/i, "").replace(/<\/loc>$/i, ""))), lastmod: "" }));
}

function normalizeHost(hostname) {
  return String(hostname || "").toLowerCase().replace(/^www\./, "");
}

function getSiteRoot(site) {
  try {
    const parsed = new URL(site.url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function isSameSite(url, root) {
  try {
    return normalizeHost(new URL(url).hostname) === normalizeHost(new URL(root).hostname);
  } catch {
    return false;
  }
}

function normalizeCandidate(url) {
  try {
    const parsed = new URL(decodeEntities(url));
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return null;
  }
}

function looksLikeSitemapUrl(url) {
  return /(?:sitemap|wp-sitemap|\.xml(?:\.gz)?)(?:[/?#]|$)/i.test(String(url || ""));
}

function legacyUrlRegex(site) {
  try { return site.urlPattern ? new RegExp(site.urlPattern, "i") : null; }
  catch { return null; }
}

function legacyChildRegex(site) {
  try { return site.childPattern ? new RegExp(site.childPattern, "i") : null; }
  catch { return null; }
}

function recipeishPathScore(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|xml|gz|css|js)$/i.test(path)) return -100;
    if (/\/(?:tag|author|page|wp-admin|wp-content|privacy|terms|contact|about|shop|cart|account)(?:\/|$)/i.test(path)) return -6;
    let score = 0;
    if (/\/(?:recipe|recipes)\//i.test(path)) score += 5;
    if (/-recipe\/?$/i.test(path)) score += 4;
    if (path.split("/").filter(Boolean).length >= 2) score += 1;
    return score;
  } catch {
    return -100;
  }
}

function candidateScore(url, { sitemapUrl = "", site } = {}) {
  let score = recipeishPathScore(url);
  const legacy = legacyUrlRegex(site);
  if (legacy?.test(url)) score += 8;
  if (/recipe/i.test(sitemapUrl)) score += 7;
  if (/post-sitemap/i.test(sitemapUrl)) score += 2;
  return score;
}

async function discoverSitemapSeeds(site, root, diagnostics) {
  const seeds = [];
  if (looksLikeSitemapUrl(site.url)) seeds.push(site.url);

  const robotsUrl = `${root}/robots.txt`;
  const robots = await fetchText(robotsUrl, { accept: "text/plain,*/*;q=0.8", timeout: 10000 });
  if (robots.text) {
    diagnostics.robots = true;
    const matches = [...robots.text.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map((m) => decodeEntities(m[1]));
    seeds.push(...matches);
  }

  seeds.push(`${root}/sitemap.xml`, `${root}/sitemap_index.xml`, `${root}/wp-sitemap.xml`);
  return [...new Set(seeds.filter(Boolean))];
}

async function collectFromSitemaps(site, root, diagnostics) {
  const seeds = await discoverSitemapSeeds(site, root, diagnostics);
  diagnostics.sitemapSeeds = seeds.length;
  const queue = seeds.map((url) => ({ url, lastmod: "" }));
  const seenMaps = new Set();
  const candidates = [];

  while (queue.length && seenMaps.size < MAX_SITEMAPS && candidates.length < MAX_DISCOVERED_URLS) {
    const childHint = legacyChildRegex(site);
    queue.sort((a, b) => {
      const legacyPriority = Number(!!childHint?.test(b.url)) - Number(!!childHint?.test(a.url));
      const recipePriority = Number(/recipe/i.test(b.url)) - Number(/recipe/i.test(a.url));
      return legacyPriority || recipePriority || String(b.lastmod || "").localeCompare(String(a.lastmod || ""));
    });
    const current = queue.shift();
    if (!current?.url || seenMaps.has(current.url)) continue;
    seenMaps.add(current.url);

    const fetched = await fetchText(current.url, { accept: "application/xml,text/xml,text/plain,*/*;q=0.8" });
    if (!fetched.text || !/<(?:urlset|sitemapindex|sitemap|url)\b/i.test(fetched.text)) continue;
    diagnostics.sitemapsFetched++;

    const childMaps = extractSitemapEntries(fetched.text);
    if (childMaps.length || /<sitemapindex\b/i.test(fetched.text)) {
      diagnostics.sitemapIndexes++;
      childMaps
        .filter((entry) => isSameSite(entry.loc, root))
        .forEach((entry) => {
          if (!seenMaps.has(entry.loc)) queue.push({ url: entry.loc, lastmod: entry.lastmod });
        });
      await sleep(60 + rand(0, 80));
      continue;
    }

    const urls = extractUrlEntries(fetched.text);
    diagnostics.sitemapUrlsets++;
    diagnostics.sitemapUrls += urls.length;
    for (const entry of urls) {
      const normalized = normalizeCandidate(entry.loc);
      if (!normalized || !isSameSite(normalized, root)) continue;
      const score = candidateScore(normalized, { sitemapUrl: current.url, site });
      if (score <= -50) continue;
      candidates.push({ url: normalized, lastmod: entry.lastmod, score, method: "sitemap", source: current.url });
      if (candidates.length >= MAX_DISCOVERED_URLS) break;
    }
    await sleep(60 + rand(0, 80));
  }

  return candidates;
}

function extractFeedUrlsFromHtml(html, baseUrl) {
  const urls = [];
  const links = String(html || "").match(/<link\b[^>]*>/gi) || [];
  for (const tag of links) {
    if (!/rel\s*=\s*["'][^"']*alternate/i.test(tag) || !/type\s*=\s*["']application\/(?:rss\+xml|atom\+xml)/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try { urls.push(new URL(decodeEntities(href), baseUrl).toString()); } catch {}
  }
  return urls;
}

function extractFeedEntryUrls(xml, baseUrl) {
  const out = [];
  const items = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const item of items) {
    const link = extractTag(item, "link") || extractTag(item, "guid");
    if (!link) continue;
    try { out.push(new URL(link, baseUrl).toString()); } catch {}
  }
  const entries = String(xml || "").match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const entry of entries) {
    const href = entry.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1] || extractTag(entry, "link");
    if (!href) continue;
    try { out.push(new URL(decodeEntities(href), baseUrl).toString()); } catch {}
  }
  return out;
}

async function collectFromFeeds(site, root, diagnostics, homepageHtml = null) {
  let homepage = homepageHtml;
  if (!homepage) homepage = (await fetchText(`${root}/`, { accept: "text/html,*/*;q=0.8", timeout: 12000 })).text;
  const discovered = homepage ? extractFeedUrlsFromHtml(homepage, root) : [];
  const feedUrls = [...new Set([...discovered, `${root}/feed/`, `${root}/feed`, `${root}/rss.xml`, `${root}/atom.xml`])].slice(0, 8);
  diagnostics.feedSeeds = feedUrls.length;

  const candidates = [];
  let successfulFeeds = 0;
  for (const feedUrl of feedUrls) {
    const fetched = await fetchText(feedUrl, { accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8", timeout: 10000 });
    if (!fetched.text || !/<(?:rss|feed|channel|item|entry)\b/i.test(fetched.text)) continue;
    const urls = extractFeedEntryUrls(fetched.text, feedUrl);
    if (!urls.length) continue;
    diagnostics.feedsFetched++;
    successfulFeeds++;
    diagnostics.feedUrls += urls.length;
    for (const raw of urls) {
      const normalized = normalizeCandidate(raw);
      if (!normalized || !isSameSite(normalized, root)) continue;
      const score = candidateScore(normalized, { site }) + 2;
      if (score <= -50) continue;
      candidates.push({ url: normalized, lastmod: "", score, method: "feed", source: feedUrl });
    }
    if (successfulFeeds >= 2 || candidates.length >= 120) break;
  }
  return { candidates, homepage };
}

function extractAnchorUrls(html, baseUrl) {
  const out = [];
  const anchors = String(html || "").match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>/gi) || [];
  for (const tag of anchors) {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || /^(?:mailto:|tel:|javascript:|#)/i.test(href)) continue;
    try { out.push(new URL(decodeEntities(href), baseUrl).toString()); } catch {}
  }
  return out;
}

async function collectFromArchives(site, root, diagnostics, homepageHtml = null) {
  let homepage = homepageHtml;
  if (!homepage) homepage = (await fetchText(`${root}/`, { accept: "text/html,*/*;q=0.8", timeout: 12000 })).text;
  if (!homepage) return [];

  const homeLinks = extractAnchorUrls(homepage, root).filter((url) => isSameSite(url, root));
  const archiveSeeds = homeLinks.filter((url) => /\/(?:recipes?|cooking|food)(?:\/|$)/i.test(new URL(url).pathname));
  archiveSeeds.push(`${root}/recipes/`, `${root}/recipe/`, `${root}/category/recipes/`);

  const pages = [...new Set([`${root}/`, ...archiveSeeds])].slice(0, MAX_ARCHIVE_PAGES);
  const candidates = [];
  for (const pageUrl of pages) {
    let html = pageUrl === `${root}/` ? homepage : null;
    if (!html) html = (await fetchText(pageUrl, { accept: "text/html,*/*;q=0.8", timeout: 10000 })).text;
    if (!html) continue;
    diagnostics.archivePagesFetched++;
    const links = extractAnchorUrls(html, pageUrl);
    diagnostics.archiveLinks += links.length;
    for (const raw of links) {
      const normalized = normalizeCandidate(raw);
      if (!normalized || !isSameSite(normalized, root)) continue;
      const score = candidateScore(normalized, { site }) + (/recipe/i.test(pageUrl) ? 2 : 0);
      if (score <= 0) continue;
      candidates.push({ url: normalized, lastmod: "", score, method: "archive", source: pageUrl });
    }
  }
  return candidates;
}

function containsRecipeType(value, depth = 0) {
  if (depth > 10 || value == null) return false;
  if (Array.isArray(value)) return value.some((item) => containsRecipeType(item, depth + 1));
  if (typeof value !== "object") return false;
  const type = value["@type"];
  if (typeof type === "string" && type.toLowerCase() === "recipe") return true;
  if (Array.isArray(type) && type.some((item) => String(item).toLowerCase() === "recipe")) return true;
  return Object.values(value).some((item) => containsRecipeType(item, depth + 1));
}

function hasRecipeStructuredData(html) {
  const text = String(html || "");
  if (/itemtype\s*=\s*["'][^"']*schema\.org\/Recipe["']/i.test(text)) return true;
  const scripts = [...text.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const raw = stripCdata(match[1]).trim();
    if (!raw) continue;
    try {
      if (containsRecipeType(JSON.parse(raw))) return true;
    } catch {
      if (/["']@type["']\s*:\s*(?:\[[^\]]*)?["']Recipe["']/i.test(raw)) return true;
    }
  }
  return false;
}

async function inspectRecipePage(url) {
  const fetched = await fetchText(url, { accept: "text/html,application/xhtml+xml,*/*;q=0.8", timeout: 12000 });
  if (!fetched.text) return { ok: false, isRecipe: false, status: fetched.status, error: fetched.error?.message || "fetch failed" };
  return { ok: true, isRecipe: hasRecipeStructuredData(fetched.text), status: fetched.status };
}

function dedupeCandidates(candidates, existingUrls) {
  const byUrl = new Map();
  for (const candidate of candidates) {
    if (!candidate?.url || existingUrls.has(candidate.url)) continue;
    const current = byUrl.get(candidate.url);
    if (!current || candidate.score > current.score) byUrl.set(candidate.url, candidate);
  }
  return [...byUrl.values()];
}

function sortCandidates(candidates) {
  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.lastmod || "").localeCompare(String(a.lastmod || ""));
  });
}

async function fetchCandidatesWithDiagnostics(site, existingUrls = new Set(), limit = 30) {
  const diagnostics = {
    root: null,
    robots: false,
    sitemapSeeds: 0,
    sitemapsFetched: 0,
    sitemapIndexes: 0,
    sitemapUrlsets: 0,
    sitemapUrls: 0,
    feedSeeds: 0,
    feedsFetched: 0,
    feedUrls: 0,
    archivePagesFetched: 0,
    archiveLinks: 0,
    schemaChecked: 0,
    schemaRecipes: 0,
    acceptedByHint: 0,
    acceptedBySchema: 0,
    methods: [],
  };

  const root = getSiteRoot(site);
  diagnostics.root = root;
  if (!root) return { candidates: [], details: [], diagnostics: { ...diagnostics, error: "Invalid site URL" } };

  let discovered = await collectFromSitemaps(site, root, diagnostics);
  const feedResult = await collectFromFeeds(site, root, diagnostics);
  discovered.push(...feedResult.candidates);

  // Archive crawling is deliberately a last fallback. Use it when the more
  // publisher-friendly discovery mechanisms have not produced much.
  if (dedupeCandidates(discovered, existingUrls).length < Math.max(limit * 2, 20)) {
    discovered.push(...await collectFromArchives(site, root, diagnostics, feedResult.homepage));
  }

  const ranked = sortCandidates(dedupeCandidates(discovered, existingUrls));
  const accepted = [];
  const legacy = legacyUrlRegex(site);

  for (const candidate of ranked) {
    if (accepted.length >= limit) break;

    // Existing regexes and recipe-specific sitemaps remain strong hints. This
    // preserves known-good sources without forcing every page through another
    // HTTP request.
    const strongHint = (legacy?.test(candidate.url) || /recipe/i.test(candidate.source || "")) && candidate.score >= 7;
    if (strongHint) {
      accepted.push({ ...candidate, acceptedBy: "hint" });
      diagnostics.acceptedByHint++;
      continue;
    }

    if (diagnostics.schemaChecked >= MAX_SCHEMA_CHECKS) continue;
    diagnostics.schemaChecked++;
    const inspected = await inspectRecipePage(candidate.url);
    await sleep(80 + rand(0, 80));
    if (!inspected.isRecipe) continue;
    diagnostics.schemaRecipes++;
    diagnostics.acceptedBySchema++;
    accepted.push({ ...candidate, acceptedBy: "schema" });
  }

  diagnostics.methods = [...new Set(accepted.map((item) => item.method))];
  return { candidates: accepted.map((item) => item.url), details: accepted, diagnostics };
}

/**
 * Fetch fresh candidate URLs from a single BotSite document.
 * Existing urlPattern/childPattern settings are treated as optional hints;
 * discovery now works from the site/homepage or sitemap automatically.
 */
async function fetchCandidatesFromSite(site, existingUrls, limit = 30) {
  const result = await fetchCandidatesWithDiagnostics(site, existingUrls, limit);
  if (!result.candidates.length) {
    log("⚠️", "warn", "No recipe candidates discovered", `${site.name} — sitemap:${result.diagnostics.sitemapsFetched}, feed:${result.diagnostics.feedsFetched}, schema:${result.diagnostics.schemaRecipes}/${result.diagnostics.schemaChecked}`);
  }
  return result.candidates;
}

/** Save URL strings to BotUrl, tagged with the source name. */
async function saveUrlsToPool(urls, siteName) {
  let added = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const url of urls) {
    try {
      await BotUrl.create({ url, verified: today, failed: false, failCount: 0, note: siteName });
      added++;
    } catch (err) {
      if (err.code !== 11000) log("⚠️", "warn", "Failed to insert URL", err.message);
    }
  }
  return added;
}

/** Auto-harvest all enabled sites. */
async function harvestAll(perSite = 30) {
  log("🌾", "info", "Starting auto-harvest...");
  const sites = await BotSite.find({ enabled: true });
  if (!sites.length) {
    log("ℹ️", "info", "No enabled sites — add sites via the dashboard");
    return;
  }

  const existing = new Set((await BotUrl.find({}, "url").lean()).map((e) => e.url));
  let totalAdded = 0;

  for (const site of sites) {
    try {
      log("📡", "info", "Harvesting", site.name);
      const { candidates, diagnostics } = await fetchCandidatesWithDiagnostics(site, existing, perSite);
      if (!candidates.length) {
        log("ℹ️", "info", "No new URLs found", `${site.name} — maps:${diagnostics.sitemapsFetched}, feeds:${diagnostics.feedsFetched}, schema:${diagnostics.schemaRecipes}/${diagnostics.schemaChecked}`);
      } else {
        const added = await saveUrlsToPool(candidates, site.name);
        candidates.forEach((u) => existing.add(u));
        totalAdded += added;
        const via = diagnostics.methods.length ? diagnostics.methods.join("+") : "discovery";
        log("✅", "info", `Added ${added} URLs from ${site.name}`, via);
      }
      await BotSite.findByIdAndUpdate(site._id, { lastHarvested: new Date() });
    } catch (err) {
      log("❌", "error", `Harvest error — ${site.name}`, err.message);
    }
    await sleep(1200 + rand(0, 1200));
  }

  log("🌾", "info", `Auto-harvest complete — ${totalAdded} URLs added`);
}

/** Preview harvest from one site without saving. */
async function previewHarvest(siteId, limit = 20) {
  const site = await BotSite.findById(siteId);
  if (!site) throw new Error("Site not found");
  const existing = new Set((await BotUrl.find({}, "url").lean()).map((e) => e.url));
  log("🔍", "info", `Preview harvest (${limit} max)`, site.name);
  const result = await fetchCandidatesWithDiagnostics(site, existing, limit);
  log("🔍", "info", `Preview found ${result.candidates.length} fresh URLs`, `${site.name} — ${result.diagnostics.methods.join("+") || "no method"}`);
  return { site, candidates: result.candidates, diagnostics: result.diagnostics };
}

module.exports = {
  harvestAll,
  previewHarvest,
  saveUrlsToPool,
  fetchCandidatesFromSite,
  fetchCandidatesWithDiagnostics,
  inspectRecipePage,
  hasRecipeStructuredData,
};
