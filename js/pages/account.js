// Auth, Account, Orders history, Static + Legal pages.
import { BUSINESS } from "../config.js";
import * as S from "../store.js";
import { esc, inr, setTitle, toast, confirmDialog, isEmail, openModal } from "../ui.js";
import { serverCancelOrder, serverExpressUpgrade } from "../api.js";
import { openReviewModal } from "./commerce.js";

const needAuth = async () => {
  const u = await S.currentUser();
  if (!u) { location.hash = "#/login?next=" + encodeURIComponent(location.hash.slice(1)); return null; }
  return u;
};

// Business details are placeholders until the owner fills js/config.js —
// never render raw placeholder internals to customers.
const biz = (v) => {
  v = String(v || "").replace(/\s*\(proposed\)/i, "");
  return /REPLACE_ME|\/\//.test(v) ? "To be announced" : v;
};

// ---------- LOGIN / REGISTER ----------
export function LoginPage(query) {
  setTitle("Log In — Siesta", "Access your Siesta account, orders and wishlist.");
  const next = query.get("next") || "/account";
  setTimeout(() => {
    const f = document.getElementById("loginForm");
    const toggle = document.getElementById("showPw");
    toggle.onclick = () => { const i = document.getElementById("lPw"); i.type = i.type === "password" ? "text" : "password"; toggle.textContent = i.type === "password" ? "Show" : "Hide"; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector('[type="submit"]');
      btn.classList.add("is-loading"); btn.disabled = true;
      try {
        await S.login(f.email.value, f.password.value, f.remember.checked);
        toast("Welcome back. You're logged in.");
        location.hash = "#" + next;
      } catch (err) { toast(err.message, "error"); }
      finally { btn.classList.remove("is-loading"); btn.disabled = false; }
    };
  });
  return `<div class="page"><div class="auth-wrap"><span class="eyebrow">Welcome back</span><h1 class="h-display" style="font-size:2rem">Log in to Siesta</h1>
  <div class="auth-card"><form id="loginForm" novalidate>
    <div class="field"><label for="lEmail">Email address <span class="req" style="color:var(--clay)">*</span></label><input id="lEmail" name="email" class="input" type="email" autocomplete="email" required/><span class="err"></span></div>
    <div class="field" style="margin-top:.7rem"><label for="lPw">Password <span class="req" style="color:var(--clay)">*</span></label><div class="pass-wrap"><input id="lPw" name="password" class="input" type="password" autocomplete="current-password" required/><button type="button" id="showPw" aria-label="Show password">Show</button></div><span class="err"></span></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:.7rem 0"><label class="check-row"><input type="checkbox" name="remember" checked/> Remember me</label><a class="link-btn" href="#/forgot">Forgot password?</a></div>
    <button class="btn btn-dark btn-block" type="submit">Log In Securely</button>
    <p class="muted" style="font-size:.86rem;text-align:center">New to Siesta? <a href="#/register${next !== "/account" ? "?next=" + encodeURIComponent(next) : ""}">Create an account</a></p>
  </form></div></div></div>`;
}

