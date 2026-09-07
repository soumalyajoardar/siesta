"use strict";
// Minimal .env loader for server startup (KEY=value lines, # comments).
// Real environment variables always win. No dependencies.
const path = require("path");
const fs = require("fs");
try {
  const file = path.join(__dirname, "..", ".env");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || process.env[m[1]] !== undefined || !m[2]) continue;
      let v = m[2];
      if (v.length > 1 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
} catch { /* .env is optional */ }
