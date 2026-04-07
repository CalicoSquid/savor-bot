/**
 * migrate-urls.js
 *
 * One-time script: imports your existing bot-urls.json into MongoDB.
 * Run once after deploying, then you can forget about the JSON file.
 *
 * Usage:
 *   MONGODB_URI=your_uri node scripts/migrate-urls.js /path/to/bot-urls.json
 */

"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const fs       = require("fs");
const path     = require("path");
const BotUrl   = require("../src/models/BotUrl");

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/migrate-urls.js /path/to/bot-urls.json");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  if (!data.urls?.length) {
    console.log("No URLs found in file.");
    process.exit(0);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  let imported = 0;
  let skipped  = 0;

  for (const entry of data.urls) {
    try {
      await BotUrl.create({
        url:       entry.url,
        verified:  entry.verified || new Date().toISOString().slice(0, 10),
        failed:    entry.failed    || false,
        failCount: entry.failCount || 0,
      });
      console.log(`  ✓ ${entry.url.slice(0, 70)}`);
      imported++;
    } catch (err) {
      if (err.code === 11000) {
        console.log(`  ⏭ Already exists: ${entry.url.slice(0, 70)}`);
        skipped++;
      } else {
        console.error(`  ✗ Error: ${err.message}`);
      }
    }
  }

  console.log(`\nDone. ${imported} imported, ${skipped} skipped.`);
  process.exit(0);
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
