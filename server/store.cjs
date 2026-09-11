"use strict";
// Store abstraction: Supabase (Postgres) when SUPABASE_URL + SUPABASE_SERVICE_KEY
// are set, otherwise the zero-config JSON files (server/data/*.json).
// All access is async; route handlers must await it.
// First Supabase boot migrates any existing local JSON data upward once,
// so switching backends never loses products, orders, coupons or settings.
const json = require("./db.cjs");
const sbs = require("./supabase.cjs");

const COLLECTIONS = ["products", "coupons", "orders", "events", "settings", "reviews", "admin", "customers", "messages"];

function backend() {
  return sbs.isConfigured() ? "supabase" : "json";
}

async function load(name, fallback) {
  if (backend() === "supabase") return sbs.dbLoad(name, fallback);
  return json.load(name, fallback);
}

async function save(name, value) {
  if (backend() === "supabase") return sbs.dbSave(name, value);
  return json.save(name, value);
}

// Typed accessors (same shapes as the JSON files).
const getProducts = () => load("products", []);
const saveProducts = (v) => save("products", v);
const getCoupons = () => load("coupons", []);
const saveCoupons = (v) => save("coupons", v);
const getOrders = () => load("orders", []);
const saveOrders = (v) => save("orders", v);
const getEvents = () => load("events", []);
const saveEvents = (v) => save("events", v);
const getReviews = () => load("reviews", []);
const saveReviews = (v) => save("reviews", v);
const getAdmin = () => load("admin", null);
const saveAdmin = (v) => save("admin", v);
const getCustomers = () => load("customers", []);
const saveCustomers = (v) => save("customers", v);
const getMessages = () => load("messages", []);
const saveMessages = (v) => save("messages", v);
const getSettings = () => load("settings", { freeShipThreshold: 1499, shipFlat: 79, codMaxOrder: 20000 });

// Copy local JSON data into Supabase once (only collections missing there).
// Returns true when a migration ran.
async function migrateIfNeeded() {
  if (backend() !== "supabase") return false;
  let migrated = false;
  for (const name of COLLECTIONS) {
    const remote = await sbs.dbLoad(name, null);
    if (remote !== null && !(Array.isArray(remote) && remote.length === 0)) continue;
    const local = json.load(name, null);
    if (local === null || (Array.isArray(local) && local.length === 0)) continue;
    await sbs.dbSave(name, local);
    migrated = true;
    console.log(`  migrated '${name}' (${Array.isArray(local) ? local.length + " items" : "settings"}) from JSON to Supabase`);
  }
  return migrated;
}

module.exports = {
  backend, load, save,
  getProducts, saveProducts, getCoupons, saveCoupons,
  getOrders, saveOrders, getEvents, saveEvents, getReviews, saveReviews, getAdmin, saveAdmin, getCustomers, saveCustomers, getMessages, saveMessages, getSettings, saveSettings: (v) => save("settings", v),
  migrateIfNeeded,
};
