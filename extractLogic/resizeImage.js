const axios = require("axios");
const fs = require("fs").promises;
const sharp = require("sharp");
const logger = require("../../utils/logger");

const resizeImage = async (pathOrUrl) => {
  let imageBuffer;
  try {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
      const imageResponse = await axios({
        url: pathOrUrl,
        responseType: "arraybuffer",
      });
      imageBuffer = imageResponse.data;
    } else if (pathOrUrl.startsWith("data:")) {
      // Base64 data URI — extract the raw base64 and decode it
      const base64Data = pathOrUrl.split(",")[1];
      if (!base64Data) return null;
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      imageBuffer = await fs.readFile(pathOrUrl);
    }
    
    const optimizedImageBuffer = await sharp(imageBuffer)
      .resize(300)
      .toFormat("jpeg")
      .jpeg({ quality: 80 })
      .toBuffer();

    return `data:image/jpeg;base64,${optimizedImageBuffer.toString("base64")}`;
  } catch (error) {
    logger.error("Error optimizing image", error);
    return null;
  }
};

module.exports = resizeImage;