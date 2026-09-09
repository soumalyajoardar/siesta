"use strict";
// Siesta backend: serves the storefront + admin dashboard and exposes a REST API.
// - Storage backend: Supabase (Postgres + Storage) when SUPABASE_URL and
//   SUPABASE_SERVICE_KEY are set, otherwise local JSON files. See store.js.
// - Public API re-validates prices, coupons and stock server-side (never trusts the client).
// - Admin API (bearer token) manages products, images, orders, coupons, settings.
// Run:  npm start   (or: PORT=3000 node server/index.cjs)
// Hosting: `start()` boots a long-running server locally; on Vercel the
// api/index.js wrapper reuses `app` as a serverless function instead.
const path = require("path");
const fs = require("fs");
require("./env.cjs"); // load .env (if present) before anything reads config
const { execSync } = require("child_process");
const express = require("express");
const multer = require("multer");
const store = require("./store.cjs");
const sbs = require("./supabase.cjs");
const { verify, issueToken, requireAdmin, rateLimited, recordFailure, getAdminRecord, changePassword, hasEnvPassword } = require("./auth.cjs");

const IS_VERCEL = Boolean(process.env.VERCEL);
const ROOT = path.join(__dirname, "..");
const UPLOAD_DIR = path.join(__dirname, "uploads");
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* read-only serverless FS */ }

const app = express();
app.use(express.json({ limit: "1mb" }));
// Storefront data changes from the admin — never let browsers cache API JSON.
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// Safe diagnostic: which config the live deployment sees (names only, no secrets).
app.get("/api/debug", async (req, res) => {
  let hasAdminRecord = false;
  try { hasAdminRecord = Boolean((await store.getAdmin()) || hasEnvPassword()); } catch {}
  res.json({
    vercel: IS_VERCEL,
    backend: store.backend(),
    hasAdminPassword: Boolean(process.env.ADMIN_PASSWORD),
    hasAdminRecord,
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseKey: Boolean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    node: process.version,
  });
});

// On Vercel there is no persistent disk: Supabase is mandatory and every
// /api call waits for one verified connection (then reuses it).
let apiReady = null;
function ensureApiReady() {
  if (!apiReady) {
    apiReady = (async () => {
      if (store.backend() !== "supabase") {
        const err = new Error("Supabase is required when hosted on Vercel: set SUPABASE_URL + SUPABASE_SERVICE_KEY in Vercel environment variables.");
        err.status = 503;
        throw err;
      }
      await sbs.checkConnection();
      await store.migrateIfNeeded();
    })().catch((e) => { apiReady = null; throw e; });
  }
  return apiReady;
}
if (IS_VERCEL) {
  app.use("/api", async (req, res, next) => {
    try { await ensureApiReady(); next(); }
    catch (e) { res.status(e.status || 503).json({ error: e.message }); }
  });
}

