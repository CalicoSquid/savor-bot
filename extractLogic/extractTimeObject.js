const { parse } = require("tinyduration");

const extractTimeObject = (data) => {
  const prepParsed = data.prepTime && parse(data.prepTime);
  const cookParsed = data.cookTime && parse(data.cookTime);

  const prepHours = prepParsed?.hours || 0;
  const cookHours = cookParsed?.hours || 0;
  const cookMinutes = cookParsed?.minutes || 0;
  const prepMinutes = prepParsed?.minutes || 0;
  const totalHours = parseInt(prepHours) + parseInt(cookHours);
  const totalMinutes = parseInt(prepMinutes) + parseInt(cookMinutes);

  const timeObject = {
    prep: {
      hours: prepHours + Math.floor(prepMinutes / 60),
      minutes: prepMinutes % 60,
    },
    cook: {
      hours: cookHours + Math.floor(cookMinutes / 60),
      minutes: cookMinutes % 60,
    },
    total: {
      hours: totalHours + Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    },
  };
  return timeObject;
};

module.exports = extractTimeObject;
