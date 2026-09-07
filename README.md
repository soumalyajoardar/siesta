# SIESTA — Premium Fashion E-Commerce

A production-quality, responsive, accessible fashion storefront for **Siesta**
(T-shirts, shirts, jackets, hoodies, jeans, pants, shorts, sweatshirts).
Vanilla HTML/CSS/ES-modules storefront + Node.js (Express) backend and admin
dashboard. JSON-file database — no database server to install.

## Run the full stack (recommended)

```powershell
cd "S:\STUDY MATERIALS\Projects\Siesta"
npm install
npm start
```

- Store: http://localhost:3000
- Admin: http://localhost:3000/admin (user `admin`; password is printed in the
  console on first run, or set `ADMIN_PASSWORD` before starting)
- Change port: `$env:PORT=4000; npm start`

## Supabase (optional Postgres database + image storage)

Without configuration the store uses local JSON files — nothing to set up.
To move to Supabase (free tier works):

1. Create a project at https://supabase.com/dashboard
2. **SQL Editor → New query** → paste the whole `supabase/schema.sql` → Run
   (creates the `collections` table, the public `product-images` bucket and
   safe access rules: the world can read products/events/settings; orders and
   coupons stay server-only)
3. **Settings → API**: copy the Project URL and the `service_role` key
   (server-only — never the anon key for this, never in browser code)
4. `Copy-Item .env.example .env`, set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
5. `npm run db:check` (verifies connection + schema), then `npm start`
   - First boot copies your existing JSON data into Supabase automatically
     (JSON files stay as backup). The console prints the active backend.
- Already uploaded images before switching? `npm run images:migrate`
  uploads every referenced local photo to Supabase Storage and rewrites the
  URLs (backups first, skips missing files with a report, safe to re-run).

## Deploy to Vercel (public link, free)

Your store + admin run serverlessly; Supabase holds the data (local JSON
files can't persist on Vercel, so the Supabase setup above is required first).

1. Push the project to GitHub, then https://vercel.com →
   **Add New → Project** → import your repo. Framework preset: **Other**.
   No build command, no output directory — leave both empty.
2. **Settings → Environment Variables**, add (all environments):
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SERVICE_KEY` = your secret/service key (never the anon key)
   - `ADMIN_PASSWORD` = only needed if the database has no admin login yet
     (one-time bootstrap; afterwards the DB record rules — rotate in
     Admin → Settings, never by redeploying)
3. **Deploy.** You get `https://siesta-xyz.vercel.app`:
   - Store + `/admin` served worldwide over HTTPS by Vercel's CDN
   - `/api/*` runs the same Express app as a function (Supabase backend,
     stateless logins — verified to survive restarts/redeploys)
4. Every `git push` redeploys automatically. Your data is safe: it lives in
   Supabase, never in the deployment.

Notes: cold starts add ~1–3s to the first request after idle (free tier);
uploads go to Supabase Storage; the `images/` + `server/uploads/` folders are
backups only and are not deployed.

## Admin dashboard (`/admin`)

- **Overview** — revenue, order counts, low-stock alerts, recent orders
- **Products** — search, add/edit/delete; upload **product images**
  (JPG/PNG/WebP/GIF/AVIF, ≤5MB) with cover-photo ordering; stock, sizes,
  colours, pricing, badges — changes go live in the store immediately
- **Orders** — filter by status, advance Confirmed → … → Delivered
  (customers see it live on Track Order), cancel
- **Reviews** — verified-purchase reviews customers write from delivered
  orders; publish publicly on product pages, delete abuse here
- **Settings** — thresholds, announcement bar, and the admin password change
  (stored scrypt-hashed in the database, same store as everything else)
- **Events** — create sales, festive edits and drops with banner + gallery
  image uploads, button links, badges and start/end dates; live events appear
  in a "Happening now" section on the store homepage
- **Homepage** — rotating hero banners (each with its own text + up to 6 photos
  that auto-fade inside the banner), plus photos for the Shop by Category and
  Shop by Collection cards (empty = built-in artwork)
- **Coupons** — create/disable/delete (live at store checkout)
- **Media** — every uploaded image in one place, delete unused files
- **Settings** — free-shipping threshold, shipping fee, COD cap, announcement

## Product images folder (`images/`)

Drop your JPG/PNG/WebP files straight into the **`images/`** folder in the
project (via Explorer/Finder — no upload step needed). Each file is served at
`/images/your-file.webp`, appears in **Admin → Media** with a **Copy URL**
button, and attaches to a product via **Admin → Products → Edit → images**
(paste the URL, or upload from your computer — first image is the cover).

## Static-only mode (no backend)

Any static server still works (`npx serve .`): the store falls back to its
bundled catalog with browser-local orders.

## Test the flows

- Shop: `#/shop`, filters, sort, pagination, search (`q`, suggestions, recent)
- Product: size (required) → Add to Cart / Buy Now, wishlist, size guide, lightbox
- Coupons: `WELCOME10` · `SIESTA15` · `FLAT200` (+ `EXPIRED5` for the expired state)
- Checkout: Address → Delivery → Payment (**Cash on Delivery only**, rest show
  "Coming soon") → Review → animated order processing → confirmation
- Track: `#/track/483920174658` (12-digit order numbers) · Orders: `#/account/orders` (cancel pre-ship)
- Auth: Register/Login/Logout, profile, addresses, password change (SHA-256+salt,
  never plaintext), "Erase my data"
- Cookie banner: Accept / Reject / Manage → footer "Cookie preferences"

## Architecture

```
index.html          shell, SEO/OG/JSON-LD, header/footer, cookie consent
css/                design tokens + app styles + motion system
js/api.js           backend client (live data with local fallback)
js/data.js          bundled fallback catalog (used without backend)
js/store.js         cart/wishlist/auth-hash/orders/addresses/consent
js/ui.js            toasts, modal, product art + uploaded-photo rendering
js/pages/           home/listing/detail, cart/checkout/tracking, account/legal
js/app.js           boot (loads live catalog), router, search, splash
server/index.cjs    Express app: storefront + /admin + REST API
server/db.cjs       JSON-file database (server/data/)
server/auth.cjs     admin auth (scrypt + tokens + login rate-limit)
server/seed.js      seeds DB from the storefront catalog (first boot)
server/uploads/     admin-uploaded product images (served at /uploads/*)
admin/              dashboard UI: products+images, orders, coupons, media, settings
```

## Before launch (mandatory)

1. Fill every `REPLACE_ME` in `js/config.js` with real business details.
2. Complete the `LAUNCH_CHECKLIST` review with legal/tax professionals.
3. Set a strong `ADMIN_PASSWORD`, serve behind HTTPS, and back up `server/data/`.
   For scale, swap the JSON store for a real database and add a payment gateway
   + courier partner before accepting real money.
4. See About page ("Pre-launch checklist") and Privacy/Cookie policies.
