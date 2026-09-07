// Siesta Admin dashboard (vanilla JS, same-origin API).
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const TOKEN_KEY = "siesta.admin.token";
  const getToken = () => sessionStorage.getItem(TOKEN_KEY);

  function toast(msg, type = "success") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  async function api(path, opts = {}) {
    const r = await fetch(path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (getToken() || ""), ...(opts.headers || {}) },
    });
    let data = null;
    try { data = await r.json(); } catch {}
    if (r.status === 401) { showLogin(); throw new Error("Session expired. Please log in again."); }
    if (!r.ok) throw new Error((data && data.error) || "Request failed.");
    return data;
  }

  async function uploadFiles(files) {
    const fd = new FormData();
    [...files].forEach((f) => fd.append("images", f));
    const r = await fetch("/api/admin/upload", { method: "POST", headers: { Authorization: "Bearer " + getToken() }, body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Upload failed.");
    return data;
  }

  /* ---------- auth gate ---------- */
  function showLogin() {
    sessionStorage.removeItem(TOKEN_KEY);
    $("#loginView").hidden = false;
    $("#dashView").hidden = true;
  }
  function showDash() {
    $("#loginView").hidden = true;
    $("#dashView").hidden = false;
    nav("overview");
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $("#loginErr").textContent = "";
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Login failed.");
      sessionStorage.setItem(TOKEN_KEY, data.token);
      toast("Welcome back.");
      showDash();
    } catch (err) { $("#loginErr").textContent = err.message; }
  });
  $("#logoutBtn").addEventListener("click", showLogin);

  /* ---------- router ---------- */
  const TITLES = { overview: "Overview", products: "Products", events: "Events", homepage: "Homepage", orders: "Orders", coupons: "Coupons", media: "Media Library", settings: "Settings" };
  let productsCache = [];
  function nav(view) {
    $$("#sideNav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("#viewTitle").textContent = TITLES[view];
    ({ overview: vOverview, products: vProducts, events: vEvents, homepage: vHomepage, orders: vOrders, coupons: vCoupons, media: vMedia, settings: vSettings })[view]();
  }
  $("#sideNav").addEventListener("click", (e) => { if (e.target.dataset.view) nav(e.target.dataset.view); });

  /* ---------- overview ---------- */
  async function vOverview() {
    $("#view").innerHTML = "<p class='muted'>Loading…</p>";
    try {
      const s = await api("/api/admin/stats");
      $("#view").innerHTML = `
        <div class="stat-grid">
          <div class="stat"><span>Revenue (COD)</span><strong>${inr(s.revenue)}</strong></div>
          <div class="stat"><span>Orders</span><strong>${s.orders}</strong></div>
          <div class="stat"><span>Products</span><strong>${s.products}</strong></div>
          <div class="stat"><span>Low stock (≤5)</span><strong>${s.lowStock.length}</strong></div>
        </div>
        <div class="grid-2">
          <div class="card"><h3>Orders by status</h3>${Object.entries(s.byStatus).map(([k, v]) => `<p>${esc(k.replace(/_/g, " "))}: <strong>${v}</strong></p>`).join("") || "<p class='muted'>No orders yet.</p>"}</div>
          <div class="card"><h3>Needs restock</h3>${s.lowStock.map((p) => `<p><a href="#" data-edit="${esc(p.id)}">${esc(p.name)}</a> — <strong>${p.stock} left</strong></p>`).join("") || "<p class='muted'>All stocked up.</p>"}</div>
        </div>
        <div class="card"><h3>Recent orders</h3>${s.recent.map((o) => `<p><strong>${esc(o.orderNo)}</strong> · ${inr(o.amounts.total)} · <span class="pill">${esc(o.status)}</span></p>`).join("") || "<p class='muted'>No orders yet.</p>"}</div>`;
      $$("#view [data-edit]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); openProductEditor(a.dataset.edit); }));
    } catch (e) { $("#view").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  /* ---------- products ---------- */
  async function vProducts() {
    $("#view").innerHTML = "<p class='muted'>Loading…</p>";
    try {
      productsCache = await api("/api/admin/products");
      renderProductTable("");
    } catch (e) { $("#view").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
  function renderProductTable(filter) {
    const list = productsCache.filter((p) => !filter || (p.name + p.sku + p.category).toLowerCase().includes(filter.toLowerCase()));
    $("#view").innerHTML = `
      <div class="toolbar">
        <input type="search" id="pq" placeholder="Search products…" value="${esc(filter)}" aria-label="Search products" />
        <span class="muted small">${list.length} products</span>
        <span style="flex:1"></span>
        <button class="btn btn-dark btn-sm" id="addP">+ Add Product</button>
      </div>
      <div class="card" style="padding:0;overflow:auto"><table class="tbl">
        <tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
        ${list.map((p) => `<tr>
          <td>${p.images && p.images[0] ? `<img class="thumb" src="${esc(p.images[0])}" alt="" loading="lazy" />` : `<span class="thumb-ph">S</span>`}</td>
          <td><strong>${esc(p.name)}</strong><br /><span class="muted small">${esc(p.sku)} · ${esc(p.gender)}</span></td>
          <td>${esc(p.category)}</td>
          <td>${inr(p.price)} <span class="muted small"><s>${inr(p.mrp)}</s></span></td>
          <td>${p.stock <= 0 ? '<span class="pill">Out</span>' : p.stock <= 5 ? `<span class="pill warn">${p.stock} low</span>` : p.stock}</td>
          <td>${p.isNew ? '<span class="pill ok">New</span> ' : ""}${p.bestseller ? '<span class="pill">Best</span>' : ""}</td>
          <td><div class="row-actions"><button class="btn btn-light btn-sm" data-edit="${esc(p.id)}">Edit</button><button class="btn btn-light btn-sm" data-del="${esc(p.id)}">Delete</button></div></td>
        </tr>`).join("") || `<tr><td colspan="7" class="muted">No products match.</td></tr>`}
      </table></div>`;
    $("#pq").addEventListener("input", (e) => renderProductTable(e.target.value));
    $("#addP").addEventListener("click", () => openProductEditor(null));
    $$("#view [data-edit]").forEach((b) => (b.onclick = () => openProductEditor(b.dataset.edit)));
    $$("#view [data-del]").forEach((b) => (b.onclick = async () => {
      if (!confirm(`Delete "${b.dataset.del}" permanently?`)) return;
      try { await api("/api/admin/products/" + encodeURIComponent(b.dataset.del), { method: "DELETE" }); toast("Product deleted."); vProducts(); }
      catch (e) { toast(e.message, "error"); }
    }));
  }

  function openProductEditor(id) {
    const p = id ? productsCache.find((x) => x.id === id) : { name: "", category: "tshirts", gender: "unisex", price: 999, mrp: 1499, colors: [{ name: "Default", hex: "#999999" }], sizes: ["S", "M", "L", "XL"], stock: 10, material: "", care: "", desc: "", details: [], isNew: true, bestseller: false, images: [] };
    if (id && !p) return;
    const root = $("#modalRoot");
    root.innerHTML = `
    <div class="modal-scrim"><div class="modal" role="dialog" aria-modal="true" aria-label="${id ? "Edit product" : "Add product"}">
      <div class="modal-head"><strong>${id ? "Edit product" : "Add product"}</strong><button class="btn btn-light btn-sm" id="mClose">Close ✕</button></div>
      <div class="modal-body"><form id="pForm">
        <div class="grid-2">
          <div class="field"><label>Product name *</label><input class="input" name="name" value="${esc(p.name)}" required /></div>
          <div class="field"><label>SKU ${id ? "(locked)" : "(optional)"}</label><input class="input" name="sku" value="${esc(p.sku || "")}" ${id ? "disabled" : ""} /></div>
          <div class="field"><label>Category</label><select class="input" name="category">${["tshirts", "shirts", "jackets", "hoodies", "jeans", "pants", "shorts", "sweatshirts"].map((c) => `<option ${p.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          <div class="field"><label>Gender</label><select class="input" name="gender">${["men", "women", "unisex"].map((g) => `<option ${p.gender === g ? "selected" : ""}>${g}</option>`).join("")}</select></div>
          <div class="field"><label>Price (₹) *</label><input class="input" name="price" type="number" min="1" value="${p.price}" required /></div>
          <div class="field"><label>MRP (₹)</label><input class="input" name="mrp" type="number" min="1" value="${p.mrp}" /></div>
          <div class="field"><label>Stock *</label><input class="input" name="stock" type="number" min="0" value="${p.stock}" required /></div>
          <div class="field"><label>Sizes (comma separated) *</label><input class="input" name="sizes" value="${esc(p.sizes.join(", "))}" /></div>
        </div>
        <div class="field"><label>Colours — one per line as <code>Name:#hex</code></label><textarea class="input" name="colors" rows="3">${esc(p.colors.map((c) => `${c.name}:${c.hex}`).join("\n"))}</textarea></div>
        <div class="field"><label>Material</label><input class="input" name="material" value="${esc(p.material || "")}" /></div>
        <div class="field"><label>Description</label><textarea class="input" name="desc" rows="3">${esc(p.desc || "")}</textarea></div>
        <div class="field"><label>Care instructions</label><input class="input" name="care" value="${esc(p.care || "")}" /></div>
        <div class="field"><label>Details — one per line</label><textarea class="input" name="details" rows="3">${esc((p.details || []).join("\n"))}</textarea></div>
        <div style="display:flex;gap:1rem;margin:.4rem 0"><label class="check-row"><input type="checkbox" name="isNew" ${p.isNew ? "checked" : ""} /> New arrival</label><label class="check-row"><input type="checkbox" name="bestseller" ${p.bestseller ? "checked" : ""} /> Best seller</label></div>
        <div class="field"><label>Product images <span class="muted">(first image = cover)</span></label>
          <div class="img-grid" id="imgGrid"></div>
          <label class="drop">Click or drop images here to upload (JPG/PNG/WebP/GIF/AVIF, ≤5MB each)<input type="file" id="imgInput" accept="image/*" multiple /></label>
          <div style="display:flex;gap:.5rem;margin-top:.6rem"><input class="input" id="imgUrl" placeholder="…or paste a folder URL like /images/tee-front.webp" style="flex:1" /><button type="button" class="btn btn-light btn-sm" id="imgUrlAdd">Add</button></div>
        </div>
        <p class="err" id="pErr"></p>
        <button class="btn btn-dark btn-block" type="submit">${id ? "Save Changes" : "Create Product"}</button>
      </form></div>
    </div></div>`;
    let images = [...(p.images || [])];
    const grid = $("#imgGrid");
    const drawImgs = () => {
      grid.innerHTML = images.map((u, i) => `<div class="img-cell"><img src="${esc(u)}" alt="" loading="lazy" />${i === 0 ? '<span class="tag">Cover</span>' : ""}<button data-rm="${i}" aria-label="Remove image">✕</button></div>`).join("") || "<p class='muted small'>No images — the store shows an illustration placeholder.</p>";
      $$("#imgGrid [data-rm]").forEach((b) => (b.onclick = () => { images.splice(Number(b.dataset.rm), 1); drawImgs(); }));
    };
    drawImgs();
    $("#imgInput").addEventListener("change", async (e) => {
      if (!e.target.files.length) return;
      try {
        toast("Uploading…");
        const up = await uploadFiles(e.target.files);
        images.push(...up.map((f) => f.url));
        drawImgs();
        toast(`${up.length} image(s) uploaded.`);
      } catch (err) { toast(err.message, "error"); }
      e.target.value = "";
    });
    $("#imgUrlAdd").addEventListener("click", () => {
      const u = $("#imgUrl").value.trim();
      if (!/^\/(uploads|images)\/[^/]+\.(jpe?g|png|webp|gif|avif)$/i.test(u)) { toast("Use a valid store URL like /images/tee-front.webp", "error"); return; }
      if (images.length >= 8) { toast("Maximum 8 images per product.", "error"); return; }
      images.push(u);
      $("#imgUrl").value = "";
      drawImgs();
    });
    $("#mClose").addEventListener("click", () => (root.innerHTML = ""));
    root.querySelector(".modal-scrim").addEventListener("mousedown", (e) => { if (e.target.classList.contains("modal-scrim")) root.innerHTML = ""; });
    $("#pForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const colors = String(fd.get("colors")).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, hex] = l.split(":").map((s) => s.trim());
        return { name: name || "Default", hex: /^#[0-9a-fA-F]{6}$/.test(hex || "") ? hex : "#999999" };
      });
      const body = {
        name: fd.get("name"), sku: fd.get("sku") || undefined, category: fd.get("category"), gender: fd.get("gender"),
        price: Number(fd.get("price")), mrp: Number(fd.get("mrp")), stock: Number(fd.get("stock")),
        sizes: String(fd.get("sizes")).split(",").map((s) => s.trim()).filter(Boolean),
        colors: colors.length ? colors : [{ name: "Default", hex: "#999999" }],
        material: fd.get("material"), care: fd.get("care"), desc: fd.get("desc"),
        details: String(fd.get("details")).split("\n").map((s) => s.trim()).filter(Boolean),
        isNew: !!fd.get("isNew"), bestseller: !!fd.get("bestseller"), images,
      };
      try {
        if (id) await api("/api/admin/products/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(body) });
        else await api("/api/admin/products", { method: "POST", body: JSON.stringify(body) });
        root.innerHTML = "";
        toast(id ? "Product saved." : "Product created.");
        vProducts();
      } catch (err) { $("#pErr").textContent = err.message; }
    });
  }

  /* ---------- events ---------- */
  async function vEvents() {
    $("#view").innerHTML = "<p class='muted'>Loading…</p>";
    try {
      const list = await api("/api/admin/events");
      const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
      $("#view").innerHTML = `
        <div class="toolbar"><span class="muted small">${list.length} events · only active ones in date show on the store homepage</span><span style="flex:1"></span><button class="btn btn-dark btn-sm" id="addE">+ New Event</button></div>
        ${list.map((e) => `<div class="card"><div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap">
          ${e.image ? `<img class="thumb" style="width:90px;height:64px;object-fit:cover;border-radius:10px;border:1px solid var(--line)" src="${esc(e.image)}" alt="" loading="lazy" />` : `<span class="thumb-ph" style="width:90px;height:64px">✦</span>`}
          <div style="flex:1;min-width:200px"><strong>${esc(e.title)}</strong> ${e.active ? '<span class="pill ok">Live</span>' : '<span class="pill">Hidden</span>'}<br />
          <span class="muted small">${esc(e.badge || e.subtitle || "")} · ${fmt(e.startsAt)} → ${fmt(e.endsAt)} · <a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.cta)}</a></span></div>
          <div class="row-actions"><button class="btn btn-light btn-sm" data-eedit="${esc(e.id)}">Edit</button><button class="btn btn-light btn-sm" data-edel="${esc(e.id)}">Delete</button></div>
        </div></div>`).join("") || "<div class='card'><p class='muted'>No events yet. Create one for your next sale, drop or festive edit.</p></div>"}`;
      $("#addE").addEventListener("click", () => openEventEditor(null));
      $$("#view [data-eedit]").forEach((b) => (b.onclick = () => openEventEditor(b.dataset.eedit)));
      $$("#view [data-edel]").forEach((b) => (b.onclick = async () => {
        if (!confirm("Delete this event? It will disappear from the store homepage.")) return;
        try { await api("/api/admin/events/" + encodeURIComponent(b.dataset.edel), { method: "DELETE" }); toast("Event deleted."); vEvents(); }
        catch (e) { toast(e.message, "error"); }
      }));
    } catch (e) { $("#view").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  async function openEventEditor(id) {
    let e = { title: "", subtitle: "", description: "", badge: "", image: "", gallery: [], cta: "Shop Now", link: "#/shop?filter=sale", startsAt: "", endsAt: "", active: true, sort: 0 };
    if (id) {
      try {
        const found = (await api("/api/admin/events")).find((x) => x.id === id);
        if (!found) { toast("Event not found.", "error"); return; }
        e = found;
      } catch (err) { toast(err.message, "error"); return; }
    }
    const root = $("#modalRoot");
    root.innerHTML = `
    <div class="modal-scrim"><div class="modal" role="dialog" aria-modal="true" aria-label="${id ? "Edit event" : "New event"}">
      <div class="modal-head"><strong>${id ? "Edit event" : "New event"}</strong><button class="btn btn-light btn-sm" id="mClose">Close ✕</button></div>
      <div class="modal-body"><form id="eForm">
        <div class="grid-2">
          <div class="field"><label>Event title *</label><input class="input" name="title" value="${esc(e.title)}" placeholder="Diwali Festive Edit" required /></div>
          <div class="field"><label>Badge (short highlight)</label><input class="input" name="badge" value="${esc(e.badge || "")}" placeholder="Up to 40% off" /></div>
        </div>
        <div class="field"><label>Subtitle</label><input class="input" name="subtitle" value="${esc(e.subtitle || "")}" placeholder="One line under the title" /></div>
        <div class="field"><label>Description</label><textarea class="input" name="description" rows="3" placeholder="What is this event about?">${esc(e.description || "")}</textarea></div>
        <div class="field"><label>Banner image <span class="muted">(landscape works best, shown on homepage)</span></label>
          <div class="img-grid" id="eImgGrid"></div>
          <label class="drop">Click or drop a banner here to upload<input type="file" id="eImgInput" accept="image/*" /></label>
          <div style="display:flex;gap:.5rem;margin-top:.6rem"><input class="input" id="eImgUrl" placeholder="…or paste /images/event-banner.webp" style="flex:1" /><button type="button" class="btn btn-light btn-sm" id="eImgUrlAdd">Add</button></div>
        </div>
        <div class="field"><label>Extra gallery images <span class="muted">(optional)</span></label>
          <div class="img-grid" id="eGalGrid"></div>
          <label class="drop">Click or drop more event photos here<input type="file" id="eGalInput" accept="image/*" multiple /></label>
        </div>
        <div class="grid-2">
          <div class="field"><label>Button label</label><input class="input" name="cta" value="${esc(e.cta || "Shop Now")}" /></div>
          <div class="field"><label>Button link</label><input class="input" name="link" value="${esc(e.link || "#/shop")}" placeholder="#/shop?filter=sale" /></div>
          <div class="field"><label>Start date (optional)</label><input class="input" name="startsAt" type="date" value="${esc(e.startsAt || "")}" /></div>
          <div class="field"><label>End date (optional)</label><input class="input" name="endsAt" type="date" value="${esc(e.endsAt || "")}" /></div>
          <div class="field"><label>Sort order (lower shows first)</label><input class="input" name="sort" type="number" min="0" value="${e.sort || 0}" /></div>
          <div class="field"><label>&nbsp;</label><label class="check-row"><input type="checkbox" name="active" ${e.active !== false ? "checked" : ""} /> Show on store homepage</label></div>
        </div>
        <p class="err" id="eErr"></p>
        <button class="btn btn-dark btn-block" type="submit">${id ? "Save Changes" : "Create Event"}</button>
      </form></div>
    </div></div>`;
    let banner = e.image || "";
    let gallery = [...(e.gallery || [])];
    const drawE = () => {
      $("#eImgGrid").innerHTML = banner ? `<div class="img-cell" style="grid-column:span 2"><img src="${esc(banner)}" alt="" style="aspect-ratio:16/9" /><button data-rmb aria-label="Remove banner">✕</button></div>` : "<p class='muted small'>No banner — upload or paste one.</p>";
      const rb = $("#eImgGrid [data-rmb]");
      if (rb) rb.onclick = () => { banner = ""; drawE(); };
      $("#eGalGrid").innerHTML = gallery.map((u, i) => `<div class="img-cell"><img src="${esc(u)}" alt="" loading="lazy" /><button data-rmg="${i}" aria-label="Remove photo">✕</button></div>`).join("") || "<p class='muted small'>No extra photos.</p>";
      $$("#eGalGrid [data-rmg]").forEach((b) => (b.onclick = () => { gallery.splice(Number(b.dataset.rmg), 1); drawE(); }));
    };
    drawE();
    const takeUpload = async (files, single, set) => {
      if (!files.length) return;
      try {
        toast("Uploading…");
        const up = await uploadFiles(files);
        if (single) set(up[0].url);
        else set(null, up.map((f) => f.url));
        toast("Uploaded.");
      } catch (err) { toast(err.message, "error"); }
    };
    $("#eImgInput").addEventListener("change", async (ev) => { await takeUpload(ev.target.files, true, (u) => { banner = u; drawE(); }); ev.target.value = ""; });
    $("#eGalInput").addEventListener("change", async (ev) => { await takeUpload(ev.target.files, false, (u, arr) => { gallery.push(...arr); drawE(); }); ev.target.value = ""; });
    $("#eImgUrlAdd").addEventListener("click", () => {
      const u = $("#eImgUrl").value.trim();
      if (!/^\/(uploads|images)\/[^/]+\.(jpe?g|png|webp|gif|avif)$/i.test(u)) { toast("Use a valid store URL like /images/event-banner.webp", "error"); return; }
      banner = u; $("#eImgUrl").value = ""; drawE();
    });
    $("#mClose").addEventListener("click", () => (root.innerHTML = ""));
    root.querySelector(".modal-scrim").addEventListener("mousedown", (ev) => { if (ev.target.classList.contains("modal-scrim")) root.innerHTML = ""; });
    $("#eForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const body = {
        title: fd.get("title"), subtitle: fd.get("subtitle"), description: fd.get("description"), badge: fd.get("badge"),
        image: banner, gallery, cta: fd.get("cta"), link: fd.get("link"),
        startsAt: fd.get("startsAt"), endsAt: fd.get("endsAt"), sort: Number(fd.get("sort")),
        active: !!fd.get("active"),
      };
      try {
        if (id) await api("/api/admin/events/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(body) });
        else await api("/api/admin/events", { method: "POST", body: JSON.stringify(body) });
        root.innerHTML = "";
        toast(id ? "Event saved." : "Event created — live on the homepage.");
        vEvents();
      } catch (err) { $("#eErr").textContent = err.message; }
    });
  }
  /* ---------- homepage visuals ---------- */
  async function vHomepage() {
    $("#view").innerHTML = "<p class='muted'>Loading…</p>";
    let s = {};
    try { s = await api("/api/admin/settings"); }
    catch (e) { $("#view").innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const blankSlide = () => ({ eyebrow: "", title: "", message: "", badge: "", image: "", images: [] });
    const withGallery = (b) => {
      const s = { ...blankSlide(), ...(b || {}) };
      if (!Array.isArray(s.images)) s.images = s.image ? [s.image] : [];
      return s;
    };
    let slides;
    if (Array.isArray(s.heroSlides) && s.heroSlides.length) {
      try { slides = JSON.parse(JSON.stringify(s.heroSlides)).map(withGallery); }
      catch { slides = [blankSlide()]; }
    } else {
      const h = s.hero || {};
      slides = (h.title || h.image || h.eyebrow || h.message || h.badge) ? [withGallery(h)] : [blankSlide()];
    }
    const catImgs = { ...(s.categoryImages || {}) };
    const colImgs = { ...(s.collectionImages || {}) };
    const CATS = [["tshirts", "T-Shirts"], ["shirts", "Shirts"], ["jackets", "Jackets"], ["hoodies", "Hoodies"], ["jeans", "Jeans"], ["pants", "Pants"], ["shorts", "Shorts"], ["sweatshirts", "Sweatshirts"]];
    const COLS = [["men", "Men"], ["women", "Women"], ["unisex", "Unisex"]];
    const get = (kind, key) => (kind === "slide" ? (slides[Number(key)] || {}).image : kind === "cat" ? catImgs[key] : colImgs[key]) || "";
    const set = (kind, key, url) => {
      if (kind === "slide") { if (slides[Number(key)]) slides[Number(key)].image = url; }
      else if (kind === "cat") { if (url) catImgs[key] = url; else delete catImgs[key]; }
      else { if (url) colImgs[key] = url; else delete colImgs[key]; }
    };
    const rowHTML = (kind, key, label) => {
      const url = get(kind, key);
      return `<div class="img-row" data-kind="${kind}" data-key="${key}">
        ${url ? `<img src="${esc(url)}" alt="" loading="lazy" />` : `<span class="thumb-ph">–</span>`}
        <strong>${esc(label)}</strong>
        <input class="input" data-url placeholder="/images/… or upload →" value="${esc(url)}" aria-label="Image URL for ${esc(label)}" />
        <label class="btn btn-light btn-sm">Upload<input type="file" data-file accept="image/*" hidden /></label>
        <button type="button" class="btn btn-light btn-sm" data-clear>Remove</button>
      </div>`;
    };
    const slideHTML = (b, i) => `
      <div class="slide-block" data-sidx="${i}">
        <div class="slide-head"><strong>Banner ${i + 1}</strong>
          <span class="row-actions">
            <button type="button" class="btn btn-light btn-sm" data-smove="-1" ${i === 0 ? "disabled" : ""} aria-label="Move banner ${i + 1} up">↑</button>
            <button type="button" class="btn btn-light btn-sm" data-smove="1" ${i === slides.length - 1 ? "disabled" : ""} aria-label="Move banner ${i + 1} down">↓</button>
            <button type="button" class="btn btn-light btn-sm" data-sdel>Remove</button>
          </span>
        </div>
        <div class="grid-2">
          <div class="field"><label>Headline</label><input class="input" data-sfield="title" value="${esc(b.title || "")}" placeholder="Considered essentials, made to be lived in." /></div>
          <div class="field"><label>Eyebrow (small top line)</label><input class="input" data-sfield="eyebrow" value="${esc(b.eyebrow || "")}" placeholder="New Season · Autumn–Winter 2026" /></div>
        </div>
        <div class="field"><label>Message</label><textarea class="input" data-sfield="message" rows="2" placeholder="Short brand message…">${esc(b.message || "")}</textarea></div>
        <div class="field"><label>Badge (bottom-left tag)</label><input class="input" data-sfield="badge" value="${esc(b.badge || "")}" placeholder="The Autumn Edit…" /></div>
        <div class="field"><label>Banner photos <span class="muted">(first = cover · auto-fades when 2+)</span></label>
          <div class="img-grid">${(b.images || []).map((u, k) => `<div class="img-cell"><img src="${esc(u)}" alt="" loading="lazy" />${k === 0 ? '<span class="tag">Cover</span>' : ""}<button type="button" data-sgaldel="${k}" aria-label="Remove photo">✕</button></div>`).join("") || "<p class='muted small'>No photos — the built-in artwork shows.</p>"}</div>
          <label class="drop">Click or drop photos here (uploads instantly)<input type="file" data-sgalup accept="image/*" multiple /></label>
          <div style="display:flex;gap:.5rem;margin-top:.6rem"><input class="input" data-sgalurl placeholder="/images/banner-1.webp" style="flex:1" /><button type="button" class="btn btn-light btn-sm" data-sgaladd>Add</button></div>
        </div>
      </div>`;
    const draw = () => {
      $("#hpSlides").innerHTML = slides.map(slideHTML).join("");
      $("#hpCatRows").innerHTML = CATS.map(([k, l]) => rowHTML("cat", k, l)).join("");
      $("#hpColRows").innerHTML = COLS.map(([k, l]) => rowHTML("col", k, l)).join("");
    };
    $("#view").innerHTML = `
      <div id="hpWrap">
      <div class="card"><h3>Hero banners <span class="muted small">— fade and rotate on the homepage. Empty fields keep the built-in text.</span></h3>
        <div id="hpSlides"></div>
        <button type="button" class="btn btn-light btn-sm" id="hpAddSlide">+ Add banner</button>
      </div>
      <div class="card"><h3>Shop by Category photos</h3><div id="hpCatRows" class="img-rows"></div></div>
      <div class="card"><h3>Shop by Collection photos</h3><div id="hpColRows" class="img-rows"></div></div>
      <button class="btn btn-dark" id="hpSave">Save Homepage</button> <span class="muted small" id="hpMsg"></span>
      </div>`;
    draw();
    $("#hpAddSlide").addEventListener("click", () => { slides.push(blankSlide()); draw(); });
    $("#hpWrap").addEventListener("input", (ev) => {
      const f = ev.target.closest("[data-sfield]");
      if (!f) return;
      const block = f.closest(".slide-block");
      const sl = slides[Number(block.dataset.sidx)];
      if (sl) sl[f.dataset.sfield] = f.value;
    });
    $("#hpWrap").addEventListener("change", async (ev) => {
      const sgal = ev.target.closest("[data-sgalup]");
      if (sgal && sgal.files.length) {
        const sl = slides[Number(sgal.closest(".slide-block").dataset.sidx)];
        try {
          toast("Uploading…");
          const up = await uploadFiles(sgal.files);
          const room = Math.max(0, 6 - sl.images.length);
          sl.images.push(...up.map((x) => x.url).slice(0, room));
          draw();
          toast("Uploaded — remember to Save Homepage.");
        } catch (err) { toast(err.message, "error"); }
        sgal.value = "";
        return;
      }
      const row = ev.target.closest(".img-row");
      if (!row) return;
      const { kind, key } = row.dataset;
      if (ev.target.matches("[data-file]") && ev.target.files.length) {
        try {
          toast("Uploading…");
          const up = await uploadFiles(ev.target.files);
          set(kind, key, up[0].url);
          draw();
          toast("Uploaded — remember to Save Homepage.");
        } catch (err) { toast(err.message, "error"); }
        ev.target.value = "";
      } else if (ev.target.matches("[data-url]")) {
        const u = ev.target.value.trim();
        if (u && !/^\/(uploads|images)\/[^/]+\.(jpe?g|png|webp|gif|avif)$/i.test(u)) { toast("Use a store URL like /images/hero.webp", "error"); draw(); return; }
        set(kind, key, u);
        draw();
      }
    });
    $("#hpWrap").addEventListener("click", (ev) => {
      const add = ev.target.closest("[data-sgaladd]");
      if (add) {
        const block = add.closest(".slide-block");
        const sl = slides[Number(block.dataset.sidx)];
        const u = block.querySelector("[data-sgalurl]").value.trim();
        if (!/^\/(uploads|images)\/[^/]+\.(jpe?g|png|webp|gif|avif)$/i.test(u)) { toast("Use a store URL like /images/banner-1.webp", "error"); return; }
        if (sl.images.length >= 6) { toast("Maximum 6 photos per banner.", "error"); return; }
        if (sl.images.includes(u)) { toast("That photo is already in this banner.", "error"); return; }
        sl.images.push(u);
        draw();
        return;
      }
      const del = ev.target.closest("[data-sgaldel]");
      if (del) {
        slides[Number(del.closest(".slide-block").dataset.sidx)].images.splice(Number(del.dataset.sgaldel), 1);
        draw();
        return;
      }
      const mv = ev.target.closest("[data-smove]");
      if (mv) {
        const block = mv.closest(".slide-block");
        const i = Number(block.dataset.sidx);
        const j = i + Number(mv.dataset.smove);
        if (j < 0 || j >= slides.length) return;
        [slides[i], slides[j]] = [slides[j], slides[i]];
        draw();
        return;
      }
      if (ev.target.closest("[data-sdel]")) {
        if (slides.length <= 1) { toast("Keep at least one banner (leave it empty for built-in text).", "error"); return; }
        slides.splice(Number(ev.target.closest(".slide-block").dataset.sidx), 1);
        draw();
        return;
      }
      const btn = ev.target.closest("[data-clear]");
      if (!btn) return;
      const row = btn.closest(".img-row");
      set(row.dataset.kind, row.dataset.key, "");
      draw();
    });
    $("#hpSave").addEventListener("click", async () => {
      const IMG_OK = /^\/(uploads|images)\/[^/]+\.(jpe?g|png|webp|gif|avif)$/i;
      const clean = slides
        .map((b) => ({
          eyebrow: (b.eyebrow || "").trim(), title: (b.title || "").trim(), message: (b.message || "").trim(), badge: (b.badge || "").trim(),
          images: [...new Set((b.images || []).filter((u) => IMG_OK.test(u)))].slice(0, 6),
        }))
        .map((b) => ({ ...b, image: b.images[0] || "" }))
        .filter((b) => b.eyebrow || b.title || b.message || b.badge || b.images.length);
      try {
        await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ ...s, heroSlides: clean, hero: clean[0] || blankSlide(), categoryImages: catImgs, collectionImages: colImgs }) });
        $("#hpMsg").textContent = "Saved — banners live on the homepage.";
        toast("Homepage saved.");
      } catch (err) { toast(err.message, "error"); }
    });
  }

  /* ---------- orders ---------- */
  async function vOrders() {
    $("#view").innerHTML = "<p class='muted'>Loading…</p>";
    try {
      const orders = await api("/api/admin/orders");
      const statuses = ["all", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"];
      $("#view").innerHTML = `
        <div class="toolbar"><select id="osf" aria-label="Filter by status">${statuses.map((s) => `<option>${s}</option>`).join("")}</select><span class="muted small">${orders.length} orders</span></div>
        <div id="olist"></div>`;
      const draw = (f) => {
        const list = orders.filter((o) => f === "all" || o.status === f);
        $("#olist").innerHTML = list.map((o) => `
          <div class="card"><div style="display:flex;gap:.8rem;justify-content:space-between;flex-wrap:wrap;align-items:center">
            <div><strong>${esc(o.orderNo)}</strong><br /><span class="muted small">${new Date(o.createdAt).toLocaleString("en-IN")} · ${esc(o.address.name)} · ${esc(o.address.city)} ${esc(o.address.pin)}</span>
            <div class="order-items">${o.items.map((i) => `${esc(i.name)} × ${i.qty} (${esc(i.size)})`).join(" · ")}</div></div>
            <div style="text-align:right"><strong>${inr(o.amounts.total)}</strong> <span class="muted small">COD${o.coupon ? " · " + esc(o.coupon) : ""}</span><br />
            <select class="status" data-os="${esc(o.orderNo)}">${["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"].map((s) => `<option ${o.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
          </div></div>`).join("") || "<p class='muted'>No orders in this state.</p>";
        $$("#olist [data-os]").forEach((sel) => (sel.onchange = async () => {
          try { await api("/api/admin/orders/" + encodeURIComponent(sel.dataset.os), { method: "PATCH", body: JSON.stringify({ status: sel.value }) }); toast("Order updated — the customer sees it on Track Order."); vOrders(); }
          catch (e) { toast(e.message, "error"); }
        }));
      };
      draw("all");
      $("#osf").addEventListener("change", (e) => draw(e.target.value));
    } catch (e) { $("#view").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  /* ---------- coupons ---------- */
  async function vCoupons() {
    $("#view").innerHTML = "<p class='muted'>Loading…</p>";
    try {
      const list = await api("/api/admin/coupons");
      $("#view").innerHTML = `
        <div class="card"><h3>Create coupon</h3><form id="cForm" class="grid-2">
          <div class="field"><label>Code *</label><input class="input" name="code" placeholder="DIWALI20" required /></div>
          <div class="field"><label>Type</label><select class="input" name="type"><option value="pct">Percent %</option><option value="flat">Flat ₹</option></select></div>
          <div class="field"><label>Value *</label><input class="input" name="value" type="number" min="1" required /></div>
          <div class="field"><label>Min order (₹)</label><input class="input" name="minSubtotal" type="number" min="0" value="0" /></div>
          <div class="field"><label>Expires</label><input class="input" name="expires" type="date" value="2027-12-31" /></div>
          <div class="field"><label>Label</label><input class="input" name="label" placeholder="20% off festive sale" /></div>
          <div><br /><button class="btn btn-dark btn-sm" type="submit">Create</button></div>
        </form></div>
        <div class="card" style="padding:0;overflow:auto"><table class="tbl">
          <tr><th>Code</th><th>Offer</th><th>Min order</th><th>Expires</th><th>Active</th><th></th></tr>
          ${list.map((c) => `<tr><td><strong>${esc(c.code)}</strong></td><td>${c.type === "pct" ? c.value + "% off" : inr(c.value) + " off"}</td><td>${inr(c.minSubtotal)}</td><td>${esc(c.expires)}</td>
          <td><input type="checkbox" data-ct="${esc(c.code)}" ${c.active !== false ? "checked" : ""} aria-label="Active: ${esc(c.code)}" /></td>
          <td><button class="btn btn-light btn-sm" data-cd="${esc(c.code)}">Delete</button></td></tr>`).join("")}
        </table></div>`;
      $("#cForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api("/api/admin/coupons", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) }); toast("Coupon created."); vCoupons(); }
        catch (err) { toast(err.message, "error"); }
      });
      $$("#view [data-ct]").forEach((t) => (t.onchange = async () => {
        try { await api("/api/admin/coupons/" + t.dataset.ct, { method: "PUT", body: JSON.stringify({ active: t.checked }) }); toast("Coupon updated."); }
        catch (e) { toast(e.message, "error"); t.checked = !t.checked; }
      }));
      $$("#view [data-cd]").forEach((b) => (b.onclick = async () => {
        if (!confirm(`Delete coupon ${b.dataset.cd}?`)) return;
        try { await api("/api/admin/coupons/" + b.dataset.cd, { method: "DELETE" }); toast("Coupon deleted."); vCoupons(); }
        catch (e) { toast(e.message, "error"); }
      }));
    } catch (e) { $("#view").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  /* ---------- media ---------- */
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast("URL copied: " + t); }
    catch { prompt("Copy this URL:", t); }
  }
  async function vMedia() {
    $("#view").innerHTML = "<p class='muted'>Loading…</p>";
    try {
      const [files, siteFiles] = await Promise.all([api("/api/admin/uploads"), api("/api/admin/site-images")]);
      const total = files.reduce((s, f) => s + f.size, 0);
      $("#view").innerHTML = `
        <div class="card"><h3>Project images folder <span class="muted small">— drop files into the <code>images/</code> folder, then copy a URL below and paste it into any product's images</span></h3>
          <div class="img-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
            ${siteFiles.map((f) => `<div class="img-cell"><img src="${esc(f.url)}" alt="" loading="lazy" /><button data-copy="${esc(f.url)}" style="right:auto;left:4px" aria-label="Copy URL for ${esc(f.name)}">Copy URL</button></div>`).join("") || "<p class='muted'>The <code>images/</code> folder is empty — copy your JPG/PNG/WebP files there.</p>"}
          </div></div>
        <label class="drop" style="margin-bottom:1rem">Or upload straight from here — click or drop images (≤5MB each)<input type="file" id="mUp" accept="image/*" multiple /></label>
        <p class="muted small">${files.length} dashboard uploads · ${(total / 1048576).toFixed(1)} MB</p>
        <div class="img-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
          ${files.map((f) => `<div class="img-cell"><img src="${esc(f.url)}" alt="" loading="lazy" /><button data-mdel="${esc(f.name)}" aria-label="Delete ${esc(f.name)}">✕</button></div>`).join("") || "<p class='muted'>No uploads yet.</p>"}
        </div>`;
      $$("#view [data-copy]").forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
      $("#mUp").addEventListener("change", async (e) => {
        try { const up = await uploadFiles(e.target.files); toast(`${up.length} image(s) uploaded.`); vMedia(); }
        catch (err) { toast(err.message, "error"); }
      });
      $$("#view [data-mdel]").forEach((b) => (b.onclick = async () => {
        if (!confirm(`Delete ${b.dataset.mdel}? Products using it will fall back to illustrations.`)) return;
        try { await api("/api/admin/uploads/" + encodeURIComponent(b.dataset.mdel), { method: "DELETE" }); toast("Deleted."); vMedia(); }
        catch (e) { toast(e.message, "error"); }
      }));
    } catch (e) { $("#view").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  /* ---------- settings ---------- */
  async function vSettings() {
    $("#view").innerHTML = "<p class='muted'>Loading…</p>";
    try {
      const s = await api("/api/admin/settings");
      $("#view").innerHTML = `<div class="card"><h3>Store settings</h3><form id="sForm" class="grid-2">
        <div class="field"><label>Free shipping threshold (₹)</label><input class="input" name="freeShipThreshold" type="number" value="${s.freeShipThreshold}" /></div>
        <div class="field"><label>Flat shipping fee (₹)</label><input class="input" name="shipFlat" type="number" value="${s.shipFlat}" /></div>
        <div class="field"><label>Max COD order (₹)</label><input class="input" name="codMaxOrder" type="number" value="${s.codMaxOrder}" /></div>
        <div class="field"><label>Announcement bar</label><input class="input" name="announcement" value="${esc(s.announcement || "")}" /></div>
        <div><br /><button class="btn btn-dark btn-sm" type="submit">Save Settings</button></div>
      </form></div>`;
      $("#sForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) }); toast("Settings saved."); }
        catch (err) { toast(err.message, "error"); }
      });
    } catch (e) { $("#view").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  /* ---------- boot ---------- */
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#modalRoot").innerHTML = ""; });
  if (getToken()) showDash(); else showLogin();
})();
