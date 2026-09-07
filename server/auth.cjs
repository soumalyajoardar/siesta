"use strict";
// Admin authentication: scrypt-hashed password + short-lived bearer tokens.
// Password comes from ADMIN_PASSWORD env (a safe default is generated on first
// run and printed once — change it immediately). NOTE: for single-server local
// / small-business use. Put the app behind HTTPS before exposing to the internet.
const crypto = require("crypto");
const { load, save } = require("./db.cjs");

const sessions = new Map(); // token -> { createdAt }
const TOKEN_TTL = 12 * 3600 * 1000;

function getAdminRecord() {
  let rec = load("admin", null);
  if (!rec) {
    const password = process.env.ADMIN_PASSWORD || `siesta-${crypto.randomBytes(4).toString("hex")}`;
    if (!process.env.ADMIN_PASSWORD) {
      console.log("\n  *** SIESTA ADMIN ***  First run: generated admin password:\n");
      console.log(`      ${password}\n`);
      console.log("  Log in at /admin with username 'admin'. Set ADMIN_PASSWORD env to change it.\n");
    }
    const salt = crypto.randomBytes(16).toString("hex");
    rec = { username: "admin", salt, hash: hash(password, salt), createdAt: new Date().toISOString() };
    save("admin", rec);
  }
  return rec;
}

function hash(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function verify(password) {
  const rec = getAdminRecord();
  try {
    return crypto.timingSafeEqual(Buffer.from(hash(password, rec.salt), "hex"), Buffer.from(rec.hash, "hex"));
  } catch {
    return false;
  }
}

// Tiny login rate-limit: 5 failures per IP per 5 minutes.
const failures = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (failures.get(ip) || []).filter((t) => now - t < 5 * 60 * 1000);
  failures.set(ip, arr);
  return arr.length >= 5;
}
function recordFailure(ip) {
  failures.set(ip, [...(failures.get(ip) || []), Date.now()]);
}

function issueToken() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function validToken(token) {
  const s = sessions.get(token);
  if (!s) return false;
  if (Date.now() - s.createdAt > TOKEN_TTL) { sessions.delete(token); return false; }
  return true;
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!validToken(token)) return res.status(401).json({ error: "Admin login required." });
  next();
}

module.exports = { getAdminRecord, verify, issueToken, requireAdmin, rateLimited, recordFailure };
