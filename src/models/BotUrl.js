"use strict";

const mongoose = require("mongoose");

/**
 * Replaces bot-urls.json — URLs live in MongoDB so they survive Render redeploys.
 */
const botUrlSchema = new mongoose.Schema({
  url:       { type: String, required: true, unique: true },
  verified:  { type: String, default: null },   // date string e.g. "2026-03-30"
  failed:    { type: Boolean, default: false },
  failCount: { type: Number, default: 0 },
  addedAt:   { type: Date, default: Date.now },
  note:      { type: String, default: "" },

  // Once a URL produces a successful feed share it is permanently consumed.
  // This remains true even when the public recipe is presented as "Made with Savor"
  // and therefore has sourceUrl stripped.
  consumedAt:      { type: Date, default: null },
  consumedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "UserFb", default: null },
  consumedAs:      { type: String, default: null },
  sharedRecipeId:  { type: mongoose.Schema.Types.ObjectId, ref: "Recipe", default: null },
});

module.exports = mongoose.model("BotUrl", botUrlSchema);
