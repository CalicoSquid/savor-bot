"use strict";

require("dotenv").config();

const { startBot }    = require("./bot");
const { startServer } = require("./server");

// Start the Express dashboard first (Render needs the port bound quickly)
startServer();

// Then kick off the bot loop
startBot().catch(err => {
  console.error("Fatal bot error:", err);
  process.exit(1);
});
