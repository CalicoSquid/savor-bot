"use strict";

/**
 * Checks disabled sitemap sources from the same environment the bot runs in.
 * By default this is read-only. Pass --enable to enable only sources that
 * actually return recipe candidates.
 *
 *   npm run verify-sites
 *   npm run verify-sites -- --enable
 */
require("dotenv").config();
const mongoose = require("mongoose");
const BotSite = require("../src/models/BotSite");
const { fetchCandidatesFromSite } = require("../src/harvester");

const SHOULD_ENABLE = process.argv.includes("--enable");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const sites = await BotSite.find({ enabled: false }).sort({ name: 1 });

  if (!sites.length) {
    console.log("No disabled sites to verify.");
    await mongoose.disconnect();
    return;
  }

  let working = 0;
  let enabled = 0;
  for (const site of sites) {
    try {
      const urls = await fetchCandidatesFromSite(site, new Set(), 5);
      if (!urls.length) {
        console.log(`✗ ${site.name}: no matching recipe URLs found`);
        continue;
      }

      working++;
      console.log(`✓ ${site.name}: ${urls.length} sample recipe URL(s)`);
      urls.slice(0, 2).forEach((url) => console.log(`    ${url}`));
      if (SHOULD_ENABLE) {
        site.enabled = true;
        await site.save();
        enabled++;
        console.log("    enabled");
      }
    } catch (err) {
      console.log(`✗ ${site.name}: ${err.message}`);
    }
  }

  console.log(`\nWorking disabled sources: ${working}/${sites.length}`);
  if (SHOULD_ENABLE) console.log(`Enabled: ${enabled}`);
  else console.log("Read-only check. Re-run with --enable to enable working sources.");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
