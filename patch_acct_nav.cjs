const fs = require('fs');

let c = fs.readFileSync('css/app.css', 'utf8');
const oldCss = `.acct-nav { display: flex; gap: 0.4rem; overflow-x: auto; white-space: nowrap; scroll-snap-type: x mandatory; padding: 0.5rem; scrollbar-width: none; border: none; background: transparent; position: relative; top: 0; }
  .acct-nav::-webkit-scrollbar { display: none; }
  .acct-nav a, .acct-nav button { flex: 0 0 auto; scroll-snap-align: center; border: 1px solid var(--line); border-radius: 999px; padding: 0.5rem 1rem; }
  .acct-nav a[aria-current="page"] { background: var(--ink); color: #fff; border-color: var(--ink); }`;

const newCss = `.acct-sidebar { position: relative; top: 0; z-index: 10; margin-bottom: 1rem; }
  .acct-mobile-toggle { display: flex; justify-content: space-between; align-items: center; width: 100%; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 0.9rem 1.2rem; font-weight: 700; cursor: pointer; color: var(--ink); }
  .acct-nav { display: none; background: #fff; border: 1px solid var(--line); border-radius: 0 0 12px 12px; flex-direction: column; position: absolute; left: 0; right: 0; top: 100%; margin-top: -6px; border-top: none; padding: 0.4rem; box-shadow: var(--shadow-sm); z-index: 10; }
  .acct-nav.open { display: flex; animation: dropIn 0.2s var(--ease); }
  .acct-mobile-toggle[aria-expanded="true"] { border-radius: 12px 12px 0 0; }
  .acct-mobile-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
  .acct-nav a, .acct-nav button { padding: 0.7rem 1rem; border-radius: 8px; }
  .acct-nav button { text-align: left; margin: 0 !important; }
  @keyframes dropIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }`;

c = c.replace(oldCss, newCss);

// Add .acct-mobile-toggle { display: none; } base rule
c = c.replace('.acct{display:grid;grid-template-columns:250px 1fr;gap:1.4rem;align-items:start}',
  '.acct{display:grid;grid-template-columns:250px 1fr;gap:1.4rem;align-items:start}\n.acct-mobile-toggle { display: none; }\n.acct-sidebar { position: sticky; top: calc(var(--header-h) + 12px); }');

c = c.replace('.acct-nav{background:#fff;border:1px solid var(--line);border-radius:12px;padding:.6rem;position:sticky;top:calc(var(--header-h) + 12px)}',
  '.acct-nav{background:#fff;border:1px solid var(--line);border-radius:12px;padding:.6rem;}');


fs.writeFileSync('css/app.css', c);

let ac = fs.readFileSync('js/pages/account.js', 'utf8');

const oldHtml = `<nav class="acct-nav" style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:.6rem;position:sticky;top:calc(var(--header-h) + 12px)">
          \${NAV.map(([id, l]) => \`<a href="/account/\${id}" data-link \${tab === id ? 'aria-current="page"' : ""}>\${l}</a>\`).join("")}
          <a href="/track" data-link>Track Order</a>
          <a href="/wishlist" data-link>Wishlist</a>
          <button class="link-btn" id="logoutBtn" style="width:100%;text-align:left;padding:.65rem .85rem;margin-top:.4rem;color:var(--danger);font-weight:600;display:block">Log out</button>
        </nav>`;

const newHtml = `<div class="acct-sidebar">
          <button class="acct-mobile-toggle" id="acctMobileToggle" aria-expanded="false">
            <span>\${NAV.find(x => x[0] === tab)?.[1] || (tab === 'wishlist' ? 'Wishlist' : (tab === 'track' ? 'Track Order' : 'Menu'))}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <nav class="acct-nav" id="acctNav">
            \${NAV.map(([id, l]) => \`<a href="/account/\${id}" data-link \${tab === id ? 'aria-current="page"' : ""}>\${l}</a>\`).join("")}
            <a href="/track" data-link>Track Order</a>
            <a href="/wishlist" data-link>Wishlist</a>
            <button class="link-btn" id="logoutBtn" style="width:100%;text-align:left;padding:.65rem .85rem;margin-top:.4rem;color:var(--danger);font-weight:600;display:block">Log out</button>
          </nav>
        </div>`;

ac = ac.replace(oldHtml, newHtml);

// And wire the click event in the timeout function
const oldSetTimeout = `setTitle("My Account — Siesta", "Manage orders, addresses and settings.");
    setTimeout(async () => {
      if (!document.getElementById("acctMain")) return;`;

const newSetTimeout = `setTitle("My Account — Siesta", "Manage orders, addresses and settings.");
    setTimeout(async () => {
      if (!document.getElementById("acctMain")) return;
      const tgl = document.getElementById("acctMobileToggle");
      const nav = document.getElementById("acctNav");
      if (tgl && nav) {
        tgl.onclick = () => {
          const open = nav.classList.toggle("open");
          tgl.setAttribute("aria-expanded", String(open));
        };
        nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
          nav.classList.remove("open");
          tgl.setAttribute("aria-expanded", "false");
        }));
      }`;

ac = ac.replace(oldSetTimeout, newSetTimeout);

fs.writeFileSync('js/pages/account.js', ac);
console.log("Patched account mobile nav.");
