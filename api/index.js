// Vercel serverless entry: every /api/* request runs the Express app as a
// function. Static files (/, /admin, /css, /js, /assets, /images) are served
// by Vercel's CDN — see vercel.json. Requires Supabase (no persistent disk).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { app } = require("../server/index.cjs");

export default function handler(req, res) {
  return app(req, res);
}
