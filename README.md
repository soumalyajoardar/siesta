# SIESTA — Premium Fashion E-Commerce

A production-quality, responsive, accessible fashion storefront for **Siesta**
(T-shirts, shirts, jackets, hoodies, jeans, pants, shorts, sweatshirts — Men / Women / Unisex).
Vanilla HTML/CSS/ES-modules storefront (no build step) + Node.js (Express 5) backend + admin dashboard.
Dual storage: local JSON files by default, Supabase (Postgres + Storage) when configured.

Current catalog: **34 products**, **4 coupons**. India-only, INR, Cash on Delivery.

## Quick start (full stack, recommended)

```powershell
cd "S:\PROJECTS\Siesta"
npm install
npm start
```

- Store: http://localhost:3000
- Admin: http://localhost:3000/admin (user `admin`; password is printed in the
  console on first local boot, or set `ADMIN_PASSWORD` before starting)
- Change port: `$env:PORT=4000; npm start`
- Health: `GET /api/health` · Safe diagnostics (no secrets): `GET /api/debug`

Other scripts:

```powershell
npm run seed            # server/seed.js — reseed DB from js/data.js catalog
npm run db:check        # node server/db-check.cjs — verify Supabase connection + schema
npm run images:migrate  # node server/migrate-images.cjs — upload local photos to Supabase
```

Deps: `express ^5`, `multer ^2`, `@supabase/supabase-js ^2`. No frontend build.

## Storefront (`/`)

History-API SPA: `index.html` shell + `js/app.js` router. No framework.

Routes:

| URL | Page |
|---|---|
| `/` | Home (hero slides, Happening now events, categories, collections, new/bestsellers) |
| `/shop`, `/search?...` | Listing with filters/sort/search/pagination |
| `/product/:id` | Product detail + reviews + related + recently viewed |
| `/cart` | Full cart (drawer also available site-wide) |
| `/checkout` | 4-step checkout (login-required, else `/login?next=/checkout`) |
| `/success/:orderNo` | Order confirmation (16-digit order number) |
| `/track`, `/track/:orderNo` | Order tracking timeline |
| `/invoice/:orderNo` | Printable tax invoice (`INV-<no>`, delivered orders only) |
| `/wishlist` | Wishlist |
| `/login`, `/register`, `/forgot` | Auth |
| `/account/:tab`, `/orders` | Account: overview / orders / addresses / profile / security / prefs |
| `/about`, `/contact`, `/faq`, `/shipping`, `/returns`, `/privacy`, `/terms`, `/cookies` | Static + legal |
| `/admin` | Dashboard (separate app, not part of shop router) |

Maintenance mode (`Admin → Settings`) hijacks all shop routes with your
title/message. Orders and reviews are also blocked server-side. Admin keeps working.

### Shop listing (`js/pages/shop.js:ShopPage`)

Query params (URL-synced): `q, category, gender, filter=new|sale|bestsellers, sort, max, sizes, avail=in, color, page`.

- 8 categories: `tshirts, shirts, jackets, hoodies, jeans, pants, shorts, sweatshirts`
- Gender: men / women / unisex · Sizes: `XS–XXL` + waist `26–36`
- Max-price slider `₹500–₹3,500` · In-stock-only toggle · Color filter
- Sort: `relevance | newest | price-asc | price-desc | popularity` (persisted in `siesta.prefs.v1`)
- `PAGE_SIZE=12` pagination, `Clear all`, result count, breadcrumb, empty-state chips
- Mobile filter drawer + `Filters·N` floating button, smooth scrolling
- Product cards: New / `-%` off / rating stars + count, stock note, wishlist heart,
  `Add to Cart` (default middle size) or `Notify Me` when out of stock, quick-view modal
- Larger card thumbnails, mobile-formatted prices

Search (`js/app.js`): header + mobile combobox, matches name/category/gender/
description/material/color (6 results) + category hints, recent searches (6),
keyboard `Arrow/Enter` navigation → `/shop?q=` or `/product/:id`.

### Product page (`js/pages/shop.js:ProductPage`)

