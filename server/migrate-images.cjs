"use strict";
// npm run images:migrate — uploads every LOCALLY-referenced product/event/
// homepage image into Supabase Storage and rewrites the references to the
// public cloud URLs. Local files are left untouched as backup.
// - Backs up the affected collections to server/data/*.migrate-bak.json first.
// - Skips files already in the bucket (idempotent — safe to re-run).
// - Reports referenced files missing from disk (fix those in Admin → Media).
require("./env.cjs");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const store = require("./store.cjs");

const ROOT = path.join(__dirname, "..");
const BUCKET = "product-images";
const cleanName = (n) => String(n).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

(async () => {
  if (store.backend() !== "supabase") {
    console.error("Connect Supabase first (SUPABASE_URL + SUPABASE_SERVICE_KEY), then re-run.");
    process.exit(1);
  }
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const base = `${String(process.env.SUPABASE_URL).replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;

  const [products, events, settings] = await Promise.all([
    store.getProducts(), store.getEvents(), store.getSettings(),
  ]);

  // Collect every local reference: path on disk -> list of setter callbacks.
  const jobs = new Map(); // localRelPath -> { file, setUrl(url) }
  const consider = (url, setUrl) => {
    if (typeof url !== "string") return;
    let rel = null;
    if (url.startsWith("/uploads/")) rel = path.join("server", "uploads", path.basename(url));
    else if (url.startsWith("/images/")) rel = path.join("images", path.basename(url));
    if (!rel || jobs.has(rel)) { if (rel && jobs.has(rel)) jobs.get(rel).setters.push(setUrl); return; }
    if (rel) jobs.set(rel, { file: path.join(ROOT, rel), setters: [setUrl] });
  };
  products.forEach((p) => (p.images || []).forEach((u, i) => consider(u, (nu) => { p.images[i] = nu; })));
  events.forEach((e) => {
    if (e.image) consider(e.image, (nu) => { e.image = nu; });
    (e.gallery || []).forEach((u, i) => consider(u, (nu) => { e.gallery[i] = nu; }));
  });
  const heroSlides = settings.heroSlides || [];
  heroSlides.forEach((b) => {
    if (b.image) consider(b.image, (nu) => { b.image = nu; });
    (b.images || []).forEach((u, i) => consider(u, (nu) => { b.images[i] = nu; }));
  });
  Object.entries(settings.categoryImages || {}).forEach(([k, u]) => consider(u, (nu) => { settings.categoryImages[k] = nu; }));
  Object.entries(settings.collectionImages || {}).forEach(([k, u]) => consider(u, (nu) => { settings.collectionImages[k] = nu; }));
  if (settings.hero && settings.hero.image) consider(settings.hero.image, (nu) => { settings.hero.image = nu; });

  console.log(`Referenced local files: ${jobs.size}`);
  const existing = new Set(((await sb.storage.from(BUCKET).list("", { limit: 1000 })).data || []).map((f) => f.name));
  let uploaded = 0, reused = 0;
  const missing = [];
  for (const [rel, job] of jobs) {
    const target = cleanName(path.basename(job.file));
    if (!fs.existsSync(job.file)) { missing.push(rel + " (referenced but not on disk)"); continue; }
    if (!existing.has(target)) {
      const { error } = await sb.storage.from(BUCKET).upload(target, fs.readFileSync(job.file), {
        contentType: "image/" + (target.split(".").pop() === "jpg" ? "jpeg" : target.split(".").pop()),
        upsert: false,
      });
      if (error) { missing.push(rel + " (upload failed: " + error.message + ")"); continue; }
      existing.add(target);
      uploaded++;
    } else reused++;
    const url = base + target;
    job.setters.forEach((fn) => fn(url));
  }

  // Backup current remote state locally, then save rewritten collections.
  const stamp = Date.now();
  const bak = (name, val) => fs.writeFileSync(path.join(ROOT, "server", "data", `${name}.migrate-bak-${stamp}.json`), JSON.stringify(val, null, 2));
  const [rp, re, rs] = await Promise.all([store.getProducts(), store.getEvents(), store.getSettings()]);
  bak("products", rp); bak("events", re); bak("settings", rs);
  await store.saveProducts(products);
  await store.saveEvents(events);
  await store.saveSettings(settings);
  console.log(`Done — uploaded: ${uploaded}, already in cloud: ${reused}`);
  missing.forEach((m) => console.log("  ! " + m));
  console.log(`Backups: server/data/*.migrate-bak-${stamp}.json (also add to .gitignore if you push to GitHub)`);
})();
