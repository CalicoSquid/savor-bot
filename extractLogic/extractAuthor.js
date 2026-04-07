const extractAuthor = (data) => {
  if (!data.author) return "";
  if (typeof data.author === "string") return data.author;
  if (Array.isArray(data.author)) {
    const first = data.author[0];
    return (first && typeof first === "object" && first.name) ? first.name : "";
  }
  if (typeof data.author === "object" && data.author.name) return data.author.name;
  return "";
};

module.exports = extractAuthor;