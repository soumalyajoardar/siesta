const fs = require('fs');
let c = fs.readFileSync('js/pages/account.js', 'utf8');

c = c.replace(
  'toast("Thanks — your message has been sent to our team.");',
  'toast("Our system will connect you to a live representative shortly!");'
);
c = c.replace(
  'toast("Thanks - your message has been sent to our team.");',
  'toast("Our system will connect you to a live representative shortly!");'
);
c = c.replace(
  /toast\("Thanks.*?message has been sent.*?"\);/,
  'toast("Our system will connect you to a live representative shortly!");'
);


const aboutOld = `<p>Siesta is a small Indian fashion label focused on considered everyday clothing — heavyweight T-shirts, honest denim, brushed fleece and outerwear built for real life. We design in limited runs, publish full fabric details, and price fairly without inflated “was” prices.</p><h2>What we won't do</h2>`;
const aboutNew = `<p>Siesta is a small Indian fashion label focused on considered everyday clothing — heavyweight T-shirts, honest denim, brushed fleece and outerwear built for real life. We design in limited runs, publish full fabric details, and price fairly without inflated “was” prices.</p><p>Founded and led by <strong>Soumalya Joardar</strong>, CEO of Siesta India.</p><h2>What we won't do</h2>`;

c = c.replace(aboutOld, aboutNew);

// fallback if unicode chars mismatch
c = c.replace(/clothing [^ ]+ heavyweight T-shirts, honest denim, brushed fleece and outerwear built for real life\. We design in limited runs, publish full fabric details, and price fairly without inflated [^ ]+ prices\.<\/p><h2>What we won't do<\/h2>/,
  'clothing — heavyweight T-shirts, honest denim, brushed fleece and outerwear built for real life. We design in limited runs, publish full fabric details, and price fairly without inflated “was” prices.</p><p>Founded and led by <strong>Soumalya Joardar</strong>, CEO of Siesta India.</p><h2>What we won\'t do</h2>'
);

fs.writeFileSync('js/pages/account.js', c);
console.log("Patched contact and about pages");
