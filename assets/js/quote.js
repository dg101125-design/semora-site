/* SIGNALHÄUS — quote builder. Vanilla, deterministic: every figure comes
   from the published fee schedule. No AI, no variables, no "it depends". */
(function () {
  "use strict";

  var P = {
    audit: 3000,
    signalCore: 14000,
    hausMin: 38000, hausMax: 58000,
    tiers: { directed: 4200, shared: 7400, held: 13500 },
    tierNames: { directed: "MOMENTUM / Directed", shared: "MOMENTUM / Shared", held: "MOMENTUM / Held" },
    tierTime: { directed: "~3 hrs of your week", shared: "~1 hr of your week", held: "~1 hr of your month" }
  };

  var root = document.getElementById("qb");
  if (!root) return;
  var sumEl = document.getElementById("qb-lines");
  var totEl = document.getElementById("qb-totals");
  var tierWrap = document.getElementById("qb-tier");
  var boxes = root.querySelectorAll("input[type=checkbox]");
  var qtys = root.querySelectorAll("input[type=number]");
  var tierOverride = "";

  function fmt(n) { return "$" + n.toLocaleString("en-AU"); }

  function checked(group) {
    return root.querySelectorAll('input[data-g="' + group + '"]:checked').length;
  }
  function qty(id) {
    var el = root.querySelector('input[data-q="' + id + '"]');
    return el ? Math.max(0, parseInt(el.value, 10) || 0) : 0;
  }

  function recommendTier(ongoing, ads) {
    if (!ongoing) return "";
    if (ads || ongoing >= 5) return "held";
    if (ongoing >= 3) return "shared";
    return "directed";
  }

  function build() {
    var lines = [];
    var oneMin = 0, oneMax = 0, monthly = 0;

    if (root.querySelector('input[data-g="audit"]:checked')) {
      lines.push(["The Proof Audit — 2 weeks", fmt(P.audit), "credited in full within 90 days"]);
      oneMin += P.audit; oneMax += P.audit;
    }

    if (checked("strategy")) {
      lines.push(["SIGNAL / — the position — 4 weeks", fmt(P.signalCore), "core scope"]);
      oneMin += P.signalCore; oneMax += P.signalCore;
      root.querySelectorAll('input[data-g="strategy"][data-price]:checked').forEach(function (el) {
        var p = parseInt(el.dataset.price, 10);
        lines.push([" + " + el.dataset.label, fmt(p), "SIGNAL / module"]);
        oneMin += p; oneMax += p;
      });
    }

    if (checked("build")) {
      lines.push(["/ HAUS — the system — 8–10 weeks", fmt(P.hausMin) + "–" + fmt(P.hausMax), "fixed at kickoff on scope"]);
      oneMin += P.hausMin; oneMax += P.hausMax;
    }
    var xp = qty("xpages");
    if (xp) {
      lines.push(["Website pages beyond eight × " + xp, fmt(850 * xp), "$850 per page"]);
      oneMin += 850 * xp; oneMax += 850 * xp;
    }

    var ongoing = checked("capture") + checked("authority") + checked("retain");
    var ads = !!root.querySelector('input[data-id="ads"]:checked');
    var rec = recommendTier(ongoing, ads);
    var tier = (tierOverride && ongoing) ? tierOverride : rec;
    if (tier) {
      var note = P.tierTime[tier] + " · 6-month minimum";
      if (ads && tier === "held") note += " · ad spend to $15k/mo included";
      if (ads && tier !== "held") note += " · paid media optional, + fee, at this tier";
      lines.push([P.tierNames[tier] + " — monthly engine", fmt(P.tiers[tier]) + " / mo", note]);
      monthly = P.tiers[tier];
    }

    root.querySelectorAll('input[data-g="extras"][data-price]:checked').forEach(function (el) {
      var p = parseInt(el.dataset.price, 10);
      lines.push([el.dataset.label, fmt(p), el.dataset.unit || "fixed add-on"]);
      oneMin += p; oneMax += p;
    });
    var cs = qty("cases");
    if (cs) {
      lines.push(["Case studies, proof standard × " + cs, fmt(1800 * cs), "$1,800 each"]);
      oneMin += 1800 * cs; oneMax += 1800 * cs;
    }

    /* render */
    if (!lines.length) {
      sumEl.innerHTML = '<p class="qb-empty">Tick what you need — the quote assembles itself from the published fee schedule.</p>';
      totEl.innerHTML = "";
      tierWrap.hidden = true;
      return;
    }
    sumEl.innerHTML = lines.map(function (l) {
      return '<div class="qb-line"><div><span>' + l[0] + "</span><em>" + l[2] + "</em></div><b>" + l[1] + "</b></div>";
    }).join("");

    var t = "";
    if (oneMin) {
      t += '<div class="qb-total"><span>One-off</span><b>' +
        (oneMin === oneMax ? fmt(oneMin) : fmt(oneMin) + "–" + fmt(oneMax)) + "</b></div>";
    }
    if (monthly) {
      t += '<div class="qb-total"><span>Monthly</span><b>' + fmt(monthly) + " / mo</b></div>";
    }
    t += '<p class="qb-fine">All + GST. The audit credits in full against any engagement within 90 days. Generated from the published fee schedule — identical for every client.</p>';
    totEl.innerHTML = t;

    /* tier picker */
    if (ongoing) {
      tierWrap.hidden = false;
      tierWrap.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("is-on", b.dataset.tier === tier);
        b.classList.toggle("is-rec", b.dataset.tier === rec);
      });
    } else { tierWrap.hidden = true; tierOverride = ""; }
  }

  function quoteText() {
    var out = "SIGNALHAUS — quote request " + new Date().toLocaleDateString("en-AU") + "\n";
    var pt = root.querySelector('input[name="ptype"]:checked');
    if (pt) out += "Practice: " + pt.value + "\n";
    out += "\n";
    sumEl.querySelectorAll(".qb-line").forEach(function (l) {
      out += l.querySelector("span").textContent + " — " + l.querySelector("b").textContent + "\n";
    });
    totEl.querySelectorAll(".qb-total").forEach(function (l) {
      out += l.querySelector("span").textContent + ": " + l.querySelector("b").textContent + "\n";
    });
    out += "All + GST.\n";
    return out;
  }

  boxes.forEach(function (b) { b.addEventListener("change", build); });
  qtys.forEach(function (q) { q.addEventListener("input", build); });
  tierWrap.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () { tierOverride = b.dataset.tier; build(); });
  });
  var mail = document.getElementById("qb-mail");
  if (mail) mail.addEventListener("click", function () {
    mail.href = "mailto:team@signalhaus.au?subject=" +
      encodeURIComponent("Quote request — via signalhaus.au/quote") +
      "&body=" + encodeURIComponent(quoteText() + "\nMy details:\nName:\nPractice:\nPhone:\n");
  });
  var pr = document.getElementById("qb-print");
  if (pr) pr.addEventListener("click", function () { window.print(); });

  build();
})();
