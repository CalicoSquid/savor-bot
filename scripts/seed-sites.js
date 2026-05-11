"use strict";

/**
 * Run once after deploy to seed known-working sitemap sources into BotSite.
 *   node scripts/seed-sites.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const BotSite  = require("../src/models/BotSite");

const KNOWN_SITES = [
  // ── Confirmed working from Railway ────────────────────────────────────────
  {
    name: "BBC Good Food",
    url: "https://www.bbcgoodfood.com/sitemap.xml",
    index: true,
    childPattern: "sitemap[^\"'<]*recipe",
    urlPattern: "bbcgoodfood\\.com\\/recipes\\/[a-z0-9-]{5,}",
    enabled: true,
  },
  {
    name: "Pinch of Yum",
    url: "https://pinchofyum.com/sitemap_index.xml",
    index: true,
    childPattern: "post-sitemap",
    urlPattern: "pinchofyum\\.com\\/[a-z0-9-]{5,}",
    enabled: true,
  },
  {
    name: "BBC Food",
    url: "https://www.bbc.co.uk/food/sitemap.xml",
    index: false,
    childPattern: "",
    urlPattern: "bbc\\.co\\.uk\\/food\\/recipes\\/[a-z0-9_]{5,}",
    enabled: true,
  },

  // ── Candidates — enable after verifying from Railway dashboard ───────────
  {
    name: "RecipeTin Eats",
    url: "https://www.recipetineats.com/sitemap_index.xml",
    index: true,
    childPattern: "post-sitemap",
    urlPattern: "recipetineats\\.com\\/[a-z0-9-]{5,}\\/",
    enabled: false,
  },
  {
    name: "Minimalist Baker",
    url: "https://minimalistbaker.com/sitemap_index.xml",
    index: true,
    childPattern: "post-sitemap",
    urlPattern: "minimalistbaker\\.com\\/[a-z0-9-]{5,}\\/",
    enabled: false,
  },
  {
    name: "Smitten Kitchen",
    url: "https://smittenkitchen.com/sitemap_index.xml",
    index: true,
    childPattern: "post-sitemap",
    urlPattern: "smittenkitchen\\.com\\/[0-9]{4}\\/[0-9]{2}\\/[a-z0-9-]{5,}",
    enabled: false,
  },
  {
    name: "Love and Lemons",
    url: "https://www.loveandlemons.com/sitemap_index.xml",
    index: true,
    childPattern: "post-sitemap",
    urlPattern: "loveandlemons\\.com\\/[a-z0-9-]{5,}\\/",
    enabled: false,
  },
  {
    name: "Half Baked Harvest",
    url: "https://www.halfbakedharvest.com/sitemap_index.xml",
    index: true,
    childPattern: "post-sitemap",
    urlPattern: "halfbakedharvest\\.com\\/[a-z0-9-]{5,}\\/",
    enabled: false,
  },
  {
    name: "Ambitious Kitchen",
    url: "https://www.ambitiouskitchen.com/sitemap_index.xml",
    index: true,
    childPattern: "post-sitemap",
    urlPattern: "ambitiouskitchen\\.com\\/[a-z0-9-]{5,}\\/",
    enabled: false,
  },
  {
    name: "Serious Eats",
    url: "https://www.seriouseats.com/sitemap_index.xml",
    index: true,
    childPattern: "post-sitemap",
    urlPattern: "seriouseats\\.com\\/[a-z0-9-]{5,}-recipe",
    enabled: false,
  },
  {
    name: "David Lebovitz",
    url: "https://www.davidlebovitz.com/sitemap_index.xml",
    index: true,
    childPattern: "post-sitemap",
    urlPattern: "davidlebovitz\\.com\\/[a-z0-9-]{5,}\\/",
    enabled: false,
  },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected.");

  let added = 0, skipped = 0;
  for (const site of KNOWN_SITES) {
    const existing = await BotSite.findOne({ name: site.name });
    if (existing) {
      console.log(`⏭  Skipped (exists): ${site.name}`);
      skipped++;
      continue;
    }
    await BotSite.create(site);
    console.log(`✅ Added: ${site.name} (enabled: ${site.enabled})`);
    added++;
  }

  console.log(`\nDone — ${added} added, ${skipped} skipped.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });