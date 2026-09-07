// Central client state. Browser-storage only (demo architecture).
// IMPORTANT: This is NOT production authentication or order management.
// A real backend must re-validate prices, coupons, inventory and identity server-side.
import { STORE } from "./config.js";
import { PRODUCTS, COUPONS } from "./data.js";
import { catalog, couponList } from "./api.js";

const K = {
  users: "siesta.users.v1",
  session: "siesta.session.v1",   // sessionStorage by default
  remember: "siesta.remember.v1", // localStorage when "remember me"
  cart: "siesta.cart.v1",
  wish: "siesta.wish.v1",
  orders: "siesta.orders.v1",
  addrs: "siesta.addrs.v1",
  coupon: "siesta.coupon.v1",
  recent: "siesta.recent.v1",
  searches: "siesta.searches.v1",
  consent: "siesta.consent.v1",
  prefs: "siesta.prefs.v1",
  news: "siesta.news.v1",
};

const read = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => { try { f(); } catch {} });

export const productById = (id) => catalog().find((p) => p.id === id) || PRODUCTS.find((p) => p.id === id);

// ---------- Password hashing (never store plaintext) ----------
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}::${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const makeSalt = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

// ---------- Users / session ----------
export function getUsers() { return read(K.users, []); }
export function currentUser() {
  try {
    const s = sessionStorage.getItem(K.session) || localStorage.getItem(K.remember);
    if (!s) return null;
    const { email } = JSON.parse(s);
    return getUsers().find((u) => u.email === email) || null;
  } catch { return null; }
}
export async function register({ name, email, password, phone, marketing }) {
  email = email.trim().toLowerCase();
  const users = getUsers();
  if (users.some((u) => u.email === email)) throw new Error("An account with this email already exists. Try logging in instead.");
  const salt = makeSalt();
  const hash = await hashPassword(password, salt);
  const user = { name: name.trim(), email, phone: (phone || "").trim(), salt, hash, marketing: !!marketing, createdAt: new Date().toISOString() };
  users.push(user);
  write(K.users, users);
  setSession(email, true);
  emit();
  return user;
}
export async function login(email, password, remember) {
  email = email.trim().toLowerCase();
  const user = getUsers().find((u) => u.email === email);
  if (!user) throw new Error("We couldn't find an account with this email. Check the spelling or create a new account.");
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.hash) throw new Error("Incorrect password. Please try again or reset your password.");
  setSession(email, remember);
  emit();
  return user;
}
function setSession(email, remember) {
  sessionStorage.removeItem(K.session); localStorage.removeItem(K.remember);
  const payload = JSON.stringify({ email, at: Date.now() });
  if (remember) localStorage.setItem(K.remember, payload);
  else sessionStorage.setItem(K.session, payload);
}
export function logout() {
  sessionStorage.removeItem(K.session); localStorage.removeItem(K.remember);
  emit();
}
export function updateProfile(email, patch) {
  const users = getUsers().map((u) => (u.email === email ? { ...u, ...patch } : u));
  write(K.users, users); emit();
}
export async function changePassword(email, currentPw, nextPw) {
  const users = getUsers();
  const u = users.find((x) => x.email === email);
  if (!u) throw new Error("Account not found.");
  const h = await hashPassword(currentPw, u.salt);
  if (h !== u.hash) throw new Error("Your current password is incorrect.");
  const salt = makeSalt();
  u.salt = salt; u.hash = await hashPassword(nextPw, salt);
  write(K.users, users); emit();
}

// ---------- Cart ----------
export const getCart = () => read(K.cart, []); // [{id,size,color,qty}]
export function setCart(c) { write(K.cart, c); emit(); }
export function addToCart(id, size, color, qty = 1) {
  const p = productById(id);
  if (!p) throw new Error("Product not found.");
  if (!size) throw new Error("Please choose a size first.");
  if ((p.stock ?? 0) <= 0) throw new Error("This item is currently out of stock.");
  const cart = getCart();
  const key = (l) => l.id === id && l.size === size && l.color === color;
  const ex = cart.find(key);
  const nextQty = (ex ? ex.qty : 0) + qty;
  if (nextQty > Math.min(STORE.maxQtyPerLine, p.stock)) throw new Error(`Only ${Math.min(STORE.maxQtyPerLine, p.stock)} per order for this item (stock: ${p.stock}).`);
  if (ex) ex.qty = nextQty; else cart.push({ id, size, color: color || p.colors[0].name, qty });
  setCart(cart);
}
export const updateQty = (idx, qty) => {
  const cart = getCart();
  if (!cart[idx]) return;
  const p = productById(cart[idx].id);
  qty = Math.max(1, Math.min(qty, Math.min(STORE.maxQtyPerLine, p ? p.stock : STORE.maxQtyPerLine)));
  cart[idx].qty = qty; setCart(cart);
};
export const removeLine = (idx) => { const c = getCart(); c.splice(idx, 1); setCart(c); };
export const clearCart = () => setCart([]);
export function cartDetailed() {
  return getCart().map((l, idx) => ({ ...l, idx, product: productById(l.id) })).filter((l) => l.product);
}
export function totals() {
  const lines = cartDetailed();
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const mrpTotal = lines.reduce((s, l) => s + l.product.mrp * l.qty, 0);
  const coupon = getCoupon();
  let discount = 0;
  if (coupon && subtotal >= coupon.minSubtotal && !isExpired(coupon)) {
    discount = coupon.type === "pct" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
    discount = Math.min(discount, subtotal);
  }
  const shipping = lines.length === 0 || subtotal - discount >= STORE.freeShipThreshold ? 0 : STORE.shipFlat;
  const total = Math.max(0, subtotal - discount + shipping);
  return { lines, subtotal, mrpTotal, savings: mrpTotal - subtotal, discount, shipping, total, coupon };
}
const isExpired = (c) => new Date(c.expires + "T23:59:59") < new Date();
export const getCoupon = () => read(K.coupon, null);
export function applyCoupon(code) {
  code = code.trim().toUpperCase();
  const c = couponList().find((x) => x.code === code);
  if (!c) throw new Error("This coupon code isn't valid. Check the spelling and try again.");
  if (isExpired(c)) throw new Error("This coupon has expired.");
  const { subtotal } = totals();
  if (subtotal < c.minSubtotal) throw new Error(`This coupon needs a minimum order of ₹${c.minSubtotal.toLocaleString("en-IN")}. Add ₹${(c.minSubtotal - subtotal).toLocaleString("en-IN")} more.`);
  write(K.coupon, c); emit();
  return c;
}
export const removeCoupon = () => { localStorage.removeItem(K.coupon); emit(); };

