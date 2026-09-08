// One-time seed: copies the storefront catalog into the backend database
// (server/data/*.json). Run automatically on first server boot, or manually:
//   node server/seed.js
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS, COUPONS } from "../js/data.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "data");
mkdirSync(root, { recursive: true });
const write = (name, value) => writeFileSync(join(root, name), JSON.stringify(value, null, 2));

// Server product = storefront product + image slots for admin uploads.
write("products.json", PRODUCTS.map((p) => ({ ...p, images: [] })));
write("coupons.json", COUPONS.map((c) => ({ ...c, active: c.code !== "EXPIRED5" })));
write("orders.json", []);
write("settings.json", {
  freeShipThreshold: 1499,
  shipFlat: 79,
  codMaxOrder: 20000,
  announcement: "Complimentary shipping on orders over ₹1,499 · COD available across India",
  hero: { eyebrow: "", title: "", message: "", badge: "", image: "" },
  heroSlides: [],
  maintenance: { enabled: false, title: "", message: "" },
  categoryImages: {},
  collectionImages: {},
});
console.log("Seeded Siesta database in server/data/");
