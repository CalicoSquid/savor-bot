"use strict";

const mongoose = require("mongoose");

/**
 * Single-document config store — always upserted by key "main".
 * Controls bot speed and pause state from the dashboard.
 */
const botConfigSchema = new mongoose.Schema({
  key: { type: String, default: "main", unique: true },

  // "quiet" | "normal" | "active"
  speed: { type: String, default: "normal" },

  // true = bot loop still runs but skips all actions
  paused: { type: Boolean, default: false },

  updatedAt: { type: Date, default: Date.now },
});

botConfigSchema.statics.get = async function () {
  let config = await this.findOne({ key: "main" });
  if (!config) {
    config = await this.create({ key: "main" });
  }
  return config;
};

botConfigSchema.statics.set = async function (updates) {
  return this.findOneAndUpdate(
    { key: "main" },
    { ...updates, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model("BotConfig", botConfigSchema);