- Gallery: original SVG art (`productArt`) or uploaded photos (`photoArt`) with
  `Man / Woman / View` thumbs + lightbox
- Size required before Add to Cart, color + qty `1–10`
- `Add to Cart` (opens drawer) + `Buy Now → /checkout`, `Notify Me` if out of stock
- Stock states: `In stock / Only N left (≤5) / Out of stock`
- Price / MRP / `% off`, tax-inclusive note, ETA + COD + 7-day returns note
- Accordions: details, material & care, shipping & returns, specs, verified reviews
- Size-guide table, sticky buy bar (`IntersectionObserver`)
- Related (4) + Recently viewed (8), per-PDP JSON-LD
- Reviews: `GET /api/products/:id/reviews`; write only if delivered
  (`GET /api/reviews/eligibility/:id` → modal). Admin can auto-generate
  10–30 sample reviews on product edit.

### Cart / Checkout / Orders (`js/pages/commerce.js`, `js/store.js:totals`)

Cart math: `MRP → Discount → Offer → Coupon → Delivery → Round-off (down to nearest ₹5) → Sub Total`.
Free-shipping progress nudge in drawer + full cart. Coupon input available in both
cart and checkout. Remove uses confirm dialog.

Checkout is 4 steps: `Address → Delivery → Payment → Review`:

1. **Address** — saved-address radio + validated new form (name ≥3, Indian mobile
   `^[6-9]\d{9}$`, street ≥8, city, 16-state select, `PIN ^\d{6}$`, home/work tag)
2. **Delivery** — Standard 3–6 days (`₹80`, or Free over `₹1,499`) vs
   Express `₹150` with dynamic label: `Arriving today` if ordered before 5 PM,
   else `Arriving tomorrow`
3. **Payment** — **Cash on Delivery only**. UPI / Card / Netbanking / Wallets show
   `Coming soon`. Never collects card/CVV/UPI. Terms checkbox gates placing the order.
4. **Review** — shows delivery choice with the same dynamic Express ETA,
   animated processing overlay → `POST /api/orders` (server re-validates
   prices/coupon/stock/shipping) → `/success/:orderNo`, else local 16-digit order offline

Success page: COD amount due, ETA, Track / Continue shopping.
Order history (`/account/orders`): expanded rows **without thumbnails and without
status pills** (current UI), Track link, cancel while `confirmed|processing`
(with reason prompt + optional feedback `POST /api/orders/:orderNo/feedback`),
Review button when delivered. Sorting: newest first.

### Tracking

`/track` form → `/track/:orderNo` (uppercased). Timeline:

`confirmed → processing → packed → shipped → out_for_delivery → delivered`,
plus `cancelled` (manual only).

Cancelled orders show a **green progress bar + tick** with the admin-provided
cancellation reason. ETA: `+5 days standard / +2 days express`,
rendered as `Arriving in N / tomorrow / today`. No fake courier scans.
Uses `refreshMirror()` to sync server state when online.

### Auth / Account (`js/pages/account.js`)

Dual mode: server JWT (`siesta.token`, local if Remember me else session,
`GET/PATCH /api/auth/me`, `PUT /api/auth/addresses`) + local `SHA-256+salt`
fallback (`siesta.users.v1`). 60s cached `currentUser()` health check.

- Login (remember default, show/hide, `?next`), Register
  (name ≥3, email, password ≥8 + confirm, optional 10-digit phone, Terms required),
  Forgot (stub → toast + back to login)
- Account tabs: overview (stats + latest), orders, addresses (default pill,
  add/delete, synced), profile (email immutable), security (change password),
  prefs (newsletter, order notifications, `Erase device data`)
- Contact / support tickets: `POST /api/contact` (5/IP/hr),
  `GET /api/tickets?email=`, `POST /api/tickets/:id/reply` — threaded in
  `Admin → Messages`

### Extras

- Wishlist hearts + `/wishlist` page, restock `Notify Me` (`siesta.notify.v1` + catalog poll),
  order-stage browser notifications (opt-in)
- Footer newsletter → reveals `WELCOME10` (`siesta.news.v1`)
- Cookie banner: Necessary always on; Preferences / Analytics / Marketing opt-in
  (`siesta.consent.v1`), footer `Cookie preferences`. No ad trackers/pixels.
