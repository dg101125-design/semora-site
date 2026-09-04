/* SEMORA — quote builder. Vanilla, deterministic: every figure is
   published on the page itself. No AI, no variables, no "it depends".
   Every item carries its own price and delivery time; totals are sums.
   One rule: the monthly menu never exceeds Managed Growth Pod / Held. */
(function () {
  "use strict";

  var CAP = 13500; /* Managed Growth Pod / Held — the full monthly engine */
  var BUNDLES = {
    /* Commercial Growth Signal is a single core item ($3,000, v1.4 2 Sep
       2026) — no bundle detection needed for a one-item group. The haus
       bundle is brand + CUSTOM-BUILT website + proposals + CRM: the
       showcase website deliberately carries no data-g, so the four-piece
       detection (and the $36,500 sum) survives the v1.4 website split. */
    haus:   { n: 4, label: "Growth Foundation Build — the system", price: 36500,
              note: "delivery 8–10 weeks · brand + website + proposals + CRM, one team" }
  };

  var root = document.getElementById("qb");
  if (!root) return;
  var sumEl = document.getElementById("qb-lines");
  var totEl = document.getElementById("qb-totals");
  var boxes = root.querySelectorAll("input[type=checkbox]");
  var qtys = root.querySelectorAll("input[type=number]");
  var payBtn = document.getElementById("qb-pay");
  var payNote = document.getElementById("qb-paynote");
  var payEnabled = false;      /* /api/checkout GET says whether Stripe is connected */
  var payable = [];            /* the current one-off selection, labels + qty */
  var oneOffNow = 0;

  function fmt(n) { return "$" + n.toLocaleString("en-AU"); }

  function payVisibility() {
    var show = payEnabled && oneOffNow > 0;
    if (payBtn) payBtn.hidden = !show;
    if (payNote) payNote.hidden = !show;
  }

  function build() {
    var lines = [];
    var oneOff = 0, moMenu = 0;
    payable = [];

    /* bundle detection: all core items of a group ticked → one product line */
    var bundled = {};
    Object.keys(BUNDLES).forEach(function (g) {
      var all = root.querySelectorAll('input[data-g="' + g + '"]');
      var on = root.querySelectorAll('input[data-g="' + g + '"]:checked');
      if (all.length === BUNDLES[g].n && on.length === BUNDLES[g].n) bundled[g] = true;
    });
    Object.keys(bundled).forEach(function (g) {
      var b = BUNDLES[g];
      lines.push([b.label, fmt(b.price), b.note]);
      oneOff += b.price;
    });

    boxes.forEach(function (el) {
      if (!el.checked) return;
      if (el.dataset.g && bundled[el.dataset.g]) return; /* folded into bundle */
      var p = parseInt(el.dataset.p, 10) || 0;
      if (el.dataset.mo) {
        lines.push([el.dataset.label, fmt(p) + " / mo", "monthly · 6-month minimum"]);
        moMenu += p;
      } else {
        var note = el.dataset.t ? "delivery " + el.dataset.t : "";
        if (el.dataset.note) note += " · " + el.dataset.note;
        lines.push([el.dataset.label, fmt(p), note]);
        oneOff += p;
        payable.push({ label: el.dataset.label });
      }
    });
    /* the bundle's own cores go to the server as their four labels — the
       checkout endpoint folds them to the published bundle line itself */
    Object.keys(bundled).forEach(function (g) {
      root.querySelectorAll('input[data-g="' + g + '"]').forEach(function (el) {
        payable.push({ label: el.dataset.label });
      });
    });

    qtys.forEach(function (el) {
      var n = Math.max(0, parseInt(el.value, 10) || 0);
      if (!n) return;
      var p = (parseInt(el.dataset.p, 10) || 0) * n;
      lines.push([el.dataset.label + " × " + n, fmt(p),
        el.dataset.t ? "delivery " + el.dataset.t : ""]);
      oneOff += p;
      payable.push({ label: el.dataset.label, qty: n });
    });

    var capped = moMenu > CAP;
    var monthly = capped ? CAP : moMenu;

    /* render */
    if (!lines.length) {
      sumEl.innerHTML = '<p class="qb-empty">Build up what you need — each item is priced and timed. We quote the package for you.</p>';
      totEl.innerHTML = "";
      oneOffNow = 0;        /* Codex r1: the pay button went stale when the
                               selection emptied — this branch returns early */
      payVisibility();
      return;
    }
    sumEl.innerHTML = lines.map(function (l) {
      return '<div class="qb-line"><div><span>' + l[0] + "</span><em>" + l[2] + "</em></div><b>" + l[1] + "</b></div>";
    }).join("");

    var t = "";
    if (oneOff) {
      t += '<div class="qb-total"><span>One-off</span><b>' + fmt(oneOff) + "</b></div>";
    }
    if (monthly) {
      t += '<div class="qb-total"><span>Monthly</span><b>' +
        (capped ? "<s>" + fmt(moMenu) + "</s> " : "") + fmt(monthly) + " / mo</b></div>";
      if (capped) {
        t += '<p class="qb-cap">Managed Growth Pod / Held cap applied — the full engine ' +
          "never costs more than " + fmt(CAP) + " a month.</p>";
      }
    }
    t += '<p class="qb-fine">GST applies on purchase.</p>';
    totEl.innerHTML = t;
    oneOffNow = oneOff;
    payVisibility();
  }

  function quoteText() {
    var out = "SEMORA STUDIO — quote request " + new Date().toLocaleDateString("en-AU") + "\n\n";
    sumEl.querySelectorAll(".qb-line").forEach(function (l) {
      out += l.querySelector("span").textContent + " — " + l.querySelector("b").textContent +
        " (" + l.querySelector("em").textContent + ")\n";
    });
    totEl.querySelectorAll(".qb-total").forEach(function (l) {
      out += l.querySelector("span").textContent + ": " + l.querySelector("b").textContent + "\n";
    });
    out += "GST applies on purchase.\n";
    return out;
  }

  boxes.forEach(function (b) { b.addEventListener("change", build); });
  qtys.forEach(function (q) { q.addEventListener("input", build); });
  var mail = document.getElementById("qb-mail");
  if (mail) mail.addEventListener("click", function () {
    mail.href = "mailto:team@semora.com.au?subject=" +
      encodeURIComponent("Quote request — via semora.com.au/quote") +
      "&body=" + encodeURIComponent(quoteText() + "\nMy details:\nName:\nPractice:\nPhone:\n");
  });
  /* the print sheet's date and reference — filled whenever a print
     actually starts (the button, Ctrl-P, the browser menu: beforeprint
     covers them all — Codex r1 caught the button-only version) */
  function fillSheet() {
    var d = document.getElementById("qsheet-date");
    var r = document.getElementById("qsheet-ref");
    var now = new Date();
    if (d) d.textContent = now.toLocaleDateString("en-AU",
      { day: "numeric", month: "long", year: "numeric" });
    if (r) r.textContent = "Q" + now.toISOString().slice(0, 10).replace(/-/g, "") +
      "-" + String(now.getTime() % 1000).padStart(3, "0");
  }
  window.addEventListener("beforeprint", fillSheet);
  var pr = document.getElementById("qb-print");
  if (pr) pr.addEventListener("click", function () {
    fillSheet();
    window.print();
  });

  /* ── payment (founder order, 4 Sep 2026) ─────────────────────────────
     The button exists only when /api/checkout says a payment account is
     connected AND the selection holds one-off items. The charge itself is
     rebuilt server-side from the generated price table — what is sent
     here is only WHICH items, never what they cost. */
  if (payBtn) {
    fetch("/api/checkout", { method: "GET" })
      .then(function (r) { return r.json(); })
      .then(function (cfg) { payEnabled = !!(cfg && cfg.enabled); payVisibility(); })
      .catch(function () { payEnabled = false; });
    payBtn.addEventListener("click", function () {
      if (!payable.length) return;
      payBtn.disabled = true;
      payBtn.textContent = "Opening secure payment…";
      fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: payable })
      }).then(function (r) { return r.json(); }).then(function (out) {
        if (out && out.url) { window.location.href = out.url; return; }
        payBtn.disabled = false;
        payBtn.textContent = "Pay Now";
        if (payNote) payNote.textContent = (out && out.error) ||
          "Payment could not start. Email the quote instead — same numbers.";
      }).catch(function () {
        payBtn.disabled = false;
        payBtn.textContent = "Pay Now";
        if (payNote) payNote.textContent =
          "Payment could not start. Email the quote instead — same numbers.";
      });
    });
  }

  /* the return leg: Stripe sends the buyer back with ?payment=…&session_id=….
     "Payment received" prints ONLY after the server has asked Stripe and
     Stripe said paid — a typed URL gets the neutral line (Codex r1: the
     banner was forgeable). */
  var status = document.getElementById("qb-paystatus");
  if (status) {
    var q = new URLSearchParams(window.location.search);
    var pv = q.get("payment");
    var sid = q.get("session_id") || "";
    if (pv === "success" && sid) {
      status.hidden = false;
      status.className = "qb-paystatus";
      status.textContent = "Checking the payment…";
      fetch("/api/checkout?session_id=" + encodeURIComponent(sid))
        .then(function (r) { return r.json(); })
        .then(function (v) {
          if (v && v.paid) {
            status.className = "qb-paystatus qb-paystatus--ok";
            status.textContent = "Payment received — the receipt is in your " +
              "email, and we reply within one business day to start delivery.";
          } else {
            status.textContent = "We could not confirm a payment for this " +
              "visit. If you paid, the Stripe receipt in your email is the " +
              "record — nothing further is needed.";
          }
        })
        .catch(function () {
          status.textContent = "We could not confirm a payment for this " +
            "visit. If you paid, the Stripe receipt in your email is the " +
            "record — nothing further is needed.";
        });
    } else if (pv === "cancelled") {
      status.hidden = false;
      status.className = "qb-paystatus";
      status.textContent = "Payment was cancelled — nothing was charged. " +
        "Your selection is still here.";
    }
  }

  build();
})();
