// Shop pages: Home, PLP (listing + search), PDP.
import { CATEGORIES, discountPct, inStock, lowStock } from "../data.js";
import { catalog } from "../api.js";
import { events as liveEvents, siteHero, siteSettings, siteCatImage, siteCollectionImage } from "../api.js";
import { productById, getWish, toggleWish, addToCart, pushRecent, getRecent, getPrefs, setPrefs } from "../store.js";
import { esc, inr, productArt, photoArt, hasAltVisual, heroArt, catArt, observeReveals, setTitle, toast, openModal, openReviewModal, flyToCart, stars, imgVariant } from "../ui.js";

const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;

// Homepage events showcase (rendered only when the backend has live events).
export function eventSection() {
  const list = liveEvents();
  if (!list.length) return "";
  const dates = (e) => {
    const f = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    if (e.startsAt && e.endsAt) return `${f(e.startsAt)} – ${f(e.endsAt)}`;
    if (e.endsAt) return `Ends ${f(e.endsAt)}`;
    return "";
  };
  return `<section class="section" aria-labelledby="evH">
    <div class="section-head"><div><span class="eyebrow">Events & drops</span><h2 id="evH">Happening now</h2></div></div>
    <div class="event-grid">${list.map((e, i) => `
      <article class="event-card reveal" style="transition-delay:${Math.min(i * 70, 280)}ms">
        ${e.image ? `<a class="event-media" href="${esc(e.link)}" aria-label="${esc(e.title)}"><img src="${esc(imgVariant(e.image, 800))}" alt="${esc(e.title)}" loading="lazy" onerror="this.remove()" /></a>` : ""}
        <div class="event-copy">
          ${e.badge ? `<span class="badge sale">${esc(e.badge)}</span>` : ""}
          <h3>${esc(e.title)}</h3>
          ${e.subtitle ? `<p class="muted">${esc(e.subtitle)}</p>` : ""}
          ${dates(e) ? `<p class="event-dates">${esc(dates(e))}</p>` : ""}
          <a class="btn btn-dark btn-sm" href="${esc(e.link)}">${esc(e.cta || "Shop Now")}</a>
        </div>
      </article>`).join("")}</div>
  </section>`;
}

export function cardHTML(p, i = 0) {
  const off = discountPct(p);
  const wished = getWish().includes(p.id);
  const stockCls = !inStock(p) ? "out" : lowStock(p) ? "low" : "in";
  const stockTxt = !inStock(p) ? "Out of stock" : lowStock(p) ? `Only ${p.stock} left` : "In stock";
  return `<article class="p-card reveal" style="transition-delay:${Math.min(i * 40, 320)}ms">
    <div class="p-media">
      <a href="/product/${p.id}" aria-label="View ${esc(p.name)}" tabindex="-1">${productArt(p, 0, { loading: i < 4 ? "eager" : "lazy" })}</a>
      ${hasAltVisual(p) ? `<span class="p-alt" aria-hidden="true">${productArt(p, 1)}</span>` : ""}
      <div class="p-badges">
        ${off > 0 ? `<span class="badge sale">−${off}%</span>` : ""}
        ${p.isNew ? `<span class="badge new">New</span>` : ""}
      </div>
      <button class="wish-btn" data-wish="${p.id}" aria-pressed="${wished}" aria-label="${wished ? "Remove" : "Add"} ${esc(p.name)} ${wished ? "from" : "to"} wishlist">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${wished ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M12 20.5C7 16.5 3.5 13.3 3.5 9.5 3.5 7 5.5 5 8 5c1.6 0 3.1.8 4 2.1C12.9 5.8 14.4 5 16 5c2.5 0 4.5 2 4.5 4.5 0 3.8-3.5 7-8.5 11Z"/></svg>
      </button>
      <button class="quick-view" data-quick="${p.id}">Quick view</button>
    </div>
    <div class="p-body">
      <span class="p-cat">${esc(catLabel(p.category))} · ${esc(p.gender)}</span>
      <a class="p-name" href="/product/${p.id}">${esc(p.name)}</a>
      <span class="p-meta">${esc(p.colors.map((c) => c.name).join(" / "))} · ${esc(p.sizes.slice(0, 4).join(", "))}${p.sizes.length > 4 ? "+" : ""}</span>
      <div class="p-price"><span class="price">${inr(p.price)}</span>${p.mrp > p.price ? `<span class="mrp">${inr(p.mrp)}</span><span class="off">${off}% off</span>` : ""}</div>
      <span class="stock-note ${stockCls}">${stockTxt}</span>
      <div class="p-actions">
        <button class="btn btn-dark" data-add="${p.id}" ${!inStock(p) ? "disabled" : ""}>${inStock(p) ? "Add to Cart" : "Notify Me"}</button>
      </div>
    </div>
  </article>`;
}

export function bindCards(root) {
  root.querySelectorAll("[data-wish]").forEach((b) => (b.onclick = (e) => {
    e.preventDefault();
    const added = toggleWish(b.dataset.wish);
    
    b.classList.remove("beat");
    void b.offsetWidth;
    if (added) b.classList.add("beat");
    document.dispatchEvent(new CustomEvent("siesta:counts"));
    // update pressed state without full rerender
    b.setAttribute("aria-pressed", String(added));
    b.setAttribute("aria-label", `${added ? "Remove" : "Add"} item ${added ? "from" : "to"} wishlist`);
    b.querySelector("svg").setAttribute("fill", added ? "currentColor" : "none");
  }));
  root.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => {
    const p = productById(b.dataset.add);
    if (!p) return;
    if (!inStock(p)) { toast("This item is out of stock. We'll restock soon.", "error"); return; }
    // default size = middle size to reduce friction; PDP enforces explicit choice
    const size = p.sizes[Math.floor(p.sizes.length / 2)];
    try {
      addToCart(p.id, size, p.colors[0].name, 1);
      flyToCart(b);
      document.dispatchEvent(new CustomEvent("siesta:counts"));
    } catch (err) { toast(err.message, "error"); }
  }));
  root.querySelectorAll("[data-quick]").forEach((b) => (b.onclick = () => quickView(b.dataset.quick)));
}

