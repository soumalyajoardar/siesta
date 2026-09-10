// Backend API client. When the Siesta server is reachable the store uses live
// products, coupons and server-validated orders; otherwise it falls back to the
// bundled local catalog (e.g. plain static hosting or file preview).
import { PRODUCTS, COUPONS } from "./data.js";

let healthCache = { at: 0, ok: false };
let catalogCache = null;
let couponCache = null;

async function getJSON(path, headers) {
  let r;
  try {
    r = await fetch(path, { headers: { Accept: "application/json", ...(headers || {}) } });
  } catch (e) {
    const err = new Error("Network unavailable.");
    err.network = true;
    throw err;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || "Request failed.");
    err.status = r.status;
    throw err;
  }
  return data;
}

export async function apiHealth() {
  if (Date.now() - healthCache.at < 60000) return healthCache.ok;
  try {
    await getJSON("/api/health");
    healthCache = { at: Date.now(), ok: true };
  } catch {
    healthCache = { at: Date.now(), ok: false };
  }
  return healthCache.ok;
}

export async function loadCatalog() {
  try {
    const list = await getJSON("/api/products");
    if (Array.isArray(list) && list.length) catalogCache = list;
    
    // Check for restocked products for notifications
    if ("Notification" in window && Notification.permission === "granted") {
      let notifies = JSON.parse(localStorage.getItem("siesta.notify") || "[]");
      let activeNotifies = [];
      let updated = false;
      for (const id of notifies) {
        const p = catalogCache.find(x => x.id === id);
        if (p && p.stock > 0) {
          new Notification("Siesta Restock Alert", { body: `${p.name} is available again in stock!`, icon: "/icon.png" });
          updated = true;
        } else {
          activeNotifies.push(id);
        }
      }
      if (updated) {
        localStorage.setItem("siesta.notify", JSON.stringify(activeNotifies));
        // If on a PDP or shop page, emit an event so it enables the Add to Cart button
        document.dispatchEvent(new CustomEvent("siesta:reroute", { detail: { keep: true } }));
      }
    }
  } catch { /* offline/static fallback */ }
  // Warm the connection to the image host before first paint needs it.
  try {
    const u = (catalogCache || []).find((p) => p.images && p.images[0])?.images[0];
    if (u && u.startsWith("http")) {
      const origin = new URL(u).origin;
      if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
        const l = document.createElement("link");
        l.rel = "preconnect"; l.href = origin; l.crossOrigin = "";
        document.head.appendChild(l);
      }
    }
  } catch { /* non-fatal */ }
  return catalog();
}
export const catalog = () => catalogCache || PRODUCTS;

export async function loadCoupons() {
  try {
    const list = await getJSON("/api/coupons");
    if (Array.isArray(list) && list.length) couponCache = list;
  } catch { /* fallback */ }
  return couponList();
}
export const couponList = () => couponCache || COUPONS;

let settingsCache = null;
export async function loadSettings() {
  try {
    const s = await getJSON("/api/settings");
    if (s && typeof s === "object") settingsCache = s;
  } catch { /* static mode: built-in defaults */ }
  return siteSettings();
}
// Homepage visuals managed from Admin → Homepage (hero, category + collection photos).
export const siteSettings = () => settingsCache || {};
export const siteHero = () => siteSettings().hero || {};
export const siteCatImage = (id) => (siteSettings().categoryImages || {})[id] || "";
export const siteCollectionImage = (g) => (siteSettings().collectionImages || {})[g] || "";

let eventsCache = null;
export async function loadEvents() {
  try {
    const list = await getJSON("/api/events");
    if (Array.isArray(list)) eventsCache = list;
  } catch { /* static mode: no events section */ }
  return events();
}
export const events = () => eventsCache || [];