export function RegisterPage(query) {
  setTitle("Create Account — Siesta", "Join Siesta for faster checkout and order tracking.");
  const next = (query && query.get("next")) || "/account";
  setTimeout(() => {
    const f = document.getElementById("regForm");
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f).entries());
      const fail = (name, msg) => { const i = f.elements[name]; i.closest(".field").querySelector(".err").textContent = msg; i.setAttribute("aria-invalid", "true"); i.focus(); };
      f.querySelectorAll(".err").forEach((x) => (x.textContent = ""));
      if (v.name.trim().length < 3) return fail("name", "Enter your full name.");
      if (!isEmail(v.email)) return fail("email", "Enter a valid email address.");
      if (String(v.password).length < 8) return fail("password", "Use at least 8 characters.");
      if (v.password !== v.confirm) return fail("confirm", "Passwords don't match.");
      if (v.phone && !/^[6-9]\d{9}$/.test(String(v.phone).replace(/\D/g, "").slice(-10))) return fail("phone", "Enter a valid 10-digit mobile number or leave blank.");
      if (!f.terms.checked) { toast("Please accept the Terms to create an account.", "error"); return; }
      const btn = f.querySelector('[type="submit"]');
      btn.classList.add("is-loading"); btn.disabled = true;
      try { await S.register({ name: v.name, email: v.email, password: v.password, phone: v.phone, marketing: !!f.marketing.checked }); toast("Account created. Welcome to Siesta."); location.hash = "#" + next; }
      catch (err) { toast(err.message, "error"); }
      finally { btn.classList.remove("is-loading"); btn.disabled = false; }
    };
  });
  return `<div class="page"><div class="auth-wrap"><span class="eyebrow">Join Siesta</span><h1 class="h-display" style="font-size:2rem">Create your account</h1>
  <div class="auth-card"><form id="regForm" novalidate>
    <div class="field"><label for="rName">Full name *</label><input id="rName" name="name" class="input" autocomplete="name"/><span class="err" role="alert"></span></div>
    <div class="field" style="margin-top:.7rem"><label for="rEmail">Email address *</label><input id="rEmail" name="email" class="input" type="email" autocomplete="email"/><span class="err" role="alert"></span></div>
    <div class="field" style="margin-top:.7rem"><label for="rPhone">Phone (optional)</label><input id="rPhone" name="phone" class="input" inputmode="numeric" autocomplete="tel" placeholder="10-digit mobile"/><span class="err" role="alert"></span></div>
    <div class="form-grid" style="margin-top:.7rem"><div class="field"><label for="rPw">Password *</label><input id="rPw" name="password" class="input" type="password" autocomplete="new-password"/><span class="err" role="alert"></span></div>
    <div class="field"><label for="rPw2">Confirm password *</label><input id="rPw2" name="confirm" class="input" type="password" autocomplete="new-password"/><span class="err" role="alert"></span></div></div>
    <label class="check-row" style="margin-top:.7rem"><input type="checkbox" name="terms"/> I agree to the <a href="#/terms">Terms & Conditions</a> *</label>
    <label class="check-row"><input type="checkbox" name="marketing"/> Email me about new drops and offers (optional, not pre-checked). See <a href="#/privacy">Privacy Policy</a>.</label>
    <button class="btn btn-dark btn-block" type="submit" style="margin-top:.8rem">Create Account</button>
    <p class="muted" style="font-size:.86rem;text-align:center">Already have an account? <a href="#/login${next !== "/account" ? "?next=" + encodeURIComponent(next) : ""}">Log in</a></p>
  </form></div></div></div>`;
}

export function ForgotPage() {
  setTitle("Reset Password — Siesta", "Recover access to your Siesta account.");
  setTimeout(() => {
    document.getElementById("fgForm").onsubmit = (e) => {
      e.preventDefault();
      const em = e.target.email.value.trim();
      if (!isEmail(em)) { toast("Enter a valid email address.", "error"); return; }
      toast("Password reset over email isn't available in this store yet. Please create a new account or contact support for help.");
      location.hash = "#/login";
    };
  });
  return `<div class="page"><div class="auth-wrap"><h1 class="h-display" style="font-size:2rem">Reset password</h1><div class="auth-card"><form id="fgForm"><div class="field"><label for="fgEmail">Email address *</label><input id="fgEmail" name="email" class="input" type="email" autocomplete="email"/><span class="err"></span></div><button class="btn btn-dark btn-block" style="margin-top:.8rem" type="submit">Send Reset Link</button></form></div></div></div>`;
}