const STAGES = ["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
// Customer-facing timeline notes — plain, honest, no fake courier scans.
const STAGE_NOTES = {
  confirmed: "Order received — your items are reserved and the packing list is ready.",
  processing: "Your items are being picked and quality-checked at our facility.",
  packed: "Packed, sealed and labelled — ready for courier handoff.",
  shipped: "Handed to our delivery partner and on its way to you.",
  out_for_delivery: "Out for delivery and arriving today — our courier attempts delivery between 10:00 AM and 10:00 PM. Please keep the COD amount ready.",
  delivered: "Delivered. We hope you love it — tap below to review your items.",
  cancelled: "Cancelled before shipment — nothing was charged (Cash on Delivery).",
};
const CATEGORIES = ["tshirts", "shirts", "jackets", "hoodies", "jeans", "pants", "shorts", "sweatshirts"];

/* ---------------- helpers ---------------- */
const { getProducts, getCoupons, getOrders, getSettings, getEvents, getReviews } = store;
const notExpired = (c) => new Date(c.expires + "T23:59:59") >= new Date();
const discountPct = (p) => (p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0);
// Allowed image locations: local uploads, project images folder, Supabase bucket.
const storeImgBase = () => (sbs.getUrl() ? `${sbs.getUrl().replace(/\/$/, "")}/storage/v1/object/public/product-images/` : "");
const imgUrl = (u) => typeof u === "string" && (u.startsWith("/uploads/") || u.startsWith("/images/") || (storeImgBase() && u.startsWith(storeImgBase())));

function sanitizeProduct(b, isNew) {
  const str = (v, max = 200) => String(v ?? "").slice(0, max).trim();
  const num = (v, fb = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : fb);
  const p = {
    name: str(b.name, 120),
    category: CATEGORIES.includes(b.category) ? b.category : "tshirts",
    gender: ["men", "women", "unisex"].includes(b.gender) ? b.gender : "unisex",
    price: num(b.price, 999),
    mrp: num(b.mrp, num(b.price, 999)),
    colors: Array.isArray(b.colors) ? b.colors.slice(0, 6).map((c) => ({ name: str(c.name, 40) || "Default", hex: /^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : "#999999" })) : [{ name: "Default", hex: "#999999" }],
    sizes: Array.isArray(b.sizes) ? b.sizes.map((s) => str(s, 6)).filter(Boolean).slice(0, 10) : ["M", "L"],
    stock: num(b.stock, 0),
    material: str(b.material, 200),
    care: str(b.care, 300),
    desc: str(b.desc, 1000),
    details: Array.isArray(b.details) ? b.details.map((d) => str(d, 200)).filter(Boolean).slice(0, 10) : [],
    isNew: !!b.isNew,
    bestseller: !!b.bestseller,
    images: Array.isArray(b.images) ? b.images.filter(imgUrl).slice(0, 8) : [],
  };
  if (p.mrp < p.price) p.mrp = p.price;
  if (!p.name) throw new Error("Product name is required.");
  if (!p.sizes.length) throw new Error("At least one size is required.");
  if (isNew) {
    p.id = str(b.id, 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || ("p-" + Date.now().toString(36));
    p.sku = str(b.sku, 24) || ("SS-" + Date.now().toString(36).toUpperCase());
    p.added = new Date().toISOString().slice(0, 10);
    p.popularity = 50;
  }
  return p;
}

/* ---------------- public API ---------------- */
app.get("/api/health", (req, res) => res.json({ ok: true, store: "Siesta", backend: store.backend(), time: new Date().toISOString() }));

// Maintenance gate: when enabled from Admin → Settings, the storefront shows
// a maintenance page and no new orders/reviews can be created (admin stays usable).
async function maintenanceOn() {
  try {
    const s = await getSettings();
    return Boolean(s && s.maintenance && s.maintenance.enabled);
  } catch {
    return false;
  }
}
function maintenanceBlock() {
  return { error: "Siesta is under maintenance right now. Please try again in a little while." };
}

// Verified-purchase rating summaries, attached to product responses.
function ratingMap(reviews) {
  const m = {};
  for (const r of reviews || []) {
    (m[r.productId] = m[r.productId] || { count: 0, sum: 0 });
    m[r.productId].count++;
    m[r.productId].sum += r.rating;
  }
  const out = {};
  for (const [k, v] of Object.entries(m)) out[k] = { count: v.count, avg: Math.round((v.sum / v.count) * 10) / 10 };
  return out;
}

app.get("/api/products", async (req, res) => {
  try {
    let list = await getProducts();
    const ratings = ratingMap(await getReviews());
    const { category, gender, q } = req.query;
    if (category) list = list.filter((p) => p.category === category);
    if (gender) list = list.filter((p) => p.gender === gender);
    if (q) {
      const n = String(q).toLowerCase();
      list = list.filter((p) => [p.name, p.category, p.gender, p.desc, p.material].join(" ").toLowerCase().includes(n));
    }
    res.json(list.map((p) => ({ ...p, discountPct: discountPct(p), rating: ratings[p.id] || { count: 0, avg: 0 } })));
  } catch (e) { res.status(500).json({ error: "Could not load products." }); }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const p = (await getProducts()).find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: "Product not found." });
    const r = ratingMap(await getReviews())[p.id] || { count: 0, avg: 0 };
    res.json({ ...p, discountPct: discountPct(p), rating: r });
  } catch (e) { res.status(500).json({ error: "Could not load the product." }); }
});

// Public verified reviews for one product (newest first, no order details exposed).
app.get("/api/products/:id/reviews", async (req, res) => {
  try {
    const list = (await getReviews())
      .filter((r) => r.productId === req.params.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((r) => ({ id: r.id, rating: r.rating, title: r.title, text: r.text, author: r.author, createdAt: r.createdAt, verified: true }));
    res.json(list);
  } catch (e) { res.status(500).json({ error: "Could not load reviews." }); }
});

// Public recent verified reviews (safe fields only, newest first) + store-wide aggregate.
app.get("/api/reviews/recent", async (req, res) => {
  try {
    const n = Math.min(Math.max(1, Number((req.query || {}).limit) || 3), 12);
    const all = await getReviews();
    const avg = all.length ? Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 10) / 10 : 0;
    const reviews = [...all]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, n)
      .map((r) => ({ id: r.id, rating: r.rating, title: r.title, text: String(r.text).slice(0, 220), author: r.author, createdAt: r.createdAt, verified: true, productId: r.productId, productName: r.productName }));
    res.json({ count: all.length, avg, reviews });
  } catch (e) { res.status(500).json({ error: "Could not load reviews." }); }
});

