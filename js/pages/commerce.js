// Cart, Checkout (COD-only), Order success, Tracking, Wishlist.
import { STORE } from "../config.js";
import { productById } from "../store.js";
import * as S from "../store.js";
import { esc, inr, productArt, setTitle, toast, confirmDialog, flyToCart, openModal, imgVariant } from "../ui.js";
import { apiHealth, serverCreateOrder, mirrorOrder, refreshMirror, serverCancelOrder, loadCatalog } from "../api.js";
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
      if (await confirmDialog("Remove item", "Remove this item from your cart?", "Remove")) { S.removeLine(Number(b.dataset.rm)); toast("Removed from cart."); rerender(); document.dispatchEvent(new CustomEvent("siesta:counts")); }
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

  if (t.lines.length === 0) return `<div class="page page-narrow"><div class="empty"><h2>Your cart is empty</h2><p class="muted">Beautiful essentials are waiting. Start with our best sellers.</p><div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap"><a class="btn btn-dark" href="#/shop">Continue Shopping</a><a class="btn btn-light" href="#/shop?filter=new">Shop New Arrivals</a></div></div></div>`;
  const flash = flashCoupon;
  flashCoupon = false;

  return `<div class="page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span>/</span><span aria-current="page">Cart</span></nav>
    <h1 class="h-display" style="font-size:2rem">Your cart (${t.lines.reduce((s, l) => s + l.qty, 0)})</h1>
    <div class="split">
      <div class="card" aria-label="Cart items">
        ${t.lines.map((l) => `<div class="cart-line">
          <a class="cart-thumb" href="#/product/${l.id}" aria-label="View ${esc(l.product.name)}">${productArt(l.product, 0, { w: 400 })}</a>
          <div><h3><a href="#/product/${l.id}">${esc(l.product.name)}</a></h3>
            <p class="line-meta">Size ${esc(l.size)} · ${esc(l.color)} · SKU ${esc(l.product.sku)}</p>
            <p class="line-meta">${(l.product.stock ?? 0) <= 5 ? `<strong style="color:var(--warning)">Only ${l.product.stock} left</strong>` : "In stock"}</p>
            <div class="line-controls">
              <span class="mini-qty"><button data-dec="${l.idx}" aria-label="Decrease quantity">−</button><output aria-live="polite">${l.qty}</output><button data-inc="${l.idx}" aria-label="Increase quantity">+</button></span>
              <button class="link-btn" data-rm="${l.idx}">Remove</button>
            </div></div>
          <div class="line-price" style="text-align:right"><strong>${inr(l.product.price * l.qty)}</strong><br/><s class="muted" style="font-size:.82rem">${inr(l.product.mrp * l.qty)}</s></div>
        </div>`).join("")}
        <div style="margin-top:.8rem"><a class="link-btn" href="#/shop">← Continue shopping</a></div>
      </div>
      <aside class="card" aria-label="Order summary">
        <h2 style="margin:0 0 .4rem">Order summary</h2>
        ${t.coupon ? `<div class="applied-coupon"><span>✓ ${esc(t.coupon.code)} — ${esc(t.coupon.code === "FLAT200" ? "₹200 off" : t.coupon.value + "% off")}</span><button class="link-btn" id="rmCoupon">Remove</button></div>`
        : `<form id="couponForm" class="coupon-row"><label class="visually-hidden" for="couponInput">Coupon code</label><input id="couponInput" class="input" placeholder="Coupon code" autocomplete="off"/><button class="btn btn-outline btn-sm" type="submit">Apply</button></form>`}
        ${breakdownHTML(t, flash)}
        ${t.shipping > 0 ? `<p class="muted" style="font-size:.82rem">Add ${inr(STORE.freeShipThreshold - (t.subtotal - t.discount))} more for free shipping.</p>` : ""}
        <a class="btn btn-dark btn-block" href="#/checkout" style="margin-top:.8rem">Proceed to Checkout</a>
        <p class="muted" style="font-size:.82rem;text-align:center">Cash on Delivery available · Secure checkout</p>
      </aside>
    </div>
  </div>`;
}

// ---------------- CHECKOUT ----------------
let coState = { step: 1, addrId: "", address: null, saveAddr: true };
export function resetCheckout() { coState = { step: 1, addrId: "", address: null, saveAddr: true }; }

