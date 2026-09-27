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
  var paymentState = "editing";
  var lockedInputs = null;
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
    if (!state || typeof state !== "object" || Array.isArray(state)) return;
    var c = state.c && typeof state.c === "object" && !Array.isArray(state.c) ? state.c : {};
    var n = state.n && typeof state.n === "object" && !Array.isArray(state.n) ? state.n : {};
    var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    qtys.forEach(function (el) {
      var k = keyOf(el);
      if (!k || !has(n, k)) return;
      var v = n[k];
      if (!Number.isSafeInteger(v) || !(v > 0)) return;
      /* the markup's own max stays the law on the way back in, exactly as
         it is for typed input */
      var mx = parseInt(el.max, 10) || 99;
      el.value = String(Math.min(v, mx));
    });
    boxes.forEach(function (el) {
      var k = keyOf(el);
      if (!k) return;
      el.checked = has(c, k) && c[k] === 1;
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
    var ready = live && oneOffNow > 0 && paymentState === "editing";
    boxes.forEach(function (el) { el.disabled = paymentState !== "editing"; });
    qtys.forEach(function (el) { el.disabled = paymentState !== "editing"; });
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
      var stateLabel = {paid:"Payment received", uncertain:"Checkout not confirmed",
        expired:"Checkout expired", open:"Checkout open", verifying:"Checking checkout"};
      setLabel(b, paymentState !== "editing" ? stateLabel[paymentState] || "Checkout in progress" :
        ready ? "Pay Now — " + fmt(inc) : "Select an item to pay");
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
    if (paymentState !== "editing" && lockedInputs) {
      lockedInputs.forEach(function (row) { row.el.checked = row.checked; row.el.value = row.value; });
    }
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
      cappedNow = false;
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

  /* One controller owns all payment locks. The cart and the signed attempt
     are separate; no network ambiguity creates a replacement attempt. */
  var ATTEMPT_KEY = "semora.checkout.v1";
  var attempt = null;
  var busy = false;
  var status = document.getElementById("qb-paystatus");
  var receiptEl = document.getElementById("qb-receipt");
  var actionsEl = document.getElementById("qb-checkout-actions");
  var retryBtn = document.getElementById("qb-retry");
  var resumeBtn = document.getElementById("qb-resume");
  var editBtn = document.getElementById("qb-edit");
  var newBtn = document.getElementById("qb-new");
  var NEUTRAL = "We could not confirm this checkout. If you have paid, email team@semora.com.au with your Stripe receipt.";
  var returnQuery = new URLSearchParams(window.location.search);

  function captureInputs() {
    lockedInputs = [];
    boxes.forEach(function (el) { lockedInputs.push({ el: el, checked: el.checked, value: el.value }); });
    qtys.forEach(function (el) { lockedInputs.push({ el: el, checked: el.checked, value: el.value }); });
  }
  function persistAttempt() {
    var encoded = JSON.stringify(attempt);
    try {
      window.sessionStorage.setItem(ATTEMPT_KEY, encoded);
      return window.sessionStorage.getItem(ATTEMPT_KEY) === encoded;
    } catch (e) { return false; }
  }
  function renderPayment(message) {
    payVisibility();
    var available = [
      [retryBtn, !busy && paymentState === "uncertain" && !!(attempt && attempt.token) &&
        (!!attempt.session_id || Date.now() < attempt.create_before * 1000)],
      [resumeBtn, !busy && paymentState === "open"],
      [editBtn, !busy && (paymentState === "open" || paymentState === "expired")],
      [newBtn, !busy && paymentState === "paid"]
    ];
    available.forEach(function (pair) {
      if (pair[0]) { pair[0].hidden = !pair[1]; pair[0].disabled = !pair[1]; }
    });
    if (actionsEl) actionsEl.hidden = !available.some(function (pair) { return pair[1]; });
    if (status && message) {
      status.hidden = false;
      status.className = "qb-paystatus" + (paymentState === "paid" ? " qb-paystatus--ok" : "");
      status.textContent = message;
    }
  }
  function transition(state, message) {
    paymentState = state;
    renderPayment(message);
  }
  async function api(data) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch("/api/checkout", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data), signal: controller.signal });
      var out = await response.json();
      if (!response.ok) throw new Error(out && out.error || NEUTRAL);
      return out;
    } finally { clearTimeout(timer); }
  }
  function validURL(value) {
    try { var url = new URL(value); return url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.username && !url.password; }
    catch (e) { return false; }
  }
  function cleanPaidCart(receipt) {
    // Exact purchased rows only; monthly choices and unrelated quantities survive.
    receipt.items.forEach(function (item) {
      boxes.forEach(function (el) {
        if (!el.dataset.mo && !el.dataset.bx && el.dataset.label === item.label) el.checked = false;
      });
      qtys.forEach(function (el) {
        if (!el.dataset.cmo && el.dataset.label === item.label && Number(el.value) === item.qty) el.value = "0";
      });
    });
    captureInputs();
    build();
  }
  function showResult(out) {
    if (out.session_id && /^cs_[A-Za-z0-9_]+$/.test(out.session_id)) attempt.session_id = out.session_id;
    // Persist before navigation. If this fails, stay here with the attempt in memory.
    if (!persistAttempt()) {
      transition("uncertain", "This browser could not retain the checkout. " + NEUTRAL);
      return;
    }
    if (out.state === "paid" && out.paid === true && out.attempt_id === attempt.id &&
        out.receipt && Array.isArray(out.receipt.items) && Number.isSafeInteger(out.receipt.total)) {
      attempt.paid = true;
      attempt.receipt = out.receipt;
      paymentState = "paid";
      cleanPaidCart(out.receipt);
      persistAttempt();
      if (receiptEl) {
        receiptEl.hidden = false;
        receiptEl.textContent = out.receipt.items.map(function (item) {
          return item.label + (item.qty > 1 ? " × " + item.qty : "") + " — " + fmt(item.amount / 100);
        }).join("\n") + "\nGST (10%) — " + fmt(out.receipt.gst / 100) +
          "\nTotal paid (AUD) — " + fmt(out.receipt.total / 100);
      }
      transition("paid", "Payment received for this quote. Paid items have been removed from your selection. Monthly items start by contract.");
    } else if (out.state === "open" && validURL(out.url)) {
      attempt.url = out.url;
      transition("open", "This checkout is still open. Resume payment, or edit your selection after closing it.");
    } else if (out.state === "expired") {
      transition("expired", "This checkout has expired. Select Edit selection to prepare a new quote.");
    } else {
      transition("uncertain", NEUTRAL);
    }
  }
  async function verifyAttempt(action) {
    transition("verifying", action === "abandon" ? "Closing this checkout before editing…" : "Checking this checkout…");
    var out = await api({ action: action || "verify", attempt_token: attempt.token, session_id: attempt.session_id });
    showResult(out);
    return out;
  }
  async function createAttempt(navigate) {
    transition("creating", "Opening secure payment…");
    var out = await api({ action: "create", attempt_token: attempt.token });
    showResult(out);
    if (paymentState === "open") {
      // Idempotent creation can replay an old response. Retrieve live state first.
      await verifyAttempt("verify");
      if (navigate && paymentState === "open") window.location.href = attempt.url;
    }
  }
  async function operation(fn) {
    if (busy) return;
    busy = true;
    renderPayment();
    try { await fn(); }
    catch (e) { transition("uncertain", e.message || NEUTRAL); }
    finally { busy = false; renderPayment(); }
  }
  async function startCheckout() {
    if (busy || paymentState !== "editing" || !payEnabled || !payable.length) return;
    captureInputs();
    var frozenLines = payable.map(function (line) { return Object.assign({}, line); });
    attempt = { version: 1, preparing: true };
    if (!persistAttempt()) {
      attempt = null;
      transition("editing", "This browser cannot save a checkout safely. Your quote is still editable; email the quote instead.");
      return;
    }
    await operation(async function () {
      transition("preparing", "Preparing your quote…");
      var prepared;
      try { prepared = await api({ action: "prepare", lines: frozenLines }); }
      catch (e) {
        // Prepare has no provider side effect, so a lost prepare is safe to discard.
        attempt = null;
        persistAttempt();
        transition("editing", "Payment could not be prepared. Your selection is retained; try again or email the quote.");
        return;
      }
      if (!prepared.attempt_token || !prepared.attempt || !prepared.attempt.id) throw new Error(NEUTRAL);
      attempt = { version: 1, token: prepared.attempt_token, id: prepared.attempt.id,
        create_before: prepared.attempt.create_before, lines: frozenLines };
      if (!persistAttempt()) {
        attempt = null;
        transition("editing", "This browser cannot retain a checkout safely. Email the quote instead.");
        return;
      }
      await createAttempt(true);
    });
  }
  function resetAttempt() {
    // Only reached after a provider-confirmed expiry or payment, never uncertainty.
    attempt = null;
    if (!persistAttempt()) { transition("uncertain", NEUTRAL); return; }
    if (window.history && window.history.replaceState) window.history.replaceState(null, "", window.location.pathname);
    lockedInputs = null;
    paymentState = "editing";
    if (receiptEl) receiptEl.hidden = true;
    build();
    renderPayment("Your selection is ready to edit. A new payment will use a new checkout.");
  }
  [payBtn, payBtn2].forEach(function (button) { if (button) button.addEventListener("click", startCheckout); });
  if (retryBtn) retryBtn.addEventListener("click", function () {
    operation(async function () {
      if (!attempt || !attempt.token) return;
      if (attempt.session_id) await verifyAttempt("verify");
      else await createAttempt(false);
    });
  });
  if (resumeBtn) resumeBtn.addEventListener("click", function () {
    if (paymentState !== "open") return;
    operation(async function () {
      await verifyAttempt("verify");
      if (paymentState === "open") window.location.href = attempt.url;
    });
  });
  if (editBtn) editBtn.addEventListener("click", function () {
    if (paymentState !== "open" && paymentState !== "expired") return;
    operation(async function () {
      if (paymentState === "open") await verifyAttempt("abandon");
      if (paymentState === "expired") resetAttempt();
    });
  });
  if (newBtn) newBtn.addEventListener("click", function () { if (!busy && paymentState === "paid") resetAttempt(); });

  restoreState();
  build();
  var corrupt = false;
  var saved = null;
  try { saved = window.sessionStorage.getItem(ATTEMPT_KEY); } catch (e) { /* ordinary quoting still works */ }
  try {
    if (saved) attempt = JSON.parse(saved);
    if (attempt && (attempt.version !== 1 || typeof attempt !== "object" || Array.isArray(attempt))) corrupt = true;
    if (attempt && !attempt.preparing && (typeof attempt.token !== "string" || attempt.token.length > 48000 ||
        typeof attempt.id !== "string" || !Number.isSafeInteger(attempt.create_before))) corrupt = true;
  } catch (e) { corrupt = true; }
  var returned = returnQuery.has("payment") || returnQuery.has("session_id") || returnQuery.has("attempt_id");
  if (corrupt || (returned && (!attempt || returnQuery.get("attempt_id") !== attempt.id)) ||
      (returned && returnQuery.has("session_id") && attempt && attempt.session_id && returnQuery.get("session_id") !== attempt.session_id)) {
    attempt = null;
    captureInputs();
    transition("uncertain", NEUTRAL);
  } else if (attempt && attempt.token) {
    captureInputs();
    var returnedSession = returnQuery.get("session_id");
    if (returnedSession && /^cs_[A-Za-z0-9_]+$/.test(returnedSession)) attempt.session_id = returnedSession;
    transition("uncertain", attempt.session_id || Date.now() < attempt.create_before * 1000 ?
      "Your saved checkout is retained. Retry this checkout to recover its current state." : NEUTRAL);
    if (attempt.session_id) operation(function () { return verifyAttempt("verify"); });
  } else if (returned) {
    captureInputs();
    transition("uncertain", NEUTRAL);
  } else {
    // No Stripe call can occur until the signed token is saved.
    attempt = null;
  }
  if (payBtn || payBtn2) fetch("/api/checkout", { method: "GET" })
    .then(function (r) { return r.json(); })
    .then(function (cfg) { payEnabled = !!(cfg && cfg.enabled); renderPayment(); })
    .catch(function () { payEnabled = false; renderPayment(); });
})();
