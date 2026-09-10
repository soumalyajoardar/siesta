// App shell: hash router, header/search/mobile nav, counts, cookies, newsletter.
import { catalog } from "./api.js";
import { loadCatalog, loadCoupons, loadEvents, loadSettings, siteSettings } from "./api.js";
import * as S from "./store.js";
import { esc, toast, observeReveals, isEmail, popBadge, reducedMotion, setTitle } from "./ui.js";
import { HomePage, ShopPage, ProductPage } from "./pages/shop.js";
import { CartPage, CheckoutPage, SuccessPage, TrackPage, WishlistPage, resetCheckout } from "./pages/commerce.js";
import { LoginPage, RegisterPage, ForgotPage, AccountPage, StaticPages } from "./pages/account.js";

const app = document.getElementById("app");
const bootT0 = performance.now();
window.__siestaBooted = true; // boot started — disables the no-JS failsafe trap

function parsePath() {
  const segs = location.pathname.split("/").filter(Boolean);
  return { segs, query: new URLSearchParams(location.search || "") };
}

async function render() {
  barStart();
  document.getElementById("pdp-jsonld")?.remove(); // product schema belongs to PDP only
  const { segs, query } = parsePath();
  closeMobileNav();
  // Maintenance mode: the whole storefront becomes one page. The cached flag
  // paints instantly (no flash of the store); a fresh fetch then confirms it.
  // (Admin dashboard is a separate page and always stays reachable.)
  const cached = siteSettings() || {};
  if (cached.maintenance && cached.maintenance.enabled) showMaintenance(cached.maintenance);
  try {
    const s = await loadSettings();
    const m = (s && s.maintenance) || {};
    if (m.enabled) {
      showMaintenance(m);
      window.scrollTo({ top: 0, behavior: "auto" });
      barDone();
      return;
    }
  } catch (err) { console.warn("Maintenance check skipped:", err?.message || err); /* offline/static: storefront stays up */ }
  document.body.classList.remove("maintenance");
  // Logged-out visitors get the main page for account-only routes —
  // no dead ends, no login walls on guessed URLs.
  const PROTECTED = ["account", "orders", "checkout", "success"];
  if (PROTECTED.includes(segs[0]) && !(await S.currentUser())) {
    toast("Please log in to continue.");
    window.navigate("/", true);
    barDone();
    return;
  }
  let html = "";
  const r = segs.join("/");
  if (segs.length === 0) html = HomePage();
  else if (segs[0] === "shop" || segs[0] === "search") html = ShopPage(query);
  else if (segs[0] === "product" && segs[1]) html = ProductPage(decodeURIComponent(segs[1]));
  else if (r === "cart") html = CartPage();
  else if (r === "checkout") html = CheckoutPage();
  else if (segs[0] === "success" && segs[1]) html = SuccessPage(decodeURIComponent(segs[1]));
  else if (segs[0] === "track") html = TrackPage(segs[1] ? decodeURIComponent(segs[1]) : "");
  else if (r === "wishlist") html = WishlistPage();
  else if (r === "login") html = LoginPage(query);
  else if (r === "register") html = RegisterPage(query);
  else if (r === "forgot") html = ForgotPage();
  else if (segs[0] === "account") html = AccountPage(segs[1] || "overview");
  else if (r === "orders") { window.navigate("/account/orders"); return; }
  else if (["about", "contact", "faq", "shipping", "returns", "privacy", "terms", "cookies"].includes(segs[0])) html = StaticPages[segs[0]]();
  else { window.navigate("/", true); barDone(); return; }

  app.innerHTML = html;
  observeReveals(app);
  window.scrollTo({ top: 0, behavior: "auto" });
  document.getElementById("main").focus({ preventScroll: true });
  updateCounts();
  markActiveNav();
  barDone();
}

