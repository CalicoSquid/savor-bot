"use strict";

/**
 * Diagnose recipe sources from the same environment the bot runs in.
 * Separates discovery from final Savor scrape compatibility.
 *
 *   npm run verify-sites
 *   npm run verify-sites -- --all
 *   npm run verify-sites -- --enable
 *
 * --enable only enables a disabled source when discovery succeeds AND the
 * Savor scraper successfully extracts at least one sampled candidate.
 */
require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const BotSite = require("../src/models/BotSite");
const { fetchCandidatesWithDiagnostics } = require("../src/harvester");

const SHOULD_ENABLE = process.argv.includes("--enable");
const CHECK_ALL = process.argv.includes("--all");

async function testSavorScrape(url) {
  if (!process.env.RAILWAY_SCRAPER_URL || !process.env.BOT_SCRAPE_SECRET) {
    return { skipped: true, ok: false, reason: "RAILWAY_SCRAPER_URL/BOT_SCRAPE_SECRET not set" };
  }
  try {
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
    const recipe = res.data?.recipe;
    if (!res.data?.ok || !recipe?.name || !recipe?.ingredients?.length) {
      return { ok: false, reason: res.data?.error || "no usable recipe returned" };
    }
    return { ok: true, name: recipe.name };
  } catch (err) {
    return { ok: false, reason: err?.response?.data?.error || err?.message || "scrape failed" };
  }
}

function line(label, value) {
  console.log(`    ${label.padEnd(18)} ${value}`);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const filter = CHECK_ALL ? {} : { enabled: false };
  const sites = await BotSite.find(filter).sort({ name: 1 });

  if (!sites.length) {
    console.log(CHECK_ALL ? "No sites configured." : "No disabled sites to verify.");
    await mongoose.disconnect();
    return;
  }

  let discoveredCount = 0;
  let scrapeableCount = 0;
  let enabledCount = 0;

  for (const site of sites) {
    console.log(`\n${site.enabled ? "●" : "○"} ${site.name}`);
    try {
      const result = await fetchCandidatesWithDiagnostics(site, new Set(), 5);
      const d = result.diagnostics;
      const methods = d.methods.length ? d.methods.join(" + ") : "none";
      line("root", d.root || "invalid");
      line("sitemaps", `${d.sitemapsFetched} fetched / ${d.sitemapUrls} URLs`);
      line("feeds", `${d.feedsFetched} fetched / ${d.feedUrls} URLs`);
      line("archive fallback", `${d.archivePagesFetched} page(s)`);
      line("recipe schema", `${d.schemaRecipes}/${d.schemaChecked} checked`);
      line("accepted by hint", String(d.acceptedByHint));
      line("methods", methods);
      line("candidates", String(result.candidates.length));

      if (!result.candidates.length) {
        console.log("    ✗ Discovery found no usable recipe candidates");
        continue;
      }

      discoveredCount++;
      result.candidates.slice(0, 2).forEach((url) => console.log(`      ${url}`));

      let scrapeResult = null;
      for (const url of result.candidates.slice(0, 2)) {
        const tested = await testSavorScrape(url);
        if (tested.skipped) {
          scrapeResult = tested;
          break;
        }
        if (tested.ok) {
          scrapeResult = tested;
          break;
        }
        scrapeResult = tested;
      }

      if (scrapeResult?.skipped) {
        line("Savor scrape", `SKIPPED — ${scrapeResult.reason}`);
      } else if (scrapeResult?.ok) {
        scrapeableCount++;
        line("Savor scrape", `✓ ${scrapeResult.name}`);
      } else {
        line("Savor scrape", `✗ ${scrapeResult?.reason || "failed"}`);
      }

      if (SHOULD_ENABLE && !site.enabled) {
        if (scrapeResult?.ok) {
          site.enabled = true;
          await site.save();
          enabledCount++;
          console.log("    ✓ enabled");
        } else {
          console.log("    not enabled — final Savor scrape did not pass");
        }
      }
    } catch (err) {
      console.log(`    ✗ ${err.message}`);
    }
  }

  console.log(`\nDiscovery working: ${discoveredCount}/${sites.length}`);
  console.log(`Savor scrape verified: ${scrapeableCount}/${sites.length}`);
  if (SHOULD_ENABLE) console.log(`Newly enabled: ${enabledCount}`);
  else console.log("Read-only check. Re-run with --enable to enable disabled sources that pass both stages.");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
