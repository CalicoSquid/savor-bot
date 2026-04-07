const extractCuisine = (data) => {
  if (typeof data.recipeCuisine === "string") return data.recipeCuisine.trim();
  if (Array.isArray(data.recipeCuisine) && data.recipeCuisine.length > 0) {
    const first = data.recipeCuisine[0];
    return typeof first === "string" ? first.trim() : "";
  }
  return "";
};

module.exports = extractCuisine;