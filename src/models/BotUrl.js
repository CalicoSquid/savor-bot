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
});

module.exports = mongoose.model("BotUrl", botUrlSchema);
