const { convertIngredientData } = require("../../utils/convertIngredients");
const extractConvertedIngredients = async (data) => {
  switch (true) {
    case Array.isArray(data.recipeIngredient):
      try {
        const result = await convertIngredientData(data.recipeIngredient);
        return result;
      } catch (error) {
        return data.recipeIngredient;
      }
    default:
      return [];
  }
};

module.exports = extractConvertedIngredients;