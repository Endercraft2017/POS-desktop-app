// Express route: GET /api/loyalty/public-card?code=NNNNN
// Public endpoint (no Bearer auth) — meant for the homepage's customer
// landing view rendered from a QR scan.
//
// Returns ONLY public-safe fields: name, stamps, reward-claimed booleans.
// Per Q3 (decisions) we don't store phone/email, but if future columns are
// added they must NEVER appear in this response.
//
// Rate-limited in-process (30 req / minute / IP) to make 90,000-code
// enumeration infeasible.

const RATE_LIMIT = { windowMs: 60_000, max: 30 };

function registerPublic(app, getDatabase) {
  const buckets = new Map();

  function rateLimitOk(req) {
    const now = Date.now();
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const bucket = buckets.get(ip) || { count: 0, windowStart: now };
    if (now - bucket.windowStart > RATE_LIMIT.windowMs) {
      bucket.count = 0;
      bucket.windowStart = now;
    }
    bucket.count++;
    buckets.set(ip, bucket);
    return bucket.count <= RATE_LIMIT.max;
  }

  app.get("/api/loyalty/public-card", (req, res) => {
    if (!rateLimitOk(req)) {
      return res.status(429).json({ error: "rate_limited" });
    }
    const code = String(req.query.code || "");
    if (!/^\d{5}$/.test(code)) {
      return res.status(400).json({ error: "invalid_code" });
    }
    try {
      const db = getDatabase();
      const row = db
        .prepare(
          `SELECT customer_name, stamps, rewards_claimed_mask
             FROM loyalty_cards
            WHERE code = ? AND deleted_at IS NULL
            LIMIT 1`,
        )
        .get(code);
      if (!row) {
        // 200 with exists:false so the response shape doesn't differentiate
        // "no card" from "card exists but unnamed" too sharply for enumeration.
        return res.json({ exists: false });
      }
      return res.json({
        exists: true,
        code,
        name: row.customer_name || null,
        stamps: row.stamps,
        rewards: {
          tier1_claimed: !!(row.rewards_claimed_mask & 1),
          tier2_claimed: !!(row.rewards_claimed_mask & 2),
          tier3_claimed: !!(row.rewards_claimed_mask & 4),
        },
      });
    } catch (e) {
      console.error("[loyalty-public] error:", e.message);
      return res.status(500).json({ error: "server_error" });
    }
  });
}

module.exports = { registerPublic };
