"use strict";

const mongoose = require("mongoose");

/**
 * Bot-only identity, taste and behaviour. Kept out of the production UserFb
 * schema so the community seed layer can evolve without changing real users.
 */
const botPersonaSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "UserFb", required: true, unique: true },
  templateKey: { type: String, required: true },
  identityVersion: { type: Number, default: 1 },
  displayName: { type: String, required: true },
  previousName: { type: String, default: null },
  previousAvatar: { type: String, default: null },
  previousTheme: { type: String, default: null },
  avatarKind: { type: String, required: true },
  avatarTopic: { type: String, default: null },
  theme: { type: String, required: true },
  cuisines: [{ type: String }],
  categories: [{ type: String }],
  sources: [{ type: String }],
  shareAffinity: { type: Number, default: 1 },
  likeAffinity: { type: Number, default: 1 },
  saveAffinity: { type: Number, default: 1 },
  madeWithSavorChance: { type: Number, default: 0.17 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("BotPersona", botPersonaSchema);
