const Database = require('better-sqlite3');
const fs = require('fs');
const out = [];
const log = (...args) => out.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));

const db = new Database('D:/tseri/AppData/Roaming/@pos/desktop/pos.db');

const now = new Date();
const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
log('Today range:', startOfDay, '->', endOfDay);

const summary = db.prepare(`SELECT COALESCE(SUM(o.total), 0) as revenue,
       COALESCE(SUM((SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0)
                     FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
                     WHERE oi.order_id = o.id AND oi.deleted_at IS NULL)), 0) as cogs,
       COUNT(*) as orders
FROM orders o
WHERE o.deleted_at IS NULL AND o.status = 'completed'
  AND o.created_at >= ? AND o.created_at <= ?`).get(startOfDay, endOfDay);
log('Today summary (DB query):', summary);
log('Gross profit (DB):', (summary.revenue - summary.cogs).toFixed(2));

const items = db.prepare(`SELECT oi.product_name, oi.quantity, oi.unit_price, oi.total as line_total, p.cost_price
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id
JOIN orders o ON o.id = oi.order_id
WHERE oi.deleted_at IS NULL AND o.deleted_at IS NULL AND o.status = 'completed'
  AND o.created_at >= ? AND o.created_at <= ?`).all(startOfDay, endOfDay);
log('Per-item breakdown:', items.length, 'rows');
let revSum = 0, cogsSum = 0, missingCost = 0;
for (const r of items) {
  const lineCost = r.quantity * (r.cost_price || 0);
  revSum += r.line_total;
  cogsSum += lineCost;
  if (!r.cost_price) missingCost++;
  log(`  ${r.product_name} | qty=${r.quantity} | unit=${r.unit_price} | line=${r.line_total} | cost/u=${r.cost_price ?? 'NULL'} | line_cost=${lineCost.toFixed(2)}`);
}
log('Sum of line totals:', revSum.toFixed(2));
log('Sum of line costs:', cogsSum.toFixed(2));
log('Expected gross profit:', (revSum - cogsSum).toFixed(2));
log('Items missing cost_price:', missingCost);

db.close();
fs.writeFileSync('d:/Kyle/business/POS-desktop-app/check-profit.out.txt', out.join('\n'));
console.log('Wrote output');
