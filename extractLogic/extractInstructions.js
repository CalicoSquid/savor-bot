const extractInstructionsFromString = (instructionsString) => {
  const listItemRegex = /<li>(.*?)<\/li>/g;
  const listItems = [];
  let match;
  while ((match = listItemRegex.exec(instructionsString)) !== null) {
    listItems.push(match[1].trim());
  }
  return listItems;
};

const extractInstructionsFromArray = (instructionsArray) => {
  if (typeof instructionsArray[0] === "string") {
    return instructionsArray;
  } else if (typeof instructionsArray[0] === "object") {
    const arr = instructionsArray.map((item) => {
      if ("text" in item) {
        return item.text;
      } else if ("name" in item && "itemListElement" in item) {
        return `${item.name}\n${item.itemListElement
          .map((e) => e.text)
          .join("\n")}`;
      }
    });
    return arr.filter(Boolean);
  }
  return [];
};

const extractInstructions = (data) => {
  if (typeof data.recipeInstructions === "string") {
    return extractInstructionsFromString(data.recipeInstructions);
  } else if (Array.isArray(data.recipeInstructions)) {
    return extractInstructionsFromArray(data.recipeInstructions);
  }
  return [];
};

module.exports = extractInstructions;