// Write a review — only for items in DELIVERED orders, one per order+product.
app.post("/api/reviews", async (req, res) => {
  try {
    if (await maintenanceOn()) return res.status(503).json(maintenanceBlock());
    const { orderNo, productId, rating, title, text } = req.body || {};
    if (!orderNo || !productId) return res.status(400).json({ error: "Order number and product are required." });
    const r = Math.round(Number(rating));
    if (!(r >= 1 && r <= 5)) return res.status(400).json({ error: "Please choose a star rating from 1 to 5." });
    const cleanText = String(text || "").trim();
    if (cleanText.length < 10) return res.status(400).json({ error: "Please write at least a sentence (10+ characters) about the product." });
    if (cleanText.length > 1000) return res.status(400).json({ error: "Please keep your review under 1000 characters." });
    const order = (await getOrders()).find((x) => x.orderNo.toLowerCase() === String(orderNo).toLowerCase());
    if (!order) return res.status(404).json({ error: "We couldn't find that order." });
    if (order.status !== "delivered") return res.status(400).json({ error: "Reviews open up once your order is delivered." });
    const item = order.items.find((i) => i.id === productId);
    if (!item) return res.status(400).json({ error: "That product isn't part of this order." });
    const reviews = await getReviews();
    if (reviews.some((x) => x.orderNo === order.orderNo && x.productId === productId)) {
      return res.status(409).json({ error: "You've already reviewed this item. Thanks!" });
    }
    const product = (await getProducts()).find((x) => x.id === productId);
    const review = {
      id: "rv-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      productId, productName: product ? product.name : item.name,
      orderNo: order.orderNo, rating: r,
      title: String(title || "").trim().slice(0, 120),
      text: cleanText,
      author: String((order.address && order.address.name) || "Verified buyer").trim().split(" ")[0] || "Verified buyer",
      createdAt: new Date().toISOString(), verified: true,
    };
    await store.saveReviews([review, ...reviews]);
    res.status(201).json({ id: review.id, rating: review.rating, title: review.title, text: review.text, author: review.author, createdAt: review.createdAt, verified: true });
  } catch (e) { res.status(500).json({ error: "Could not save your review. Please try again." }); }
});

app.get("/api/coupons", async (req, res) => {
  try {
    res.json((await getCoupons()).filter((c) => c.active !== false && notExpired(c)));
  } catch (e) { res.status(500).json({ error: "Could not load coupons." }); }
});

app.get("/api/settings", async (req, res) => {
  try { res.json(await getSettings()); }
  catch (e) { res.status(500).json({ error: "Could not load settings." }); }
});

// Create a COD order. Totals are computed HERE from database prices.
app.post("/api/orders", async (req, res) => {
  try {
    if (await maintenanceOn()) return res.status(503).json(maintenanceBlock());
    const { items, address, coupon } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Your cart is empty." });
    const products = await getProducts();
    const settings = await getSettings();
    const a = address || {};
    for (const f of ["name", "phone", "line1", "city", "state", "pin"]) {
      if (!String(a[f] || "").trim()) return res.status(400).json({ error: `Delivery address is incomplete (missing ${f}).` });
    }
    if (!/^\d{6}$/.test(String(a.pin).trim())) return res.status(400).json({ error: "Enter a valid 6-digit PIN code." });

    let subtotal = 0, mrpTotal = 0;
    const lines = [];
    for (const it of items) {
      const p = products.find((x) => x.id === it.id);
      if (!p) return res.status(400).json({ error: "A product in your cart no longer exists." });
      const qty = Math.min(Math.max(1, Number(it.qty) || 1), 10);
      if (!p.sizes.includes(it.size)) return res.status(400).json({ error: `Size ${it.size} is not available for ${p.name}.` });
      if ((p.stock ?? 0) < qty) return res.status(400).json({ error: `Only ${p.stock} left of ${p.name}. Please adjust quantity.` });
      subtotal += p.price * qty;
      mrpTotal += p.mrp * qty;
      lines.push({ id: p.id, name: p.name, price: p.price, qty, size: it.size, color: it.color || p.colors[0].name });
    }
    void mrpTotal;
    let discount = 0, couponCode = null;
    if (coupon) {
      const c = (await getCoupons()).find((x) => x.code === String(coupon).toUpperCase() && x.active !== false);
      if (!c) return res.status(400).json({ error: "This coupon code isn't valid." });
      if (!notExpired(c)) return res.status(400).json({ error: "This coupon has expired." });
      if (subtotal < c.minSubtotal) return res.status(400).json({ error: `This coupon needs a minimum order of ₹${c.minSubtotal}.` });
      discount = c.type === "pct" ? Math.round((subtotal * c.value) / 100) : c.value;
      discount = Math.min(discount, subtotal);
      couponCode = c.code;
    }
    const shipping = subtotal - discount >= settings.freeShipThreshold ? 0 : settings.shipFlat;
    // Round DOWN to the nearest ₹5 (fives table) — never adds, may leave unchanged.
    const preRound = subtotal - discount + shipping;
    const total = Math.floor(preRound / 5) * 5;
    const roundOff = total - preRound;
    if (total > settings.codMaxOrder) return res.status(400).json({ error: `COD is available up to ₹${settings.codMaxOrder.toLocaleString("en-IN")}.` });

    // Decrement stock.
    const updated = products.map((p) => {
      const line = lines.find((l) => l.id === p.id);
      return line ? { ...p, stock: p.stock - line.qty } : p;
    });
    await store.saveProducts(updated);

    // Unique 12-digit order number (timestamp slice + random, collision-checked).
    const existingNos = new Set((await getOrders()).map((x) => x.orderNo));
    let orderNo = "";
    do {
      orderNo = String(Date.now()).slice(-6) + String(Math.floor(100000 + Math.random() * 900000));
    } while (existingNos.has(orderNo));
    const now = new Date().toISOString();
    const order = {
      orderNo, createdAt: now, items: lines,
      address: { name: a.name, phone: a.phone, line1: a.line1, land: a.land || "", city: a.city, state: a.state, pin: a.pin, country: "India" },
      payment: "Cash on Delivery", coupon: couponCode,
      amounts: { subtotal, mrpTotal, savings: mrpTotal - subtotal, discount, shipping, roundOff, total },
      status: "confirmed",
      timeline: [{ stage: "confirmed", at: now, note: "Order placed · Cash on Delivery" }],
    };
    await store.saveOrders([order, ...(await getOrders())]);
    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: "Could not create the order. Please try again." });
  }
});

