const fs   = require("fs");
const path = require("path");
const resizeImage = require("./resizeImage");

const extractImage = async (data) => {
  const defaultImagePath = path.join(__dirname, "no-image-2.png");
  const noImage          = fs.readFileSync(defaultImagePath);
  const defaultBase64    = `data:image/png;base64,${noImage.toString("base64")}`;

  if (!data.image) return defaultBase64;

  let imageUrl;

  if (typeof data.image === "string") {
    imageUrl = data.image;
  } else if (Array.isArray(data.image)) {
    const first = data.image[0];
    if (!first) return defaultBase64;
    imageUrl = (first && typeof first === "object" && first.url) ? first.url : String(first);
  } else if (data.image && typeof data.image === "object" && data.image.url) {
    imageUrl = data.image.url;
  } else {
    return defaultBase64;
  }

  if (!imageUrl || typeof imageUrl !== "string") return defaultBase64;

  try {
    const resized = await resizeImage(imageUrl);
    return resized;
  } catch {
    return imageUrl;
  }
};

module.exports = extractImage;