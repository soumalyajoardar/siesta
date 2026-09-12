// Cart, Checkout (COD-only), Order success, Tracking, Wishlist.
import { STORE, BUSINESS } from "../config.js";
import { productById } from "../store.js";
import * as S from "../store.js";
import { esc, inr, productArt, setTitle, toast, confirmDialog, flyToCart, openReviewModal, imgVariant, addrIcon, addrLabel } from "../ui.js";
import { apiHealth, serverCreateOrder, serverFetchOrder, serverMyOrders, mirrorOrder, refreshMirror, serverCancelOrder,
  loadCatalog } from "../api.js";
import { cardHTML, bindCards } from "./shop.js";

// Set right before a coupon apply/remove re-render so the changed rows flash.
let flashCoupon = false;
const signed = (n) => (n < 0 ? `− ${inr(-n)}` : n > 0 ? `+ ${inr(n)}` : inr(0));
// Full MRP → sub-total breakdown shared by cart + checkout.
function breakdownHTML(t, flash = false) {
  const f = flash ? " flash" : "";
  return `
    <div class="summary-row"><span>MRP Total</span><span>${inr(t.mrpTotal)}</span></div>
    <div class="summary-row${f}"><span>Discount</span><span style="color:var(--success)">− ${inr(t.savings)}</span></div>
    <div class="summary-row"><span>Offer Price</span><span>${inr(t.subtotal)}</span></div>
    ${t.coupon && t.discount ? `<div class="summary-row${f}"><span>Coupon (${esc(t.coupon.code)})</span><span style="color:var(--success)">− ${inr(t.discount)}</span></div>` : ""}
    <div class="summary-row"><span>Delivery Charge</span><span>${t.shipping ? inr(t.shipping) : "Free"}</span></div>
    ${t.roundOff ? `<div class="summary-row"><span>Round Off</span><span>${signed(t.roundOff)}</span></div>` : ""}
    <div class="summary-row total${f}"><span>Sub Total</span><span>${inr(t.total)}</span></div>`;
}
// Compact breakdown for saved orders (tolerates pre-round-off records).
function orderAmountsHTML(a) {
  a = a || {};
  const subtotal = a.subtotal ?? 0, discount = a.discount ?? 0, shipping = a.shipping ?? 0;
  const roundOff = a.roundOff ?? 0, total = a.total ?? 0;
  const coupon = a.coupon || null;
  return `
    ${discount ? `<div class="summary-row"><span>Coupon${coupon ? ` (${esc(coupon)})` : ""}</span><span style="color:var(--success)">− ${inr(discount)}</span></div>` : ""}
    <div class="summary-row"><span>Delivery Charge</span><span>${shipping ? inr(shipping) : "Free"}</span></div>
    ${roundOff ? `<div class="summary-row"><span>Round Off</span><span>${signed(roundOff)}</span></div>` : ""}
    <div class="summary-row total"><span>Sub Total</span><span>${inr(total)}</span></div>`;
}

export function CartPage() {
  setTitle("Your Cart — Siesta", "Review items, apply coupons and proceed to checkout.");
  const t = S.totals();
  setTimeout(() => {
    const root = document.getElementById("app");
    root.querySelectorAll("[data-inc]").forEach((b) => (b.onclick = () => { S.updateQty(Number(b.dataset.inc), S.getCart()[Number(b.dataset.inc)].qty + 1); rerender(); }));
    root.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = () => { S.updateQty(Number(b.dataset.dec), S.getCart()[Number(b.dataset.dec)].qty - 1); rerender(); }));
    root.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
      if (await confirmDialog("Remove item", "Remove this item from your cart?", "Remove")) { S.removeLine(Number(b.dataset.rm)); rerender(); document.dispatchEvent(new CustomEvent("siesta:counts")); }
    }));
    const form = root.querySelector("#couponForm");
    if (form) form.onsubmit = (e) => {
      e.preventDefault();
      const code = root.querySelector("#couponInput").value;
      try {
        const c = S.applyCoupon(code);
        const after = S.totals();
        toast(`Coupon ${c.code} applied — you save ${inr(after.discount)}. New sub total ${inr(after.total)}.`);
        flashCoupon = true;
        rerender();
      } catch (err) { toast(err.message, "error"); }
    };
    const rmCoupon = root.querySelector("#rmCoupon");
    if (rmCoupon) rmCoupon.onclick = () => { S.removeCoupon(); toast("Coupon removed — sub total updated."); flashCoupon = true; rerender(); };
  });
  const rerender = () => { document.dispatchEvent(new CustomEvent("siesta:reroute")); document.dispatchEvent(new CustomEvent("siesta:counts")); };

  if (t.lines.length === 0) return `<div class="page page-narrow"><div class="empty"><h2>Your cart is empty</h2><p class="muted">Beautiful essentials are waiting. Start with our best sellers.</p><div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap"><a class="btn btn-dark" href="/shop">Continue Shopping</a><a class="btn btn-light" href="/shop?filter=new">Shop New Arrivals</a></div></div></div>`;
  const flash = flashCoupon;
  flashCoupon = false;

  return `<div class="page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Cart</span></nav>
    <h1 class="h-display" style="font-size:2rem"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:8px"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg> Your cart (${t.lines.reduce((s, l) => s + l.qty, 0)})</h1>
    <div class="split">
      <div class="card" aria-label="Cart items">
        ${t.lines.map((l) => `<div class="cart-line">
          <a class="cart-thumb" href="/product/${l.id}" aria-label="View ${esc(l.product.name)}">${productArt(l.product, 0, { w: 400 })}</a>
          <div><h3><a href="/product/${l.id}">${esc(l.product.name)}</a></h3>
            <p class="line-meta">Size ${esc(l.size)} · ${esc(l.color)} · SKU ${esc(l.product.sku)}</p>
            <p class="line-meta">${(l.product.stock ?? 0) <= 5 ? `<strong style="color:var(--warning)">Only ${l.product.stock} left</strong>` : "In stock"}</p>
            <div class="line-controls">
              <span class="mini-qty"><button data-dec="${l.idx}" aria-label="Decrease quantity">−</button><output aria-live="polite">${l.qty}</output><button data-inc="${l.idx}" aria-label="Increase quantity">+</button></span>
              <button class="link-btn" data-rm="${l.idx}">Remove</button>
            </div></div>
          <div class="line-price" style="text-align:right"><strong>${inr(l.product.price * l.qty)}</strong><br/><s class="muted" style="font-size:.82rem">${inr(l.product.mrp * l.qty)}</s></div>
        </div>`).join("")}
        <div style="margin-top:.8rem"><a class="link-btn" href="/shop">← Continue shopping</a></div>
      </div>
      <aside class="card" aria-label="Order summary">
        <h2 style="margin:0 0 .4rem">Order summary</h2>
        ${t.coupon ? `<div class="applied-coupon"><span>✓ ${esc(t.coupon.code)} — ${esc(t.coupon.code === "FLAT200" ? "₹200 off" : t.coupon.value + "% off")}</span><button class="link-btn" id="rmCoupon">Remove</button></div>`
        : `<form id="couponForm" class="coupon-row"><label class="visually-hidden" for="couponInput">Coupon code</label><input id="couponInput" class="input" placeholder="Coupon code" autocomplete="off"/><button class="btn btn-outline btn-sm" type="submit">Apply</button></form>`}
        ${breakdownHTML(t, flash)}
        ${t.shipping > 0 ? `<p class="muted" style="font-size:.82rem">Add ${inr(STORE.freeShipThreshold - (t.subtotal - t.discount))} more for free shipping.</p>` : ""}
        <a class="btn btn-dark btn-block" href="/checkout" style="margin-top:.8rem">Proceed to Checkout</a>
        <p class="muted" style="font-size:.82rem;text-align:center">Cash on Delivery available · Secure checkout</p>
      </aside>
    </div>
  </div>`;
}