export function CheckoutPage() {
  // NOTE: logged-out visitors never reach here — the router sends them home.
  const t = S.totals();
  setTitle("Checkout — Siesta", "Delivery address, payment and order review.");
  if (t.lines.length === 0) return `<div class="page page-narrow"><div class="empty"><h2>Nothing to check out</h2><p class="muted">Your cart is empty.</p><a class="btn btn-dark" href="#/shop">Browse Products</a></div></div>`;
  const addrs = S.getAddrs();
  setTimeout(() => wireCheckout(t));
  const steps = ["Address", "Delivery", "Payment", "Review"];
  return `<div class="page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span>/</span><a href="#/cart">Cart</a><span>/</span><span aria-current="page">Checkout</span></nav>
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
        ${addrs.length ? `<div class="addr-grid" role="radiogroup" aria-label="Saved addresses">${addrs.map((a) => `<label class="addr-card ${a.isDefault ? "default" : ""}"><input type="radio" name="addr" value="${a.id}" ${coState.addrId === a.id || (!coState.addrId && a.isDefault) ? "checked" : ""}/> <strong>${esc(a.name)}</strong> ${a.isDefault ? '<span class="pill">Default</span>' : ""}<br/><span class="muted">${esc(a.line1)}, ${esc(a.city)} ${esc(a.pin)}</span><br/><span class="muted">${esc(a.phone)}</span></label>`).join("")}</div>
        <div style="display:flex;gap:.6rem;margin:.8rem 0"><button class="btn btn-dark btn-sm" id="useSaved">Deliver to This Address</button><button class="btn btn-ghost btn-sm" id="newAddrBtn">Add new address</button></div><div class="muted" style="font-size:.85rem">— or enter a new address below —</div>` : ""}
        <form id="addrForm" class="form-grid" style="margin-top:.8rem" novalidate>
          <div class="field"><label for="fName">Full name <span class="req">*</span></label><input id="fName" class="input" name="name" autocomplete="name"/><span class="err" role="alert"></span></div>
          <div class="field"><label for="fPhone">Phone <span class="req">*</span></label><input id="fPhone" class="input" name="phone" inputmode="numeric" autocomplete="tel" placeholder="10-digit mobile"/><span class="err" role="alert"></span></div>
          <div class="field full"><label for="fLine">Address (house no, street) <span class="req">*</span></label><input id="fLine" class="input" name="line1" autocomplete="street-address"/><span class="err" role="alert"></span></div>
          <div class="field"><label for="fLand">Apartment / landmark</label><input id="fLand" class="input" name="land" autocomplete="address-line2"/><span class="err" role="alert"></span></div>
          <div class="field"><label for="fCity">City <span class="req">*</span></label><input id="fCity" class="input" name="city" autocomplete="address-level2"/><span class="err" role="alert"></span></div>
          <div class="field"><label for="fState">State <span class="req">*</span></label><select id="fState" class="select" name="state" autocomplete="address-level1"><option value="">Select state</option>${["Andhra Pradesh", "Delhi", "Gujarat", "Haryana", "Himachal Pradesh", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal"].map((s) => `<option>${s}</option>`).join("")}</select><span class="err" role="alert"></span></div>
          <div class="field"><label for="fPin">PIN code <span class="req">*</span></label><input id="fPin" class="input" name="pin" inputmode="numeric" autocomplete="postal-code" placeholder="6 digits"/><span class="err" role="alert"></span></div>
          <div class="field full"><label class="check-row"><input type="checkbox" id="fSave" checked/> Save this address to my account</label></div>
          <div class="full"><button class="btn btn-dark btn-block" type="submit">Continue to Delivery</button></div>
        </form></div>`;
      const form = main.querySelector("#addrForm");
      main.querySelector("#newAddrBtn") && (main.querySelector("#newAddrBtn").onclick = () => form.querySelector("#fName").focus());
      main.querySelector("#useSaved") && (main.querySelector("#useSaved").onclick = () => {
        const sel = main.querySelector('input[name="addr"]:checked');
        if (!sel) { toast("Please select a saved address.", "error"); return; }
        coState.address = S.getAddrs().find((a) => a.id === sel.value);
        coState.addrId = sel.value; coState.step = 2; refresh();
      });
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
        const addr = { name: v.name.trim(), phone: String(v.phone).trim(), line1: v.line1.trim(), land: v.land.trim(), city: v.city.trim(), state: v.state, pin: String(v.pin).trim(), country: "India" };
        if (form.querySelector("#fSave").checked) { const saved = S.saveAddr(addr); coState.addrId = saved.id; }
        coState.address = addr; coState.step = 2; refresh();
      };
    } else if (coState.step === 2) {
      main.innerHTML = `<div class="card"><h2 style="margin-top:0">Delivery method</h2>
        <label class="pay-option selected"><input type="radio" checked/><span><strong>Standard delivery (3–6 days)</strong><br/><span class="muted">${t.shipping ? `₹${t.shipping} · free over ₹1,499` : "Free — your order qualifies for complimentary shipping"}</span></span></label>
        <label class="pay-option disabled"><input type="radio" disabled/><span><strong>Express delivery</strong> <span class="coming">Coming soon</span><br/><span class="muted">1–2 day delivery is not available yet.</span></span></label>
        <div style="display:flex;gap:.6rem;margin-top:.8rem"><button class="btn btn-ghost" id="back1">← Address</button><button class="btn btn-dark" id="toPay" style="flex:1">Continue to Payment</button></div></div>`;
      main.querySelector("#back1").onclick = () => { coState.step = 1; refresh(); };
      main.querySelector("#toPay").onclick = () => { coState.step = 3; refresh(); };
    } else if (coState.step === 3) {
      main.innerHTML = `<div class="card"><h2 style="margin-top:0">Payment method</h2>
        <p class="muted" style="font-size:.88rem">Only Cash on Delivery is available right now. Card, UPI, net-banking and wallets are coming soon — we never ask for card or banking details by form.</p>
        <label class="pay-option selected"><input type="radio" name="pay" value="cod" checked/><span><strong>Cash on Delivery</strong> <span class="pill ok">Available</span><br/><span class="muted">Pay ${inr(t.total)} in cash or UPI when your order arrives.</span></span></label>
        ${[["UPI (GPay / PhonePe / Paytm)", "Pay instantly via UPI apps"], ["Credit / Debit Card", "Visa, Mastercard, RuPay"], ["Net Banking", "All major Indian banks"], ["Wallets", "Popular mobile wallets"]].map(([h, s]) => `<label class="pay-option disabled"><input type="radio" disabled/><span><strong>${h}</strong> <span class="coming">Coming soon</span><br/><span class="muted">${s} — not available yet.</span></span></label>`).join("")}
        <div style="display:flex;gap:.6rem;margin-top:.8rem"><button class="btn btn-ghost" id="back2">← Delivery</button><button class="btn btn-dark" id="toReview" style="flex:1">Review Order</button></div></div>`;
      main.querySelector("#back2").onclick = () => { coState.step = 2; refresh(); };
      main.querySelector("#toReview").onclick = () => { coState.step = 4; refresh(); };
    } else {
      main.innerHTML = `<div class="card"><h2 style="margin-top:0">Review & place order</h2>
        <p><strong>Deliver to:</strong> ${esc(coState.address.name)}, ${esc(coState.address.line1)}, ${esc(coState.address.city)} ${esc(coState.address.pin)} · ${esc(coState.address.phone)}</p>
        <p><strong>Payment:</strong> Cash on Delivery — ${inr(t.total)} due on delivery.</p>
        <label class="check-row" style="margin:.6rem 0"><input type="checkbox" id="agree"/> I agree to the <a href="#/terms">Terms</a> and <a href="#/returns">Return Policy</a>. <span class="req" style="color:var(--clay)">*</span></label>
        <div style="display:flex;gap:.6rem"><button class="btn btn-ghost" id="back3">← Payment</button><button class="btn btn-clay" id="placeBtn" style="flex:1">Place Order · ${inr(t.total)}</button></div>
        <p class="muted" style="font-size:.82rem">No advance payment is taken. COD orders can be cancelled before shipping from My Orders.</p></div>`;
      main.querySelector("#back3").onclick = () => { coState.step = 3; refresh(); };
      main.querySelector("#placeBtn").onclick = (e) => {
        if (!main.querySelector("#agree").checked) { toast("Please accept the Terms to place your order.", "error"); return; }
        runOrderProcessing(e.currentTarget, t);
      };
    }
  }
  function refresh() { document.dispatchEvent(new CustomEvent("siesta:reroute", { detail: { keep: true } })); }

  function runOrderProcessing(btn, t) {
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
                });
                await mirrorOrder(serverOrder);
                try { await loadCatalog(); } catch {}
                S.clearCart(); S.removeCoupon(); resetCheckout();
                document.dispatchEvent(new CustomEvent("siesta:counts"));
                overlay.remove();
                location.hash = "#/success/" + serverOrder.orderNo;
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
          location.hash = "#/success/" + order.orderNo;
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
    if (el) el.innerHTML = o ? successHTML(o) : `<div class="empty"><h2>Order not found</h2><a class="btn btn-dark" href="#/orders">View My Orders</a></div>`;
  });
  return `<div class="page page-narrow"><div id="successWrap"><div class="card"><div class="skel" style="height:280px"></div></div></div></div>`;
}

