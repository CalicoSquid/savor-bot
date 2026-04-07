"use strict";

const MAX_ENTRIES = 100;

const entries = [];

/**
 * Add an entry to the activity log.
 * @param {"share"|"like"|"save"|"info"|"error"|"warn"} type
 * @param {string} message
 * @param {string} [detail]
 */
function addEntry(type, message, detail = "") {
  entries.unshift({
    type,
    message,
    detail,
    ts: new Date().toISOString(),
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
}

function getEntries() {
  return entries;
}

module.exports = { addEntry, getEntries };
