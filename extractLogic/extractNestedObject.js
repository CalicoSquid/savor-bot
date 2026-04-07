const extractNestedObject = (obj, keysToFind) => {
  if (obj === null || obj === undefined || typeof obj !== "object") return null;

  for (const key of keysToFind) {
    if (key in obj) return obj;
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === null || val === undefined) continue;

    if (Array.isArray(val)) {
      for (const item of val) {
        if (!item || typeof item !== "object") continue;
        const result = extractNestedObject(item, keysToFind);
        if (result !== null) return result;
      }
    } else if (typeof val === "object") {
      const result = extractNestedObject(val, keysToFind);
      if (result !== null) return result;
    }
  }

  return null;
};

module.exports = extractNestedObject;