// Public tracking by order number.
app.get("/api/orders/:orderNo", async (req, res) => {
  try {
    const o = (await getOrders()).find((x) => x.orderNo.toLowerCase() === String(req.params.orderNo).toLowerCase());
    if (!o) return res.status(404).json({ error: "Order not found." });
    res.json(o);
  } catch (e) { res.status(500).json({ error: "Could not load the order." }); }
});

// Public pre-shipment cancel (order numbers are unguessable; same exposure as tracking).
app.post("/api/orders/:orderNo/cancel", async (req, res) => {
  try {
    const orders = await getOrders();
    const o = orders.find((x) => x.orderNo.toLowerCase() === String(req.params.orderNo).toLowerCase());
    if (!o) return res.status(404).json({ error: "Order not found." });
    if (!["confirmed", "processing"].includes(o.status)) return res.status(400).json({ error: "This order can no longer be cancelled (already packed/shipped)." });
  o.status = "cancelled";
  o.timeline.push({ stage: "cancelled", at: new Date().toISOString(), note: STAGE_NOTES.cancelled });
    // Restock.
    const products = (await getProducts()).map((p) => {
      const line = o.items.find((l) => l.id === p.id);
      return line ? { ...p, stock: p.stock + line.qty } : p;
    });
    await store.saveProducts(products);
    await store.saveOrders(orders);
    res.json(o);
  } catch (e) { res.status(500).json({ error: "Could not cancel the order." }); }
});

/* ---------------- customer auth (server-side accounts, cross-device) ---------------- */
const { requireCustomer, sanitizeCustomer, custSign } = require("./auth.cjs");
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ""));
const isPhone = (v) => /^[6-9]\d{9}$/.test(String(v || "").replace(/\D/g, "").slice(-10));
const custHash = (pw, salt) => require("crypto").scryptSync(String(pw), salt, 64).toString("hex");

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, phone, marketing } = req.body || {};
    if (String(name || "").trim().length < 3) return res.status(400).json({ error: "Enter your full name." });
    if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (String(password || "").length < 8) return res.status(400).json({ error: "Use at least 8 characters." });
    if (phone && !isPhone(phone)) return res.status(400).json({ error: "Enter a valid 10-digit mobile number or leave it blank." });
    const cleanEmail = String(email).trim().toLowerCase();
    const list = await store.getCustomers();
    if (list.some((u) => u.email === cleanEmail)) return res.status(409).json({ error: "An account with this email already exists. Try logging in instead." });
    const salt = require("crypto").randomBytes(16).toString("hex");
    const user = {
      id: "cu_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: String(name).trim(), email: cleanEmail,
      phone: phone ? String(phone).replace(/\D/g, "").slice(-10) : "",
      salt, hash: custHash(password, salt),
      marketing: !!marketing, addresses: [],
      createdAt: new Date().toISOString(),
    };
    await store.saveCustomers([user, ...list]);
    res.status(201).json({ token: await custSign(user.id), user: sanitizeCustomer(user) });
  } catch (e) { res.status(500).json({ error: "Could not create your account. Please try again." }); }
});

app.post("/api/auth/login", async (req, res) => {
  const ip = req.ip;
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  try {
    const { email, password } = req.body || {};
    const user = (await store.getCustomers()).find((u) => u.email === String(email || "").trim().toLowerCase());
    const ok = user && (() => { try { return require("crypto").timingSafeEqual(Buffer.from(custHash(password, user.salt), "hex"), Buffer.from(user.hash, "hex")); } catch { return false; } })();
    if (!ok) { recordFailure(ip); return res.status(401).json({ error: "Incorrect email or password. Please try again." }); }
    res.json({ token: await custSign(user.id), user: sanitizeCustomer(user) });
  } catch (e) { res.status(500).json({ error: "Login failed. Please try again." }); }
});

app.get("/api/auth/me", requireCustomer, (req, res) => res.json({
  user: sanitizeCustomer(req.customer),
  addresses: req.customer.addresses || [],
  cart: req.customer.cart || [],
  wishlist: req.customer.wishlist || [],
}));