- SEO/a11y: `lang=en-IN`, canonical, OG/Twitter, inline SVG favicon,
  JSON-LD `ClothingStore + Organization + WebSite SearchAction → /search?q={query}`,
  `<noscript>` category links, skip-link, focus-trapped modals + `Esc`,
  labelled forms, `prefers-reduced-motion`, back-to-top
- Offline fallback (`js/api.js`): 60s `apiHealth`; catalog/coupons/settings/events
  fall back to bundled `js/data.js`; local orders mirrored (`_remote` flag) so
  history/track work offline; image `onerror` → SVG; Supabase `WebP w800/q70`;
  splash failsafe (4s `file://` trap)

Business constants (`js/config.js`, `js/data.js`):

- `STORE: INR, en-IN, freeShipThreshold 1499, shipFlat 79 (UI shows ₹80 standard),
  codFee 0, codMaxOrder 20000, deliveryEtaDays [3,6], maxQtyPerLine 10`
- Coupons: `WELCOME10 10% min999 → 2027-03-31`, `SIESTA15 15% min1999 → 2027-06-30`,
  `FLAT200 ₹200 min1499 → 2027-02-28`, `EXPIRED5` (expired-state demo)
- `BUSINESS: Siesta Apparel Studio Pvt. Ltd., concierge@siestastudio.in,
  +91-80-4851-2200, Indiranagar Bengaluru + Whitefield returns,
  GSTIN 29AABCS1234F1ZP, grievance Arjun Mehta, Mon–Sat 10–7 IST`

## Backend (`server/index.cjs` + `server/*.cjs`)

Express app serving storefront + `/admin` + `no-store` JSON `REST API`.
Public API re-validates prices, coupons and stock — never trusts the client.

Run: `npm start` (`PORT=3000`, `HOST=0.0.0.0`). On Vercel `api/index.js`
re-exports `app` as a serverless function (`maxDuration:60`).

### Storage: JSON ↔ Supabase

`store.backend()` = `supabase` if `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` set,
else `json` (`server/store.cjs`, `server/supabase.cjs`, `server/db.cjs`, `server/env.cjs`).

- JSON: `server/data/*.json`, atomic `*.tmp → rename`. Collections:
  `products, coupons, orders, events, settings, reviews, admin, customers, messages`.
  Local now: `products.json:34`, `coupons.json:4`, `orders.json:0`,
  `settings.json:9 keys`, `admin.json:1 record`.
  `server/seed.js` seeds from `js/data.js:PRODUCTS/COUPONS` on first boot.
- Supabase: single `public.collections(name PK, data JSONB)` + public
  `storage.product-images` bucket (`supabase/schema.sql`). First boot migrates
  non-empty local JSON → Supabase once. Console prints active backend.

### Public API (`server/index.cjs`)

```text
GET  /api/health | /api/debug | /api/settings | /api/coupons | /api/events
GET  /api/products[?category,gender,q] | /api/products/:id
GET  /api/products/:id/reviews | /api/reviews/recent[?limit]
POST /api/reviews                        # delivered-order only, 1 per order+product
GET  /api/reviews/eligibility/:productId # + customer auth
POST /api/orders                         # COD, 16-digit orderNo, shipping 0|80|150
GET  /api/orders/:orderNo
POST /api/orders/:orderNo/cancel         # only confirmed|processing, restocks
POST /api/orders/:orderNo/feedback
POST /api/contact                        # 5/IP/hr
GET  /api/tickets?email= | POST /api/tickets/:id/reply
POST /api/auth/register | /api/auth/login
GET  /api/auth/me | /api/auth/orders | PATCH /api/auth/me
POST /api/auth/password | PUT /api/auth/addresses
```

### Admin API (all `requireAdmin` Bearer except login)

