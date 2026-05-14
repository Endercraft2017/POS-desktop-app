// Reads ?card=<5-digit> from the URL, fetches /api/loyalty/public-card?code=…,
// and renders a personalized loyalty view in the homepage's #loyalty-view div.
// No build step, vanilla JS, runs on https://3ks.afkcube.com/?card=NNNNN.

(function () {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("card");
  if (!code) return; // Bare homepage — leave the default landing visible.

  const defaultView = document.getElementById("default-view");
  const loyaltyView = document.getElementById("loyalty-view");
  if (!loyaltyView) return;
  if (defaultView) defaultView.hidden = true;
  loyaltyView.hidden = false;
  loyaltyView.innerHTML = `<p class="loading">Loading your card…</p>`;

  fetch(`/api/loyalty/public-card?code=${encodeURIComponent(code)}`)
    .then((r) => r.json())
    .then((data) => {
      if (data.error === "rate_limited" || data.error === "too many requests") {
        loyaltyView.innerHTML = `
          <h1>Slow down a moment</h1>
          <p class="error">Too many requests right now. Please try again in a minute.</p>`;
        return;
      }
      if (!data.exists) {
        loyaltyView.innerHTML = `
          <h1>Card not found</h1>
          <p class="error">
            The card number <code>${escapeHtml(code)}</code> isn't in our system yet.
            Bring it to the counter and a staff member will set it up.
          </p>`;
        return;
      }
      render(loyaltyView, code, data);
    })
    .catch(() => {
      loyaltyView.innerHTML = `
        <h1>Something went wrong</h1>
        <p class="error">Please try again in a moment.</p>`;
    });

  function render(root, code, data) {
    const greeting = data.name
      ? `Hi <strong>${escapeHtml(data.name)}</strong>!`
      : `Hello!`;
    const filledInRow = (tier) =>
      Math.min(Math.max(data.stamps - (tier - 1) * 3, 0), 3);
    const rewardLabel = ["Medium Fries", "Large Powder Shake", "Empanada Special"];
    const rewardIcon = [
      "/loyalty/medium-fries.png",
      "/loyalty/large-shake.png",
      "/loyalty/empanada-special.png",
    ];
    const stampIcon = "/loyalty/stamp.png";
    const claimedBits = [
      !!data.rewards.tier1_claimed,
      !!data.rewards.tier2_claimed,
      !!data.rewards.tier3_claimed,
    ];

    const nextTier = [1, 2, 3].find((t) => filledInRow(t) < 3);
    let nextMsg;
    if (nextTier) {
      const need = 3 - filledInRow(nextTier);
      nextMsg = `${need} more stamp${need === 1 ? "" : "s"} to unlock ${rewardLabel[nextTier - 1]}!`;
    } else {
      nextMsg = "You've claimed every reward on this card — show it next visit for a new one!";
    }

    root.innerHTML = `
      <header class="hero">
        <h1>${greeting}</h1>
        <p class="subtitle">Your 3Ks loyalty card</p>
      </header>

      <section class="qr-block">
        <img class="qr"
             src="/app/loyalty-cards/${encodeURIComponent(code)}.png"
             alt="Your loyalty QR">
        <p class="code">Card no. <strong>${escapeHtml(code)}</strong></p>
      </section>

      <section class="grid">
        ${[1, 2, 3]
          .map((tier) => {
            const filled = filledInRow(tier);
            const claimed = claimedBits[tier - 1];
            const ready = filled === 3 && !claimed;
            const cells = [0, 1, 2]
              .map((i) =>
                i < filled
                  ? `<div class="stamp filled"><img src="${stampIcon}" alt=""></div>`
                  : `<div class="stamp"></div>`,
              )
              .join("");
            const state = claimed ? "claimed" : ready ? "ready" : "locked";
            const stateLabel = claimed
              ? "✓ Claimed"
              : ready
              ? "Claim next visit"
              : `${3 - filled} to go`;
            return `
              <div class="row">
                ${cells}
                <div class="reward ${state}">
                  <img class="reward-icon" src="${rewardIcon[tier - 1]}" alt="">
                  <div class="reward-text">
                    <span class="reward-label">${rewardLabel[tier - 1]}</span>
                    <span class="reward-state">${stateLabel}</span>
                  </div>
                </div>
              </div>
            `;
          })
          .join("")}
      </section>

      <p class="next">${nextMsg}</p>
      <p class="hint">Show this page (or the printed card) at the counter to earn stamps.</p>
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }
})();
