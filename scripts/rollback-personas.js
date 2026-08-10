"use strict";

/**
 * Optional safety rollback for bot profile identity changes made by personas.
 * Run this BEFORE deploying the untouched rollback zip if you also want the
 * bot names/themes/avatars restored to their pre-persona values.
 *
 *   npm run rollback-personas
 *
 * This does not delete bot activity or recipes. It only restores identity
 * fields recorded when each BotPersona was first created, then removes the
 * BotPersona records so a future smart-bot deploy can assign fresh personas.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const BotPersona = require("../src/models/BotPersona");
const UserFb = require("../src/models/UserFB");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const personas = await BotPersona.find({});

  let restored = 0;
  for (const persona of personas) {
    const update = {
      name: persona.previousName || persona.displayName,
      theme: persona.previousTheme || "Tangerine",
      avatar: persona.previousAvatar || null,
    };
    const result = await UserFb.updateOne({ _id: persona.user }, { $set: update });
    if (result.matchedCount) restored++;
  }

  await BotPersona.deleteMany({});
  console.log(`Restored ${restored} bot profile(s); removed ${personas.length} persona record(s).`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