// ---------- Maintenance page (no links out — just a retry) ----------
function showMaintenance(m) {
  document.body.classList.add("maintenance");
  setTitle("Under Maintenance — Siesta", "Siesta is briefly under maintenance.");
  app.innerHTML = maintenancePage(m);
  document.getElementById("retryBtn")?.addEventListener("click", () => location.reload());
}
function maintenancePage(m) {
  const title = (m.title || "").trim() || "We'll be right back.";
  const msg = (m.message || "").trim() || "Siesta is undergoing scheduled maintenance to improve your shopping experience. Everything — your cart, wishlist and orders — is safe. Please check back in a little while.";
  return `<div class="page page-narrow"><div class="maint-card" role="status">
    <p class="logo" aria-hidden="true">SIESTA<span class="logo-dot">.</span></p>
    <p><span class="pill warn">Under maintenance</span></p>
    <h1 class="h-display" style="font-size:2.2rem">${esc(title)}</h1>
    <p class="lead" style="margin:0 auto">${esc(msg)}</p>
    <button class="btn btn-dark" id="retryBtn" style="margin-top:1.4rem">Check Again</button>
  </div></div>`;
}
const routeBar = document.getElementById("routeBar");
function barStart() {
  if (reducedMotion()) return;
  routeBar.classList.remove("done");
  void routeBar.offsetWidth;
  routeBar.classList.add("run");
}
function barDone() {
  if (reducedMotion()) return;
  routeBar.classList.add("done");
  setTimeout(() => routeBar.classList.remove("run", "done"), 320);
}

function markActiveNav() {
  const { segs, query } = parsePath();
  document.querySelectorAll(".desktop-nav a").forEach((a) => {
    const url = new URL(a.href.replace("#", ""), location.href);
    // hash links: compare manually
    a.removeAttribute("aria-current");
  });
}

// ---------- Header counts (badge pops when the cart grows) ----------
let prevCart = -1;
export function updateCounts() {
  const cc = document.getElementById("cartCount");
  const wc = document.getElementById("wishCount");
  const n = S.cartCount(), w = S.getWish().length;
  cc.hidden = n === 0; cc.textContent = n;
  wc.hidden = w === 0; wc.textContent = w;
  if (prevCart !== -1 && n > prevCart) popBadge();
  prevCart = n;
  // Logged-out visitors go to login, members to their account.
  const ab = document.getElementById("accountBtn");
  if (ab) {
    S.currentUser().then((u) => {
      const el = document.getElementById("accountBtn");
      if (!el) return;
      el.setAttribute("href", u ? "#/account" : "#/login");
      el.setAttribute("aria-label", u ? "My account" : "Log in to your account");
    }).catch(() => {});
  }
}
document.addEventListener("siesta:counts", updateCounts);
document.addEventListener("siesta:reroute", render);
window.addEventListener("popstate", render);
window.navigate = (path, replace = false) => {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  render();
};
document.addEventListener("click", e => {
  const a = e.target.closest("a");
  if (a && a.href && a.origin === location.origin && !a.hasAttribute("download") && !a.hasAttribute("target") && !a.pathname.startsWith("/admin") && !a.pathname.startsWith("/api") && !a.pathname.includes(".")) {
    e.preventDefault();
    window.navigate(a.pathname + a.search);
  }
});
S.subscribe(updateCounts);

// ---------- Mobile nav ----------
const nav = document.getElementById("mobileNav");
const scrim = document.getElementById("scrim");
const menuBtn = document.getElementById("menuBtn");
function openMobileNav() { nav.classList.add("open"); nav.setAttribute("aria-hidden", "false"); scrim.hidden = false; menuBtn.setAttribute("aria-expanded", "true"); nav.querySelector("a").focus(); }
function closeMobileNav() { if (!nav.classList.contains("open")) { scrim.hidden = document.getElementById("filters")?.classList.contains("open") ? false : true; if (!document.getElementById("filters")?.classList.contains("open")) scrim.hidden = true; return; } nav.classList.remove("open"); nav.setAttribute("aria-hidden", "true"); scrim.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
menuBtn.onclick = openMobileNav;
document.getElementById("menuClose").onclick = closeMobileNav;
scrim.onclick = () => { closeMobileNav(); document.getElementById("filters")?.classList.remove("open"); scrim.hidden = true; };
nav.querySelectorAll("a").forEach((a) => (a.onclick = closeMobileNav));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMobileNav(); hideSuggest(); } });

