"use strict";
// npm run db:check — verifies Supabase connectivity + schema presence.
require("./env.cjs");
const sbs = require("./supabase.cjs");

(async () => {
  if (!sbs.isConfigured()) {
    console.error("Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_KEY first (see .env.example).");
    process.exit(1);
  }
  try {
    await sbs.checkConnection();
    const { createClient } = require("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data } = await sb.from("collections").select("name");
    console.log(`Supabase OK — collections present: ${(data || []).map((r) => r.name).join(", ") || "(none yet — first boot migrates them)"}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
