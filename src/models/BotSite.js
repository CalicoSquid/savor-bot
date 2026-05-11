"use strict";

const mongoose = require("mongoose");

/**
 * Sitemap sources — replaces the hardcoded SITEMAPS array in bot.js.
 * childPattern and urlPattern stored as strings, converted to RegExp at runtime.
 */
const botSiteSchema = new mongoose.Schema({
  name:         { type: String, required: true, unique: true },
  url:          { type: String, required: true },           // sitemap URL
  index:        { type: Boolean, default: true },           // true = sitemap index, false = direct urlset
  childPattern: { type: String, default: "" },              // regex string to match child sitemaps
  urlPattern:   { type: String, required: true },           // regex string to match recipe URLs
  enabled:      { type: Boolean, default: false },          // false until manually verified
  addedAt:      { type: Date, default: Date.now },
  lastHarvested:{ type: Date, default: null },
});

// Convert stored strings to RegExp for use in harvester
botSiteSchema.methods.childRegex = function () {
  return this.childPattern ? new RegExp(this.childPattern, "i") : null;
};
botSiteSchema.methods.urlRegex = function () {
  return new RegExp(this.urlPattern, "i");
};

module.exports = mongoose.model("BotSite", botSiteSchema);