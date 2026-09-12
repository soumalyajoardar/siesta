const fs = require('fs');
let c = fs.readFileSync('css/app.css', 'utf8');
c = c.replace(
  '.hero-art{min-height:230px;order:-1}',
  '.hero-art{min-height:230px;height:350px;order:-1}'
);
// Make sure product media strictly handles aspect-ratio
c = c.replace(
  '.p-media{position:relative;aspect-ratio:4/5;background:var(--sand);overflow:hidden}',
  '.p-media{position:relative;aspect-ratio:4/5;background:var(--sand);overflow:hidden;width:100%;height:auto}'
);

fs.writeFileSync('css/app.css', c);
console.log("Patched hero and product media heights");