// ---------------- CHECKOUT ----------------
let coState = { step: 1, addrId: "", address: null, saveAddr: true };
export function resetCheckout() { coState = { step: 1, addrId: "", address: null, saveAddr: true }; }

export function CheckoutPage() {
  const t = S.totals();
  if (coState.express) {
    t.shipping = 150;
    const preRound = t.subtotal - t.discount + t.shipping;
    const total = Math.floor(preRound / 5) * 5;
    t.roundOff = total - preRound;
    t.total = total;
  } else {
    t.shipping = t.subtotal - t.discount >= STORE.freeShipThreshold ? 0 : 80;
    const preRound = t.subtotal - t.discount + t.shipping;
    const total = Math.floor(preRound / 5) * 5;
    t.roundOff = total - preRound;
    t.total = total;
  }
  setTitle("Checkout — Siesta", "Delivery address, payment and order review.");
  if (t.lines.length === 0) return `<div class="page page-narrow"><div class="empty"><h2>Nothing to check out</h2><p class="muted">Your cart is empty.</p><a class="btn btn-dark" href="/shop">Browse Products</a></div></div>`;
  const addrs = S.getAddrs();
  setTimeout(() => wireCheckout(t));
  const steps = ["Address", "Delivery", "Payment", "Review"];
  return `<div class="page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/cart">Cart</a><span>/</span><span aria-current="page">Checkout</span></nav>
    <h1 class="h-display" style="font-size:2rem">Checkout</h1>
    <ol class="steps" aria-label="Checkout progress">${steps.map((s, i) => `<li ${coState.step === i + 1 ? 'aria-current="step"' : ""}><span class="n">${i + 1}</span>${s}</li>`).join("")}</ol>
    <div class="split">
      <div id="coMain"></div>
      <aside class="card" aria-label="Order summary" style="position:sticky;top:calc(var(--header-h) + 12px)">
        <h2 style="margin:0 0 .4rem">Summary</h2>
        ${t.lines.map((l) => `<div class="summary-row"><span>${esc(l.product.name)} × ${l.qty} <span class="muted">(${esc(l.size)})</span></span><span>${inr(l.product.price * l.qty)}</span></div>`).join("")}
        ${breakdownHTML(t)}
        <p class="muted" style="font-size:.82rem">Pay ${inr(t.total)} in cash/UPI on delivery.</p>
      </aside>
    </div>
  </div>`;
}