```text
POST /api/admin/login | PATCH /api/admin/password
GET|POST /api/admin/products | PUT|DELETE /api/admin/products/:id
POST /api/admin/upload | GET /api/admin/uploads | DELETE /api/admin/uploads/:name
GET  /api/admin/site-images
GET|POST /api/admin/events | PUT|DELETE /api/admin/events/:id
GET|POST /api/admin/coupons | PUT|DELETE /api/admin/coupons/:code
GET  /api/admin/orders | PATCH /api/admin/orders/:orderNo | DELETE /api/admin/orders/:orderNo
GET|DELETE /api/admin/reviews            # GET /api/admin/reviews
GET  /api/admin/messages | POST /api/admin/messages/:id/reply|/close | DELETE /api/admin/messages/:id
GET  /api/admin/customers (sanitized) | GET|PUT /api/admin/settings | GET /api/admin/stats
```

### Auth (`server/auth.cjs`)

- Admin: stateless `jwt.<base64exp>.<hmac-sha256>` keyed by `scrypt` admin hash
  (`12h`, `30d` if remember). Fixed username `admin`. Bootstrap from
  `ADMIN_PASSWORD` once, else generated + printed locally.
  `5 fails/IP/5min` rate-limit. `Authorization: Bearer`.
- Customer: `cust.<sub,exp>.<hmac>` `30d`, key = `CUSTOMER_JWT_SECRET` →
  `SUPABASE_SERVICE_KEY` → admin hash. `scrypt` password hash in `customers`.
  Optional on checkout (links `customerId`, else guest).

### Orders

Stages: `confirmed → processing → packed → shipped → out_for_delivery → delivered`
+ `cancelled` (manual `PATCH /api/admin/orders/:orderNo` with reason prompt,
timeline + note appended). No background automation ticker.

### Images

`multer.memoryStorage`, `5MB/file, 8 files`, `jpg|png|webp|gif|avif` (mime + ext).
Supabase mode → `product-images` bucket public URL; JSON mode →
`server/uploads/<ts>-<rand>.<ext>` served at `/uploads` (`7d cache`).
Hand-dropped `/images/*` served at `/images` (`7d`). Only
`/uploads | /images | Supabase-URL` accepted in `sanitizeProduct/sanitizeEvent`.

## Admin dashboard (`/admin`)

`admin/index.html` login gate + 11 sections (`admin/admin.js` 984 lines).
Client compresses uploads (`gif|<400KB` passthrough, else `max1400px WebP@0.82`).

- **Overview** — `GET /api/admin/stats`: COD revenue, orders, products,
  low-stock (`≤5`), by-status, recent orders, restock shortcut into product editor
- **Products** — search, table (thumb/name/gender/category/price/MRP/stock/status),
  Add/Edit/Delete. Editor: name/category/gender/price/MRP/stock/sizes/colors
  (`Name:#hex`)/material/desc/care/details/`isNew`/bestseller/auto-reviews
  (10–30 sample ~4.3 avg), image grid (first = Cover), upload + paste URL,
  `Copy AI Image Prompt`
- **Orders** — tabs `all/pending/delivered/cancelled`, address/items/cancel-feedback/
  total (COD + coupon + Express pill), status select `confirmed…cancelled` + Delete.
  Cancelling prompts for reason shown to the customer on Track.
- **Customers** — read-only: total/opt-ins, name/email/phone/addresses/joined
- **Reviews** — total/avg, product/order/★/title/text/author/date, verified-once note, delete
- **Messages** — support tickets: total/open/closed, thread modal,
  Reply / Close / Delete
- **Events** — sales/festive edits/drops: title/badge/subtitle/description,
  banner + gallery, CTA/link, starts/ends/sort/active. Live events → homepage
  `Happening now`
- **Homepage** — `heroSlides[]` (eyebrow/title/message/badge/image/images —
  first = cover, auto-fade if 2+), reorder/add/remove;
  `categoryImages{tshirts…sweatshirts}`, `collectionImages{men,women,unisex}`
  (empty = built-in artwork)
- **Coupons** — create `{code, type:pct|flat, value, minSubtotal, expires, label}`,
  active checkbox, edit/delete — live at checkout
- **Media** — `GET /api/admin/uploads + /api/admin/site-images`, `images/` pane
  `Copy URL`, upload pane `≤5MB` upload/delete, MB total
