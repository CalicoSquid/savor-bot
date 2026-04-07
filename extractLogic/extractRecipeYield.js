const extractYield = (data) => {
  if (typeof data.recipeYield === "string") return data.recipeYield.trim();
  if (Array.isArray(data.recipeYield) && data.recipeYield.length > 0)
    return String(data.recipeYield[0]).trim();
  if (typeof data.yield === "string") return data.yield.trim();
  return "";
};

module.exports = extractYield;