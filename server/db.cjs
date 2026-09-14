"use strict";
// Tiny JSON-file database: zero-config persistence for the Siesta backend.
// Collections live in server/data/*.json and are written atomically.
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function load(name, fallback) {
  ensureDir();
  try {
    return JSON.parse(fs.readFileSync(fileFor(name), "utf8"));
  } catch {
    return fallback;
  }
}

function save(name, value) {
  ensureDir();
  const tmp = fileFor(name) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, fileFor(name));
}

module.exports = { load, save, DATA_DIR };
