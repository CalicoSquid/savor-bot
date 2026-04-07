const extractDescription = (data) => {
  if (typeof data.description === "string") return data.description.trim();
  return "";
};

module.exports = extractDescription;