function wireCheckout(t) {
  const main = document.getElementById("coMain");
  if (!main) return;
  renderStep(main, t);

  function renderStep(main, t) {
    if (coState.step === 1) {
      const addrs = S.getAddrs();
      main.innerHTML = `<div class="card"><h2 style="margin-top:0">Delivery address</h2>
        ${addrs.length > 0 ? `<div class="addr-grid" style="margin-bottom:1.5rem">
          ${addrs.map((a) => `<label class="addr-card ${coState.addrId === a.id ? "selected" : ""}"><input type="radio" name="addr" value="${esc(a.id)}" ${coState.addrId === a.id || (a.isDefault && !coState.addrId) ? "checked" : ""}/><div class="addr-card-body"><strong>${esc(a.name)}</strong><br/>${esc(a.line1)}<br/>${esc(a.city)}, ${esc(a.state)} ${esc(a.pin)}</div></label>`).join("")}
        </div><div style="display:flex;gap:.6rem;margin-bottom:2rem"><button class="btn btn-outline" id="newAddrBtn">Add New Address</button><button class="btn btn-dark" id="useSaved">Deliver Here →</button></div>
        <hr style="border:none;border-top:1px solid var(--line);margin:1.5rem 0" />` : ""}
        <form id="addrForm" novalidate>
          <h3 style="margin-top:0">${addrs.length > 0 ? "Or enter a new address" : "Enter your address"}</h3>
          <div class="field-row">
            <div class="field"><label for="fName">Full Name <span class="req">*</span></label><input id="fName" class="input" name="name" autocomplete="name" autofocus/><span class="err" role="alert"></span></div>
            <div class="field"><label for="fPhone">Mobile <span class="req">*</span></label><div class="input-phone"><span>+91</span><input id="fPhone" name="phone" type="tel" autocomplete="tel" placeholder="10 digits"/></div><span class="err" role="alert"></span></div>
          </div>
          <div class="field"><label for="fLine">House no, Building, Street <span class="req">*</span></label><input id="fLine" class="input" name="line1" autocomplete="address-line1"/><span class="err" role="alert"></span></div>
          <div class="field"><label for="fLand">Landmark (Optional)</label><input id="fLand" class="input" name="land" autocomplete="address-line2"/></div>
          <div class="field-row">
            <div class="field full"><label>Address Type</label><div style="display:flex;gap:1rem;margin-top:.4rem"><label><input type="radio" name="label" value="home" checked/> Home</label><label><input type="radio" name="label" value="work"/> Work</label></div><span class="err" role="alert"></span></div>
            <div class="field"><label for="fCity">City <span class="req">*</span></label><input id="fCity" class="input" name="city" autocomplete="address-level2"/><span class="err" role="alert"></span></div>
            <div class="field"><label for="fState">State <span class="req">*</span></label><select id="fState" class="select" name="state" autocomplete="address-level1"><option value="">Select state</option>${["Andhra Pradesh", "Delhi", "Gujarat", "Haryana", "Himachal Pradesh", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal"].map((s) => `<option>${s}</option>`).join("")}</select><span class="err" role="alert"></span></div>
            <div class="field"><label for="fPin">PIN code <span class="req">*</span></label><input id="fPin" class="input" name="pin" inputmode="numeric" autocomplete="postal-code" placeholder="6 digits"/><span class="err" role="alert"></span></div>
            <div class="field full"><label class="check-row"><input type="checkbox" id="fSave" checked/> Save this address to my account</label></div>
          </div>
          <button type="submit" class="btn btn-dark" style="margin-top:.8rem">Continue to Delivery</button>
        </form></div>`;
      main.querySelector("#newAddrBtn") && (main.querySelector("#newAddrBtn").onclick = () => form.querySelector("#fName").focus());
      main.querySelector("#useSaved") && (main.querySelector("#useSaved").onclick = () => {
        const sel = main.querySelector('input[name="addr"]:checked');
        if (!sel) { toast("Please select a saved address.", "error"); return; }
        coState.address = S.getAddrs().find((a) => a.id === sel.value);
        coState.addrId = sel.value; coState.step = 2; refresh();
      });
      const form = main.querySelector("#addrForm");
      form.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const v = Object.fromEntries(fd.entries());
        let ok = true;
        const need = (id, valid, msg) => { const inp = form.querySelector("#" + id); inp.closest(".field").querySelector(".err").textContent = valid ? "" : msg; inp.setAttribute("aria-invalid", String(!valid)); if (!valid) ok = false; };
        need("fName", v.name.trim().length >= 3, "Enter the recipient's full name.");
        need("fPhone", /^[6-9]\d{9}$/.test(String(v.phone).replace(/\D/g, "").slice(-10)), "Enter a valid 10-digit Indian mobile number.");
        need("fLine", v.line1.trim().length >= 8, "Enter house number and street.");
        need("fCity", v.city.trim().length >= 2, "Enter the city.");
        need("fState", !!v.state, "Select the state.");
        need("fPin", /^\d{6}$/.test(String(v.pin).trim()), "Enter a 6-digit PIN code.");
        if (!ok) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
        const addr = { name: v.name.trim(), phone: String(v.phone).trim(), line1: v.line1.trim(), land: v.land.trim(), city: v.city.trim(), state: v.state, pin: String(v.pin).trim(), country: "India", label: v.label === "work" ? "work" : "home" };
        if (form.querySelector("#fSave").checked) { const saved = S.saveAddr(addr); coState.addrId = saved.id; }
        coState.address = addr; coState.step = 2; refresh();
      };
    } else if (coState.step === 2) {
      main.innerHTML = `<div class="card"><h2 style="margin-top:0">Delivery method</h2>
        <label class="pay-option ${!coState.express ? 'selected' : ''}"><input type="radio" name="delivery" value="standard" ${!coState.express ? 'checked' : ''}/><span><strong><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:4px"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg> Standard delivery (3–6 days)</strong><br/><span class="muted">${t.subtotal - t.discount >= STORE.freeShipThreshold ? "Free — your order qualifies for complimentary shipping" : "₹80"}</span></span></label>
        <label class="pay-option ${coState.express ? 'selected' : ''}"><input type="radio" name="delivery" value="express" ${coState.express ? 'checked' : ''}/><span><strong><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:4px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Express delivery (1–2 days)</strong><br/><span class="muted">₹150</span></span></label>
        <div style="display:flex;gap:.6rem;margin-top:.8rem"><button class="btn btn-ghost" id="back1">← Address</button><button class="btn btn-dark" id="toPay" style="flex:1">Continue to Payment</button></div></div>`;
      main.querySelectorAll('input[name="delivery"]').forEach((r) => r.onchange = () => {
        coState.express = (r.value === "express");
        refresh();
      });
      main.querySelector("#back1").onclick = () => { coState.step = 1; refresh(); };
      main.querySelector("#toPay").onclick = () => { coState.step = 3; refresh(); };
    } else if (coState.step === 3) {
      main.innerHTML = `<div class="card"><h2 style="margin-top:0">Payment method</h2>
        <p class="muted" style="font-size:.88rem">Only Cash on Delivery is available right now. Card, UPI, net-banking and wallets are coming soon — we never ask for card or banking details by form.</p>
        <label class="pay-option selected"><input type="radio" name="pay" value="cod" checked/><span style="display:flex;gap:.75rem;align-items:center"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg> <div><strong>Cash on Delivery</strong><br/><span class="muted">Pay ${inr(t.total)} in cash or UPI when your order arrives.</span></div></span></label>
        ${[[`<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`, "UPI (GPay / PhonePe / Paytm)", "Pay instantly via UPI apps"], [`<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`, "Credit / Debit Card", "Visa, Mastercard, RuPay"], [`<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11m16-11v11m-12-11v11m4-11v11m4-11v11"/></svg>`, "Net Banking", "All major Indian banks"], [`<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 00-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg>`, "Wallets", "Popular mobile wallets"]].map(([icon, h, s]) => `<label class="pay-option disabled"><input type="radio" disabled/><span style="display:flex;gap:.75rem;align-items:center">${icon} <div><strong>${h}</strong> <span class="coming">Coming soon</span><br/><span class="muted">${s}</span></div></span></label>`).join("")}
        <div style="display:flex;gap:.6rem;margin-top:.8rem"><button class="btn btn-ghost" id="back2">← Delivery</button><button class="btn btn-dark" id="toReview" style="flex:1">Review Order</button></div></div>`;
      main.querySelector("#back2").onclick = () => { coState.step = 2; refresh(); };
      main.querySelector("#toReview").onclick = () => { coState.step = 4; refresh(); };
    } else {
      main.innerHTML = `<div class="card"><h2 style="margin-top:0">Review & place order</h2>
        <p><strong>Deliver to:</strong> ${esc(coState.address.name)}, ${esc(coState.address.line1)}, ${esc(coState.address.city)} ${esc(coState.address.pin)} · ${esc(coState.address.phone)}</p>
        <p><strong>Delivery:</strong> ${coState.express ? "Express delivery (1–2 days)" : "Standard delivery (3–6 days)"}</p>
        <p><strong>Payment:</strong> Cash on Delivery — ${inr(t.total)} due on delivery.</p>
        <label class="check-row" style="margin:.6rem 0"><input type="checkbox" id="agree"/> I agree to the <a href="/terms">Terms</a> and <a href="/returns">Return Policy</a>. <span class="req" style="color:var(--clay)">*</span></label>
        <div style="display:flex;gap:.6rem"><button class="btn btn-ghost" id="back3">← Payment</button><button class="btn btn-clay" id="placeBtn" style="flex:1" disabled>Place Order · ${inr(t.total)}</button></div>
        <p class="muted" style="font-size:.82rem">No advance payment is taken. COD orders can be cancelled before shipping from My Orders.</p></div>`;
      main.querySelector("#back3").onclick = () => { coState.step = 3; refresh(); };
      main.querySelector("#agree").onchange = (e) => {
        main.querySelector("#placeBtn").disabled = !e.target.checked;
      };
      main.querySelector("#placeBtn").onclick = (e) => {
        if (!main.querySelector("#agree").checked) { toast("Please accept the Terms to place your order.", "error"); return; }
        runOrderProcessing(e.currentTarget, t, coState.express);
      };
    }
  }
  function refresh() { document.dispatchEvent(new CustomEvent("siesta:reroute", { detail: { keep: true } })); }

  function runOrderProcessing(btn, t, express) {
    btn.classList.add("is-loading"); btn.disabled = true;
    const overlay = document.createElement("div");
    overlay.className = "process-overlay";
    overlay.innerHTML = `<div class="process-card" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <h2 id="poTitle" style="margin:.2rem 0">Confirming your order…</h2>
      <p class="muted" style="font-size:.88rem">Please don't close this window.</p>
      <ul class="process-steps" id="poSteps">
        <li data-s="0"><span class="tick">·</span> Validating cart</li>
        <li data-s="1"><span class="tick">·</span> Checking inventory</li>
        <li data-s="2"><span class="tick">·</span> Preparing your order</li>
        <li data-s="3"><span class="tick">·</span> Confirming</li>
      </ul></div>`;
    document.body.appendChild(overlay);
    const steps = [...overlay.querySelectorAll("[data-s]")];
    const titles = ["Confirming your order…", "Checking inventory…", "Preparing your order…", "Order confirmed."];
    let i = 0;
    const D = matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 900;
    const tick = () => {
      steps.forEach((li, k) => {
        li.classList.toggle("done", k < i);
        li.classList.toggle("active", k === i);
        if (k < i) li.querySelector(".tick").textContent = "✓";
      });
      overlay.querySelector("#poTitle").textContent = titles[Math.min(i, 3)];
      if (i < 3) { i++; setTimeout(tick, D); }
      else {
        setTimeout(async () => {
          const fail = (msg) => { overlay.remove(); btn.classList.remove("is-loading"); btn.disabled = false; toast(msg, "error"); refresh(); };
          // 1) Server path: stock, coupons and totals are re-validated by the
          // backend from database prices — the client total is never trusted.
          try {
            if (await apiHealth()) {
              try {
                const serverOrder = await serverCreateOrder({
                  items: t.lines.map((l) => ({ id: l.id, size: l.size, color: l.color, qty: l.qty })),
                  address: coState.address,
                  coupon: t.coupon ? t.coupon.code : null,
                  express: express
                });
                await mirrorOrder(serverOrder);
                try { await loadCatalog(); } catch {}
                S.clearCart(); S.removeCoupon(); resetCheckout();
                document.dispatchEvent(new CustomEvent("siesta:counts"));
                overlay.remove();
                window.navigate("/success/" + serverOrder.orderNo);
                return;
              } catch (err) {
                if (err.validation) { fail(err.message); return; }
                // Network failure mid-flight → fall through to local order.
              }
            }
          } catch { /* health check failed → local fallback */ }
          // 2) Local fallback (static hosting / offline demo mode).
          for (const l of t.lines) {
            const live = productById(l.id);
            if (!live || live.stock <= 0) { overlay.remove(); toast(`${l.product.name} just went out of stock. It was removed.`, "error"); S.removeLine(l.idx); refresh(); return; }
          }
          const order = S.createOrder({
            items: t.lines.map((l) => ({ id: l.id, name: l.product.name, price: l.product.price, qty: l.qty, size: l.size, color: l.color })),
            address: coState.address,
            payment: "Cash on Delivery",
            amounts: { subtotal: t.subtotal, mrpTotal: t.mrpTotal, savings: t.savings, discount: t.discount, shipping: t.shipping, roundOff: t.roundOff, total: t.total },
          });
          S.clearCart(); S.removeCoupon(); resetCheckout();
          document.dispatchEvent(new CustomEvent("siesta:counts"));
          overlay.remove();
          window.navigate("/success/" + order.orderNo);
        }, 600);
      }
    };
    setTimeout(tick, 400);
  }
}

// ---------------- SUCCESS ----------------
export function SuccessPage(orderNo) {
  setTitle("Order Confirmed — Siesta", "Your COD order is confirmed.");
  setTimeout(async () => {
    await refreshMirror(orderNo); // pull admin status updates when online; no-op offline
    const o = S.getOrders().find((x) => x.orderNo === orderNo);
    const el = document.getElementById("successWrap");
    if (el) el.innerHTML = o ? successHTML(o) : `<div class="empty"><h2>Order not found</h2><a class="btn btn-dark" href="/orders">View My Orders</a></div>`;
  });
  return `<div class="page page-narrow"><div id="successWrap"><div class="card"><div class="skel" style="height:280px"></div></div></div></div>`;
}

function successHTML(o) {
  const di = S.deliveryInfo(o);
  return `<div class="card" style="text-align:center">
    <div class="success-check" aria-hidden="true"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="33"/><path d="M23 37.5 32 46l17-19"/></svg></div>
    <span class="eyebrow">Cash on Delivery</span>
    <h1 class="h-display" style="font-size:2.2rem">Order confirmed.</h1>
    <p class="muted">Thanks ${esc(o.address.name.split(" ")[0])} — please keep <strong style="color:var(--ink)">${inr(o.amounts.total)}</strong> ready on delivery.</p>
    ${di && di.detail ? `<p class="eta-line" style="justify-content:center"><strong>${esc(di.headline)}</strong><span class="muted"> · ${esc(di.detail)}</span></p>` : ""}
    <div class="summary-row"><span>Order number</span><strong>${esc(o.orderNo)}</strong></div>
    <div class="summary-row"><span>Order date</span><span>${new Date(o.createdAt).toLocaleString("en-IN")}</span></div>
    <div class="summary-row"><span>Payment</span><span>Cash on Delivery</span></div>
    <div class="summary-row"><span>Deliver to</span><span style="text-align:right">${esc(o.address.line1)}, ${esc(o.address.city)} ${esc(o.address.pin)}</span></div>
    ${orderAmountsHTML(o.amounts)}
    <div class="summary-row total"><span>Total due on delivery</span><span>${inr(o.amounts.total)}</span></div>
    <div style="display:flex;gap:.6rem;margin-top:1.2rem;flex-wrap:wrap;justify-content:center">
      <a class="btn btn-dark" href="/track/${esc(o.orderNo)}">Track Order</a>
      <a class="btn btn-light" href="/shop">Continue Shopping</a>
    </div></div></div>`;
}

// ---------------- TRACKING ----------------
export function TrackPage(orderNo) {
  setTitle("Track Order — Siesta", "Follow your Siesta order status.");
  const orders = S.getOrders();
  if (!orderNo) {
  setTimeout(() => {
    const form = document.getElementById("trackForm");
    form && (form.onsubmit = (e) => { e.preventDefault(); const v = document.getElementById("trackInput").value.trim(); if (v) window.navigate("/track/" + encodeURIComponent(v.toUpperCase())); });
    // Merge server-side history so other devices' orders appear here too.
    serverMyOrders().then(async (list) => {
      const box = document.getElementById("trackRecent");
      if (!box) return;
      
      let pruned = false;
      if (!list) {
        for (const o of S.getOrders().slice(0, 5)) {
          if (o._remote) {
            try { await import("../api.js").then(m => m.serverFetchOrder(o.orderNo)); }
            catch (e) { if (e && e.status === 404) { S.removeOrderLocal(o.orderNo); pruned = true; } }
          }
        }
      } else {
        for (const o of S.getOrders()) {
          if (o._remote && !list.some((x) => x.orderNo === o.orderNo)) { S.removeOrderLocal(o.orderNo); pruned = true; }
        }
        for (const o of list) await mirrorOrder(o);
      }
      
      const fresh = S.getOrders().slice(0, 5);
      if (pruned || (list && fresh.some((x) => !new Set(list.map(l => l.orderNo)).has(x.orderNo)))) {
        box.innerHTML = fresh.length ? `<h2>Recent orders</h2>${fresh.map((o) => `<div class="order-card"><div class="order-top"><strong>${esc(o.orderNo)}</strong><a class="link-btn" href="/track/${esc(o.orderNo)}">View →</a></div></div>`).join("")}` : `<p class="muted">No orders on this device yet.</p>`;
      }
    }).catch(() => {});
  });
    return `<div class="page page-narrow"><h1 class="h-display" style="font-size:2rem">Track your order</h1>
    <form id="trackForm" class="coupon-row"><label class="visually-hidden" for="trackInput">Order number</label><input id="trackInput" class="input" placeholder="e.g. 4839201717484658"/><button class="btn btn-dark" type="submit">Track</button></form>
    ${orders.length ? `<div id="trackRecent"><h2>Recent orders</h2>${orders.slice(0, 5).map((o) => `<div class="order-card"><div class="order-top"><strong>${esc(o.orderNo)}</strong><a class="link-btn" href="/track/${esc(o.orderNo)}">View →</a></div></div>`).join("")}</div>` : `<div id="trackRecent"><p class="muted">No orders on this device yet.</p></div>`}</div>`;
  }
  setTimeout(async () => {
    const el = document.getElementById("trackWrap");
    if (!el) return;
    const show404 = () => {
      el.innerHTML = `<div class="page-narrow"><div class="empty"><span class="eyebrow">Error 404</span><h2>We couldn't find this order</h2><p class="muted">No order exists with number ${esc(orderNo)}. It may have been removed — check the number and try again.</p><div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap"><a class="btn btn-dark" href="/track">Try Again</a><a class="btn btn-light" href="/shop">Continue Shopping</a></div></div></div>`;
    };
    let raw = S.getOrders().find((x) => x.orderNo.toLowerCase() === orderNo.toLowerCase());
    try {
      if (await apiHealth()) {
        try {
          raw = await mirrorOrder(await serverFetchOrder(orderNo));
        } catch (e) {
          if (e && e.status === 404 && raw && raw._remote) {
            // Was mirrored here but is gone on the server (deleted in admin) — prune and 404.
            S.removeOrderLocal(raw.orderNo);
            raw = null;
          }
          // Purely-local (never synced) orders and blips still render below.
        }
      } else {
        await refreshMirror(orderNo);
        raw = S.getOrders().find((x) => x.orderNo.toLowerCase() === orderNo.toLowerCase()) || raw;
      }
    } catch { /* fall through to local copy */ }
    if (!raw) { show404(); return; }
    const o = S.orderWithProgress(raw);
    el.innerHTML = trackHTML(o);
    el.querySelectorAll("[data-review]").forEach((b) => (b.onclick = () => openReviewModal(o.orderNo, o.items[Number(b.dataset.review)])));
    el.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast("Order number copied."); }
      catch { toast("Order number: " + b.dataset.copy); }
    }));
  });
  return `<div class="page"><div id="trackWrap"><div class="card"><div class="skel" style="height:320px"></div></div></div></div>`;
}