// ---------------- EXPRESS DELIVERY UPGRADE (free auto-upgrade) ----------------
export function openExpressModal(orderNo, onDone) {
  const { el, close } = openModal("Express Delivery", `
    <p class="muted" style="margin-top:0">Upgrade this order to express delivery — free, instant, and prioritised in packing.</p>
    <div class="field"><label for="exDay">Arriving</label>
      <select id="exDay" class="select">
        <option value="today">Today</option>
        <option value="tomorrow">Tomorrow</option>
      </select>
    </div>
    <p class="err" id="exErr" role="alert"></p>
    <button class="btn btn-dark btn-block" id="exGo">Confirm Express Upgrade</button>`);
  el.querySelector("#exGo").onclick = async (e) => {
    const day = el.querySelector("#exDay").value;
    const btn = e.currentTarget;
    btn.classList.add("is-loading"); btn.disabled = true;
    try {
      const updated = await serverExpressUpgrade(orderNo, day);
      try {
        const all = JSON.parse(localStorage.getItem("siesta.orders.v1") || "[]");
        const i = all.findIndex((x) => x.orderNo === orderNo);
        if (i >= 0) { all[i] = { ...all[i], express: updated.express, timeline: updated.timeline }; }
        else all.unshift({ ...updated, _remote: true });
        localStorage.setItem("siesta.orders.v1", JSON.stringify(all));
      } catch {}
      const { el: doneEl, close: doneClose } = openModal("Upgraded to Express", `
        <div style="text-align:center">
          <div class="success-check" aria-hidden="true" style="width:56px;height:56px;font-size:1.5rem">✓</div>
          <h3 style="margin:.4rem 0">Congratulations, your order has been auto upgraded to express delivery.</h3>
          <p class="muted">It will arrive ${day === "today" ? "today" : "tomorrow"}. Keep the COD amount ready.</p>
          <button class="btn btn-dark" id="exDone">Done</button>
        </div>`);
      doneEl.querySelector("#exDone").onclick = () => { doneClose(); close(); if (onDone) onDone(); };
      toast(`Express delivery confirmed — arriving ${day}.`);
    } catch (err) {
      el.querySelector("#exErr").textContent = err.message || "Could not upgrade this order.";
      btn.classList.remove("is-loading"); btn.disabled = false;
    }
  };
}

// ---------- ACCOUNT ----------
const NAV = [["overview", "Overview"], ["orders", "Orders"], ["addresses", "Addresses"], ["profile", "Profile"], ["security", "Security"], ["prefs", "Preferences"]];
export function AccountPage(tab = "overview") {
  setTitle("My Account — Siesta", "Manage orders, addresses and settings.");
  setTimeout(async () => {
    if (!document.getElementById("acctMain")) return;
    const u = await needAuth();
    if (!u) return;
    const hello = document.getElementById("acctHello");
    if (hello) hello.textContent = `Hello, ${u.name.split(" ")[0]}`;
    wireAccount(tab, u);
  });
  return `<div class="page"><span class="eyebrow" id="acctHello">My account</span><h1 class="h-display" style="font-size:2rem">My account</h1>
  <div class="acct"><nav class="acct-nav" aria-label="Account sections">${NAV.map(([id, l]) => `<a href="#/account/${id}" ${tab === id ? 'aria-current="page"' : ""}>${l}</a>`).join("")}<a href="#/track">Track Order</a><a href="#/wishlist">Wishlist</a><button class="link-btn" id="logoutBtn" style="text-align:left;padding:.65rem .85rem">Log out</button></nav>
  <div id="acctMain"><div class="card"><div class="skel" style="height:120px"></div></div></div></div></div>`;
}