function successHTML(o) {
  return `<div class="card" style="text-align:center">
    <div class="success-check" aria-hidden="true"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="33"/><path d="M23 37.5 32 46l17-19"/></svg></div>
    <span class="eyebrow">Cash on Delivery</span>
    <h1 class="h-display" style="font-size:2.2rem">Order confirmed.</h1>
    <p class="muted">Thanks ${esc(o.address.name.split(" ")[0])} — please keep <strong style="color:var(--ink)">${inr(o.amounts.total)}</strong> ready on delivery.</p>
    <div class="summary-row"><span>Order number</span><strong>${esc(o.orderNo)}</strong></div>
    <div class="summary-row"><span>Order date</span><span>${new Date(o.createdAt).toLocaleString("en-IN")}</span></div>
    <div class="summary-row"><span>Payment</span><span>Cash on Delivery</span></div>
    <div class="summary-row"><span>Deliver to</span><span style="text-align:right">${esc(o.address.line1)}, ${esc(o.address.city)} ${esc(o.address.pin)}</span></div>
    ${orderAmountsHTML(o.amounts)}
    <div class="summary-row total"><span>Total due on delivery</span><span>${inr(o.amounts.total)}</span></div>
    <div style="display:flex;gap:.6rem;margin-top:1.2rem;flex-wrap:wrap;justify-content:center">
      <a class="btn btn-dark" href="#/track/${esc(o.orderNo)}">Track Order</a>
      <a class="btn btn-light" href="#/shop">Continue Shopping</a>
    </div></div></div>`;
}