// ---------- Search ----------
const input = document.getElementById("globalSearch");
const suggest = document.getElementById("searchSuggest");
const clearBtn = document.getElementById("searchClear");
let activeIdx = -1, currentList = [];
function suggestions(q) {
  q = q.trim().toLowerCase();
  if (!q) return S.getSearches().map((s) => ({ label: s, type: "recent" }));
  const matches = catalog().filter((p) => [p.name, p.category, p.gender, ...p.colors.map((c) => c.name)].join(" ").toLowerCase().includes(q)).slice(0, 6).map((p) => ({ label: p.name, type: p.category, id: p.id }));
  const cats = [...new Set(catalog().filter((p) => p.category.includes(q)).map((p) => p.category))].map((c) => ({ label: `Shop ${c}`, type: "category", cat: c }));
  return [...matches, ...cats].slice(0, 7);
}
function showSuggest() {
  currentList = suggestions(input.value);
  activeIdx = -1;
  if (!currentList.length) { hideSuggest(); return; }
  suggest.innerHTML = currentList.map((s, i) => `<button role="option" data-i="${i}" aria-selected="false"><span>⌕ ${esc(s.label)}</span><span class="s-type">${esc(s.type)}</span></button>`).join("");
  suggest.hidden = false;
  input.setAttribute("aria-expanded", "true");
  suggest.querySelectorAll("button").forEach((b) => {
    b.onclick = () => pickSuggestion(Number(b.dataset.i));
    b.onmousemove = () => setActive(Number(b.dataset.i));
  });
}
function hideSuggest() { suggest.hidden = true; input.setAttribute("aria-expanded", "false"); }
function setActive(i) {
  activeIdx = i;
  suggest.querySelectorAll("button").forEach((b, k) => { b.classList.toggle("active", k === i); b.setAttribute("aria-selected", String(k === i)); });
  if (currentList[i] && currentList[i].id) { /* preview only */ }
}
function pickSuggestion(i) {
  const s = currentList[i];
  hideSuggest();
  if (!s) return;
  if (s.id) { S.pushSearch(input.value || s.label); window.navigate("/product/" + s.id); }
  else if (s.cat) window.navigate("/shop?category=" + s.cat);
  else { goSearch(s.label); }
  input.value = "";
  clearBtn.hidden = true;
}
function goSearch(q) {
  q = q.trim();
  if (!q) return;
  S.pushSearch(q);
  window.navigate("/shop?q=" + encodeURIComponent(q));
}
input.addEventListener("input", () => { clearBtn.hidden = !input.value; showSuggest(); });
input.addEventListener("focus", showSuggest);
input.addEventListener("blur", () => setTimeout(hideSuggest, 150));
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(activeIdx + 1, currentList.length - 1)); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)); }
  else if (e.key === "Enter") { e.preventDefault(); if (activeIdx >= 0) pickSuggestion(activeIdx); else { goSearch(input.value); hideSuggest(); input.value = ""; clearBtn.hidden = true; } }
});
clearBtn.onclick = () => { input.value = ""; clearBtn.hidden = true; input.focus(); hideSuggest(); };

// Mobile search
const mRow = document.getElementById("mobileSearchRow");
const mInput = document.getElementById("mobileSearchInput");
document.getElementById("mobileSearchBtn").onclick = () => { mRow.hidden = !mRow.hidden; if (!mRow.hidden) mInput.focus(); };
document.getElementById("mobileSearchClose").onclick = () => (mRow.hidden = true);
mInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { goSearch(mInput.value); mInput.value = ""; mRow.hidden = true; } });

// ---------- Newsletter ----------
document.getElementById("newsForm").onsubmit = (e) => {
  e.preventDefault();
  const em = document.getElementById("newsEmail").value.trim();
  const msg = document.getElementById("newsMsg");
  if (!isEmail(em)) { msg.textContent = "Please enter a valid email address."; msg.style.color = "var(--danger)"; return; }
  localStorage.setItem("siesta.news.v1", JSON.stringify({ email: em, at: new Date().toISOString() }));
  msg.textContent = "You're on the list. Your 10% welcome code is WELCOME10.";
  msg.style.color = "var(--success)";
  e.target.querySelector("input").value = "";
  toast("Subscribed. Welcome code: WELCOME10.");
};