app.patch("/api/auth/me", requireCustomer, async (req, res) => {
  try {
    const { name, phone, marketing, cart, wishlist } = req.body || {};
    if (name !== undefined && String(name).trim().length < 3) return res.status(400).json({ error: "Enter your full name." });
    if (phone !== undefined && phone !== "" && !isPhone(phone)) return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });
    const list = await store.getCustomers();
    const u = list.find((x) => x.id === req.customer.id);
    if (!u) return res.status(404).json({ error: "Account not found." });
    if (name !== undefined) u.name = String(name).trim();
    if (phone !== undefined) u.phone = phone ? String(phone).replace(/\D/g, "").slice(-10) : "";
    if (marketing !== undefined) u.marketing = !!marketing;
    if (cart !== undefined) u.cart = sanitizeCart(cart);
    if (wishlist !== undefined) u.wishlist = sanitizeWishlist(wishlist);
    await store.saveCustomers(list);
    res.json({ user: sanitizeCustomer(u) });
  } catch (e) { res.status(500).json({ error: "Could not update your profile." }); }
});

// Lightly validated shopping state (prices/stock are always re-checked at checkout).
function sanitizeCart(cart) {
  if (!Array.isArray(cart)) return [];
  return cart.slice(0, 50).map((l) => ({
    id: String((l && l.id) || "").slice(0, 80),
    size: String((l && l.size) || "").slice(0, 6),
    color: String((l && l.color) || "").slice(0, 40),
    qty: Math.min(Math.max(1, Number((l && l.qty) || 1) || 1), 10),
  })).filter((l) => l.id && l.size);
}
function sanitizeWishlist(w) {
  if (!Array.isArray(w)) return [];
  return [...new Set(w.map((x) => String(x).slice(0, 80)).filter(Boolean))].slice(0, 200);
}

