// UI primitives: toasts, modals, original SVG product art, formatting, a11y helpers.
export const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
// Lightweight delivery variants for Supabase-hosted photos (1.7MB PNG → ~60KB
// WebP). Local /uploads + /images files pass through untouched.
export function imgVariant(url, w = 800, q = 70) {
  if (typeof url !== "string" || !url.includes("/storage/v1/object/public/")) return url;
  const [base, hash] = url.split("#");
  return base.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
    `?width=${w}&quality=${q}&format=webp` + (hash ? `#${hash}` : "");
}
// Star display (typographic, screen-reader labelled — never faked).
export const stars = (n, label) => {
  const full = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return `<span class="stars" role="img" aria-label="${esc(label || `${full} out of 5 stars`)}">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
};
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Toasts (accessible, polite, persistent enough) ----------
export function toast(msg, type = "success", ms = 4200) {
  const wrap = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `<span>${esc(msg)}</span><button aria-label="Dismiss notification">✕</button>`;
  const kill = () => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); };
  el.querySelector("button").onclick = kill;
  wrap.appendChild(el);
  setTimeout(kill, ms);
  while (wrap.children.length > 4) wrap.firstChild.remove();
}

// ---------- Modal with focus trap + Esc ----------
export function openModal(title, bodyHTML) {
  const root = document.getElementById("modalRoot");
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><strong>${esc(title)}</strong><button class="icon-btn" data-close aria-label="Close dialog">✕</button></div>
    <div class="modal-body">${bodyHTML}</div></div>`;
  root.appendChild(scrim);
  const modal = scrim.querySelector(".modal");
  const prevFocus = document.activeElement;
  const close = () => { scrim.remove(); document.removeEventListener("keydown", onKey); if (prevFocus?.focus) prevFocus.focus(); };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const f = [...modal.querySelectorAll("button,a,input,select,textarea,[tabindex]")].filter((el) => !el.disabled && el.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener("keydown", onKey);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  scrim.querySelector("[data-close]").onclick = close;
  setTimeout(() => scrim.querySelector("[data-close]").focus(), 30);
  return { close, el: modal };
}

export function confirmDialog(title, message, confirmLabel = "Confirm") {
  return new Promise((resolve) => {
    const { close, el } = openModal(title, `<p>${esc(message)}</p>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.2rem">
        <button class="btn btn-ghost btn-sm" data-no>Cancel</button>
        <button class="btn btn-dark btn-sm" data-yes>${esc(confirmLabel)}</button>
      </div>`);
    el.querySelector("[data-no]").onclick = () => { close(); resolve(false); };
    el.querySelector("[data-yes]").onclick = () => { close(); resolve(true); };
  });
}

// ---------------- WRITE A REVIEW (delivered orders only) ----------------
// Shared by tracking, order history and product pages.
export function openReviewModal(orderNo, item) {
  let rating = 0;
  const { el, close } = openModal(`Review: ${esc(item.name)}`, `
    <div class="stars-input" role="radiogroup" aria-label="Choose a star rating">
      ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}
    </div>
    <p class="err" id="rvStarErr" role="alert"></p>
    <div class="field"><label for="rvTitle">Headline (optional)</label><input id="rvTitle" class="input" maxlength="120" placeholder="Sums it up in a line" /></div>
    <div class="field"><label for="rvText">Your review *</label><textarea id="rvText" class="input" rows="4" maxlength="1000" placeholder="Fit, fabric, delivery experience… (min 10 characters)"></textarea></div>
    <p class="err" id="rvErr" role="alert"></p>
    <button class="btn btn-dark btn-block" id="rvSubmit">Submit Review</button>`);
  const paint = () => el.querySelectorAll("[data-star]").forEach((b) => {
    const n = Number(b.dataset.star);
    b.classList.toggle("lit", n <= rating);
    b.setAttribute("aria-checked", String(n === rating));
  });
  el.querySelectorAll("[data-star]").forEach((b) => (b.onclick = () => { rating = Number(b.dataset.star); paint(); el.querySelector("#rvStarErr").textContent = ""; }));
  el.querySelector("#rvSubmit").onclick = async (e) => {
    if (!rating) { el.querySelector("#rvStarErr").textContent = "Please choose a star rating."; return; }
    const text = el.querySelector("#rvText").value.trim();
    if (text.length < 10) { el.querySelector("#rvErr").textContent = "Please write at least a sentence (10+ characters)."; return; }
    const btn = e.currentTarget;
    btn.classList.add("is-loading"); btn.disabled = true;
    try {
      const r = await fetch("/api/reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo, productId: item.id, rating, title: el.querySelector("#rvTitle").value.trim(), text }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Could not save your review.");
      close();
      toast("Thanks! Your review is now public.");
      document.dispatchEvent(new CustomEvent("siesta:reroute"));
    } catch (err) {
      el.querySelector("#rvErr").textContent = err.message;
      btn.classList.remove("is-loading"); btn.disabled = false;
    }
  };
}

// ---------- Original SVG product art (no third-party imagery) ----------
const BG = ["#EFE9DD", "#E7E0D2", "#DDE3DA", "#E3D9CC", "#D8DEE4", "#E9DCD2"];
const bgFor = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997; return BG[h % BG.length]; };

function garmentShape(category, color) {
  const s = `fill="${color}" stroke="rgba(20,20,20,.28)" stroke-width="3" stroke-linejoin="round"`;
  const d = `fill="none" stroke="rgba(20,20,20,.35)" stroke-width="3" stroke-linecap="round"`;
  const seam = `stroke="rgba(255,255,255,.55)" stroke-width="2.5" fill="none" stroke-linecap="round"`;
  switch (category) {
    case "tshirts": return `<path ${s} d="M150 110 110 128 78 170l38 26 14-12v172h140V184l14 12 38-26-32-42-40 18c-6 10-18 16-30 16s-24-6-30-16l-40-18Z"/><path ${d} d="M150 122c12 0 24-6 30-16"/><path ${seam} d="M140 300v-60M160 300v-60"/>`;
    case "shirts": return `<path ${s} d="M150 96l-28 14-44 20-30 44 36 26 14-14v170h104V186l14 14 36-26-30-44-44-20-28-14Z"/><path ${s} d="M136 100l14 20 14-20 10 6-24 26-24-26 10-6Z"/><path ${d} d="M150 132v224"/><circle cx="150" cy="170" r="3.4" fill="rgba(20,20,20,.5)"/><circle cx="150" cy="210" r="3.4" fill="rgba(20,20,20,.5)"/><circle cx="150" cy="250" r="3.4" fill="rgba(20,20,20,.5)"/><path ${seam} d="M112 300v-40M188 300v-40"/>`;
    case "jackets": return `<path ${s} d="M150 92l-30 12-46 20-32 48 38 28 14-14v176h112V186l14 14 38-28-32-48-46-20-30-12Z"/><path ${d} d="M150 110v252"/><path ${d} d="M112 210h28M160 210h28M112 260h28M160 260h28"/><path ${seam} d="M120 132l-16 40M180 132l16 40"/>`;
    case "hoodies": return `<ellipse ${s} cx="150" cy="112" rx="42" ry="34"/><path ${s} d="M108 150 74 172l-30 46 36 26 14-12v130h112V232l14 12 36-26-30-46-34-22c-8 14-24 22-42 22s-34-8-42-22Z"/><path ${d} d="M132 116c4 10 10 16 18 16s14-6 18-16"/><rect x="118" y="290" width="64" height="44" rx="10" fill="none" stroke="rgba(20,20,20,.35)" stroke-width="3"/><path ${seam} d="M150 140v60"/>`;
    case "jeans":
    case "pants": return `<path ${s} d="M110 96h80l14 80 10 180h-52l-12-150-12 150H86l10-180 14-80Z"/><path ${d} d="M110 120h80"/><path ${d} d="M150 120v40"/><path ${seam} d="M100 200l40 8M200 200l-40 8"/><circle cx="150" cy="132" r="3.4" fill="rgba(20,20,20,.5)"/>`;
    case "shorts": return `<path ${s} d="M108 130h84l12 60 8 84h-52l-10-70-10 70H88l8-84 12-60Z"/><path ${d} d="M108 152h84"/><path ${seam} d="M150 152v40"/>`;
    case "sweatshirts": return `<path ${s} d="M150 108l-38 16-36 42 36 26 12-10v174h52V182l12 10 36-26-36-42-38-16Z"/><path ${d} d="M132 112c5 12 11 18 18 18s13-6 18-18"/><path ${seam} d="M120 320h60M112 200l16 8M188 200l-16 8"/>`;
    default: return `<rect ${s} x="90" y="110" width="120" height="240" rx="18"/>`;
  }
}

export function productArt(p, colorIdx = 0, opts = {}) {
  const color = p.colors[colorIdx % p.colors.length];
  const bg = bgFor(p.id);
  const label = opts.label ?? p.name;
  const svg = `<svg viewBox="0 0 300 440" role="img" aria-label="${esc(label)} — ${esc(color.name)} ${esc(p.category)} illustration">
    <rect width="300" height="440" fill="${bg}"/>
    <ellipse cx="150" cy="118" rx="118" ry="86" fill="rgba(255,255,255,.45)"/>
    <rect x="0" y="356" width="300" height="84" fill="rgba(20,20,20,.06)"/>
    <text x="150" y="392" text-anchor="middle" font-family="Georgia,serif" font-size="21" letter-spacing="4" fill="rgba(20,20,20,.55)">SIESTA</text>
    <text x="150" y="410" text-anchor="middle" font-family="system-ui" font-size="10" letter-spacing="2.5" fill="rgba(20,20,20,.45)">${esc(p.colors[colorIdx % p.colors.length].name.toUpperCase())}</text>
    <g transform="translate(0,6)">${garmentShape(p.category, color.hex)}</g>
  </svg>`;
  // Admin-uploaded photo overlays the illustration; if it fails to load the
  // illustration underneath still shows (graceful degradation).
  const photo = p.images && p.images[Math.min(colorIdx, p.images.length - 1)];
  if (!photo) return svg;
  const w = opts.w || 600;
  return `<span class="art-wrap">${svg}<img class="art-photo" src="${esc(imgVariant(photo, w))}" alt="${esc(label)}" loading="${opts.loading || "lazy"}" onerror="this.remove()" /></span>`;
}

// Photo at an explicit index (for galleries), falling back to illustration.
// Pass full=true for the zoom lightbox (original file, uncropped).
export function photoArt(p, idx = 0, full = false) {
  const all = p.images || [];
  if (!all.length) return productArt(p, 0);
  const raw = all[idx % all.length];
  const src = full ? raw : imgVariant(raw, 1000, 75);
  return `<span class="art-wrap">${productArt({ ...p, images: [] }, 0)}<img class="art-photo" src="${esc(src)}" alt="${esc(p.name)} — photo ${idx + 1}" onerror="this.remove()" /></span>`;
}
export const hasAltVisual = (p) => Boolean((p.images && p.images[1]) || (!(p.images && p.images.length) && p.colors.length > 1));

export function heroArt() {
  return `<svg viewBox="0 0 600 520" role="img" aria-label="Siesta editorial collage illustration of folded essentials in sand, olive and clay tones">
    <rect width="600" height="520" fill="#E9E2D3"/>
    <ellipse cx="430" cy="120" rx="180" ry="130" fill="#DCD2BC"/>
    <rect x="60" y="60" width="220" height="400" rx="22" fill="#1E3A32"/>
    <g transform="translate(80,96) scale(.62)">${garmentShape("jackets", "#5A6248")}</g>
    <rect x="300" y="120" width="220" height="340" rx="22" fill="#FBFAF8" stroke="#D8D2C8" stroke-width="2"/>
    <g transform="translate(320,140) scale(.62)">${garmentShape("tshirts", "#E8E0D2")}</g>
    <rect x="36" y="372" width="240" height="96" rx="16" fill="#141414"/>
    <text x="58" y="408" font-family="Georgia,serif" font-size="22" fill="#FBFAF8" letter-spacing="2">New Season</text>
    <text x="58" y="434" font-family="system-ui" font-size="13" fill="#CFC7B4">Heavyweight cottons · Raw denim</text>
  </svg>`;
}

export function catArt(id, img = "") {
  const map = { tshirts: ["tshirts", "#E8E0D2"], shirts: ["shirts", "#B9CDDE"], jackets: ["jackets", "#5A6248"], hoodies: ["hoodies", "#9A9A9A"], jeans: ["jeans", "#33465C"], pants: ["pants", "#B5A586"], shorts: ["shorts", "#D9CBB6"], sweatshirts: ["sweatshirts", "#F1EAD9"] };
  const [cat, hex] = map[id] || ["tshirts", "#E8E0D2"];
  const svg = `<svg viewBox="0 0 300 240" style="width:100%;height:100%"><rect width="300" height="240" fill="${bgFor(id)}"/><ellipse cx="150" cy="90" rx="110" ry="70" fill="rgba(255,255,255,.5)"/><g transform="translate(75,-30) scale(.5)">${garmentShape(cat, hex)}</g></svg>`;
  // Admin-uploaded photo overlays the illustration (removed if it fails to load).
  const photo = img ? `<img src="${esc(imgVariant(img, 800))}" alt="" loading="lazy" onerror="this.remove()" />` : "";
  return `<span class="cat-art" aria-hidden="true">${svg}${photo}</span>`;
}

// ---------- Fly-to-cart + badge pop (skipped under reduced motion) ----------
export function popBadge() {
  const b = document.getElementById("cartCount");
  if (!b) return;
  b.classList.remove("pop");
  void b.offsetWidth;
  b.classList.add("pop");
}

export function flyToCart(fromEl) {
  if (reducedMotion() || !fromEl) return;
  const cart = document.querySelector(".cart-btn");
  if (!cart) return;
  const r1 = fromEl.getBoundingClientRect();
  const r2 = cart.getBoundingClientRect();
  const dot = document.createElement("span");
  dot.className = "fly-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.style.left = r1.left + r1.width / 2 + "px";
  dot.style.top = r1.top + "px";
  document.body.appendChild(dot);
  const dx = r2.left + r2.width / 2 - (r1.left + r1.width / 2);
  const dy = r2.top + r2.height / 2 - r1.top;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    dot.style.transform = `translate(${dx}px, ${dy}px) scale(.25)`;
    dot.style.opacity = "0";
  }));
  setTimeout(() => { dot.remove(); popBadge(); }, 680);
}