// Genuine per-stage notes. Legacy placeholder notes from older orders are
// translated at render time so history reads honestly without rewriting it.
const STAGE_NOTES_FALLBACK = {
  confirmed: "Order confirmed. Your selection has been securely reserved and our team is preparing your package.",
  processing: "In progress. Your items are currently undergoing careful quality inspection and picking at our facility.",
  packed: "Securely packed. Your order is meticulously sealed, labelled, and awaiting scheduled courier pickup.",
  shipped: "In transit. Your package has been handed over to our trusted delivery partner and is on its way to you.",
  out_for_delivery: "Out for delivery. Your order will arrive today. For Cash on Delivery, please keep the exact amount ready.",
  delivered: "Successfully delivered. We hope you enjoy your new pieces. We'd love to hear your thoughts — tap below to leave a review.",
  cancelled: "Order cancelled. No charges were processed for this transaction.",
};
const LEGACY_NOTES = new Set(["Updated by store admin", "Cancelled by customer", "Updated by Siesta order system (illustrative)"]);
const noteFor = (stage, note) => (note && !LEGACY_NOTES.has(note) ? note : STAGE_NOTES_FALLBACK[stage] || note || "");

function trackHTML(o) {
  const stages = ["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
  const labels = { confirmed: "Order Confirmed", processing: "Processing", packed: "Packed", shipped: "Shipped", out_for_delivery: "Out for Delivery", delivered: "Delivered" };
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/orders">Orders</a><span>/</span><span aria-current="page">${esc(o.orderNo)}</span></nav>`;
  const itemCount = o.items.reduce((s, i) => s + i.qty, 0);
  const thumbFor = (i) => {
    const p = productById(i.id);
    const src = p && p.images && p.images[0];
    const inner = src
      ? `<img class="t-item-thumb" src="${esc(imgVariant(src, 200, 60))}" alt="" loading="lazy" onload="this.classList.add('on')" onerror="this.remove()" />`
      : p
        ? `<span class="t-item-thumb t-item-art" aria-hidden="true">${productArt(p)}</span>`
        : `<span class="t-item-thumb t-item-ph" aria-hidden="true">S</span>`;
    return p ? `<a href="/product/${i.id}" aria-label="View ${esc(i.name)}" style="flex:none;line-height:0">${inner}</a>` : inner;
  };
  const aside = `<aside class="card track-aside"><h2 style="margin-top:0">Delivery details</h2>
    <p class="t-addr"><span aria-hidden="true">${addrIcon(o.address.label, 16)}</span><span>${esc(o.address.name)} <span class="muted" style="font-size:.8rem">${addrLabel(o.address.label)}</span><br/>${esc(o.address.line1)}<br/>${esc(o.address.city)}, ${esc(o.address.state)} ${esc(o.address.pin)}<br/>${esc(o.address.phone)}</span></p>
    <h3>Items (${itemCount})</h3>${o.items.map((i) => { const live = productById(i.id); const nm = live ? `<a href="/product/${i.id}">${esc(i.name)}</a>` : esc(i.name); return `<div class="t-item">${thumbFor(i)}<span class="t-item-name">${nm} × ${i.qty} <span class="muted">(${esc(i.size)})</span></span><span class="t-item-price">${inr(i.price * i.qty)}</span></div>`; }).join("")}${orderAmountsHTML(o.amounts)}<div class="summary-row total"><span>Total (COD)</span><span>${inr(o.amounts.total)}</span></div></aside>`;

  if (o.status === "cancelled") {
    const conf = o.timeline.find((t) => t.stage === "confirmed");
    const canc = [...o.timeline].reverse().find((t) => t.stage === "cancelled");
    return `${crumbs}<div class="split"><div class="card track-card">
      <h1 class="h-display" style="font-size:1.8rem">Order cancelled.</h1>
      <p class="muted">Order ${esc(o.orderNo)} · ${inr(o.amounts.total)} was never charged (Cash on Delivery).</p>
      <ol class="timeline mini">
        <li class="done"><span class="dot" aria-hidden="true"></span><strong>Order Confirmed</strong>${conf ? `<time>${new Date(conf.at).toLocaleString("en-IN")}</time><div class="t-sub">${esc(noteFor("confirmed", conf.note))}</div>` : ""}</li>
        <li class="done current cancelled"><span class="dot" aria-hidden="true"></span><strong>Cancelled</strong>${canc ? `<time>${new Date(canc.at).toLocaleString("en-IN")}</time><div class="t-sub">${esc(noteFor("cancelled", canc.note))}</div>` : ""}</li>
      </ol>
      <a class="btn btn-dark btn-sm" href="/shop">Shop Again</a></div>${aside}</div>`;
  }

  const pct = Math.round(((o.stageIndex ?? 0) / (stages.length - 1)) * 100);
  const stepNo = Math.min((o.stageIndex ?? 0) + 1, stages.length);
  const etaDays = Math.max(0, Math.ceil((new Date(o.createdAt).getTime() + 5 * 86400000 - Date.now()) / 86400000));
  const isExpress = Boolean(o.express) && o.status !== "delivered";
  const etaText = o.status === "delivered"
    ? "Delivered — enjoy!"
    : isExpress
      ? `Arriving ${o.express.option === "tomorrow" ? "Tomorrow" : "Today"}`
      : etaDays <= 0 ? "Arriving today" : `Arriving in ${etaDays} day${etaDays === 1 ? "" : "s"}`;
  return `${crumbs}
  <div class="split"><div class="card track-card">
      <div class="track-hero">
        <div>
          <h1 class="h-display" style="font-size:1.8rem;margin:.2rem 0 .3rem">${esc(etaText)}</h1>
          <p class="muted track-meta">Step ${stepNo} of ${stages.length} · ${itemCount} item${itemCount === 1 ? "" : "s"} · ${inr(o.amounts.total)} (COD)</p>
          ${isExpress && o.amounts.shipping !== 150 ? `<div class="express-note"><h3><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z"/></svg> Express delivery</h3><p>Your order has been manually upgraded to express delivery.</p></div>` : ""}
        </div>
        <button class="order-chip" data-copy="${esc(o.orderNo)}" aria-label="Copy order number ${esc(o.orderNo)}"><span class="muted">Order</span><strong>${esc(o.orderNo)}</strong><span class="copy-ic" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg></span></button>
      </div>
      <div class="tl-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Delivery progress"><span style="width:${pct}%"></span></div>
    <ol class="timeline" style="--fill:${pct}%">${stages.map((s) => { const hit = o.timeline.find((t) => t.stage === s); const done = !!hit; const cur = o.status === s; return `<li class="${done ? "done" : ""} ${cur ? "current" : ""}"><span class="dot" aria-hidden="true"></span><strong>${labels[s]}</strong>${hit ? `<time>${new Date(hit.at).toLocaleString("en-IN")}</time><div class="t-sub">${esc(noteFor(s, hit.note))}</div>` : `<div class="t-sub">Pending</div>`}</li>`; }).join("")}</ol>
    ${(() => {
      if (o.status !== "delivered") return "";
      const unreviewed = o.items.map((it, k) => ({it, k})).filter(x => !localStorage.getItem(`reviewed_${o.orderNo}_${x.it.id}`));
      if (!unreviewed.length) return "";
      return `<div class="review-cta"><h3>Enjoying your order?</h3><p class="muted">Your review is published publicly with a Verified Purchase badge.</p><div style="display:flex;gap:.5rem;flex-wrap:wrap">${unreviewed.map(x => `<button class="btn btn-light btn-sm" data-review="${x.k}">Review Product</button>`).join("")}</div></div>`;
    })()}
    <p class="muted" style="font-size:.82rem">${o._remote ? "Live status from the Siesta store — updated at every step from packing to delivery." : "Status reflects Siesta's order system on this device. Live courier scans will appear here once a delivery partner is connected."}</p></div>
  ${aside}</div>`;
}

export function renderCartDrawer() {
  const t = S.totals();
  const c = document.getElementById("cartDrawerContent");
  const f = document.getElementById("cartDrawerFoot");
  if (!c || !f) return;
  if (t.lines.length === 0) {
    c.innerHTML = `<div class="empty" style="text-align:center;margin:auto"><h3>Your cart is empty</h3><button class="btn btn-dark" onclick="closeCartDrawer(); window.navigate('/shop')">Shop Now</button></div>`;
    f.innerHTML = "";
    return;
  }
  const prog = Math.min(100, Math.round(((t.subtotal - t.discount) / STORE.freeShipThreshold) * 100));
  c.innerHTML = `
    ${t.shipping > 0 ? `<p style="font-size:0.85rem;margin:0 0 1rem;text-align:center">You are ${inr(STORE.freeShipThreshold - (t.subtotal - t.discount))} away from unlocking free delivery</p>` : `<p style="font-size:0.85rem;margin:0 0 1rem;text-align:center;color:var(--success)">You've unlocked free delivery!</p>`}
    <div style="background:var(--line);border-radius:99px;height:4px;margin-bottom:1.5rem;overflow:hidden"><div style="background:var(--forest);height:100%;width:${prog}%;transition:width 0.3s"></div></div>
    <div style="display:flex;flex-direction:column;gap:1rem">
    ${t.lines.map((l) => `
      <div style="display:flex;gap:1rem;padding-bottom:1rem;border-bottom:1px solid var(--line-2)">
        <a href="/product/${l.id}" style="width:70px;flex-shrink:0" onclick="closeCartDrawer()">${productArt(l.product, 0, { w: 140 })}</a>
        <div style="flex:1">
          <h4 style="margin:0;font-size:0.95rem"><a href="/product/${l.id}" onclick="closeCartDrawer()">${esc(l.product.name)}</a></h4>
          <p class="muted" style="margin:0.2rem 0;font-size:0.85rem">${esc(l.size)} · ${esc(l.color)}</p>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.4rem">
            <span class="mini-qty"><button onclick="SiestaCartUpdate(${l.idx}, ${l.qty-1})">−</button><output>${l.qty}</output><button onclick="SiestaCartUpdate(${l.idx}, ${l.qty+1})">+</button></span>
            <div style="text-align:right"><strong>${inr(l.product.price * l.qty)}</strong></div>
          </div>
        </div>
      </div>
    `).join("")}
    </div>
  `;
  f.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:1rem"><strong>Subtotal</strong><strong>${inr(t.total)}</strong></div>
    <a class="btn btn-dark btn-block" href="/checkout" onclick="closeCartDrawer()">Checkout</a>
    <a class="btn btn-outline btn-block" href="/cart" onclick="closeCartDrawer()" style="margin-top:0.5rem">View full cart</a>
  `;
}
window.SiestaCartUpdate = (idx, newQty) => {
  if (newQty <= 0) {
    S.removeLine(idx);
  } else {
    S.updateQty(idx, newQty);
  }
  document.dispatchEvent(new CustomEvent("siesta:counts"));
  renderCartDrawer();
  if (location.pathname === "/cart" || location.pathname === "/checkout") document.dispatchEvent(new CustomEvent("siesta:reroute"));
};

export function openCartDrawer() {
  renderCartDrawer();
  const d = document.getElementById("cartDrawer");
  const s = document.getElementById("scrim");
  if (d && s) {
    d.classList.add("open");
    d.setAttribute("aria-hidden", "false");
    s.hidden = false;
  }
}
window.openCartDrawer = openCartDrawer;
window.closeCartDrawer = () => {
  const d = document.getElementById("cartDrawer");
  const s = document.getElementById("scrim");
  if (d && s) {
    d.classList.remove("open");
    d.setAttribute("aria-hidden", "true");
    if (!document.getElementById("mobileNav")?.classList.contains("open") && !document.getElementById("filters")?.classList.contains("open")) {
      s.hidden = true;
    }
  }
};

// ---------------- WISHLIST ----------------
export function WishlistPage() {
  setTitle("Wishlist — Siesta", "Your saved Siesta styles.");
  const ids = S.getWish();
  const items = ids.map(productById).filter(Boolean);
  setTimeout(() => {
    const root = document.getElementById("app");
    bindCards(root);
    root.querySelector("#clearW") && (root.querySelector("#clearW").onclick = async () => {
      if (await confirmDialog("Clear wishlist", "Remove all saved items?", "Clear")) { S.clearWish(); toast("Wishlist cleared."); document.dispatchEvent(new CustomEvent("siesta:reroute")); document.dispatchEvent(new CustomEvent("siesta:counts")); }
    });
    root.querySelectorAll("[data-move]").forEach((b) => (b.onclick = () => {
      const p = productById(b.dataset.move);
      try { S.addToCart(p.id, p.sizes[Math.floor(p.sizes.length / 2)], p.colors[0].name, 1); S.toggleWish(p.id); flyToCart(b); document.dispatchEvent(new CustomEvent("siesta:reroute")); document.dispatchEvent(new CustomEvent("siesta:counts")); }
      catch (e) { toast(e.message, "error"); }
    }));
    root.querySelectorAll("[data-unwish]").forEach((b) => (b.onclick = () => { S.toggleWish(b.dataset.unwish); document.dispatchEvent(new CustomEvent("siesta:reroute")); document.dispatchEvent(new CustomEvent("siesta:counts")); }));
  });
  if (!items.length) return `<div class="page page-narrow"><div class="empty"><h2>Your wishlist is empty</h2><p class="muted">Tap the heart on any product to save it here.</p><a class="btn btn-dark" href="/shop">Discover Products</a></div></div>`;
  return `<div class="page"><div class="section-head"><div><span class="eyebrow">${items.length} saved</span><h2 style="font-size:2rem">Wishlist</h2></div><button class="link-btn" id="clearW">Clear all</button></div>
  <div class="product-grid">${items.map(cardHTML).join("")}</div>
  <div class="card" style="margin-top:1.2rem"><h3 style="margin-top:0">Unavailable right now</h3>${items.filter((p) => !S.productById(p.id) || p.stock <= 0).map((p) => `<div class="summary-row"><span>${esc(p.name)}</span><button class="link-btn" data-unwish="${p.id}">Remove</button></div>`).join("") || '<p class="muted">Everything you saved is currently available.</p>'}
  <div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap">${items.filter((p) => p.stock > 0).map((p) => `<button class="btn btn-light btn-sm" data-move="${p.id}">Move ${esc(p.name.slice(0, 22))}… to cart</button>`).join("")}</div></div></div>`;
}

export function InvoicePage(orderNo) {
  setTitle(`Invoice ${esc(orderNo)} — Siesta`, "Tax Invoice");
  setTimeout(async () => {
    try {
      let o = S.getOrders().find((x) => x.orderNo === orderNo);
      if (!o) o = await serverFetchOrder(orderNo);
      if (!o) { document.getElementById("invRoot").innerHTML = `<div class="empty"><h2>Not found</h2><p>Order not found.</p></div>`; return; }
      if (o.status !== "delivered") { document.getElementById("invRoot").innerHTML = `<div class="empty"><h2>Unavailable</h2><p>Invoices are only generated for delivered orders.</p></div>`; return; }
      const couponCode = typeof o.coupon === "string" ? o.coupon : "";
      const a = o.amounts || {};
      const addr = o.address || {};
      const invNo = `INV-${o.orderNo}`;
      const invHTML = `<style>
        @media print {
          body > * { display: none !important; }
          #app, #invRoot { display: block !important; }
          #invRoot { position: absolute; left: 0; top: 0; width: 100%; }
          #invRoot .btn { display: none !important; }
          #invRoot > div { margin: 0 !important; padding: 0 !important; border: none !important; max-width: 100% !important; }
        }
      </style>
      <div style="max-width:800px;margin:2rem auto;padding:2rem;background:#fff;color:#111;border:1px solid #ccc;font-family:sans-serif">
        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:1rem;margin-bottom:2rem">
          <div><h1 style="margin:0;font-size:2rem;letter-spacing:1px">SIESTA.</h1><p style="margin:.2rem 0;color:#555;font-size:.85rem">${esc(BUSINESS.businessAddress)}<br/>${esc(BUSINESS.supportEmail)}<br/>${esc(BUSINESS.supportPhone)}</p></div>
          <div style="text-align:right"><h2 style="margin:0;font-size:1.5rem;color:#555">TAX INVOICE</h2><p style="margin:.2rem 0;font-size:.85rem"><strong>Invoice No:</strong> ${esc(invNo)}<br/><strong>Order:</strong> ${esc(o.orderNo)}<br/><strong>Date:</strong> ${new Date(o.createdAt).toLocaleDateString("en-IN")}</p></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:2rem">
          <div><p style="margin:0;font-size:.85rem;color:#555;text-transform:uppercase;font-weight:700">Bill To:</p><p style="margin:.2rem 0;font-size:.95rem"><strong>${esc(addr.name || "")}</strong><br/>${esc(addr.line1 || "")}<br/>${esc(addr.city || "")}${addr.state ? `, ${esc(addr.state)}` : ""} ${esc(addr.pin || "")}<br/>${esc(addr.phone || "")}</p></div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:2rem">
          <thead><tr style="border-bottom:1px solid #ccc;text-align:left"><th style="padding:.5rem;font-size:.85rem">Item</th><th style="padding:.5rem;font-size:.85rem">Size</th><th style="padding:.5rem;font-size:.85rem;text-align:right">Qty</th><th style="padding:.5rem;font-size:.85rem;text-align:right">Price</th><th style="padding:.5rem;font-size:.85rem;text-align:right">Total</th></tr></thead>
          <tbody>
            ${o.items.map(i => `<tr style="border-bottom:1px solid #eee"><td style="padding:.5rem;font-size:.9rem">${esc(i.name)}</td><td style="padding:.5rem;font-size:.9rem">${esc(i.size)}</td><td style="padding:.5rem;font-size:.9rem;text-align:right">${i.qty}</td><td style="padding:.5rem;font-size:.9rem;text-align:right">${inr(i.price)}</td><td style="padding:.5rem;font-size:.9rem;text-align:right">${inr(i.price * i.qty)}</td></tr>`).join("")}
          </tbody>
        </table>
        <div style="display:flex;justify-content:flex-end">
          <table style="width:300px;border-collapse:collapse">
            <tr><td style="padding:.3rem;text-align:right;color:#555">Subtotal</td><td style="padding:.3rem;text-align:right">${inr(a.subtotal || 0)}</td></tr>
            ${(a.discount || 0) > 0 ? `<tr><td style="padding:.3rem;text-align:right;color:#555">Discount${couponCode ? ` (${esc(couponCode)})` : ""}</td><td style="padding:.3rem;text-align:right;color:var(--danger)">-${inr(a.discount)}</td></tr>` : ""}
            <tr><td style="padding:.3rem;text-align:right;color:#555">Shipping</td><td style="padding:.3rem;text-align:right">${!a.shipping ? "Free" : inr(a.shipping)}</td></tr>
            ${(a.roundOff || 0) !== 0 ? `<tr><td style="padding:.3rem;text-align:right;color:#555">Round-off</td><td style="padding:.3rem;text-align:right">${inr(a.roundOff)}</td></tr>` : ""}
            <tr style="font-weight:700;font-size:1.1rem;border-top:1px solid #111"><td style="padding:.5rem;text-align:right">Total</td><td style="padding:.5rem;text-align:right">${inr(a.total || 0)}</td></tr>
          </table>
        </div>
        ${(a.savings || 0) > 0 ? `<p style="text-align:right;color:#2e7d32;font-size:.9rem;margin-top:.6rem">You saved ${inr(a.savings)} on this order.</p>` : ""}
        <div style="margin-top:3rem;text-align:center"><button class="btn btn-dark" onclick="window.print()" style="margin-right:1rem">Print Invoice</button><a class="btn btn-outline" href="/account/orders">Back to Orders</a></div>
      </div>`;
      document.getElementById("invRoot").innerHTML = invHTML;
    } catch { document.getElementById("invRoot").innerHTML = `<div class="empty"><p class="err">Could not load invoice.</p></div>`; }
  });
  return `<div class="page" id="invRoot"><div class="empty"><p class="muted">Loading invoice…</p></div></div>`;
}