function wireAccount(tab, u) {
  document.getElementById("logoutBtn").onclick = async () => { if (await confirmDialog("Log out", "Log out of your Siesta account on this device?", "Log out")) { S.logout(); toast("You've been logged out."); location.hash = "#/"; } };
  const main = document.getElementById("acctMain");
  const orders = S.getOrders().map(S.orderWithProgress);
  if (tab === "overview") {
    main.innerHTML = `<div class="stat-grid">
      <div class="stat"><span class="muted">Orders</span><strong>${orders.length}</strong><a class="link-btn" href="#/account/orders">View orders →</a></div>
      <div class="stat"><span class="muted">Wishlist</span><strong>${S.getWish().length}</strong><a class="link-btn" href="#/wishlist">View wishlist →</a></div>
      <div class="stat"><span class="muted">Addresses</span><strong>${S.getAddrs().length}</strong><a class="link-btn" href="#/account/addresses">Manage →</a></div></div>
      <div class="card" style="margin-top:1rem"><h3 style="margin-top:0">Latest order</h3>${orders[0] ? `<div class="summary-row"><span><strong>${esc(orders[0].orderNo)}</strong> · ${esc(orders[0].status.replace(/_/g, " "))}</span><a class="link-btn" href="#/track/${esc(orders[0].orderNo)}">Track →</a></div>` : `<p class="muted">No orders yet. <a href="#/shop">Start shopping</a>.</p>`}</div>`;
  } else if (tab === "orders") {
    main.innerHTML = `<div class="card"><h3 style="margin-top:0">Order history</h3>${orders.length ? orders.map((o) => `<div class="order-card"><div class="order-top"><div><strong>${esc(o.orderNo)}</strong>${o.express ? ` <span class="pill ok">⚡ Express · arrives ${esc(o.express.option)}</span>` : ""}<br/><span class="muted" style="font-size:.84rem">${new Date(o.createdAt).toLocaleDateString("en-IN")} · ${o.items.reduce((s, i) => s + i.qty, 0)} items · ${inr(o.amounts.total)} · COD</span></div><span class="pill ${o.status === "delivered" ? "ok" : o.status === "cancelled" ? "" : "warn"}">${esc(o.status.replace(/_/g, " "))}</span></div>
      <div style="display:flex;gap:.8rem;margin-top:.6rem;flex-wrap:wrap"><a class="link-btn" href="#/track/${esc(o.orderNo)}">Track order</a><button class="link-btn" data-detail="${esc(o.orderNo)}">View details</button>${["confirmed", "processing"].includes(o.status) ? `<button class="link-btn" data-cancel="${esc(o.orderNo)}">Cancel order</button>` : ""}${!["delivered", "cancelled"].includes(o.status) ? `<button class="link-btn" data-express="${esc(o.orderNo)}">${o.express ? "Change express day" : "Express Delivery"}</button>` : ""}</div>
      <div data-dwrap="${esc(o.orderNo)}" hidden style="margin-top:.6rem">${o.items.map((i, k) => `<div class="summary-row"><span>${esc(i.name)} × ${i.qty} (${esc(i.size)})</span><span>${o.status === "delivered" ? `<button class="link-btn" data-rev="${esc(o.orderNo)}::${k}">Review</button> ` : ""}${inr(i.price * i.qty)}</span></div>`).join("")}</div></div>`).join("") : `<div class="empty"><h2>No orders yet</h2><p class="muted">Orders placed on this device will appear here.</p><a class="btn btn-dark" href="#/shop">Start Shopping</a></div>`}</div>`;
    main.querySelectorAll("[data-detail]").forEach((b) => (b.onclick = () => { const w = main.querySelector(`[data-dwrap="${b.dataset.detail}"]`); w.hidden = !w.hidden; }));
    main.querySelectorAll("[data-rev]").forEach((b) => (b.onclick = () => {
      const [orderNo, k] = b.dataset.rev.split("::");
      const order = S.getOrders().find((x) => x.orderNo === orderNo);
      if (order) openReviewModal(orderNo, order.items[Number(k)]);
    }));
    main.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = async () => {
      if (!(await confirmDialog("Cancel order", `Cancel order ${b.dataset.cancel}? This cannot be undone.`, "Cancel order"))) return;
      try { await serverCancelOrder(b.dataset.cancel); } catch (e) { if (e.status && e.status !== 404) { toast(e.message, "error"); return; } }
      S.cancelOrder(b.dataset.cancel);
      toast("Order cancelled.");
      wireAccount(tab, await S.currentUser());
    }));
    main.querySelectorAll("[data-express]").forEach((b) => (b.onclick = () => openExpressModal(b.dataset.express, async () => wireAccount(tab, await S.currentUser()))));
  } else if (tab === "addresses") {
    const list = S.getAddrs();
    main.innerHTML = `<div class="card"><h3 style="margin-top:0">Saved addresses</h3><div class="addr-grid">${list.map((a) => `<div class="addr-card ${a.isDefault ? "default" : ""}"><strong>${esc(a.name)}</strong> ${a.isDefault ? '<span class="pill">Default</span>' : ""}<br/><span class="muted">${esc(a.line1)}, ${esc(a.city)} ${esc(a.pin)}<br/>${esc(a.phone)}</span><div style="display:flex;gap:.6rem;margin-top:.5rem"><button class="link-btn" data-del="${a.id}">Delete</button></div></div>`).join("") || '<p class="muted">No saved addresses yet.</p>'}</div>
    <form id="addrMini" class="form-grid" style="margin-top:1rem"><div class="field"><label>Full name *</label><input name="name" class="input" required/></div><div class="field"><label>Phone *</label><input name="phone" class="input" required/></div><div class="field full"><label>Address *</label><input name="line1" class="input" required/></div><div class="field"><label>City *</label><input name="city" class="input" required/></div><div class="field"><label>PIN *</label><input name="pin" class="input" required/></div><div class="full"><button class="btn btn-dark" type="submit">Save Address</button></div></form></div>`;
    main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { S.deleteAddr(b.dataset.del); toast("Address deleted."); wireAccount(tab, await S.currentUser()); }));
    main.querySelector("#addrMini").onsubmit = async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries());
      if (!v.name || !v.phone || !v.line1 || !v.city || !/^\d{6}$/.test(String(v.pin || "").trim())) { toast("Fill all fields with a valid 6-digit PIN.", "error"); return; }
      S.saveAddr({ ...v, state: "—", country: "India" }); toast("Address saved."); wireAccount(tab, await S.currentUser());
    };
  } else if (tab === "profile") {
    main.innerHTML = `<div class="card"><h3 style="margin-top:0">Profile</h3><form id="profForm" class="form-grid"><div class="field"><label>Full name</label><input name="name" class="input" value="${esc(u.name)}"/></div><div class="field"><label>Phone</label><input name="phone" class="input" value="${esc(u.phone || "")}"/></div><div class="field full"><label>Email (cannot be changed)</label><input class="input" value="${esc(u.email)}" disabled/></div><div class="full"><button class="btn btn-dark" type="submit">Save Changes</button></div></form></div>`;
    main.querySelector("#profForm").onsubmit = async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries());
      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await S.updateProfile(u.email, { name: v.name.trim(), phone: v.phone.trim() });
        toast("Profile updated.");
        const fresh = await S.currentUser();
        if (fresh) wireAccount(tab, fresh);
      } catch (err) { toast(err.message, "error"); }
      finally { btn.disabled = false; }
    };
  } else if (tab === "security") {
    main.innerHTML = `<div class="card"><h3 style="margin-top:0">Security</h3><form id="pwForm" class="form-grid"><div class="field full"><label>Current password</label><input name="cur" type="password" class="input" autocomplete="current-password"/></div><div class="field"><label>New password (min 8 chars)</label><input name="next" type="password" class="input" autocomplete="new-password"/></div><div class="field"><label>Confirm new password</label><input name="next2" type="password" class="input" autocomplete="new-password"/></div><div class="full"><button class="btn btn-dark" type="submit">Update Password</button></div></form><p class="muted" style="font-size:.84rem">Passwords are hashed and never stored in plain text.</p></div>`;
    main.querySelector("#pwForm").onsubmit = async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries());
      if (v.next.length < 8) { toast("New password must be at least 8 characters.", "error"); return; }
      if (v.next !== v.next2) { toast("New passwords don't match.", "error"); return; }
      try { await S.changePassword(u.email, v.cur, v.next); toast("Password updated."); e.target.reset(); } catch (err) { toast(err.message, "error"); }
    };
  } else {
    const prefs = S.getPrefs();
    main.innerHTML = `<div class="card"><h3 style="margin-top:0">Preferences</h3><label class="check-row"><input type="checkbox" id="prefNews" ${localStorage.getItem("siesta.news.v1") ? "checked" : ""}/> Newsletter emails (only if you subscribed)</label><p class="muted" style="font-size:.85rem">Manage cookies anytime via “Cookie preferences” in the footer.</p><button class="btn btn-outline btn-sm" id="wipeBtn">Erase my data on this device</button></div>`;
    main.querySelector("#wipeBtn").onclick = async () => { if (await confirmDialog("Erase data", "Remove cart, wishlist, orders and account data stored in this browser?", "Erase everything")) { ["siesta.cart.v1", "siesta.wish.v1", "siesta.orders.v1", "siesta.addrs.v1", "siesta.users.v1", "siesta.recent.v1", "siesta.searches.v1"].forEach((k) => localStorage.removeItem(k)); S.logout(); toast("Local data erased."); location.hash = "#/"; } };
  }
}