export async function serverCreateOrder(payload) {
  const headers = { "Content-Type": "application/json" };
  try {
    const t = localStorage.getItem("siesta.token") || sessionStorage.getItem("siesta.token");
    if (t) headers.Authorization = "Bearer " + t; // links the order to your account
  } catch {}
  const r = await fetch("/api/orders", {
    method: "POST", headers,
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || "Could not place the order.");
    err.validation = r.status >= 400 && r.status < 500;
    throw err;
  }
  return data;
}

export async function serverFetchOrder(orderNo) {
  return getJSON("/api/orders/" + encodeURIComponent(orderNo));
}

// My server-side order history (logged in). Falls back to [] offline/guest.
export async function serverMyOrders() {
  try {
    const t = getToken();
    if (!t) return null; // guest: caller uses local mirrors
    const r = await fetch("/api/auth/orders", { headers: { Authorization: "Bearer " + t } });
    const data = await r.json().catch(() => ([]));
    if (!r.ok) return null;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// ---------- Customer auth (server JWT; token lives per-device, account roams) ----------
export const getToken = () => {
  try { return localStorage.getItem("siesta.token") || sessionStorage.getItem("siesta.token"); }
  catch { return null; }
};
export function setToken(token, remember) {
  try {
    localStorage.removeItem("siesta.token");
    sessionStorage.removeItem("siesta.token");
    (remember !== false ? localStorage : sessionStorage).setItem("siesta.token", token);
  } catch {}
}
export function clearToken() {
  try { localStorage.removeItem("siesta.token"); sessionStorage.removeItem("siesta.token"); } catch {}
}
const authH = () => ({ Authorization: "Bearer " + getToken() });
async function sendJSON(path, body, { method = "POST", auth = false } = {}) {
  let r;
  try {
    r = await fetch(path, {
      method, headers: { "Content-Type": "application/json", Accept: "application/json", ...(auth ? authH() : {}) },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error("Network unavailable.");
    err.network = true;
    throw err;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || "Request failed.");
    err.status = r.status;
    throw err;
  }
  return data;
}
export const authRegister = (d) => sendJSON("/api/auth/register", d);
export const authLogin = (d) => sendJSON("/api/auth/login", d);
export const authMe = () => getJSON("/api/auth/me", authH());
export const authUpdate = (d) => sendJSON("/api/auth/me", d, { method: "PATCH", auth: true });
export const authPassword = (d) => sendJSON("/api/auth/password", d, { auth: true });
export async function authAddresses(list) {
  let r;
  try {
    r = await fetch("/api/auth/addresses", {
      method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json", ...authH() },
      body: JSON.stringify({ addresses: list }),
    });
  } catch (e) {
    const err = new Error("Network unavailable.");
    err.network = true;
    throw err;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || "Request failed.");
    err.status = r.status;
    throw err;
  }
  return data;
}

export async function serverCancelOrder(orderNo) {
  const r = await fetch("/api/orders/" + encodeURIComponent(orderNo) + "/cancel", { method: "POST" });
  if (r.status === 404) return null; // pure-local order or unknown — caller handles locally
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(data.error || "Could not cancel the order."); err.status = r.status; throw err; }
  return data;
}

// Keep a local mirror of server orders so order history + tracking work
// uniformly, and refresh it from the server whenever we're online.
export async function mirrorOrder(order) {
  try {
    let all = [];
    try { all = JSON.parse(localStorage.getItem("siesta.orders.v1") || "[]"); } catch {}
    const i = all.findIndex((o) => o.orderNo === order.orderNo);
    const merged = { ...order, _remote: true };
    if (i >= 0) { if (all[i].status === "cancelled" && order.status !== "cancelled") return all[i]; all[i] = merged; }
    else all = [merged, ...all];
    localStorage.setItem("siesta.orders.v1", JSON.stringify(all));
    return merged;
  } catch { return order; }
}

export async function refreshMirror(orderNo) {
  try {
    if (!(await apiHealth())) return null;
    const order = await serverFetchOrder(orderNo);
    return await mirrorOrder(order);
  } catch { return null; }
}
