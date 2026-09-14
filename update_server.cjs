const fs = require('fs');

let content = fs.readFileSync('server/index.cjs', 'utf-8');

// Replace everything between `/* ---------------- delivery automation` and `async function withAutomation`
const startMarker = '/* ---------------- delivery automation (standard orders, one stage per day) ---------------- */';
const endMarker = 'async function withAutomation(orders) {';
const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

const newAutomation = `/* ---------------- delivery automation (chronological, every order) ---------------- */
function applyAutomation(orders, now) {
  let changed = false;
  const STAGES_ARR = ["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
  for (const o of orders) {
    if (o.status === "cancelled" || o.status === "delivered") continue;
    
    const created = new Date(o.createdAt);
    const day0 = new Date(created);
    day0.setHours(0, 0, 0, 0);
    const ms = 24 * 60 * 60 * 1000;
    
    const thresholds = [
      { status: "processing", at: new Date(day0.getTime() + 1 * ms).setHours(17, 0, 0, 0) },
      { status: "packed", at: new Date(day0.getTime() + 2 * ms).setHours(17, 0, 0, 0) },
      { status: "shipped", at: new Date(day0.getTime() + 3 * ms).setHours(17, 0, 0, 0) },
      { status: "out_for_delivery", at: new Date(day0.getTime() + 4 * ms).setHours(10, 0, 0, 0) },
      { status: "delivered", at: new Date(day0.getTime() + 4 * ms).setHours(17, 0, 0, 0) }
    ];
    
    const currIdx = STAGES_ARR.indexOf(o.status);
    let targetIdx = currIdx;
    for (let i = 0; i < thresholds.length; i++) {
      if (now.getTime() >= thresholds[i].at) {
        const tIdx = STAGES_ARR.indexOf(thresholds[i].status);
        if (tIdx > targetIdx) targetIdx = tIdx;
      }
    }
    
    if (targetIdx > currIdx) {
      for (let i = currIdx + 1; i <= targetIdx; i++) {
        const next = STAGES_ARR[i];
        const th = thresholds.find((t) => t.status === next);
        o.status = next;
        // Apply historical exact timestamps if we're catching up, so timeline looks perfectly scheduled
        const runAt = Math.min(now.getTime(), th.at);
        o.timeline.push({ stage: next, at: new Date(runAt).toISOString(), note: STAGE_NOTES[next] });
      }
      changed = true;
    }
  }
  return changed;
}
`;

content = content.substring(0, startIndex) + newAutomation + content.substring(endIndex);

// Remove the automate route
const routeStart = 'app.post("/api/admin/orders/:orderNo/automate"';
const routeStartIndex = content.indexOf(routeStart);
if (routeStartIndex !== -1) {
  // Find the end of this block which ends with `});\napp.patch("/api/admin/orders/:orderNo"`
  const routeEndStr = 'app.patch("/api/admin/orders/:orderNo"';
  const routeEndIndex = content.indexOf(routeEndStr, routeStartIndex);
  if (routeEndIndex !== -1) {
    content = content.substring(0, routeStartIndex) + content.substring(routeEndIndex);
  }
}

// Remove o.auto check in patch
content = content.replace('if (o.auto && o.auto.active) return res.status(400).json({ error: "Automation is running on this order — manual changes are locked." });\n', '');

fs.writeFileSync('server/index.cjs', content, 'utf-8');
