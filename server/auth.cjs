"use strict";
// Admin authentication.
// - If ADMIN_PASSWORD is set it is authoritative (verified directly, never
//   stored): required on serverless hosting, convenient anywhere.
// - Otherwise the classic flow: scrypt-hashed password persisted locally,
//   generated + printed once on first run.
// - Tokens: stateless signed JWT when ADMIN_PASSWORD is set (survives across
//   serverless invocations), otherwise in-memory sessions (single server).
// NOTE: for single-server local / small-business use. Always serve over HTTPS
// in production (Vercel provides this automatically).
const crypto = require("crypto");
const { load, save } = require("./db.cjs");

const sessions = new Map(); // token -> { createdAt } (local single-server mode)
const TOKEN_TTL = 12 * 3600 * 1000;
const ENV_SALT = "siesta-admin-env-v1";
const JWT_SALT = "siesta-jwt-v1";

const hasEnvPassword = () => Boolean(process.env.ADMIN_PASSWORD);

function hash(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function getAdminRecord() {
  if (hasEnvPassword()) return { username: "admin", mode: "env" };
  let rec = load("admin", null);
  if (!rec) {
    const password = `siesta-${crypto.randomBytes(4).toString("hex")}`;
    console.log("\n  *** SIESTA ADMIN ***  First run: generated admin password:\n");
    console.log(`      ${password}\n`);
    console.log("  Log in at /admin with username 'admin'. Set ADMIN_PASSWORD env to change it.\n");
    const salt = crypto.randomBytes(16).toString("hex");
    rec = { username: "admin", salt, hash: hash(password, salt), createdAt: new Date().toISOString() };
    save("admin", rec);
  }
  return rec;
}

function verify(password) {
  try {
    if (hasEnvPassword()) {
      return crypto.timingSafeEqual(
        Buffer.from(hash(password, ENV_SALT), "hex"),
        Buffer.from(hash(process.env.ADMIN_PASSWORD, ENV_SALT), "hex")
      );
    }
    const rec = getAdminRecord();
    return crypto.timingSafeEqual(Buffer.from(hash(password, rec.salt), "hex"), Buffer.from(rec.hash, "hex"));
  } catch {
    return false;
  }
}

// ---- stateless JWT (used when ADMIN_PASSWORD is set) ----
function jwtKey() {
  return crypto.scryptSync(String(process.env.ADMIN_PASSWORD), JWT_SALT, 32);
}
function signJwt() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL })).toString("base64url");
  const sig = crypto.createHmac("sha256", jwtKey()).update(`jwt.${payload}`).digest("hex");
  return `jwt.${payload}.${sig}`;
}
function validJwt(token) {
  try {
    if (!hasEnvPassword() || typeof token !== "string") return false;
    const [tag, payload, sig] = token.split(".");
    if (tag !== "jwt" || !payload || !sig) return false;
    const expect = crypto.createHmac("sha256", jwtKey()).update(`jwt.${payload}`).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expect, "hex"))) return false;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(exp) > Date.now();
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
  if (hasEnvPassword()) return signJwt();
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function validToken(token) {
  if (validJwt(token)) return true;
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