// ---------- Cookie consent ----------
const banner = document.getElementById("cookieBanner");
const prefsDlg = document.getElementById("cookiePrefs");
function showBannerIfNeeded() { if (!S.getConsent()) banner.hidden = false; }
document.getElementById("cookieAccept").onclick = () => { S.setConsent({ necessary: true, preferences: true, analytics: true, marketing: true }); banner.hidden = true; toast("Cookie preferences saved."); };
document.getElementById("cookieReject").onclick = () => { S.setConsent({ necessary: true, preferences: false, analytics: false, marketing: false }); banner.hidden = true; toast("Only necessary cookies will be used."); };
document.getElementById("cookieManage").onclick = () => { prefsDlg.hidden = false; };
document.getElementById("cpClose").onclick = () => (prefsDlg.hidden = true);
document.getElementById("cpSave").onclick = () => {
  S.setConsent({ necessary: true, preferences: document.getElementById("cpPref").checked, analytics: document.getElementById("cpAnal").checked, marketing: document.getElementById("cpMark").checked });
  prefsDlg.hidden = true; banner.hidden = true; toast("Cookie preferences saved.");
};
document.getElementById("cookieSettingsBtn").onclick = () => { prefsDlg.hidden = false; };

// ---------- Boot: the splash stays until the store is truly ready ----------
// Gate 1: live catalog + coupons. Gate 2: first render. Gate 3: fonts, window
// load (stylesheets, scripts, eager images) and all eager/in-viewport media.
// A hard cap guarantees the splash can never trap the user.
document.getElementById("year").textContent = new Date().getFullYear();
showBannerIfNeeded();

function windowLoaded() {
  return new Promise((res) => {
    if (document.readyState === "complete") res();
    else {
      addEventListener("load", res, { once: true });
      setTimeout(res, 10000); // don't wait forever on a stalled resource
    }
  });
}

function mediaSettled() {
  // Eager images only — below-fold lazy images load as the user scrolls by design.
  const imgs = [...document.images].filter((i) => !i.complete && i.loading !== "lazy");
  const vids = [...document.querySelectorAll("video")];
  if (!imgs.length && !vids.length) return Promise.resolve();
  return new Promise((res) => {
    let left = imgs.length + vids.length;
    const timer = setTimeout(fin, 8000);
    function fin() { clearTimeout(timer); res(); }
    const one = () => { if (--left <= 0) fin(); };
    imgs.forEach((i) => { i.addEventListener("load", one, { once: true }); i.addEventListener("error", one, { once: true }); });
    vids.forEach((v) => {
      if (v.readyState >= 2 || v.error) one();
      else { v.addEventListener("canplay", one, { once: true }); v.addEventListener("error", one, { once: true }); }
    });
  });
}

function hideSplash() {
  const splash = document.getElementById("bootSplash");
  if (!splash) return;
  const wait = reducedMotion() ? 0 : Math.max(0, 400 - (performance.now() - bootT0));
  setTimeout(() => {
    splash.classList.add("done");
    setTimeout(() => splash.remove(), 600);
  }, wait);
}

(async () => {
  try {
    await Promise.allSettled([loadCatalog(), loadCoupons(), loadEvents(), loadSettings()]);
    await render(); // awaited so the splash never lifts before the page (or maintenance) is painted
    updateCounts();
    await Promise.race([
      (async () => {
        try { if (document.fonts) await document.fonts.ready; } catch {}
        await windowLoaded();
        await mediaSettled();
      })(),
      new Promise((res) => setTimeout(res, 12000)), // hard cap
    ]);
  } finally {
    hideSplash();
  }
})();

// ---------- Scroll effects: header shadow + back-to-top ----------
{
  const header = document.getElementById("siteHeader");
  const toTop = document.getElementById("toTop");
  const onScroll = () => {
    header.classList.toggle("scrolled", window.scrollY > 8);
    toTop.hidden = window.scrollY < 600;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }));
}