// ---------- Wishlist ----------
export const getWish = () => read(K.wish, []);
export function toggleWish(id) {
  let w = getWish();
  w = w.includes(id) ? w.filter((x) => x !== id) : [...w, id];
  write(K.wish, w); emit();
  return w.includes(id);
}
export const clearWish = () => { write(K.wish, []); emit(); };

// ---------- Addresses ----------
export const getAddrs = () => read(K.addrs, []);
export function saveAddr(a) {
  const list = getAddrs();
  if (a.id) {
    const i = list.findIndex((x) => x.id === a.id);
    if (i >= 0) list[i] = a;
  } else {
    a.id = "ad_" + Math.random().toString(36).slice(2, 9);
    if (list.length === 0) a.isDefault = true;
    list.push(a);
  }
  if (a.isDefault) list.forEach((x) => { if (x.id !== a.id) x.isDefault = false; });
  write(K.addrs, list); emit();
  return a;
}
export function deleteAddr(id) { write(K.addrs, getAddrs().filter((x) => x.id !== id)); emit(); }

// ---------- Orders (local order-state simulation — NOT courier scans) ----------
const STAGES = ["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
export const STAGE_LABEL = { confirmed: "Order Confirmed", processing: "Processing", packed: "Packed", shipped: "Shipped", out_for_delivery: "Out for Delivery", delivered: "Delivered" };
export function getOrders() { return read(K.orders, []); }
export function createOrder({ items, address, payment, amounts }) {
  const taken = new Set(getOrders().map((o) => o.orderNo));
  let orderNo = "";
  do {
    orderNo = String(Date.now()).slice(-6) + String(Math.floor(100000 + Math.random() * 900000));
  } while (taken.has(orderNo));
  const now = new Date().toISOString();
  const order = {
    orderNo, createdAt: now, items, address, payment,
    amounts, status: "confirmed",
    timeline: [{ stage: "confirmed", at: now, note: "Order placed · Cash on Delivery" }],
  };
  const all = [order, ...getOrders()];
  write(K.orders, all);
  return order;
}
// Local demo progression: advance one stage per day (capped), purely illustrative.
export function orderWithProgress(o) {
  const ageDays = (Date.now() - new Date(o.createdAt).getTime()) / 86400000;
  let idx = 0;
  if (o.status !== "cancelled") {
    idx = Math.min(STAGES.length - 1, o.timeline.length - 1 + Math.floor(ageDays));
    // build illustrative timeline entries for elapsed stages
    const tl = [...o.timeline];
    for (let i = tl.length; i <= idx; i++) {
      const at = new Date(new Date(o.createdAt).getTime() + i * 86400000).toISOString();
      tl.push({ stage: STAGES[i], at, note: "Updated by Siesta order system (illustrative)" });
    }
    return { ...o, status: STAGES[idx], timeline: tl, stageIndex: idx, eta: etaFor(o.createdAt) };
  }
  return { ...o, stageIndex: -1, eta: "—" };
}
const etaFor = (iso) => {
  const d = new Date(new Date(iso).getTime() + 5 * 86400000);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};
export function cancelOrder(no) {
  const all = getOrders().map((o) => (o.orderNo === no ? { ...o, status: "cancelled", timeline: [...o.timeline, { stage: "cancelled", at: new Date().toISOString(), note: "Cancelled by customer" }] } : o));
  write(K.orders, all); emit();
}

// ---------- Misc persistence ----------
export const pushRecent = (id) => {
  let r = read(K.recent, []).filter((x) => x !== id);
  r = [id, ...r].slice(0, 8);
  try { localStorage.setItem(K.recent, JSON.stringify(r)); } catch {}
};
export const getRecent = () => read(K.recent, []).map(productById).filter(Boolean);
export const pushSearch = (q) => {
  q = q.trim(); if (!q) return;
  let s = read(K.searches, []).filter((x) => x.toLowerCase() !== q.toLowerCase());
  s = [q, ...s].slice(0, 6);
  try { localStorage.setItem(K.searches, JSON.stringify(s)); } catch {}
};
export const getSearches = () => read(K.searches, []);
export const getConsent = () => read(K.consent, null);
export const setConsent = (c) => write(K.consent, { ...c, at: new Date().toISOString() });
export const getPrefs = () => read(K.prefs, { size: "", sort: "relevance" });
export const setPrefs = (p) => write(K.prefs, p);
export const cartCount = () => getCart().reduce((s, l) => s + l.qty, 0);