app.post("/api/auth/password", requireCustomer, async (req, res) => {
  try {
    const { current, next } = req.body || {};
    const list = await store.getCustomers();
    const u = list.find((x) => x.id === req.customer.id);
    if (!u) return res.status(404).json({ error: "Account not found." });
    let ok = false;
    try { ok = require("crypto").timingSafeEqual(Buffer.from(custHash(current, u.salt), "hex"), Buffer.from(u.hash, "hex")); } catch { ok = false; }
    if (!ok) return res.status(401).json({ error: "Your current password is incorrect." });
    if (String(next || "").length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
    u.salt = require("crypto").randomBytes(16).toString("hex");
    u.hash = custHash(next, u.salt);
    await store.saveCustomers(list);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Could not change your password." }); }
});

// Full-replace address sync (validated lightly; detail rules live at checkout).
app.put("/api/auth/addresses", requireCustomer, async (req, res) => {
  try {
    const addrs = Array.isArray(req.body && req.body.addresses) ? req.body.addresses.slice(0, 10) : null;
    if (!addrs) return res.status(400).json({ error: "Addresses must be a list." });
    for (const a of addrs) {
      if (!a || typeof a !== "object") return res.status(400).json({ error: "Invalid address entry." });
      for (const f of ["name", "phone", "line1", "city", "pin"]) {
        if (!String(a[f] || "").trim()) return res.status(400).json({ error: "Each address needs name, phone, street, city and PIN." });
      }
      if (!/^\d{6}$/.test(String(a.pin).trim())) return res.status(400).json({ error: "Each address needs a valid 6-digit PIN." });
    }
    const list = await store.getCustomers();
    const u = list.find((x) => x.id === req.customer.id);
    if (!u) return res.status(404).json({ error: "Account not found." });
    u.addresses = addrs.map((a) => ({
      id: String(a.id || ("ad_" + Math.random().toString(36).slice(2, 9))),
      name: String(a.name).trim(), phone: String(a.phone).trim(), line1: String(a.line1).trim(),
      land: String(a.land || "").trim(), city: String(a.city).trim(), state: String(a.state || "").trim(),
      pin: String(a.pin).trim(), country: "India", isDefault: !!a.isDefault,
    }));
    await store.saveCustomers(list);
    res.json({ addresses: u.addresses });
  } catch (e) { res.status(500).json({ error: "Could not save addresses." }); }
});

/* ---------------- admin auth ---------------- */
app.post("/api/admin/login", async (req, res) => {
  const ip = req.ip;
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  try {
    await getAdminRecord(); // surfaces bootstrap problems with a clear message
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }
  const { username, password } = req.body || {};
  if (username === "admin" && (await verify(password))) {
    return res.json({ token: await issueToken() });
  }
  recordFailure(ip);
  res.status(401).json({ error: "Invalid username or password." });
});

// Rotate the admin password (stored hashed in the database, never plaintext).
app.patch("/api/admin/password", requireAdmin, async (req, res) => {
  try {
    await changePassword(req.body && req.body.current, req.body && req.body.next);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Could not change the password." });
  }
});

/* ---------------- admin: products ---------------- */
app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try { res.json(await getProducts()); }
  catch (e) { res.status(500).json({ error: "Could not load products." }); }
});
app.post("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const products = await getProducts();
    const p = sanitizeProduct(req.body, true);
    if (products.some((x) => x.id === p.id)) return res.status(409).json({ error: "A product with this ID already exists." });
    await store.saveProducts([p, ...products]);
    res.status(201).json(p);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const products = await getProducts();
    const i = products.findIndex((x) => x.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: "Product not found." });
    const keep = products[i];
    products[i] = { ...sanitizeProduct(req.body, false), id: keep.id, sku: req.body.sku || keep.sku, added: keep.added, popularity: keep.popularity ?? 50 };
    await store.saveProducts(products);
    res.json(products[i]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const products = await getProducts();
    if (!products.some((x) => x.id === req.params.id)) return res.status(404).json({ error: "Product not found." });
    await store.saveProducts(products.filter((x) => x.id !== req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Could not delete the product." }); }
});

/* ---------------- admin: image uploads ---------------- */
// Files land in memory, then go to Supabase Storage (Supabase mode) or the
// local uploads folder (JSON mode). Same response shape either way.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.mimetype)
      && [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Only JPG, PNG, WebP, GIF or AVIF images are allowed."), ok);
  },
});
app.post("/api/admin/upload", requireAdmin, (req, res) => {
  upload.array("images", 8)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const files = req.files || [];
      if (store.backend() === "supabase") {
        const out = [];
        for (const f of files) {
          const url = await sbs.uploadImage(f.buffer, f.originalname, f.mimetype);
          out.push({ url, name: f.originalname, size: f.size });
        }
        return res.status(201).json(out);
      }
      const out = files.map((f) => {
        const ext = path.extname(f.originalname).toLowerCase();
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), f.buffer);
        return { url: `/uploads/${filename}`, name: f.originalname, size: f.size };
      });
      res.status(201).json(out);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
});
app.get("/api/admin/uploads", requireAdmin, async (req, res) => {
  try {
    if (store.backend() === "supabase") return res.json(await sbs.listImages());
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter((f) => !f.startsWith("."))
      .map((f) => { const st = fs.statSync(path.join(UPLOAD_DIR, f)); return { url: `/uploads/${f}`, name: f, size: st.size, at: st.mtime }; })
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json(files);
  } catch (e) { res.status(500).json({ error: "Could not list images." }); }
});
app.delete("/api/admin/uploads/:name", requireAdmin, async (req, res) => {
  try {
    const name = path.basename(req.params.name);
    if (store.backend() === "supabase") {
      // Supabase URLs end with the plain filename; local ones are filenames already.
      await sbs.deleteImage(name);
      return res.json({ ok: true });
    }
    const fp = path.join(UPLOAD_DIR, name);
    if (!fp.startsWith(UPLOAD_DIR) || !fs.existsSync(fp)) return res.status(404).json({ error: "File not found." });
    fs.unlinkSync(fp);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Project images folder listing (files dropped into /images by hand).
app.get("/api/admin/site-images", requireAdmin, (req, res) => {
  const dir = path.join(ROOT, "images");
  fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir)
    .filter((f) => !f.startsWith(".") && /\.(jpe?g|png|webp|gif|avif)$/i.test(f))
    .map((f) => { const st = fs.statSync(path.join(dir, f)); return { url: `/images/${f}`, name: f, size: st.size, at: st.mtime }; })
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json(files);
});

/* ---------------- public events ---------------- */
function isLiveEvent(e, now = Date.now()) {
  if (!e || e.active === false) return false;
  if (e.startsAt && new Date(e.startsAt).getTime() > now) return false;
  if (e.endsAt && new Date(e.endsAt).getTime() < now) return false;
  return true;
}
app.get("/api/events", async (req, res) => {
  try {
    res.json((await getEvents()).filter((e) => isLiveEvent(e)).sort((a, b) => (a.sort || 0) - (b.sort || 0)));
  } catch (e) { res.status(500).json({ error: "Could not load events." }); }
});

/* ---------------- admin: events ---------------- */
const safeLink = (u) => (typeof u === "string" && (/^#\//.test(u) || /^https?:\/\//i.test(u)) ? u.slice(0, 300) : "#/shop");
function sanitizeEvent(b, isNew) {
  const str = (v, max = 300) => String(v ?? "").slice(0, max).trim();
  const e = {
    title: str(b.title, 120),
    subtitle: str(b.subtitle, 200),
    description: str(b.description, 1000),
    badge: str(b.badge, 60),
    image: imgUrl(b.image) ? b.image : "",
    gallery: Array.isArray(b.gallery) ? b.gallery.filter(imgUrl).slice(0, 8) : [],
    cta: str(b.cta, 40) || "Shop Now",
    link: safeLink(b.link),
    startsAt: b.startsAt || "",
    endsAt: b.endsAt || "",
    active: b.active !== false,
    sort: Math.max(0, Math.round(Number(b.sort) || 0)),
  };
  if (!e.title) throw new Error("Event title is required.");
  if (e.startsAt && e.endsAt && new Date(e.startsAt) > new Date(e.endsAt)) throw new Error("Start date must be before end date.");
  if (isNew) e.id = str(b.id, 60).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || ("ev-" + Date.now().toString(36));
  return e;
}
app.get("/api/admin/events", requireAdmin, async (req, res) => {
  try { res.json(await getEvents()); }
  catch (e) { res.status(500).json({ error: "Could not load events." }); }
});
app.post("/api/admin/events", requireAdmin, async (req, res) => {
  try {
    const list = await getEvents();
    const e = sanitizeEvent(req.body, true);
    if (list.some((x) => x.id === e.id)) return res.status(409).json({ error: "An event with this ID already exists." });
    await store.saveEvents([...list, e]);
    res.status(201).json(e);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put("/api/admin/events/:id", requireAdmin, async (req, res) => {
  try {
    const list = await getEvents();
    const i = list.findIndex((x) => x.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: "Event not found." });
    list[i] = { ...sanitizeEvent(req.body, false), id: list[i].id };
    await store.saveEvents(list);
    res.json(list[i]);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/admin/events/:id", requireAdmin, async (req, res) => {
  try {
    await store.saveEvents((await getEvents()).filter((x) => x.id !== req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Could not delete the event." }); }
});

/* ---------------- admin: coupons ---------------- */
app.get("/api/admin/coupons", requireAdmin, async (req, res) => {
  try { res.json(await getCoupons()); }
  catch (e) { res.status(500).json({ error: "Could not load coupons." }); }
});
app.post("/api/admin/coupons", requireAdmin, async (req, res) => {
  try {
    const list = await getCoupons();
    const code = String(req.body.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) return res.status(400).json({ error: "Code must be 4–16 letters/digits." });
    if (list.some((c) => c.code === code)) return res.status(409).json({ error: "Coupon already exists." });
    const c = { code, type: req.body.type === "flat" ? "flat" : "pct", value: Math.max(1, Math.round(Number(req.body.value) || 0)), minSubtotal: Math.max(0, Math.round(Number(req.body.minSubtotal) || 0)), expires: req.body.expires || "2027-12-31", label: String(req.body.label || "").slice(0, 120), active: true };
    if (!c.value) return res.status(400).json({ error: "Discount value is required." });
    await store.saveCoupons([c, ...list]);
    res.status(201).json(c);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put("/api/admin/coupons/:code", requireAdmin, async (req, res) => {
  try {
    const list = await getCoupons();
    const i = list.findIndex((c) => c.code === req.params.code.toUpperCase());
    if (i < 0) return res.status(404).json({ error: "Coupon not found." });
    list[i] = { ...list[i], ...req.body, code: list[i].code };
    await store.saveCoupons(list);
    res.json(list[i]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/admin/coupons/:code", requireAdmin, async (req, res) => {
  try {
    await store.saveCoupons((await getCoupons()).filter((c) => c.code !== req.params.code.toUpperCase()));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Could not delete the coupon." }); }
});

/* ---------------- admin: orders ---------------- */
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try { res.json(await getOrders()); }
  catch (e) { res.status(500).json({ error: "Could not load orders." }); }
});
app.patch("/api/admin/orders/:orderNo", requireAdmin, async (req, res) => {
  try {
    const orders = await getOrders();
    const o = orders.find((x) => x.orderNo === req.params.orderNo);
    if (!o) return res.status(404).json({ error: "Order not found." });
    const { status, express } = req.body || {};
    if (status === undefined && express === undefined) return res.status(400).json({ error: "Nothing to update." });
    if (status !== undefined) {
      if (![...STAGES, "cancelled"].includes(status)) return res.status(400).json({ error: "Invalid status." });
      o.status = status;
      o.timeline.push({ stage: status, at: new Date().toISOString(), note: STAGE_NOTES[status] || "Status updated." });
    }
    if (express !== undefined) {
      if (express !== null && !["today", "tomorrow"].includes(express)) return res.status(400).json({ error: "Express option must be today, tomorrow or off." });
      if (express) {
        o.express = { option: express, at: new Date().toISOString(), by: "admin" };
        o.timeline.push({ stage: o.status, at: new Date().toISOString(), note: `Marked for express delivery — arriving ${express}.` });
      } else {
        delete o.express;
        o.timeline.push({ stage: o.status, at: new Date().toISOString(), note: "Express delivery removed." });
      }
    }
    await store.saveOrders(orders);
    res.json(o);
  } catch (e) { res.status(500).json({ error: "Could not update the order." }); }
});

/* ---------------- admin: reviews (moderation) ---------------- */
app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
  try {
    res.json((await getReviews()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (e) { res.status(500).json({ error: "Could not load reviews." }); }
});
app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  try {
    await store.saveReviews((await getReviews()).filter((r) => r.id !== req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Could not delete the review." }); }
});

/* ---------------- admin: customers (read-only list, no password data) ---------------- */
app.get("/api/admin/customers", requireAdmin, async (req, res) => {
  try {
    res.json((await store.getCustomers()).map((u) => ({
      id: u.id, name: u.name, email: u.email, phone: u.phone || "",
      marketing: !!u.marketing, addresses: (u.addresses || []).length, createdAt: u.createdAt,
    })));
  } catch (e) { res.status(500).json({ error: "Could not load customers." }); }
});

app.delete("/api/admin/orders/:orderNo", requireAdmin, async (req, res) => {
  try {
    const orders = await getOrders();
    if (!orders.some((x) => x.orderNo === req.params.orderNo)) return res.status(404).json({ error: "Order not found." });
    await store.saveOrders(orders.filter((x) => x.orderNo !== req.params.orderNo));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Could not delete the order." }); }
});

/* ---------------- admin: settings + stats ---------------- */
app.get("/api/admin/settings", requireAdmin, async (req, res) => {
  try { res.json(await getSettings()); }
  catch (e) { res.status(500).json({ error: "Could not load settings." }); }
});
app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const s = { ...(await getSettings()), ...req.body };
    s.freeShipThreshold = Math.max(0, Math.round(Number(s.freeShipThreshold) || 0));
    s.shipFlat = Math.max(0, Math.round(Number(s.shipFlat) || 0));
    await store.saveSettings(s);
    res.json(s);
  } catch (e) { res.status(500).json({ error: "Could not save settings." }); }
});
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const orders = await getOrders();
    const products = await getProducts();
    const live = orders.filter((o) => o.status !== "cancelled");
    const revenue = live.reduce((s, o) => s + (o.amounts?.total || 0), 0);
    const byStatus = {};
    orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    const lowStock = products.filter((p) => (p.stock ?? 0) <= 5).map((p) => ({ id: p.id, name: p.name, stock: p.stock }));
    res.json({ orders: orders.length, revenue, byStatus, products: products.length, lowStock, recent: orders.slice(0, 5) });
  } catch (e) { res.status(500).json({ error: "Could not load stats." }); }
});

/* ---------------- static: storefront, uploads, admin ---------------- */
// NOTE: server/, node_modules/ and package.json are deliberately NOT served.
// Only the public storefront assets, uploads and the admin UI are exposed.
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d" }));
// Project images folder: drop JPG/PNG/WebP files here (via Explorer/Finder)
// and reference them as /images/your-file.webp from any product.
const IMAGES_DIR = path.join(ROOT, "images");
try { fs.mkdirSync(IMAGES_DIR, { recursive: true }); } catch { /* read-only serverless FS */ }
app.use("/images", express.static(IMAGES_DIR, { maxAge: "7d" }));
app.use("/admin", express.static(path.join(ROOT, "admin")));
app.get("/admin", (req, res) => res.sendFile(path.join(ROOT, "admin", "index.html")));
for (const dir of ["css", "js", "assets"]) {
  // No stale-code surprises: browsers revalidate every time (cheap 304s via ETag).
  app.use("/" + dir, express.static(path.join(ROOT, dir), { maxAge: 0, etag: true }));
}
app.get(["/", "/index.html"], (req, res) => res.sendFile(path.join(ROOT, "index.html")));
app.get("/robots.txt", (req, res) => res.sendFile(path.join(ROOT, "robots.txt")));
app.get("/sitemap.xml", (req, res) => res.sendFile(path.join(ROOT, "sitemap.xml")));

/* ---------------- boot ---------------- */
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // LAN-reachable: open http://<this-PC-IP>:PORT from your phone
function lanIP() {
  try {
    const nets = require("os").networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const n of list || []) {
        if (n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254.")) return n.address;
      }
    }
  } catch {}
  return "localhost";
}

async function start() {
  // Seed local JSON on a truly fresh install (also the Supabase migration source).
  // Skipped entirely on Vercel (read-only filesystem; Supabase is mandatory there).
  if (store.backend() !== "supabase" && !fs.existsSync(path.join(__dirname, "data", "products.json"))) {
    console.log("Seeding database from storefront catalog…");
    execSync("node server/seed.js", { cwd: ROOT, stdio: "inherit" });
  }
  if (store.backend() === "supabase") {
    console.log("Store backend: Supabase");
    try {
      await sbs.checkConnection();
      if (await store.migrateIfNeeded()) {
        console.log("  local JSON data migrated into Supabase (JSON files left untouched as backup)");
      }
    } catch (e) {
      console.error(`\n  SUPABASE ERROR: ${e.message}`);
      console.error("  Run supabase/schema.sql in your Supabase SQL Editor, set SUPABASE_URL + SUPABASE_SERVICE_KEY, and restart.");
      console.error("  (JSON fallback is used only when those two variables are absent.)\n");
      process.exit(1);
    }
  } else {
    console.log("Store backend: local JSON files (set SUPABASE_URL + SUPABASE_SERVICE_KEY to use Supabase)");
  }
  // Eagerly initialise the admin account so a first-run password is printed now.
  try {
    await getAdminRecord();
  } catch (e) {
    console.error(`\n  ADMIN WARNING: ${e.message}\n`);
  }
  app.listen(PORT, HOST, () => {
    const ip = lanIP();
    console.log(`\n  SIESTA running [${store.backend()}] →  local:  http://localhost:${PORT}  (admin: /admin)`);
    console.log(`                                    phone:   http://${ip}:${PORT}  (same Wi-Fi)\n`);
  });
}

// `npm start` boots a server; Vercel imports { app } as a function instead.
if (require.main === module) start();
module.exports = { app, start };