// Small address-type icons (home / work).
export const addrIcon = (label = "home", size = 14) => (String(label).toLowerCase() === "work"
  ? `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>`
  : `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11 12 4l8 7M6 10v9h12v-9"/></svg>`);
export const addrLabel = (label = "home") => (String(label).toLowerCase() === "work" ? "Work" : "Home");

// ---------- Skeletons / reveal ----------
export const skeletonGrid = (n = 8) => `<div class="product-grid" aria-hidden="true">${Array.from({ length: n }).map(() => `<div><div class="skel" style="aspect-ratio:4/5"></div><div class="skel" style="height:14px;margin:.7rem 0 .4rem"></div><div class="skel" style="height:14px;width:55%"></div></div>`).join("")}</div>`;

export function observeReveals(root = document) {
  const els = root.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || reducedMotion()) { els.forEach((e) => e.classList.add("visible")); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } }), { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

// ---------- Form helpers ----------
export function setErr(input, msg) {
  const field = input.closest(".field");
  const err = field?.querySelector(".err");
  if (err) err.textContent = msg || "";
  input.setAttribute("aria-invalid", msg ? "true" : "false");
}
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
export const isPhone = (v) => /^[6-9]\d{9}$/.test(v.replace(/[\s+-]/g, "").replace(/^91/, ""));

export function setTitle(title, desc) {
  document.title = title;
  const m = document.querySelector('meta[name="description"]');
  if (m && desc) m.setAttribute("content", desc);
}
