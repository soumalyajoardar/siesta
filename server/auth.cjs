"use strict";
// Admin authentication. The login credential lives ONLY in the database:
//   - Supabase mode → `collections` row "admin" (shared across all instances)
//   - JSON mode → server/data/admin.json
// No password is ever kept in files, env vars, or code. ADMIN_PASSWORD is
// used once, purely as a first-run bootstrap (persisted immediately, then
// ignored); afterwards the stored record rules. Without any record, a safe
// password is generated + printed (local only — Vercel refuses instead).
// Tokens are stateless JWTs signed with a key derived from the stored
// record, so logins survive restarts, redeploys and multiple instances.
// Rotate anytime in Admin → Settings (re-signs every session).
// NOTE: for single-server local / small-business use. Always serve over HTTPS
// in production (Vercel provides this automatically).
const crypto = require("crypto");
const store = require("./store.cjs");

const TOKEN_TTL = 12 * 3600 * 1000;
const JWT_SALT = "siesta-jwt-v1";

const hasEnvPassword = () => Boolean(process.env.ADMIN_PASSWORD);

function hash(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function makeRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { username: "admin", salt, hash: hash(password, salt), createdAt: new Date().toISOString() };
}

// Source of truth: stored record → else ADMIN_PASSWORD bootstrap (persisted)
// → else generated password (local only; Vercel refuses without one).
async function getAdminRecord() {
  const rec = await store.getAdmin();
  if (rec && rec.hash) return rec;
  if (hasEnvPassword()) {
    const created = makeRecord(process.env.ADMIN_PASSWORD);
    await store.saveAdmin(created);
    return created;
  }
  if (process.env.VERCEL) {
    throw new Error("Set ADMIN_PASSWORD once in Vercel environment variables and redeploy to create the admin login.");
  }
  const password = `siesta-${crypto.randomBytes(4).toString("hex")}`;
  console.log("\n  *** SIESTA ADMIN ***  First run: generated admin password:\n");
  console.log(`      ${password}\n`);
  console.log("  Log in at /admin with username 'admin'. Change it in Admin → Settings afterwards.\n");
  const created = makeRecord(password);
  await store.saveAdmin(created);
  return created;
}

async function verify(password) {
  try {
    const rec = await getAdminRecord();
    return crypto.timingSafeEqual(Buffer.from(hash(password, rec.salt), "hex"), Buffer.from(rec.hash, "hex"));
  } catch {
    return false;
  }
}

async function changePassword(currentPw, nextPw) {
  const rec = await getAdminRecord();
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(hash(currentPw, rec.salt), "hex"), Buffer.from(rec.hash, "hex"));
  } catch { ok = false; }
  if (!ok) {
    const err = new Error("Your current password is incorrect.");
    err.status = 401;
    throw err;
  }
  if (String(nextPw || "").length < 8) {
    const err = new Error("New password must be at least 8 characters.");
    err.status = 400;
    throw err;
  }
  await store.saveAdmin(makeRecord(nextPw));
}

// ---- stateless JWT, keyed by the stored record (works on every instance) ----
async function jwtKey() {
  const rec = await getAdminRecord();
  return crypto.scryptSync(String(rec.hash), JWT_SALT, 32);
}
async function issueToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL })).toString("base64url");
  const sig = crypto.createHmac("sha256", await jwtKey()).update(`jwt.${payload}`).digest("hex");
  return `jwt.${payload}.${sig}`;
}
async function validToken(token) {
  try {
    if (typeof token !== "string") return false;
    const [tag, payload, sig] = token.split(".");
    if (tag !== "jwt" || !payload || !sig) return false;
    const expect = crypto.createHmac("sha256", await jwtKey()).update(`jwt.${payload}`).digest("hex");
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

async function requireAdmin(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!(await validToken(token))) return res.status(401).json({ error: "Admin login required." });
    next();
  } catch {
    res.status(401).json({ error: "Admin login required." });
  }
}

/* ---------------- customer accounts (server-side, cross-device) ---------------- */
const CUST_JWT_SALT = "siesta-cust-jwt-v1";
const CUST_TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 days
async function custKey() {
  if (process.env.CUSTOMER_JWT_SECRET) return crypto.scryptSync(String(process.env.CUSTOMER_JWT_SECRET), CUST_JWT_SALT, 32);
  if (process.env.SUPABASE_SERVICE_KEY) return crypto.scryptSync(String(process.env.SUPABASE_SERVICE_KEY), CUST_JWT_SALT, 32);
  const rec = await store.getAdmin().catch(() => null); // stable per install (JSON mode)
  if (rec && rec.hash) return crypto.scryptSync(String(rec.hash), CUST_JWT_SALT, 32);
  return crypto.randomBytes(32); // last resort: sessions die on restart (local dev only)
}
async function custSign(customerId) {
  const payload = Buffer.from(JSON.stringify({ sub: customerId, exp: Date.now() + CUST_TOKEN_TTL })).toString("base64url");
  const sig = crypto.createHmac("sha256", await custKey()).update(`cust.${payload}`).digest("hex");
  return `cust.${payload}.${sig}`;
}
async function custValid(token) {
  try {
    if (typeof token !== "string") return null;
    const [tag, payload, sig] = token.split(".");
    if (tag !== "cust" || !payload || !sig) return null;
    const expect = crypto.createHmac("sha256", await custKey()).update(`cust.${payload}`).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expect, "hex"))) return null;
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!(Number(exp) > Date.now())) return null;
    const list = await store.getCustomers();
    return list.find((u) => u.id === sub) || null;
  } catch {
    return null;
  }
}
async function requireCustomer(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = await custValid(token);
    if (!user) return res.status(401).json({ error: "Please log in to continue." });
    req.customer = user;
    next();
  } catch {
    res.status(401).json({ error: "Please log in to continue." });
  }
}
const sanitizeCustomer = (u) => (u ? { id: u.id, name: u.name, email: u.email, phone: u.phone || "", marketing: !!u.marketing, createdAt: u.createdAt } : null);

module.exports = { getAdminRecord, verify, changePassword, issueToken, validToken, requireAdmin, rateLimited, recordFailure, hasEnvPassword, custSign, custValid, requireCustomer, sanitizeCustomer };
