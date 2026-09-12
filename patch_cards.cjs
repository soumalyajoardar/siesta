const fs = require('fs');
let c = fs.readFileSync('css/app.css', 'utf8');

c = c.replace(
  '.p-card{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;transition:transform .32s var(--ease),box-shadow .32s;position:relative}',
  '.p-card{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;transition:transform .32s var(--ease),box-shadow .32s;position:relative;height:100%}'
);

c = c.replace(
  '.p-body{padding:.9rem .95rem 1rem;display:flex;flex-direction:column;gap:.3rem}',
  '.p-body{padding:.9rem .95rem 1rem;display:flex;flex-direction:column;gap:.3rem;flex-grow:1;justify-content:space-between}'
);
c = c.replace(
  '.p-actions{display:flex;gap:.5rem;margin-top:.6rem}',
  '.p-actions{display:flex;gap:.5rem;margin-top:auto;padding-top:.6rem}'
);

fs.writeFileSync('css/app.css', c);
console.log("Patched product cards");