export function quickView(id) {
  const p = productById(id);
  if (!p) return;
  const off = discountPct(p);
  const { el } = openModal(p.name, `<div style="display:grid;grid-template-columns:140px 1fr;gap:1rem;align-items:start">
    <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden">${productArt(p, 0, { w: 400 })}</div>
    <div><p class="muted" style="margin:0">${esc(catLabel(p.category))}</p>
    <p style="margin:.4rem 0"><strong>${inr(p.price)}</strong> ${p.mrp > p.price ? `<s class="muted">${inr(p.mrp)}</s> <span class="off">${off}% off</span>` : ""}</p>
    <p class="muted" style="font-size:.88rem">${esc(p.desc)}</p>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem">
      <a class="btn btn-dark btn-sm" href="/product/${p.id}" data-nav-view>View Details</a>
      <button class="btn btn-outline btn-sm" data-qadd ${!inStock(p) ? "disabled" : ""}>Add to Cart</button>
    </div></div></div>`);
  el.querySelector("[data-nav-view]")?.addEventListener("click", () => document.getElementById("modalRoot").innerHTML = "");
  el.querySelector("[data-qadd]")?.addEventListener("click", (e) => {
    try {
      addToCart(p.id, p.sizes[Math.floor(p.sizes.length / 2)], p.colors[0].name, 1);
      flyToCart(e.currentTarget);
      document.getElementById("modalRoot").innerHTML = "";
      document.dispatchEvent(new CustomEvent("siesta:counts"));
    } catch (err) { toast(err.message, "error"); }
  });
}