- **Settings** — `freeShipThreshold / shipFlat / codMaxOrder / announcement /
  eventPreset[None|christmas]`, admin password change (scrypt),
  `maintenance{enabled,title,message}`

## Product images folder (`images/`)

Drop JPG/PNG/WebP files into `images/` via Explorer (no upload step).
Served at `/images/your-file.webp`, listed in **Admin → Media** with `Copy URL`,
attach via **Admin → Products → Edit → images** (paste URL or upload —
first image is the cover).

## Supabase (optional Postgres + Storage)

Without config the store uses local JSON — nothing to set up.
For shared/production data (required on Vercel):

1. Create project at https://supabase.com/dashboard
2. **SQL Editor → New query** → paste whole `supabase/schema.sql` → Run
   (creates `collections` table, public `product-images` bucket;
   world can read products/events/settings; orders/coupons server-only)
3. **Settings → API**: copy Project URL + `service_role` key
   (server-only — never the anon key, never in browser code)
4. `Copy-Item .env.example .env`, set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
5. `npm run db:check`, then `npm start`
   - First boot copies existing JSON into Supabase automatically (JSON stays as backup)
6. Migrating uploads later? `npm run images:migrate`
   (backups first, skips missing files with report, safe to re-run)

`.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD`
(one-time bootstrap; afterwards DB record rules — rotate in Admin → Settings),
`PORT` (default 3000).

## Deploy to Vercel (public link, free)

Store + admin run serverlessly; Supabase holds data (local JSON cannot persist
on Vercel, so Supabase setup above is required first).

1. Push to GitHub → https://vercel.com → **Add New → Project** → import repo.
   Framework preset: **Other**. No build command, no output directory.
2. **Settings → Environment Variables** (all environments):
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_KEY` = service/secret key (never anon)
   - `ADMIN_PASSWORD` = only if DB has no admin login yet (one-time bootstrap)
3. **Deploy** → `https://siesta-xyz.vercel.app`:
   - Store + `/admin` via Vercel CDN over HTTPS
   - `/api/*` runs the same Express app as a function (stateless logins survive restarts)
4. Every `git push` redeploys. Data lives in Supabase, never in the deployment.

Notes: free-tier cold start ~1–3s after idle; uploads go to Supabase Storage;
`images/` + `server/uploads/` are backups only and are not deployed.
`vercel.json`: `/api/* → /api/index.js`, `/admin → /admin/index.html`,
all other non-asset routes → `/index.html`.
On Vercel every `/api` waits for `ensureApiReady()` → `503` unless Supabase is
configured; no disk writes/seeding; `ADMIN_PASSWORD` must be preset.

## Static-only mode (no backend)

Any static server works (`npx serve .`): the store falls back to its bundled
catalog (`js/data.js`) with browser-local orders. Good for UI previews only —
do not accept real money this way.

## Ops / maintenance scripts (root `*.cjs`)

- `add_reviews.cjs` — raw `fs` on `server/data/products.json` + `reviews.json`,
  fill to 20/product, weighted ratings, Indian names, last-180d, `rev_*` ids
- `seed_reviews.cjs` — same via `server/store.cjs:getProducts/getReviews/saveReviews`
  (backend-agnostic)
- `seed_reviews2.cjs` — filter out `rev_*`, then 10–30/product with titles,
  forces `avg ≥ 3.9`
- `update_server.cjs` — one-shot patcher for `server/index.cjs`
  (delivery-automation timeline patch, now superseded — automation removed)

Gitignored (runtime, not committed): `node_modules/`, `.env`,
`server/data/*.json` (except `.gitkeep`), `server/uploads/*`, `images/*`.
Committed: code + `admin/*`, `assets/og-cover.svg`, `*.cjs` scripts,
`.env.example`, `server/data/.gitkeep`.

`robots.txt`: `Allow:/`, sitemap ref. `sitemap.xml`: `/`, `/shop`,
`/shop?filter=new|sale`, `/shop?gender=men|women|unisex`,
`/about|contact|shipping|returns|privacy|terms`.

## Test the flows

