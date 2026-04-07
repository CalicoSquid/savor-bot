const extractCategory = (data) => {
  switch (true) {
    case typeof data.recipeCategory === "string":
      return normalizeCategory(data.recipeCategory);
    case Array.isArray(data.recipeCategory) && data.recipeCategory.length > 0:
      return normalizeCategory(String(data.recipeCategory[0]));
    default:
      return "other";
  }
};

module.exports = extractCategory;

const normalizeCategory = (category) => {

  const removeExtraCategory = category.split(",");
  const singleCategory = removeExtraCategory[0];
  const normalized = singleCategory.toLowerCase().trim();

  // Specific mappings for certain cases
  const specificMappings = {
    mains: "main course",
    main: "main course",
    dinner: "main course",
    fingerfood: "finger food",
    appetizer: "side dish",
    // Add more mappings as needed
  };

  // Check specific mappings first
  if (specificMappings[normalized]) {
    return specificMappings[normalized];
  }

  // If no specific mapping, match against the standard categories
  const [standardCategory] = standardCat.map((cat) => {
    if (normalized.includes(cat)) return cat;
  });

  return standardCategory ? standardCategory : normalized;
};

const standardCat = [
  "dessert",
  "main course",
  "side dish",
  "salad",
  "bread",
  "soup",
  "beverage",
  "sauce",
  "marinade",
  "finger food",
  "snack",
  "drink",
  "other",
];