// Hero carousel rotation: crossfade every few seconds, dots + arrows,
// pause on hover, no auto-advance under reduced motion.
function initHero(root, count) {
  if (!root) return;
  const box = root.querySelector("#heroBox");
  const slides = [...root.querySelectorAll(".hero-slide")];
  if (!box || !slides.length) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // In-banner photo rotation runs for EVERY banner with 2+ photos,
  // even when there is only one banner (no dots/arrows then).
  slides.forEach((s) => {
    const shots = [...s.querySelectorAll(".hero-fg")];
    if (shots.length < 2) return;
    shots.forEach((im) => { const pre = new Image(); pre.src = im.currentSrc || im.src; });
    const backs = [...s.querySelectorAll(".hero-bg")];
    let k = 0;
    const makeSwapper = (list) => {
      let gen = 0;
      return () => {
        const my = ++gen;
        list.forEach((im, j) => {
          im.style.zIndex = j === k ? 3 : 1;
          if (j === k) im.classList.add("on");
        });
        setTimeout(() => {
          if (my !== gen) return;
          list.forEach((im, j) => { if (j !== k) { im.classList.remove("on"); im.style.zIndex = 1; } });
        }, 850);
      };
    };
    const swapShots = makeSwapper(shots);
    const swapBacks = makeSwapper(backs);
    setInterval(() => {
      if (reduced || document.hidden || !s.classList.contains("active")) return;
      k = (k + 1) % shots.length;
      swapShots();
      swapBacks();
    }, 3000);
  });
  // Banner-to-banner rotation needs 2+ banners.
  if (count < 2 || slides.length < 2) return;
  const dots = [...root.querySelectorAll(".hero-dot")];
  let cur = 0, timer = null;
  const show = (n) => {
    cur = ((n % count) + count) % count;
    slides.forEach((s, i) => {
      const on = i === cur;
      s.classList.toggle("active", on);
      if (on) s.removeAttribute("aria-hidden");
      else s.setAttribute("aria-hidden", "true");
    });
    dots.forEach((d, i) => (i === cur ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
  };
  const play = () => {
    if (reduced || timer) return;
    timer = setInterval(() => { if (!document.hidden) show(cur + 1); }, 5500);
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  dots.forEach((d, i) => (d.onclick = () => { stop(); show(i); play(); }));
  const prev = root.querySelector("[data-prev]");
  const next = root.querySelector("[data-next]");
  if (prev) prev.onclick = () => { stop(); show(cur - 1); play(); };
  if (next) next.onclick = () => { stop(); show(cur + 1); play(); };
  box.addEventListener("mouseenter", stop);
  box.addEventListener("mouseleave", play);
  box.addEventListener("focusin", stop);
  box.addEventListener("focusout", play);
  play();
}

// Live Product schema for the viewed item (real price, stock + review data).
function setProductJsonLd(p, rating) {
  try {
    let tag = document.getElementById("pdp-jsonld");
    if (!tag) {
      tag = document.createElement("script");
      tag.id = "pdp-jsonld";
      tag.type = "application/ld+json";
      document.head.appendChild(tag);
    }
    const ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      category: p.category,
      sku: p.sku,
      offers: {
        "@type": "Offer",
        priceCurrency: "INR",
        price: p.price,
        availability: (p.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      },
    };
    if (rating && rating.count > 0) {
      ld.aggregateRating = { "@type": "AggregateRating", ratingValue: rating.avg, reviewCount: rating.count };
    }
    tag.textContent = JSON.stringify(ld);
  } catch { /* SEO enhancement only */ }
}

// Homepage verified-reviews showcase (real data only — hides when empty).
function fillHomeReviews(root) {
  const box = root.querySelector("#homeReviews");
  if (!box) return;
  fetch("/api/reviews/recent?limit=3").then((r) => r.json()).then((d) => {
    if (!box.isConnected) return;
    if (!d || !d.count) { box.closest("section").hidden = true; return; }
    box.innerHTML = `<div class="rev-grid">
      <div class="stat"><span class="muted">Average rating</span><strong>${stars(d.avg)} ${d.avg}</strong><a class="link-btn" href="/shop?filter=bestsellers">${d.count} verified reviews →</a></div>
      ${d.reviews.map((r) => `<div class="stat"><span class="muted">${esc(r.productName || "Verified purchase")}</span><strong style="font-size:1rem">${stars(r.rating)} ${esc(r.title || "")}</strong><p class="muted" style="font-size:.84rem;margin:.3rem 0">“${esc(r.text.slice(0, 90))}${r.text.length > 90 ? "…" : ""}”</p><span class="verified">Verified Purchase</span></div>`).join("")}
    </div>`;
  }).catch(() => { if (box.isConnected) box.closest("section").hidden = true; });
}
export function HomePage() {
  setTitle("Siesta — Modern Essentials & Streetwear", "Premium everyday fashion: tees, shirts, jackets, hoodies, denim and more.");
  const ALL = catalog();
  const newArr = [...ALL].sort((a, b) => b.added.localeCompare(a.added)).slice(0, 8);
  const trend = [...ALL].sort((a, b) => b.popularity - a.popularity).slice(0, 8);
  const best = ALL.filter((p) => p.bestseller);
  const sale = ALL.filter((p) => discountPct(p) >= 25).slice(0, 4);
  const hero = siteHero();
  const HERO_DEFAULT = {
    eyebrow: "New Season · Autumn–Winter 2026",
    title: "Considered essentials, made to be lived in.",
    message: "Heavyweight tees, honest denim and outerwear that earns its place in your rotation. Designed in small batches, priced fairly, delivered across India with Cash on Delivery.",
    badge: `The Autumn Edit — utility jackets from ${inr(2199)}`,
    image: "",
  };
  // Multiple rotating banners (Admin → Homepage); falls back to the single
  // legacy hero, then to built-in defaults. Empty fields inherit defaults.
  const rawSlides = (() => {
    try {
      const s = JSON.parse(JSON.stringify(siteSettings()));
      if (Array.isArray(s.heroSlides) && s.heroSlides.length) return s.heroSlides;
      const h = s.hero || {};
      if (h.title || h.image || h.eyebrow || h.message || h.badge) return [h];
    } catch {}
    return [];
  })();
  const slides = (rawSlides.length ? rawSlides : [{}]).map((b) => ({ ...HERO_DEFAULT, ...Object.fromEntries(Object.entries(b || {}).filter(([, v]) => String(v ?? "").trim() !== "")) }));
  const heroSlideHTML = (b, i) => {
    const photos = (Array.isArray(b.images) && b.images.length ? b.images : (b.image ? [b.image] : [])).filter((u) => typeof u === "string" && u).slice(0, 6);
    const stack = (cls, alt) => photos.map((src, k) => `<img class="${cls}${k === 0 ? " on" : ""}" data-pi="${k}" src="${esc(imgVariant(src, 1200, 70))}" alt="${esc(alt)}"${cls === "hero-fg" && k > 0 ? ' aria-hidden="true"' : ""}${i === 0 && k === 0 && cls === "hero-fg" ? ' fetchpriority="high"' : ' loading="lazy"'} onerror="this.remove()" />`).join("");
    return `
      <div class="hero-slide${i === 0 ? " active" : ""}" data-slide="${i}"${i === 0 ? "" : ' aria-hidden="true"'}>
        <div class="hero-copy">
          <span class="eyebrow">${esc(b.eyebrow)}</span>
          <h1>${esc(b.title)}</h1>
          <p>${esc(b.message)}</p>
          <div class="hero-cta">
            <a class="btn btn-dark" href="/shop?gender=men">Shop Men</a>
            <a class="btn btn-light" href="/shop?gender=women">Shop Women</a>
            <a class="btn btn-light" href="/shop?gender=unisex">Shop Unisex</a>
          </div>
          <div class="hero-meta">
            <div><strong>COD available</strong>Pay at your door</div>
            <div><strong>Easy 7-day returns</strong>No questions asked</div>
            <div><strong>Ships in 24 hrs</strong>Across India</div>
          </div>
        </div>
        <div class="hero-art">${heroArt()}${stack("hero-bg", "")}${stack("hero-fg", b.title)}</div>
      </div>`;
  };
  const heroHTML = `
    <section class="hero" id="heroBox" aria-label="Featured collections" aria-roledescription="carousel">
      <div class="hero-slides">${slides.map(heroSlideHTML).join("")}</div>
      ${slides.length > 1 ? `<div class="hero-controls">
        <button class="hero-arrow" data-prev aria-label="Previous banner">‹</button>
        <div class="hero-dots" role="group" aria-label="Choose banner">${slides.map((b, i) => `<button class="hero-dot" data-dot="${i}"${i === 0 ? ' aria-current="true"' : ""} aria-label="Show banner ${i + 1}: ${esc(b.title.slice(0, 40))}"></button>`).join("")}</div>
        <button class="hero-arrow" data-next aria-label="Next banner">›</button>
      </div>` : ""}
    </section>`;

  setTimeout(() => { const root = document.getElementById("app"); bindCards(root); observeReveals(root); initHero(root, slides.length); fillHomeReviews(root); });
  // Preload the LCP hero photo + first-row covers so first paint already has them.
  setTimeout(() => {
    try {
      const pre = (href, hi) => {
        if (!href || document.querySelector(`link[rel="preload"][href="${CSS.escape(href)}"]`)) return;
        const l = document.createElement("link");
        l.rel = "preload"; l.as = "image"; l.href = href;
        if (hi) l.fetchPriority = "high";
        document.head.appendChild(l);
      };
      const firstSlide = slides[0] || {};
      const heroPhotos = firstSlide.images && firstSlide.images.length ? firstSlide.images : (firstSlide.image ? [firstSlide.image] : []);
      if (heroPhotos[0]) pre(imgVariant(heroPhotos[0], 1200, 70), true);
      newArr.slice(0, 4).forEach((p) => { if (p.images && p.images[0]) pre(imgVariant(p.images[0], 600, 70)); });
    } catch {}
  }, 0);
  return `<div class="page">
    ${heroHTML}

    <div class="marquee" aria-hidden="true"><div class="marquee-track">
      ${Array(2).fill(`<span>Complimentary shipping over ₹1,499</span><span>Cash on Delivery across India</span><span>7-day easy returns</span><span>New drops every week</span><span>Honest fabrics, fair prices</span>`).join("")}
    </div></div>

    <section class="section" aria-labelledby="catH">
      <div class="section-head"><div><span class="eyebrow">Departments</span><h2 id="catH">Shop by category</h2></div><a class="link-btn" href="/shop">View everything →</a></div>
      <div class="cat-grid">${CATEGORIES.map((c) => `<a class="cat-card reveal" href="/shop?category=${c.id}">${catArt(c.id, siteCatImage(c.id))}<span class="cat-label"><span><strong>${esc(c.label)}</strong><br/><span>${esc(c.blurb)}</span></span><span aria-hidden="true">→</span></span></a>`).join("")}</div>
    </section>

    <section class="section" aria-labelledby="genH">
      <div class="section-head"><div><span class="eyebrow">Collections</span><h2 id="genH">Shop by collection</h2><p>Three fits, one standard of quality.</p></div></div>
      <div class="gender-grid">
        ${[["men", "Men", "Cut for him"], ["women", "Women", "Cut for her"], ["unisex", "Unisex", "Cut for everyone"]].map(([g, label, blurb], i) => {
          const n = ALL.filter((p) => p.gender === g).length;
          const photo = siteCollectionImage(g);
          const art = `<span class="gender-art g-${g}" aria-hidden="true">${label[0]}${photo ? `<img src="${esc(imgVariant(photo, 800))}" alt="" loading="lazy" onerror="this.remove()" />` : ""}</span>`;
          return `<a class="cat-card gender-card reveal" style="transition-delay:${i * 70}ms" href="/shop?gender=${g}">${art}<span class="cat-label"><span><strong>${label}</strong><br/><span>${blurb} · ${n} styles</span></span><span aria-hidden="true">→</span></span></a>`;
        }).join("")}
      </div>
    </section>

    <section class="section" aria-labelledby="newH">
      <div class="section-head"><div><span class="eyebrow">Just landed</span><h2 id="newH">New arrivals</h2></div><a class="link-btn" href="/shop?filter=new">Shop all new →</a></div>
      <div class="product-grid" data-grid>${newArr.map(cardHTML).join("")}</div>
    </section>

    <section class="promo reveal" aria-label="Seasonal offer">
      <div class="promo-copy">
        <span class="eyebrow" style="color:#CFC7B4">Limited time</span>
        <h2>The Layering Event — up to 35% off jackets & sweatshirts</h2>
        <p style="color:#CFC7B4">Utility shells, truckers and brushed fleece. Use code <strong style="color:#fff">SIESTA15</strong> on orders over ₹1,999 at checkout.</p>
        <div class="hero-cta" style="margin-top:1.2rem"><a class="btn btn-clay" href="/shop?filter=sale">Shop the Sale</a><a class="btn btn-light" href="/shop?category=jackets">Explore Jackets</a></div>
      </div>
      <div class="promo-art" aria-hidden="true"><svg viewBox="0 0 500 320" style="width:100%;height:100%"><rect width="500" height="320" fill="none"/><g transform="translate(60,10) scale(.62)">${""}</g><text x="40" y="150" font-family="Georgia,serif" font-size="72" fill="#F3EFE6" letter-spacing="2">—35%</text><text x="42" y="185" font-family="system-ui" font-size="15" fill="#CFC7B4">on selected outerwear · ends soon</text><circle cx="400" cy="90" r="70" fill="none" stroke="#CFC7B4" stroke-width="1.5" stroke-dasharray="5 7"/><circle cx="400" cy="230" r="34" fill="#C96F4A"/></svg></div>
    </section>

    ${eventSection()}
    <section class="section" aria-labelledby="trendH">
      <div class="section-head"><div><span class="eyebrow">Most viewed</span><h2 id="trendH">Trending now</h2></div><a class="link-btn" href="/shop?sort=popularity">Shop popular →</a></div>
      <div class="product-grid" data-grid>${trend.map(cardHTML).join("")}</div>
    </section>

    <section class="section" aria-labelledby="bestH">
      <div class="section-head"><div><span class="eyebrow">Customer favourites</span><h2 id="bestH">Best sellers</h2><p>Core styles our customers reorder — merchandised by our studio, not by paid placement.</p></div><a class="link-btn" href="/shop?filter=bestsellers">Shop all →</a></div>
      <div class="product-grid" data-grid>${best.map(cardHTML).join("")}</div>
    </section>

    <section class="section" aria-labelledby="revH">
      <div class="section-head"><div><span class="eyebrow">Verified reviews</span><h2 id="revH">Loved by customers</h2><p>Real reviews from verified delivered purchases — never paid, never faked.</p></div></div>
      <div id="homeReviews"><div class="stat-grid"><div class="stat"><div class="skel" style="height:90px"></div></div><div class="stat"><div class="skel" style="height:90px"></div></div><div class="stat"><div class="skel" style="height:90px"></div></div></div></div>
    </section>

    <section class="brand-statement reveal" aria-label="About Siesta">
      <span class="eyebrow">Why Siesta</span>
      <h2>Fewer, better pieces. Honest fabrics, transparent pricing, no noise.</h2>
      <p class="lead" style="margin:0 auto">We cut small, focused collections from traceable mills and publish exactly what each garment is made of — down to the GSM. If a style doesn't earn its place, we don't make it.</p>
      <div class="values-grid">
        <div class="value-card"><h3>Honest materials</h3><p>Every product page lists fabric, weight and care — no mystery blends.</p></div>
        <div class="value-card"><h3>Fair, stable pricing</h3><p>We discount seasonally, not artificially. The price you see respects the maker.</p></div>
        <div class="value-card"><h3>Built for India</h3><p>Breathable weaves for heat, sturdy layers for winter, COD nationwide.</p></div>
      </div>
    </section>
  </div>`;
}

// ---------------- PLP ----------------
const PAGE_SIZE = 12;
export function ShopPage(query) {
  const q = (query.get("q") || "").trim();
  setTitle(q ? `Search: ${q} — Siesta` : "Shop All Fashion — Siesta", "Browse Siesta essentials with filters for size, colour, price and availability.");
  const prefs = getPrefs();
  const state = {
    category: query.get("category") || "",
    gender: query.get("gender") || "",
    filter: query.get("filter") || "",
    sort: query.get("sort") || prefs.sort || "relevance",
    maxPrice: Number(query.get("max") || 3500),
    sizes: new Set((query.get("sizes") || "").split(",").filter(Boolean)),
    avail: query.get("avail") || "",
    color: query.get("color") || "",
    page: Number(query.get("page") || 1),
    q,
  };
  let list = [...catalog()];
  if (state.q) {
    const needle = state.q.toLowerCase();
    list = list.filter((p) => [p.name, p.category, p.gender, p.desc, p.material, ...p.colors.map((c) => c.name)].join(" ").toLowerCase().includes(needle));
  }
  if (state.category) list = list.filter((p) => p.category === state.category);
  if (state.gender) list = list.filter((p) => p.gender === state.gender);
  if (state.filter === "new") list = list.filter((p) => p.isNew);
  if (state.filter === "sale") list = list.filter((p) => discountPct(p) > 0);
  if (state.filter === "bestsellers") list = list.filter((p) => p.bestseller);
  list = list.filter((p) => p.price <= state.maxPrice);
  if (state.sizes.size) list = list.filter((p) => p.sizes.some((s) => state.sizes.has(s)));
  if (state.avail === "in") list = list.filter(inStock);
  if (state.color) list = list.filter((p) => p.colors.some((c) => c.name.toLowerCase().includes(state.color.toLowerCase())));
  const sorters = { "price-asc": (a, b) => a.price - b.price, "price-desc": (a, b) => b.price - a.price, newest: (a, b) => b.added.localeCompare(a.added), popularity: (a, b) => b.popularity - a.popularity };
  if (sorters[state.sort]) list = [...list].sort(sorters[state.sort]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);
  const slice = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

  const syncURL = (patch) => {
    const nq = new URLSearchParams({ ...Object.fromEntries(query.entries()), ...patch });
    Object.keys(patch).forEach((k) => { if (patch[k] === "" || patch[k] == null) nq.delete(k); });
    window.navigate("/shop") + (nq.toString() ? "?" + nq.toString() : "");
  };

  const GENDER_TITLES = { men: "Men", women: "Women", unisex: "Unisex" };
  const title = state.q ? `Results for “${state.q}”` : state.category ? catLabel(state.category) : state.filter === "new" ? "New Arrivals" : state.filter === "sale" ? "Sale" : state.filter === "bestsellers" ? "Best Sellers" : state.gender ? (GENDER_TITLES[state.gender] || "Shop") : "Shop All";

  setTimeout(() => {
    const root = document.getElementById("app");
    const closeFilters = () => { root.querySelector("#filters")?.classList.remove("open"); const s = document.getElementById("scrim"); if (!document.getElementById("mobileNav")?.classList.contains("open")) s.hidden = true; };
    // sort
    root.querySelector("#sortSel").onchange = (e) => { setPrefs({ ...getPrefs(), sort: e.target.value }); syncURL({ sort: e.target.value, page: 1 }); };
    root.querySelector("#maxRange").oninput = (e) => { root.querySelector("#maxOut").textContent = inr(e.target.value); };
    root.querySelector("#maxRange").onchange = (e) => syncURL({ max: e.target.value, page: 1 });
    root.querySelectorAll("[data-size-f]").forEach((c) => (c.onchange = () => {
      const s = new Set([...root.querySelectorAll("[data-size-f]:checked")].map((x) => x.value));
      syncURL({ sizes: [...s].join(","), page: 1 });
    }));
    root.querySelectorAll("[data-cat-f]").forEach((c) => (c.onchange = () => syncURL({ category: c.checked ? c.value : "", page: 1 })));
    root.querySelectorAll("[data-gender-f]").forEach((c) => (c.onchange = () => syncURL({ gender: c.checked ? c.value : "", page: 1 })));
    root.querySelector("#availSel").onchange = (e) => syncURL({ avail: e.target.value, page: 1 });
    root.querySelector("#clearF").onclick = () => (window.navigate("/shop"));
    root.querySelector("#filterFab").onclick = () => { root.querySelector("#filters").classList.add("open"); document.getElementById("scrim").hidden = false; };
    root.querySelector("#filterClose").onclick = closeFilters;
    const scrim = document.getElementById("scrim");
    scrim.onclick = () => { closeFilters(); document.getElementById("mobileNav")?.classList.remove("open"); };
    root.querySelectorAll("[data-page]").forEach((b) => (b.onclick = () => syncURL({ page: b.dataset.page })));
    bindCards(root);
    observeReveals(root);
  });

  const allSizes = ["XS", "S", "M", "L", "XL", "XXL", "26", "28", "30", "32", "34", "36"];
  return `<div class="page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">${esc(title)}</span></nav>
    <div class="section-head" style="margin-top:0"><div><span class="eyebrow">${list.length} product${list.length === 1 ? "" : "s"}</span><h2 style="font-size:clamp(1.7rem,3vw,2.4rem)">${esc(title)}</h2>
    <p>${state.q ? "Search across names, categories and fabrics." : "Filter by size, price and availability. Prices include taxes where applicable."}</p></div></div>
    <div class="plp-layout">
      <aside class="filters" id="filters" aria-label="Product filters">
        <div style="display:flex;justify-content:space-between;align-items:center"><h2>Filters</h2><button class="link-btn" id="filterClose" aria-label="Close filters">✕</button></div>
        <div class="filter-group"><h3>Category</h3>${CATEGORIES.map((c) => `<label class="check-row"><input type="checkbox" data-cat-f value="${c.id}" ${state.category === c.id ? "checked" : ""}/> ${esc(c.label)}</label>`).join("")}</div>
        <div class="filter-group"><h3>Gender</h3>${["men", "women", "unisex"].map((g) => `<label class="check-row"><input type="checkbox" data-gender-f value="${g}" ${state.gender === g ? "checked" : ""}/> ${g[0].toUpperCase() + g.slice(1)}</label>`).join("")}</div>
        <div class="filter-group"><h3>Size</h3><div style="display:flex;flex-wrap:wrap;gap:.4rem">${allSizes.map((s) => `<label class="check-row" style="border:1px solid var(--line);border-radius:8px;padding:.3rem .6rem"><input type="checkbox" data-size-f value="${s}" ${state.sizes.has(s) ? "checked" : ""}/> ${s}</label>`).join("")}</div></div>
        <div class="filter-group"><h3>Max price: <output id="maxOut">${inr(state.maxPrice)}</output></h3><input id="maxRange" type="range" min="500" max="3500" step="100" value="${state.maxPrice}" aria-label="Maximum price" style="width:100%"/></div>
        <div class="filter-group"><h3>Availability</h3><select id="availSel" class="select" aria-label="Availability"><option value="">All</option><option value="in" ${state.avail === "in" ? "selected" : ""}>In stock only</option></select></div>
        <button class="btn btn-ghost btn-sm btn-block" id="clearF">Clear all filters</button>
      </aside>
      <div>
        <div class="toolbar">
          <span class="count" role="status">Showing ${slice.length} of ${list.length}</span>
          <div class="toolbar-controls">
            <label class="visually-hidden" for="sortSel">Sort products</label>
            <select id="sortSel" class="select" style="width:auto">
              <option value="relevance" ${state.sort === "relevance" ? "selected" : ""}>Sort: Relevance</option>
              <option value="newest" ${state.sort === "newest" ? "selected" : ""}>Newest</option>
              <option value="price-asc" ${state.sort === "price-asc" ? "selected" : ""}>Price: Low to High</option>
              <option value="price-desc" ${state.sort === "price-desc" ? "selected" : ""}>Price: High to Low</option>
              <option value="popularity" ${state.sort === "popularity" ? "selected" : ""}>Popularity</option>
            </select>
          </div>
        </div>
        ${slice.length === 0 ? `<div class="empty"><h2>No matches found</h2><p class="muted">Try a different keyword (“jacket”, “denim”, “hoodie”) or clear your filters.</p><div class="chips"><a class="chip" href="/shop?category=jackets">Jackets</a><a class="chip" href="/shop?category=jeans">Jeans</a><a class="chip" href="/shop?category=hoodies">Hoodies</a><a class="chip" href="/shop">Clear all</a></div></div>`
        : `<div class="product-grid" data-plp-grid>${slice.map(cardHTML).join("")}</div>
        <div style="display:flex;gap:.5rem;justify-content:center;margin-top:1.4rem;flex-wrap:wrap" role="navigation" aria-label="Pagination">
          ${Array.from({ length: pages }).map((_, i) => `<button class="btn ${i + 1 === state.page ? "btn-dark" : "btn-light"} btn-sm" data-page="${i + 1}" ${i + 1 === state.page ? 'aria-current="page"' : ""}>${i + 1}</button>`).join("")}
        </div>`}
        <div style="margin-top:1rem"><button class="btn btn-dark filter-fab" id="filterFab" aria-label="Open filters">Filters · ${list.length}</button></div>
      </div>
    </div>
  </div>`;
}

// ---------------- PDP ----------------
export function ProductPage(id) {
  const p = productById(id);
  if (!p) return `<div class="page"><div class="empty"><h2>Product not found</h2><p class="muted">It may have been moved. Try browsing the catalog.</p><a class="btn btn-dark" href="/shop">Back to Shop</a></div></div>`;
  setTitle(`${p.name} — Siesta`, p.desc);
  pushRecent(id);
  const off = discountPct(p);
  const related = catalog().filter((x) => x.id !== p.id && (x.category === p.category || x.gender === p.gender)).slice(0, 4);
  const recent = getRecent().filter((x) => x.id !== p.id).slice(0, 4);
  const photos = p.images || [];
  const thumbsHTML = photos.length
    ? photos.map((src, i) => `<button data-thumb="${i}" aria-current="${i === 0}" aria-label="View photo ${i + 1} of ${esc(p.name)}"><img src="${esc(imgVariant(src, 200, 60))}" alt="" style="width:100%;height:100%;object-fit:cover" /></button>`).join("")
    : p.colors.map((c, i) => `<button data-thumb="${i}" aria-current="${i === 0}" aria-label="View in ${esc(c.name)}"><span aria-hidden="true">${productArt(p, i)}</span></button>`).join("");
  setTimeout(() => {
    const root = document.getElementById("app");
    let size = "", color = p.colors[0].name, qty = 1, cIdx = 0;
    const main = root.querySelector("#gMain");
    const renderMain = () => { main.classList.remove("swap"); void main.offsetWidth; main.innerHTML = photos.length ? photoArt(p, cIdx) : productArt(p, cIdx); main.classList.add("swap"); };
    renderMain();
    root.querySelectorAll("[data-thumb]").forEach((b) => (b.onclick = () => {
      cIdx = Number(b.dataset.thumb);
      root.querySelectorAll("[data-thumb]").forEach((x) => x.setAttribute("aria-current", String(x === b)));
      renderMain();
    }));
    root.querySelectorAll("[data-size]").forEach((b) => (b.onclick = () => {
      size = b.dataset.size;
      root.querySelectorAll("[data-size]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      root.querySelector("#sizeErr").textContent = "";
    }));
    root.querySelectorAll("[data-color]").forEach((b) => (b.onclick = () => {
      color = b.dataset.color; cIdx = Number(b.dataset.cidx);
      root.querySelectorAll("[data-color]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderMain();
    }));
    root.querySelector("#qMinus").onclick = () => { qty = Math.max(1, qty - 1); root.querySelector("#qOut").textContent = qty; };
    root.querySelector("#qPlus").onclick = () => { qty = Math.min(10, qty + 1); root.querySelector("#qOut").textContent = qty; };
    root.querySelector("#wishBtn").onclick = (e) => {
      const added = toggleWish(p.id);
      e.currentTarget.setAttribute("aria-pressed", String(added));
      e.currentTarget.querySelector("span").textContent = added ? "Saved to Wishlist" : "Add to Wishlist";
      
      document.dispatchEvent(new CustomEvent("siesta:counts"));
    };
    const needSize = () => { if (!size) { root.querySelector("#sizeErr").textContent = "Please choose a size."; root.querySelector("[data-size]")?.focus(); return true; } return false; };
    root.querySelector("#addBtn").onclick = (e) => {
      if (needSize()) return;
      try { addToCart(p.id, size, color, qty); flyToCart(e.currentTarget); document.dispatchEvent(new CustomEvent("siesta:counts")); }
      catch (err) { toast(err.message, "error"); }
    };
    root.querySelector("#buyBtn").onclick = () => {
      if (needSize()) return;
      try { addToCart(p.id, size, color, qty); document.dispatchEvent(new CustomEvent("siesta:counts")); window.navigate("/checkout"); }
      catch (err) { toast(err.message, "error"); }
    };
    root.querySelector("#sizeGuideBtn").onclick = () => openModal("Size guide", `<table class="spec-table"><tr><th>Size</th><th>Chest (in)</th><th>Waist (in)</th></tr>${[["XS", "34", "28"], ["S", "36", "30"], ["M", "38", "32"], ["L", "40", "34"], ["XL", "42", "36"], ["XXL", "44", "38"]].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table><p class="muted" style="font-size:.85rem">Between sizes? We recommend sizing up for relaxed fits and down for tailored fits.</p>`);
    const gMain = root.querySelector("#gMain");
    const openLightbox = () => {
      const lb = document.createElement("div");      lb.className = "lightbox";
      lb.innerHTML = `${photos.length ? photoArt(p, cIdx, true) : productArt(p, cIdx)}<button class="btn btn-light btn-sm" aria-label="Close image viewer">Close ✕</button>`;
      document.body.appendChild(lb);
      const close = () => { lb.remove(); gMain.focus(); };
      lb.querySelector("button").onclick = close;
      lb.onclick = (e) => { if (e.target === lb) close(); };
      lb.querySelector("button").focus();
      document.addEventListener("keydown", function h(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", h); } });
    };
    gMain.onclick = openLightbox;
    gMain.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(); } };
    root.querySelectorAll(".acc-head").forEach((h) => (h.onclick = () => {
      const open = h.getAttribute("aria-expanded") === "true";
      h.setAttribute("aria-expanded", String(!open));
      h.nextElementSibling.hidden = open;
    }));
    bindCards(root);
    observeReveals(root);
    // Live verified-purchase reviews for this product.
    fetch(`/api/products/${encodeURIComponent(p.id)}/reviews`).then(async (r) => r.json()).then(async (list) => {
      const box = root.querySelector("#pdpRevBody");
      if (!box) return;
      // Eligibility is independent of existing reviews — check it first.
      let eligBtn = "";
      let eligOrder = "";
      try {
        const t = localStorage.getItem("siesta.token") || sessionStorage.getItem("siesta.token");
        if (t) {
          const e = await fetch(`/api/reviews/eligibility/${encodeURIComponent(p.id)}`, { headers: { Authorization: "Bearer " + t } }).then((x) => x.json()).catch(() => null);
          if (e && e.eligible && e.orderNo) {
            eligOrder = e.orderNo;
            eligBtn = `<div style="margin-bottom:.9rem"><button class="btn btn-dark btn-sm" id="pdpReviewBtn">Write a Review</button> <span class="muted" style="font-size:.84rem">Verified delivery on your account</span></div>`;
          }
        }
      } catch { /* logged out or offline: no button */ }
      if (!box.isConnected) return;
      if (!Array.isArray(list) || !list.length) {
        box.innerHTML = eligBtn + "<p>No verified-purchase reviews yet for this style. Bought it? You can review it from your delivered order.</p>";
        setProductJsonLd(p, null);
      } else {
        const avg = Math.round((list.reduce((s, x) => s + x.rating, 0) / list.length) * 10) / 10;
        setProductJsonLd(p, { avg, count: list.length });
        const line = root.querySelector("#pdpRatingLine");
        if (line) {
          line.innerHTML = `<button class="rating-jump" id="pdpRatingJump" aria-label="Rated ${avg} out of 5 from ${list.length} verified reviews. Jump to reviews.">${stars(avg, `${avg} out of 5 from ${list.length} verified reviews`)} <strong>${avg}</strong> <span class="muted">· ${list.length} verified review${list.length === 1 ? "" : "s"}</span></button>`;
          line.querySelector("#pdpRatingJump").onclick = () => {
            const head = root.querySelector("#pdpRevHead");
            if (head && head.getAttribute("aria-expanded") !== "true") head.click();
            root.querySelector("#pdpRevBody")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          };
        }
        box.innerHTML = eligBtn + `<p>${stars(avg, `${avg} out of 5 from ${list.length} verified reviews`)} <strong>${avg}</strong> · ${list.length} verified review${list.length === 1 ? "" : "s"}</p>` +
          list.map((r) => `<div class="review"><div class="review-head">${stars(r.rating)}<strong>${esc(r.title || "Verified review")}</strong><span class="verified">Verified Purchase</span><time>${new Date(r.createdAt).toLocaleDateString("en-IN")}</time></div><p>${esc(r.text)}</p><p class="muted" style="font-size:.82rem">— ${esc(r.author)}</p></div>`).join("");
      }
      const btn = box.querySelector("#pdpReviewBtn");
      if (btn) btn.onclick = () => openReviewModal(eligOrder, { id: p.id, name: p.name });
    }).catch(() => {
      const box = root.querySelector("#pdpRevBody");
      if (box) box.innerHTML = "<p class='muted'>Reviews are unavailable right now.</p>";
    });
  });

  const wished = getWish().includes(p.id);
  return `<div class="page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/shop">Shop</a><span>/</span><a href="/shop?category=${p.category}">${esc(catLabel(p.category))}</a><span>/</span><span aria-current="page">${esc(p.name)}</span></nav>
    <div class="pdp">
      <div class="gallery">
        <div class="g-main" id="gMain" role="button" tabindex="0" aria-label="Open image viewer for ${esc(p.name)}"></div>
        ${((photos.length || p.colors.length) > 1) ? `<div class="g-thumbs" role="list" aria-label="${photos.length ? "Product photos" : "Colour views"}">${thumbsHTML}</div>` : ""}
      </div>
      <div class="pdp-info">
        <span class="eyebrow">${esc(catLabel(p.category))} · ${esc(p.gender)}</span>
        <h1>${esc(p.name)}</h1>
        <p class="muted" style="margin:0">SKU ${esc(p.sku)} · ${esc(p.material)}</p>
        <div id="pdpRatingLine" style="margin:.35rem 0 0;min-height:1.4em"></div>
        <div class="pdp-price"><span class="price">${inr(p.price)}</span>${off ? `<s class="muted">${inr(p.mrp)}</s><span class="off">${off}% off</span>` : ""}</div>
        <p class="muted" style="font-size:.86rem">Inclusive of all taxes. <a href="/shipping">Shipping info</a></p>
        <p style="font-size:.9rem;color:var(--success);font-weight:700" role="status">${!inStock(p) ? `<span style="color:var(--danger)">Out of stock — restocking soon.</span>` : lowStock(p) ? `Only ${p.stock} left in stock — order soon.` : "In stock, ships within 24 hours."}</p>
        <p>${esc(p.desc)}</p>
        <div class="opt-label"><span>Size ${sizeRequiredNote(p)}</span><button class="link-btn" id="sizeGuideBtn">Size guide</button></div>
        <div class="size-row" role="group" aria-label="Choose a size">${p.sizes.map((s) => `<button class="size-btn" data-size="${s}" aria-pressed="false">${s}</button>`).join("")}</div>
        <p class="err" id="sizeErr" role="alert" style="color:var(--danger);font-size:.85rem;min-height:1.2em"></p>
        ${p.colors.length > 1 ? `
        <div class="opt-label"><span>Colour: <output id="colorOut">${esc(p.colors[0].name)}</output></span></div>
        <div class="color-row" role="group" aria-label="Choose a colour">${p.colors.map((c, i) => `<button class="color-btn" data-color="${esc(c.name)}" data-cidx="${i}" aria-pressed="${i === 0}"><span class="color-dot" style="background:${c.hex}" aria-hidden="true"></span>${esc(c.name)}</button>`).join("")}</div>`
        : `<p class="muted" style="margin:.8rem 0 0;font-size:.92rem">Colour: <strong style="color:var(--ink)">${esc(p.colors[0].name)}</strong> <span class="color-dot" style="background:${p.colors[0].hex};display:inline-block;vertical-align:-6px" aria-hidden="true"></span></p>`}
        <div class="opt-label"><span>Quantity</span></div>
        <div class="qty" aria-label="Quantity selector"><button id="qMinus" aria-label="Decrease quantity">−</button><output id="qOut" aria-live="polite">1</output><button id="qPlus" aria-label="Increase quantity">+</button></div>
        <div class="pdp-cta">
          <button class="btn btn-dark" id="addBtn" ${!inStock(p) ? "disabled" : ""}>Add to Cart</button>
          <button class="btn btn-outline" id="buyBtn" ${!inStock(p) ? "disabled" : ""}>Buy Now</button>
        </div>
        <button class="btn btn-ghost btn-sm" id="wishBtn" aria-pressed="${wished}" style="margin-top:.5rem">♡ <span>${wished ? "Saved to Wishlist" : "Add to Wishlist"}</span></button>
        <p class="muted" style="font-size:.86rem">Cash on Delivery available · Estimated delivery ${eta()} · 7-day easy returns</p>
        <div class="acc"><button class="acc-head" aria-expanded="true">Product details <span aria-hidden="true">−</span></button><div class="acc-body"><ul>${p.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></div></div>
        <div class="acc"><button class="acc-head" aria-expanded="false">Material & care <span aria-hidden="true">+</span></button><div class="acc-body" hidden><p><strong>Material:</strong> ${esc(p.material)}</p><p><strong>Care:</strong> ${esc(p.care)}</p></div></div>
        <div class="acc"><button class="acc-head" aria-expanded="false">Shipping & returns <span aria-hidden="true">+</span></button><div class="acc-body" hidden><p>Ships within 24 hours. Free shipping over ₹1,499. 7-day returns on unworn items with tags. See <a href="/shipping">Shipping</a> and <a href="/returns">Returns</a>.</p></div></div>
        <div class="acc"><button class="acc-head" aria-expanded="false">Specifications <span aria-hidden="true">+</span></button><div class="acc-body" hidden><table class="spec-table"><tr><th>SKU</th><td>${esc(p.sku)}</td></tr><tr><th>Category</th><td>${esc(catLabel(p.category))}</td></tr><tr><th>Gender</th><td>${esc(p.gender)}</td></tr><tr><th>Fit</th><td>As described above</td></tr></table></div></div>
        <div class="acc"><button class="acc-head" id="pdpRevHead" aria-expanded="false">Reviews <span aria-hidden="true">+</span></button><div class="acc-body" id="pdpRevBody" hidden><p class="muted">Loading reviews…</p></div></div>
      </div>
    </div>
    <section class="section"><div class="section-head"><h2>You may also like</h2><a class="link-btn" href="/shop?category=${p.category}">More ${esc(catLabel(p.category))} →</a></div><div class="product-grid" data-grid>${related.map(cardHTML).join("")}</div></section>
    ${recent.length ? `<section class="section"><div class="section-head"><h2>Recently viewed</h2></div><div class="h-scroll" data-grid>${recent.map(cardHTML).join("")}</div></section>` : ""}
  </div>`;
}
const sizeRequiredNote = () => `<span class="muted" style="font-weight:400;font-size:.82rem">(required)</span>`;
const eta = () => new Date(Date.now() + 5 * 86400000).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