// ---------- STATIC / LEGAL ----------
const notice = `<div class="notice"><strong>Template notice:</strong> this policy is an original starter template for Siesta. It is not legal advice and must be reviewed by a qualified professional before launch. Business details marked REPLACE_ME in <code>js/config.js</code> must be completed first.</div>`;
const prose = (title, body) => { setTitle(title + " — Siesta", title + " · Siesta fashion store."); return `<div class="page"><div class="prose"><h1>${esc(title)}</h1>${notice}${body}</div></div>`; };

export const StaticPages = {
  about: () => prose("About Siesta", `<p>Siesta is a small Indian fashion label focused on considered everyday clothing — heavyweight T-shirts, honest denim, brushed fleece and outerwear built for real life. We design in limited runs, publish full fabric details, and price fairly without inflated “was” prices.</p><h2>What we won't do</h2><ul><li>No fake reviews, ratings, testimonials or customer counts — every published review comes from a verified delivered purchase, one per order.</li><li>No fake trust badges, awards or payment-partner logos.</li><li>No copyrighted brand imagery — all visuals here are original illustrations.</li></ul>`),
  contact: () => {
    setTitle("Contact Us — Siesta", "Reach Siesta support.");
    setTimeout(() => {
      document.getElementById("ctForm").onsubmit = (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target).entries()); if (!isEmail(v.email) || v.message.trim().length < 10) { toast("Enter a valid email and a message of at least 10 characters.", "error"); return; } toast("Thanks — your message has been noted. Our team will reply from the official support email once configured."); e.target.reset(); };
    });
    return `<div class="page"><div class="prose"><h1>Contact us</h1><p>Support email: <strong>${esc(biz(BUSINESS.supportEmail))}</strong><br/>Phone: <strong>${esc(biz(BUSINESS.supportPhone))}</strong><br/>Hours: ${esc(biz(BUSINESS.hours))}</p><div class="notice">Contact details are placeholders until real business channels are configured. Nothing here is a genuine address or phone number.</div><form id="ctForm" class="form-grid" style="margin-top:1rem"><div class="field"><label for="ctName">Name *</label><input id="ctName" name="name" class="input" autocomplete="name"/></div><div class="field"><label for="ctEmail">Email *</label><input id="ctEmail" name="email" type="email" class="input" autocomplete="email"/></div><div class="field full"><label for="ctMsg">How can we help? *</label><textarea id="ctMsg" name="message" class="input" rows="5" placeholder="Order number (if any) + your question"></textarea></div><div class="full"><button class="btn btn-dark" type="submit">Send Message</button></div></form></div></div>`;
  },
  faq: () => prose("Frequently Asked Questions", `<h2>Which payment methods do you accept?</h2><p>Cash on Delivery only, right now. UPI, cards, net-banking and wallets are labelled “Coming soon” and cannot be selected until a licensed payment partner is integrated.</p><h2>How long is delivery?</h2><p>Typically 3–6 business days across India. Orders ship within 24 hours on working days.</p><h2>What is the return policy?</h2><p>7-day easy returns on unworn items with tags. COD amounts are refunded via bank transfer/UPI after quality check. See <a href="#/returns">Returns & Refunds</a>.</p><h2>How do I track my order?</h2><p>Use <a href="#/track">Track Order</a> with your 12-digit order number from the confirmation screen.</p><h2>Do you have physical stores?</h2><p>Not yet — Siesta is online-only.</p>`),
  shipping: () => prose("Shipping Policy", `<p>We ship across India. Orders are packed within 24 hours on working days. Standard delivery takes 3–6 business days. Shipping is a flat ${inr(79)} and <strong>free on orders of ${inr(1499)} or more</strong> (after discounts).</p><h2>Cash on Delivery</h2><p>COD is available on orders up to ${inr(20000)}. Please keep the exact order total ready. Our courier partner will share an OTP where applicable.</p><h2>Delays</h2><p>Weather, public holidays and remote PIN codes can add 1–3 days. If your parcel is delayed beyond 8 days, contact support with your order number.</p>`),
  returns: () => prose("Returns & Refunds", `<p>You may return unworn, unwashed items with tags within <strong>7 days of delivery</strong>. For hygiene, briefs/innerwear (if ever sold) would be final sale — Siesta currently sells outerwear only.</p><h2>How to return</h2><p>Raise a request from <a href="#/account/orders">My Orders</a> or <a href="#/contact">Contact Us</a> with your order number. We arrange a doorstep pickup where serviceable.</p><h2>Refunds (COD)</h2><p>Since COD is paid at delivery, refunds are issued via bank transfer/UPI within 5–7 business days of passing quality check. No cash refunds via courier.</p><h2>Cancellations</h2><p>Cancel free of charge before the order ships, from My Orders.</p>`),
  privacy: () => prose("Privacy Policy", `<p>We collect only what we need: account details you provide, delivery addresses, order contents, and your cookie choices. We do not collect card numbers, CVVs, UPI PINs or banking credentials — the checkout never asks for them.</p><h2>What we store and where</h2><p>Your account, addresses, orders and reviews are stored in our secured database so they work on every device you log into. Your cart, wishlist and preferences also persist in your own browser for speed. Account passwords are hashed (never plaintext) and travel over encrypted HTTPS connections.</p><h2>Marketing consent</h2><p>Newsletter and marketing checkboxes are never pre-checked. You can withdraw consent anytime from Account → Preferences.</p><h2>Your rights</h2><p>Access, correct or erase your data from Account settings (“Erase my data on this device”). For server-side copies, contact our grievance officer at ${esc(biz(BUSINESS.grievanceOfficer))}.</p><h2>Third parties</h2><p>We load no advertising trackers, analytics pixels, chat widgets or social embeds in this build. If any are added later, they will be listed here and gated behind cookie consent.</p>`),
  terms: () => prose("Terms & Conditions", `<p>By using Siesta you agree to shop honestly: provide accurate delivery details, accept COD terms, and use the site lawfully. Prices are in INR and include taxes where applicable. We may cancel orders involving pricing errors, suspected fraud, or undeliverable addresses, with a full refund of any amount paid.</p><h2>Products</h2><p>Colours may vary slightly by screen. Garment measurements in the size guide are approximate (±0.5″).</p><h2>Limitation</h2><p>To the extent permitted by law, Siesta's liability is limited to the value of the affected order. Consumer rights under Indian law remain unaffected.</p>`),
  cookies: () => prose("Cookie Policy", `<p>We use four categories:</p><ul><li><strong>Necessary</strong> — cart, checkout, login, security. Always on.</li><li><strong>Preferences</strong> — filters, recently viewed. Optional.</li><li><strong>Analytics</strong> — anonymous counts. Off by default; no scripts load until you opt in.</li><li><strong>Marketing</strong> — newsletter personalisation. Off by default.</li></ul><p>Change your choice anytime via “Cookie preferences” in the footer. Consent state is stored in your browser only.</p><table class="config-table"><tr><th>Key</th><th>Purpose</th><th>Storage</th></tr><tr><td>siesta.consent.v1</td><td>Remembers cookie choice</td><td>localStorage</td></tr><tr><td>siesta.cart.v1 / wish / orders</td><td>Store features</td><td>localStorage</td></tr></table>`),
  notfound: () => `<div class="page page-narrow"><div class="empty"><h2>Page not found (404)</h2><p class="muted">The page you're looking for moved or never existed.</p><div style="display:flex;gap:.6rem;justify-content:center"><a class="btn btn-dark" href="#/">Go Home</a><a class="btn btn-light" href="#/shop">Shop All</a></div></div></div>`,
};
