const extractName = (data) => {
  if (typeof data.name === "string" && data.name.trim()) return data.name.trim();
  if (typeof data.headline === "string" && data.headline.trim()) return data.headline.trim();
  return "";
};

module.exports = extractName;