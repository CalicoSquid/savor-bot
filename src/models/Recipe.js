"use strict";

const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");

const recipeSchema = new mongoose.Schema({
  name:                 { type: String, required: true },
  createdAt:            { type: Date, default: Date.now },
  ingredients:          Array,
  convertedIngredients: Array,
  instructions:         Array,
  description:          String,
  image:                String,
  author:               String,
  sourceUrl:            String,
  isFavorite:           Boolean,
  recipeYield:          String,
  category:             String,
  cuisine:              String,
  times: {
    cook:  { hours: { type: Number, default: 0 }, minutes: { type: Number, default: 0 } },
    prep:  { hours: { type: Number, default: 0 }, minutes: { type: Number, default: 0 } },
    total: { hours: { type: Number, default: 0 }, minutes: { type: Number, default: 0 } },
  },
  user:             { type: mongoose.Schema.Types.ObjectId, ref: "UserFb", required: true },
  isShared:         { type: Boolean, default: false },
  canShare:         { type: Boolean, default: true },
  imageCredit: {
    photographer:    { type: String, default: null },
    photographerUrl: { type: String, default: null },
  },
  originalRecipeId: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe",  default: null },
  sharedVersionId:  { type: mongoose.Schema.Types.ObjectId, ref: "Recipe",  default: null },
  originalAuthorId: { type: mongoose.Schema.Types.ObjectId, ref: "UserFb",  default: null },
  likedBy:          [{ type: mongoose.Schema.Types.ObjectId, ref: "UserFb" }],
  saveCount:        { type: Number, default: 0 },
  sourceRecipeId:   { type: mongoose.Schema.Types.ObjectId, ref: "Recipe",  default: null },
  sharedAt:         { type: Date,   default: null },
  scrapedWithAI:    { type: Boolean, default: false },
});

recipeSchema.plugin(uniqueValidator);

recipeSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Recipe", recipeSchema);
