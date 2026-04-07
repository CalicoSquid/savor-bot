const extractIngredients = (data) => {
  switch (true) {
    case Array.isArray(data.recipeIngredient):
      return data.recipeIngredient;
    default:
      return [];
  }
};

module.exports = extractIngredients;