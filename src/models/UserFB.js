"use strict";

const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");

const userSchemaFb = new mongoose.Schema({
  firebaseUID:    { type: String, required: true, unique: true },
  username:       { type: String, required: true, unique: true, minlength: 3 },
  email:          { type: String, unique: true, required: true },
  name:           String,
  subscribed:     Boolean,
  avatar:         String,
  theme:          { type: String, default: "Tangerine" },
  createdAt:      { type: Date, default: Date.now },
  updatedAt:      { type: Date, default: Date.now },
  recipes:        [{ type: mongoose.Schema.Types.ObjectId, ref: "Recipe" }],
  likedRecipes:   [{ type: mongoose.Schema.Types.ObjectId, ref: "Recipe" }],
  savedRecipes:   [{ type: mongoose.Schema.Types.ObjectId, ref: "Recipe" }],
  isAdmin:        { type: Boolean, default: false },
  unlockedThemes: [{ type: String }],
  isSeedUser:     { type: Boolean, default: false },

  // ── Lifecycle fields ──────────────────────────────────────────────────────
  // shareCount: how many times this bot has shared a recipe
  // maxShares:  lifespan — bot "deletes" itself when shareCount reaches this
  shareCount: { type: Number, default: 0 },
  maxShares:  { type: Number, default: 0 },
});

userSchemaFb.plugin(uniqueValidator);

userSchemaFb.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
    delete returnedObject.password;
  },
});

module.exports = mongoose.model("UserFb", userSchemaFb);