// ---------------- TRACKING ----------------
export function TrackPage(orderNo) {
  setTitle("Track Order — Siesta", "Follow your Siesta order status.");
  const orders = S.getOrders();
  if (!orderNo) {
    setTimeout(() => {
      const form = document.getElementById("trackForm");
      form && (form.onsubmit = (e) => { e.preventDefault(); const v = document.getElementById("trackInput").value.trim(); if (v) location.hash = "#/track/" + encodeURIComponent(v.toUpperCase()); });
    });
    return `<div class="page page-narrow"><h1 class="h-display" style="font-size:2rem">Track your order</h1>
    <form id="trackForm" class="coupon-row"><label class="visually-hidden" for="trackInput">Order number</label><input id="trackInput" class="input" placeholder="e.g. 483920174658"/><button class="btn btn-dark" type="submit">Track</button></form>
    ${orders.length ? `<h2>Recent orders</h2>${orders.slice(0, 5).map((o) => `<div class="order-card"><div class="order-top"><strong>${esc(o.orderNo)}</strong><a class="link-btn" href="#/track/${esc(o.orderNo)}">View →</a></div></div>`).join("")}` : `<p class="muted">No orders on this device yet.</p>`}</div>`;
  }
  setTimeout(async () => {
    await refreshMirror(orderNo); // live admin status when online
    const raw = S.getOrders().find((x) => x.orderNo.toLowerCase() === orderNo.toLowerCase());
    const el = document.getElementById("trackWrap");
    if (!el) return;
    if (!raw) { el.innerHTML = `<div class="empty"><h2>We couldn't find ${esc(orderNo)}</h2><p class="muted">Check the order number on your confirmation screen or in My Orders.</p><a class="btn btn-dark" href="#/track">Try Again</a></div>`; return; }
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
  confirmed: "Order received — your items are reserved and the packing list is ready.",
  processing: "Your items are being picked and quality-checked at our facility.",
  packed: "Packed, sealed and labelled — ready for courier handoff.",
  shipped: "Handed to our delivery partner and on its way to you.",
  out_for_delivery: "Out for delivery and arriving today — please keep the COD amount ready.",
  delivered: "Delivered. We hope you love it — tap below to review your items.",
  cancelled: "Cancelled before shipment — nothing was charged (Cash on Delivery).",
};
const LEGACY_NOTES = new Set(["Updated by store admin", "Cancelled by customer", "Updated by Siesta order system (illustrative)"]);
const noteFor = (stage, note) => (note && !LEGACY_NOTES.has(note) ? note : STAGE_NOTES_FALLBACK[stage] || note || "");

function trackHTML(o) {
  const stages = ["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
  const labels = { confirmed: "Order Confirmed", processing: "Processing", packed: "Packed", shipped: "Shipped", out_for_delivery: "Out for Delivery", delivered: "Delivered" };
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span>/</span><a href="#/orders">Orders</a><span>/</span><span aria-current="page">${esc(o.orderNo)}</span></nav>`;
  const itemCount = o.items.reduce((s, i) => s + i.qty, 0);
  const thumbFor = (i) => {
    const p = productById(i.id);
    const src = p && p.images && p.images[0];
    if (src) return `<img class="t-item-thumb" src="${esc(imgVariant(src, 200, 60))}" alt="" loading="lazy" onerror="this.remove()" />`;
    if (p) return `<span class="t-item-thumb t-item-art" aria-hidden="true">${productArt(p)}</span>`;
    return `<span class="t-item-thumb t-item-ph" aria-hidden="true">S</span>`;
  };
  const aside = `<aside class="card track-aside"><h2 style="margin-top:0">Delivery details</h2>
    <p class="t-addr"><span aria-hidden="true">⌂</span><span>${esc(o.address.name)}<br/>${esc(o.address.line1)}<br/>${esc(o.address.city)}, ${esc(o.address.state)} ${esc(o.address.pin)}<br/>${esc(o.address.phone)}</span></p>
    <h3>Items (${itemCount})</h3>${o.items.map((i) => `<div class="t-item">${thumbFor(i)}<span class="t-item-name">${esc(i.name)} × ${i.qty} <span class="muted">(${esc(i.size)})</span></span><span class="t-item-price">${inr(i.price * i.qty)}</span></div>`).join("")}${orderAmountsHTML(o.amounts)}<div class="summary-row total"><span>Total (COD)</span><span>${inr(o.amounts.total)}</span></div></aside>`;

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
      <a class="btn btn-dark btn-sm" href="#/shop">Shop Again</a></div>${aside}</div>`;
  }

  const pct = Math.round(((o.stageIndex ?? 0) / (stages.length - 1)) * 100);
  const stepNo = Math.min((o.stageIndex ?? 0) + 1, stages.length);
  const etaDays = Math.max(0, Math.ceil((new Date(o.createdAt).getTime() + 5 * 86400000 - Date.now()) / 86400000));
  const etaText = o.status === "delivered" ? "Delivered — enjoy!" : etaDays <= 0 ? "Arriving today" : `Arriving in ${etaDays} day${etaDays === 1 ? "" : "s"}`;
  return `${crumbs}
  <div class="split"><div class="card track-card">
    <div class="track-hero">
      <div>
        <span class="status-pill${o.status === "delivered" ? " is-done" : ""}"><span class="pulse-dot" aria-hidden="true"></span>${esc(labels[o.status] || o.status)}</span>
        <h1 class="h-display" style="font-size:1.8rem;margin:.5rem 0 .3rem">${esc(etaText)}</h1>
        <p class="muted track-meta">Step ${stepNo} of ${stages.length} · ${itemCount} item${itemCount === 1 ? "" : "s"} · ${inr(o.amounts.total)} (COD)</p>
      </div>
      <button class="order-chip" data-copy="${esc(o.orderNo)}" aria-label="Copy order number ${esc(o.orderNo)}"><span class="muted">Order</span><strong>${esc(o.orderNo)}</strong><span class="copy-ic" aria-hidden="true">⧉</span></button>
    </div>
    <div class="eta-panel"><span aria-hidden="true">▣</span><div><strong>Estimated delivery · ${esc(o.eta)}</strong><br /><span class="muted" style="font-size:.84rem">${pct}% of the way there</span></div></div>
    <div class="tl-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Delivery progress"><span style="width:${pct}%"></span></div>
    <ol class="timeline" style="--fill:${pct}%">${stages.map((s) => { const hit = o.timeline.find((t) => t.stage === s); const done = !!hit; const cur = o.status === s; return `<li class="${done ? "done" : ""} ${cur ? "current" : ""}"><span class="dot" aria-hidden="true"></span><strong>${labels[s]}</strong>${hit ? `<time>${new Date(hit.at).toLocaleString("en-IN")}</time><div class="t-sub">${esc(noteFor(s, hit.note))}</div>` : `<div class="t-sub">Pending</div>`}</li>`; }).join("")}</ol>
    ${o.status === "delivered" ? `<div class="review-cta"><h3>Enjoying your order?</h3><p class="muted">Your review is published publicly with a Verified Purchase badge.</p><div style="display:flex;gap:.5rem;flex-wrap:wrap">${o.items.map((it, k) => `<button class="btn btn-light btn-sm" data-review="${k}">Review ${esc(it.name.length > 26 ? it.name.slice(0, 26) + "…" : it.name)}</button>`).join("")}</div></div>` : ""}
    <p class="muted" style="font-size:.82rem">${o._remote ? "Live status from the Siesta store — updated at every step from packing to delivery." : "Status reflects Siesta's order system on this device. Live courier scans will appear here once a delivery partner is connected."}</p></div>
  ${aside}</div>`;
}

// ---------------- WRITE A REVIEW (delivered orders only) ----------------
export function openReviewModal(orderNo, item) {
  let rating = 0;
  const { el, close } = openModal(`Review: ${item.name}`, `
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
      try { S.addToCart(p.id, p.sizes[Math.floor(p.sizes.length / 2)], p.colors[0].name, 1); S.toggleWish(p.id); toast(`${p.name} moved to cart.`); flyToCart(b); document.dispatchEvent(new CustomEvent("siesta:reroute")); document.dispatchEvent(new CustomEvent("siesta:counts")); }
      catch (e) { toast(e.message, "error"); }
    }));
    root.querySelectorAll("[data-unwish]").forEach((b) => (b.onclick = () => { S.toggleWish(b.dataset.unwish); toast("Removed from wishlist."); document.dispatchEvent(new CustomEvent("siesta:reroute")); document.dispatchEvent(new CustomEvent("siesta:counts")); }));
  });
  if (!items.length) return `<div class="page page-narrow"><div class="empty"><h2>Your wishlist is empty</h2><p class="muted">Tap the heart on any product to save it here.</p><a class="btn btn-dark" href="#/shop">Discover Products</a></div></div>`;
  return `<div class="page"><div class="section-head"><div><span class="eyebrow">${items.length} saved</span><h2 style="font-size:2rem">Wishlist</h2></div><button class="link-btn" id="clearW">Clear all</button></div>
  <div class="product-grid">${items.map(cardHTML).join("")}</div>
  <div class="card" style="margin-top:1.2rem"><h3 style="margin-top:0">Unavailable right now</h3>${items.filter((p) => !S.productById(p.id) || p.stock <= 0).map((p) => `<div class="summary-row"><span>${esc(p.name)}</span><button class="link-btn" data-unwish="${p.id}">Remove</button></div>`).join("") || '<p class="muted">Everything you saved is currently available.</p>'}
  <div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap">${items.filter((p) => p.stock > 0).map((p) => `<button class="btn btn-light btn-sm" data-move="${p.id}">Move ${esc(p.name.slice(0, 22))}… to cart</button>`).join("")}</div></div></div>`;
}
