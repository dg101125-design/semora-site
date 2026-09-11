/* SEMORA — quote builder. Vanilla, deterministic: every figure is
   published on the page itself. No AI, no variables, no "it depends".
   Every item carries its own price and delivery time; totals are sums.
   One rule: the monthly menu never exceeds Managed Growth Pod / Held. */
(function () {
  "use strict";

  var CAP = 13500; /* Managed Growth Pod / Held — the full monthly engine */
  /* The haus bundle fold RETIRED 5 Sep 2026 with the founder's GFB
     recomposition (v1.5): four pieces, new prices, no bundle price
     ordered — each line prices itself. */
  var BUNDLES = {};

  var root = document.getElementById("qb");
  if (!root) return;
  var sumEl = document.getElementById("qb-lines");
  var totEl = document.getElementById("qb-totals");
  var boxes = root.querySelectorAll("input[type=checkbox]");
  var qtys = root.querySelectorAll("input[type=number]");
  var payBtn = document.getElementById("qb-pay");
  var payNote = document.getElementById("qb-paynote");
  /* the closing action at the foot of the list (founder, 11 Sep 2026) */
  var payBtn2 = document.getElementById("qb-pay2");
  /* The arrow-fill button carries the label TWICE — once visible, once
     clipped inside the badge so it turns colour as the fill sweeps across.
     textContent would wipe both spans and the badge with them, so every
     label change goes through here. Falls back to textContent for any
     button that is not the arrow-fill kind. */
  function setLabel(b, text) {
    if (!b) return;
    var spans = b.querySelectorAll(".btn__t");
    if (!spans.length) { b.textContent = text; return; }
    for (var i = 0; i < spans.length; i++) spans[i].textContent = text;
  }
  /* the note's resting sentence, kept so an error can be undone */
  var PAY_NOTE = "Card payment covers the one-off items, + 10% GST, through " +
    "Stripe. Monthly items start by contract, with the same published numbers.";
  var closeTot = document.getElementById("qb-close-totals");
  var payEnabled = false;      /* /api/checkout GET says whether Stripe is connected */
  var payable = [];            /* the current one-off selection, labels + qty */
  var oneOffNow = 0;
  var monthlyNow = 0;          /* monthly total, for the print sheet */
  var cappedNow = false;       /* whether the Held cap trimmed the fixed menu */

  function fmt(n) { return "$" + n.toLocaleString("en-AU"); }

  /* ── selection persistence (audit B1, 7 Sep 2026) ────────────────────
     The cart lived in page state alone. Stripe's cancel URL is
     /quotation?payment=cancelled, so a cancelled checkout came back to an
     EMPTY builder under a banner reading "Your selection is still here" —
     true about the charge, false about the page. A refresh lost the
     selection the same way.

     What is stored: WHICH rows are ticked, the typed quantities, and the
     client's own budget figures. Never a price. Every figure is recomputed
     from the page's own data attributes on the way back in, and the charge
     is still rebuilt server-side from the generated price table, so
     persistence cannot move a number. sessionStorage, so it lives for the
     tab and dies with it. A saved row whose label has left the catalogue
     is dropped, because restore walks the LIVE inputs and looks each one
     up — never the other way round. */
  var STORE_KEY = "semora.quotation.v1";

  function keyOf(el) {
    if (el.dataset.bx) {
      /* a budget row's selector carries no label of its own — it borrows
         the amount box's, so the pair round-trips as one row */
      var lab = el.closest("label");
      var amt = lab && lab.querySelector("input[data-cmo]");
      return amt && amt.dataset.label ? "b:" + amt.dataset.label : "";
    }
    if (!el.dataset.label) return "";
    return (el.type === "number" ? "n:" : "c:") + el.dataset.label;
  }

  function saveState() {
    var state = { c: {}, n: {} };
    boxes.forEach(function (el) {
      var k = keyOf(el);
      if (k && el.checked) state.c[k] = 1;
    });
    qtys.forEach(function (el) {
      var k = keyOf(el);
      var v = parseInt(el.value, 10);
      if (k && v > 0) state.n[k] = v;
    });
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) { /* private mode, quota, storage off — the builder still works */ }
  }

  function restoreState() {
    var raw;
    try { raw = window.sessionStorage.getItem(STORE_KEY); } catch (e) { return; }
    if (!raw) return;
    var state;
    try { state = JSON.parse(raw); } catch (e) { return; }
    if (!state || typeof state !== "object") return;
    var c = state.c && typeof state.c === "object" ? state.c : {};
    var n = state.n && typeof state.n === "object" ? state.n : {};
    var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    qtys.forEach(function (el) {
      var k = keyOf(el);
      if (!k || !has(n, k)) return;
      var v = parseInt(n[k], 10);
      if (!(v > 0)) return;
      /* the markup's own max stays the law on the way back in, exactly as
         it is for typed input */
      var mx = parseInt(el.max, 10) || 99;
      el.value = String(Math.min(v, mx));
    });
    boxes.forEach(function (el) {
      var k = keyOf(el);
      if (!k) return;
      if (el.dataset.bx) {
        /* a budget row is selected iff its own figure came back */
        var lab = el.closest("label");
        var amt = lab && lab.querySelector("input[data-cmo]");
        el.checked = !!(amt && (parseInt(amt.value, 10) || 0) > 0);
        return;
      }
      el.checked = has(c, k);
    });
  }

  function payVisibility() {
    /* Founder, 11 Sep 2026: the button is PRESENT whenever a payment
       account is connected — not only once something is ticked. A control
       that materialises reads as a glitch, and a first-time reader never
       learns card payment exists. The original intent survives: with no
       account connected it is still not rendered at all, because a dead
       pay button is worse than none. */
    var live = payEnabled;
    var ready = live && oneOffNow > 0;
    var gst = oneOffNow ? Math.round(oneOffNow * 0.1) : 0;
    var inc = oneOffNow + gst;
    [payBtn, payBtn2].forEach(function (b) {
      if (!b) return;
      b.hidden = !live;
      b.disabled = !ready;
      /* the amount rides on the label, so the buyer reads what leaves the
         card before they leave our page */
      /* a disabled control that repeats its own name teaches nothing; this
         one names the missing step (founder UX round, 11 Sep 2026) */
      setLabel(b, ready ? "Pay Now — " + fmt(inc) : "Select an item to pay");
    });
    if (payNote) {
      payNote.hidden = !ready;
      /* Codex r1, 11 Sep 2026: a failed checkout wrote its error into this
         note and nothing ever put the note back, so the next selection read
         a stale failure. The note owns one sentence and restores it here. */
      payNote.textContent = PAY_NOTE;
    }
    if (closeTot) {
      closeTot.innerHTML = oneOffNow
        ? '<div class="qb-total"><span>Subtotal (ex GST)</span><b>' + fmt(oneOffNow) + "</b></div>" +
          '<div class="qb-total"><span>GST (10%)</span><b>' + fmt(gst) + "</b></div>" +
          '<div class="qb-total qb-total--pay"><span>Total payable (inc GST)</span><b>' +
            fmt(inc) + "</b></div>"
        : '<p class="qb-close__empty">Tick an item above and the total appears here.</p>';
    }
  }

  function build() {
    /* every change path funnels through build(), so this is the one place
       the saved selection can never fall out of step with the page */
    saveState();
    var lines = [];
    var oneOff = 0, moMenu = 0, moBudget = 0;
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
      if (el.dataset.bx) return; /* a budget row's selector — priced via its own amount box */
      if (!el.checked) return;
      if (el.dataset.g && bundled[el.dataset.g]) return; /* folded into bundle */
      var p = parseInt(el.dataset.p, 10) || 0;
      if (el.dataset.mo) {
        if (el.dataset.free) {
          lines.push([el.dataset.label, "Free", "included with the monthly engine"]);
        } else {
          lines.push([el.dataset.label, fmt(p) + " / mo", "monthly · 6-month minimum"]);
          moMenu += p;
        }
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
      /* the markup's own max is the law for typed input too — the keyboard
         once outran the spinner bounds (context audit, 5 Sep 2026) */
      var mx = parseInt(el.max, 10) || 99;
      if (n > mx) { n = mx; el.value = mx; }
      if (!n) return;
      if (el.dataset.cmo) {
        /* a client-budget monthly figure, typed in dollars (5 Sep 2026);
           the row counts only while its checkbox is ticked */
        var bx = el.closest("label").querySelector("input[data-bx]");
        if (bx && !bx.checked) return;
        lines.push([el.dataset.label, fmt(n) + " / mo",
          "client budget · monthly"]);
        moBudget += n;
        return;
      }
      var p = (parseInt(el.dataset.p, 10) || 0) * n;
      lines.push([el.dataset.label + " × " + n, fmt(p),
        el.dataset.t ? "delivery " + el.dataset.t : ""]);
      oneOff += p;
      payable.push({ label: el.dataset.label, qty: n });
    });

    /* the Held cap governs the FIXED monthly menu only — a client-set
       budget is the client's own figure and is never trimmed (the cap
       once silently rewrote a typed budget; context audit, 5 Sep 2026) */
    var capped = moMenu > CAP;
    var monthly = (capped ? CAP : moMenu) + moBudget;

    /* render */
    if (!lines.length) {
      sumEl.innerHTML = '<p class="qb-empty">Build up what you need — each item is priced and timed. We quote the package for you.</p>';
      totEl.innerHTML = "";
      oneOffNow = 0;        /* Codex r1: the pay button went stale when the
                               selection emptied — this branch returns early */
      monthlyNow = 0;
      payVisibility();
      return;
    }
    sumEl.innerHTML = lines.map(function (l) {
      return '<div class="qb-line"><div><span>' + l[0] + "</span><em>" + l[2] + "</em></div><b>" + l[1] + "</b></div>";
    }).join("");

    var t = "";
    if (oneOff) {
      var gstNow = Math.round(oneOff * 0.1);
      t += '<div class="qb-total"><span>Subtotal (ex GST)</span><b>' + fmt(oneOff) + "</b></div>";
      t += '<div class="qb-total"><span>GST (10%)</span><b>' + fmt(gstNow) + "</b></div>";
      t += '<div class="qb-total qb-total--pay"><span>Total payable (inc GST)</span><b>' +
        fmt(oneOff + gstNow) + "</b></div>";
    }
    if (monthly) {
      t += '<div class="qb-total"><span>Monthly</span><b>' +
        (capped ? "<s>" + fmt(moMenu + moBudget) + "</s> " : "") + fmt(monthly) + " / mo</b></div>";
      if (capped) {
        t += '<p class="qb-cap">Managed Growth Pod / Held cap applied — the fixed monthly ' +
          "menu never costs more than " + fmt(CAP) + " a month; client-set budgets ride on top.</p>";
      }
    }
    t += '<p class="qb-fine">GST applies on purchase.</p>';
    totEl.innerHTML = t;
    oneOffNow = oneOff;
    monthlyNow = monthly;
    cappedNow = capped;
    payVisibility();
  }

  function quoteText() {
    var out = "SEMORA STUDIO — quote request " + new Date().toLocaleDateString("en-AU") + "\n\n";
    sumEl.querySelectorAll(".qb-line").forEach(function (l) {
      out += l.querySelector("span").textContent + " — " + l.querySelector("b").textContent +
        " (" + l.querySelector("em").textContent + ")\n";
    });
    /* totals from the numbers, not the DOM — the capped strikethrough
       once emailed as two run-together figures (context audit, 5 Sep) */
    if (oneOffNow) {
      var gstMail = Math.round(oneOffNow * 0.1);
      out += "Subtotal (ex GST): " + fmt(oneOffNow) + "\n";
      out += "GST (10%): " + fmt(gstMail) + "\n";
      out += "Total payable (inc GST): " + fmt(oneOffNow + gstMail) + "\n";
    }
    if (monthlyNow) {
      out += "Monthly: " + fmt(monthlyNow) + " / mo" +
        (cappedNow ? " (fixed menu capped at " + fmt(CAP) + ")" : "") + "\n";
    }
    out += "GST applies on purchase.\n";
    return out;
  }

  boxes.forEach(function (b) {
    b.addEventListener("change", function () {
      /* ticking a budget row invites the figure straight away */
      if (b.dataset.bx && b.checked) {
        var inp = b.closest("label").querySelector("input[data-cmo]");
        if (inp && !inp.value) inp.focus();
      }
      build();
    });
  });
  qtys.forEach(function (q) {
    q.addEventListener("input", function () {
      /* typing an amount IS selecting the row; clearing it deselects */
      if (q.dataset.cmo) {
        var bx = q.closest("label").querySelector("input[data-bx]");
        if (bx) bx.checked = (parseInt(q.value, 10) || 0) > 0;
      }
      build();
    });
  });
  /* The source route is READ from the page, not typed (audit B4, 7 Sep
     2026): the builder moved to /quotation and the mailto still said
     /quote, which is now Client Onboarding — so every emailed quote named
     the wrong page and misdirected the follow-up. The literal below is the
     file:// fallback only. */
  var SRC_PATH = (function () {
    var here = (window.location.pathname || "").replace(/\.html$/, "");
    return /^\/[a-z0-9-]+$/.test(here) ? here : "/quotation";
  })();
  var mail = document.getElementById("qb-mail");
  var mail2 = document.getElementById("qb-mail2");
  [mail, mail2].forEach(function (m) {
  if (m) m.addEventListener("click", function () {
    m.href = "mailto:team@semora.com.au?subject=" +
      encodeURIComponent("Quote request — via semora.com.au" + SRC_PATH) +
      "&body=" + encodeURIComponent(quoteText() + "\nMy details:\nName:\nPractice:\nPhone:\n");
  });
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
    /* local date parts, not UTC — the ref once said 0904 beside a Date
       line saying 5 September (caught at 1:1 review, 5 Sep 2026) */
    var ymd = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    if (r) r.textContent = "Q" + ymd + "-" + String(now.getTime() % 1000).padStart(3, "0");
    /* the document's money block: subtotal, GST, payable total — and the
       monthly menu as its own contract line (5 Sep 2026 redesign) */
    var tt = document.getElementById("qsheet-totals");
    if (tt) {
      var gst = Math.round(oneOffNow * 0.1);
      var rows = "";
      if (oneOffNow) {
        rows += '<div class="qsheet-trow"><span>Subtotal (one-off, ex GST)</span><b>' + fmt(oneOffNow) + "</b></div>";
        rows += '<div class="qsheet-trow"><span>GST (10%)</span><b>' + fmt(gst) + "</b></div>";
        rows += '<div class="qsheet-trow qsheet-trow--total"><span>Total payable</span><b>' + fmt(oneOffNow + gst) + "</b></div>";
      }
      if (monthlyNow) {
        rows += '<div class="qsheet-trow qsheet-trow--mo"><span>Monthly menu (ex GST, starts by contract' +
          (cappedNow ? ", fixed menu capped at " + fmt(CAP) : "") +
          ')</span><b>' + fmt(monthlyNow) + " / mo</b></div>";
      }
      tt.innerHTML = rows;
    }
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
  if (payBtn || payBtn2) {
    fetch("/api/checkout", { method: "GET" })
      .then(function (r) { return r.json(); })
      .then(function (cfg) { payEnabled = !!(cfg && cfg.enabled); payVisibility(); })
      .catch(function () { payEnabled = false; });
    /* both pay buttons run one starter; failure restores BOTH labels
       through payVisibility() rather than hard-coding "Pay Now", which
       would drop the amount the label now carries */
    function startCheckout(btn) {
      if (!payable.length) return;
      [payBtn, payBtn2].forEach(function (b) { if (b) b.disabled = true; });
      setLabel(btn, "Opening secure payment…");
      function failed(msg) {
        payVisibility();
        if (payNote) {
          payNote.hidden = false;
          payNote.textContent = msg;
        }
      }
      fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: payable })
      }).then(function (r) { return r.json(); }).then(function (out) {
        if (out && out.url) { window.location.href = out.url; return; }
        failed((out && out.error) ||
          "Payment could not start. Email the quote instead — same numbers.");
      }).catch(function () {
        failed("Payment could not start. Email the quote instead — same numbers.");
      });
    }
    [payBtn, payBtn2].forEach(function (b) {
      if (b) b.addEventListener("click", function () { startCheckout(b); });
    });
  }

  /* the selection comes back BEFORE the return-leg banner is written, so
     the banner can say what is actually on the page rather than what the
     page hoped (audit B1) */
  restoreState();
  build();

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
            /* The "within one business day" promise is OUT until runbook
               item 7 names who answers it (Codex r3). Restore this line the
               day the founder names the owner — it is one string. */
            status.textContent = "Payment received. We will email you to " +
              "start delivery.";
          } else {
            status.textContent = "We could not confirm a payment for this " +
              "visit. If you believe you paid, email team@semora.com.au " +
              "with your Stripe receipt and we will confirm it.";
          }
        })
        .catch(function () {
          status.textContent = "We could not confirm a payment for this " +
            "visit. If you believe you paid, email team@semora.com.au " +
            "with your Stripe receipt and we will confirm it.";
        });
    } else if (pv === "cancelled") {
      status.hidden = false;
      status.className = "qb-paystatus";
      /* the second sentence is a statement about THIS page, so it is read
         off this page — storage can be switched off, and a banner that
         promises a selection that is not there is the defect this fix
         exists to remove */
      status.textContent = "Payment was cancelled. " +
        (oneOffNow || monthlyNow
          ? "Your selection is still here."
          : "Your selection was not carried back — build it again below and " +
            "the numbers are the same.");
    }
  }
})();
