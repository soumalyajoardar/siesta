"use strict";
// Supabase backend: Postgres (single `collections` table, one JSONB row per
// collection) + Storage bucket `product-images`.
// Server-side only. Requires SUPABASE_URL + SUPABASE_SERVICE_KEY (service_role).
// The service key bypasses RLS and must NEVER be sent to browsers.
const { createClient } = require("@supabase/supabase-js");

const BUCKET = "product-images";
let client = null;

// Accept both hand-set names and the names Vercel's Supabase integration injects.
function getUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}
function getKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function isConfigured() {
  return Boolean(getUrl() && getKey());
}

function getClient() {
  if (!isConfigured()) {
    const err = new Error("Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_KEY and restart.");
    err.code = "SUPABASE_CONFIG";
    throw err;
  }
  if (!client) {
    client = createClient(getUrl(), getKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function storageBase() {
  return `${getUrl().replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;
}

// Verify connectivity + schema (throws with a clear message otherwise).
async function checkConnection() {
  const sb = getClient();
  const { error } = await sb.from("collections").select("name").limit(1);
  if (error) {
    const err = new Error(`Supabase check failed: ${error.message} — did you run supabase/schema.sql in the SQL Editor?`);
    err.code = "SUPABASE_SCHEMA";
    throw err;
  }
}

async function dbLoad(name, fallback) {
  const sb = getClient();
  const { data, error } = await sb.from("collections").select("data").eq("name", name).maybeSingle();
  if (error) throw new Error(`Supabase read failed (${name}): ${error.message}`);
  return data && data.data !== undefined ? data.data : fallback;
}

async function dbSave(name, value) {
  const sb = getClient();
  const { error } = await sb.from("collections").upsert(
    { name, data: value, updated_at: new Date().toISOString() },
    { onConflict: "name" }
  );
  if (error) throw new Error(`Supabase write failed (${name}): ${error.message}`);
}

const safeName = (name) => String(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

async function uploadImage(buffer, originalName, mimeType) {
  const sb = getClient();
  const ext = (String(originalName).split(".").pop() || "webp").toLowerCase().replace(/[^a-z0-9]/g, "") || "webp";
  const file = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(file, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return `${storageBase()}${file}`;
}

async function listImages() {
  const sb = getClient();
  const { data, error } = await sb.storage.from(BUCKET).list("", { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw new Error(`Could not list images: ${error.message}`);
  return (data || [])
    .filter((f) => f.id)
    .map((f) => ({ url: `${storageBase()}${f.name}`, name: f.name, size: f.metadata && f.metadata.size, at: f.created_at }));
}

async function deleteImage(name) {
  const sb = getClient();
  const clean = safeName(String(name).split("/").pop());
  const { error } = await sb.storage.from(BUCKET).remove([clean]);
  if (error) throw new Error(`Could not delete image: ${error.message}`);
}

module.exports = { isConfigured, getUrl, checkConnection, dbLoad, dbSave, uploadImage, listImages, deleteImage, storageBase, BUCKET };
