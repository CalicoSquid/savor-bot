"use strict";

const mongoose = require("mongoose");

/**
 * Recipe source configuration.
 *
 * url can now be either a homepage OR a sitemap. The harvester auto-discovers
 * robots.txt sitemaps, common sitemap endpoints, RSS/Atom feeds and a bounded
 * recipe/archive fallback. Legacy regex fields remain optional hints so known-
 * good sources stay fast and backwards compatible.
 */
const botSiteSchema = new mongoose.Schema({
  name:          { type: String, required: true, unique: true },
  url:           { type: String, required: true },
  index:         { type: Boolean, default: true },
  childPattern:  { type: String, default: "" },
  urlPattern:    { type: String, default: "" },
  enabled:       { type: Boolean, default: false },
  addedAt:       { type: Date, default: Date.now },
  lastHarvested: { type: Date, default: null },
});

botSiteSchema.methods.childRegex = function () {
  return this.childPattern ? new RegExp(this.childPattern, "i") : null;
};
botSiteSchema.methods.urlRegex = function () {
  return this.urlPattern ? new RegExp(this.urlPattern, "i") : null;
};

module.exports = mongoose.model("BotSite", botSiteSchema);
