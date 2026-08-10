/* SEMÖRA — quote builder. Vanilla, deterministic: every figure is
   published on the page itself. No AI, no variables, no "it depends".
   Every item carries its own price and delivery time; totals are sums.
   One rule: the monthly menu never exceeds MOMENTUM / Held. */
(function () {
  "use strict";

  var CAP = 13500; /* MOMENTUM / Held — the full monthly engine */
  var BUNDLES = {
    signal: { n: 3, label: "SIGNAL / — the position", price: 14000,
              note: "delivery 4 weeks · positioning + fees + objections, one engagement" },
    haus:   { n: 4, label: "/ HAUS — the system", price: 38000,
              note: "delivery 8–10 weeks · brand + website + proposals + CRM, one team" }
  };

  var root = document.getElementById("qb");
  if (!root) return;
  var sumEl = document.getElementById("qb-lines");
  var totEl = document.getElementById("qb-totals");
  var boxes = root.querySelectorAll("input[type=checkbox]");
  var qtys = root.querySelectorAll("input[type=number]");

  function fmt(n) { return "$" + n.toLocaleString("en-AU"); }

  function build() {
    var lines = [];
    var oneOff = 0, moMenu = 0;

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
      }
    });

    qtys.forEach(function (el) {
      var n = Math.max(0, parseInt(el.value, 10) || 0);
      if (!n) return;
      var p = (parseInt(el.dataset.p, 10) || 0) * n;
      lines.push([el.dataset.label + " × " + n, fmt(p),
        el.dataset.t ? "delivery " + el.dataset.t : ""]);
      oneOff += p;
    });

    var capped = moMenu > CAP;
    var monthly = capped ? CAP : moMenu;

    /* render */
    if (!lines.length) {
      sumEl.innerHTML = '<p class="qb-empty">Tick what you need — every item is priced and timed. The quote assembles itself.</p>';
      totEl.innerHTML = "";
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
        t += '<p class="qb-cap">MOMENTUM / Held cap applied — the full engine ' +
          "never costs more than " + fmt(CAP) + " a month.</p>";
      }
    }
    t += '<p class="qb-fine">All + GST. The audit credits in full against any engagement within 90 days. Every price on this page is published — identical for every client.</p>';
    totEl.innerHTML = t;
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
    out += "All + GST.\n";
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
  var pr = document.getElementById("qb-print");
  if (pr) pr.addEventListener("click", function () { window.print(); });

  build();
})();