- Shop: `/shop`, filters, sort, pagination, search (`q`, suggestions, recent)
- Product: size (required) → Add to Cart / Buy Now, wishlist, size guide, lightbox,
  `Notify Me` when out of stock
- Coupons: `WELCOME10` · `SIESTA15` · `FLAT200` (+ `EXPIRED5` expired state) —
  cart + checkout inputs
- Checkout: Address → Delivery (Standard 3–6d / Express `Arriving today|tomorrow`)
  → Payment (**COD only**, rest `Coming soon`) → Review → animated processing → confirmation
- Track: `/track/<16-digit-no>` (green bar + tick + reason when cancelled) ·
  Orders: `/account/orders` (cancel pre-shipment with reason + feedback)
- Invoice: `/invoice/<no>` (delivered only, printable `INV-<no>`)
- Auth: Register/Login/Logout, profile, addresses, password change, `Erase device data`
- Reviews: eligible from delivered orders only; recent via `GET /api/reviews/recent`
- Support: `/contact` → ticket → `Admin → Messages` reply/close
- Cookie banner: Accept / Reject / Manage → footer `Cookie preferences`
- Admin: `admin` login → Overview → Products (upload ≤5MB, cover ordering,
  auto-reviews) → Orders (advance/cancel with reason) → Coupons/Media/Settings/Maintenance

## Architecture

```text
index.html          shell, SEO/OG/JSON-LD, header/footer, cookie consent, splash
css/                tokens + app styles + fonts (cache-busted ?v=8)
js/api.js           backend client (live data with local fallback, 60s health cache)
js/data.js          bundled fallback catalog (~40 PRODUCTS, 4 COUPONS, 8 CATEGORIES)
js/store.js         cart/wishlist/auth-hash/orders/addresses/consent (localStorage/session)
js/ui.js            toasts, modal, stars, product art + uploaded-photo rendering
js/pages/shop.js    HomePage / ShopPage / ProductPage / cards / quick-view / events
js/pages/commerce.js CartPage / CheckoutPage / SuccessPage / TrackPage / WishlistPage / InvoicePage / drawer
js/pages/account.js Login/Register/Forgot/Account/Static (about/contact/faq/shipping/returns/privacy/terms/cookies)
js/app.js           boot (loads live catalog), History router, search, splash, newsletter
js/config.js        BUSINESS + STORE + IMAGE_LICENSE + LAUNCH_CHECKLIST
server/index.cjs    Express app: storefront + /admin + REST API (67 route handlers)
server/store.cjs    storage switch (JSON ↔ Supabase) + one-time migration
server/db.cjs       JSON-file DB (atomic writes, server/data/)
server/auth.cjs     admin (scrypt + HMAC token + rate-limit) + customer (scrypt + JWT-like)
server/supabase.cjs Supabase client (collections + product-images bucket)
server/seed.js      seeds DB from js/data.js (first boot)
server/env.cjs      .env loader · server/db-check.cjs · server/migrate-images.cjs
server/uploads/     local uploads (served at /uploads/*, 7d cache)
server/data/        products.json(34) / coupons.json(4) / orders.json / settings.json / admin.json
admin/              dashboard: overview/products/events/homepage/orders/customers/reviews/messages/coupons/media/settings
api/index.js        Vercel serverless wrapper re-exporting app
supabase/schema.sql collections table + product-images bucket + RLS
images/             hand-dropped photos (served at /images/*) · assets/og-cover.svg
```

## Before launch (mandatory)

1. Replace business details in `js/config.js` if still placeholder and complete
   `LAUNCH_CHECKLIST` review with legal/tax professionals.
2. Have Terms, Privacy, Shipping, Refund and Cookie policies reviewed for India
   (GST invoicing, tax-inclusive pricing, Consumer Protection E-Commerce Rules 2020,
   grievance officer).
3. Set a strong `ADMIN_PASSWORD`, serve behind HTTPS, back up `server/data/`
   (or use Supabase). For scale add a payment gateway (UPI/cards/netbanking —
   never collect card/CVV/UPI in this frontend) + courier partner before
   showing live courier scans or accepting real money.
4. See About page pre-launch checklist and Privacy/Cookie policies.
