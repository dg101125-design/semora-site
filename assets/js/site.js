/* SEMORA — motion. Vanilla, ~1KB. Respects prefers-reduced-motion. */
(function () {
  "use strict";
  /* content is only hidden-for-reveal when this script actually runs */
  document.documentElement.classList.add("js");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  /* scroll reveal with per-section stagger */
  var els = document.querySelectorAll(".rv");
  if ("IntersectionObserver" in window && els.length) {
    var groups = new Map();
    els.forEach(function (el) {
      var section = el.closest("section") || document.body;
      var i = groups.get(section) || 0;
      el.style.setProperty("--rvd", (Math.min(i, 6) * 0.09) + "s");
      groups.set(section, i + 1);
    });
    var seen = new WeakSet();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in"); seen.add(e.target); io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });

    /* The 2.6s fallback below reveals EVERYTHING for renders that never
       scroll — which also meant every below-fold animation played while off
       screen, and a real visitor scrolled into a page of finished motion
       (founder, 31 Aug 2026: "you lost animation design" — nothing was
       lost; it had all already played, invisibly, at t=2.6s). The fix: the
       first genuine interaction — which print pipelines, reader modes and
       engine renderers never produce, so the S3 guarantee stands — re-arms
       whatever the fallback revealed that the visitor has not actually
       seen. The observer never stopped watching those elements, so each
       one animates on real entry. */
    function rearm() {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        if (seen.has(el)) return;
        var r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) el.classList.remove("in");
        else seen.add(el);
      });
    }
    ["scroll", "wheel", "touchstart"].forEach(function (ev) {
      window.addEventListener(ev, rearm, { once: true, passive: true });
    });
  } else {
    els.forEach(function (el) { el.classList.add("in"); });
  }

  /* Fallback: any render that never scrolls (print pipelines, reader modes,
     engine visual renderers, previews) must still see the whole page. If a
     reveal has not fired by 2.6s, fire it. Idempotent — scrolled-in elements
     already carry .in. (Diagnosis S3, 27 Aug 2026: 2 of 61 reveals visible
     in a scroll-less mobile render. The re-arm above hands real visitors
     their motion back on first interaction.) */
  window.setTimeout(function () {
    els.forEach(function (el) { el.classList.add("in"); });
  }, 2600);

  /* The hero parallax went with the slashes it moved (11 Aug 2026). Nothing
     else on the page is scroll-driven, and a scroll listener that exists to
     translate elements that no longer exist is a cost with no effect. */

  /* The price count-up was removed 27 Aug 2026 (diagnosis S1): an animated
     figure displays false intermediate values — a $3,000 price photographed
     mid-count reads $974, and a screenshot is exactly how an answer engine
     or a buyer may capture the page. Figures render at their true value. */
})();

/* ---------------------------------------------- contact form
   Posts to /api/enquiry via fetch so the visitor stays on the page.
   Works with JS off too — a native POST reaches the same handler,
   which answers either transport — but nobody should be sent away
   from an enquiry they just completed. On success the form is
   replaced rather than reset: leaving the filled fields on screen
   is an invitation to send the same enquiry twice. */
(function () {
  var form = document.getElementById("contact-form");
  if (!form || !window.fetch) return;
  var status = document.getElementById("form-status");
  var btn = form.querySelector("button[type=submit]");

  function say(state, msg) {
    if (!status) return;
    status.setAttribute("data-state", state);
    status.textContent = msg;
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    btn.disabled = true;
    say("sending", "Sending…");

    /* One retry, and only on 503.

       The handler answers 503 when bytes arrived but no field survived — a
       body lost in the platform's request path, which reproduces on the first
       request against a fresh deployment. That is our failure, not the
       visitor's, so they should never see it: the second attempt lands on a
       warm function and succeeds. Any other failure is reported straight
       away rather than retried, because retrying a real rejection just makes
       the visitor wait twice. */
    function post(attempt) {
      return fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      }).then(function (r) {
        if (r.status === 503 && attempt === 1) {
          return new Promise(function (resolve) {
            setTimeout(function () { resolve(post(2)); }, 900);
          });
        }
        return r.json().catch(function () { return {}; });
      });
    }

    post(1)
      .then(function (data) {
        if (!data || data.success !== true) throw new Error("rejected");
        var done = document.createElement("div");
        done.className = "form-done";
        done.setAttribute("role", "status");
        done.innerHTML =
          "<h3>Thank you — that’s with us.</h3>" +
          "<p>A named person replies within one business day. " +
          "If it’s urgent, email " +
          "<a class=\"alink\" href=\"mailto:team@semora.com.au\">" +
          "team@semora.com.au</a> directly.</p>";
        form.parentNode.replaceChild(done, form);
        done.scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(function () {
        btn.disabled = false;
        say("error",
          "That didn’t send. Please email team@semora.com.au directly.");
      });
  });
})();

/* The "keep us" QR save handler was removed with the footer QR column
   (founder order, 30 Aug 2026). The card asset remains in assets/ for print. */

/* The three audiences (homepage): one panel lit at a time. The light
   advances every 5s; hover, click or keyboard focus takes it, and the
   timer restarts so a chosen panel is not snatched away. Phones and
   reduced-motion get all three open — CSS handles both; this loop just
   declines to run. Both media states are re-checked on change (a tablet
   rotating out of the 860px state used to arrive with no timer armed and
   two panels' content hidden for good), and the timer only runs while
   the grid is actually on screen. */
(function () {
  var grid = document.querySelector(".wpanels");
  if (!grid) return;
  var pans = [].slice.call(grid.querySelectorAll(".wpan"));
  if (pans.length < 2) return;
  var i = 0, timer = null, seen = true;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  var phone = window.matchMedia("(max-width: 860px)");
  function act(n) {
    i = n;
    pans.forEach(function (p, j) { p.classList.toggle("is-act", j === n); });
  }
  function arm() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!seen || still.matches || phone.matches) return;
    timer = setInterval(function () { act((i + 1) % pans.length); }, 5000);
  }
  pans.forEach(function (p, j) {
    p.addEventListener("mouseenter", function () { act(j); arm(); });
    p.addEventListener("focusin", function () { act(j); arm(); });
    p.querySelector(".wpan__head").addEventListener("click", function () {
      act(j); arm();
    });
  });
  if (still.addEventListener) {
    still.addEventListener("change", arm);
    phone.addEventListener("change", arm);
  }
  if ("IntersectionObserver" in window) {
    seen = false;
    new IntersectionObserver(function (entries) {
      seen = entries[0].isIntersecting;
      arm();
    }, { threshold: 0.2 }).observe(grid);
  }
  arm();
})();

/* The case-study figures jump to their value (founder, 30 Aug 2026 — the
   board asked for the jump back). Guardrails: the markup ships the TRUE
   figure, so no-JS, print, reduced-motion and engine fetches always read
   the real number; the jump runs once, only in view, and fast (700ms), so
   the window in which a capture could photograph an intermediate value is
   as small as the effect allows. Delays match the stat-land stagger. */
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var ns = document.querySelectorAll(".res .stat__n[data-count]");
  if (!ns.length || !("IntersectionObserver" in window)) return;
  function run(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var prefix = el.getAttribute("data-prefix") || "";
    var suffix = el.getAttribute("data-suffix") || "";
    var t0 = null, D = 700;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / D);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix +
        Math.round(target * eased).toLocaleString("en-AU") + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      var row = e.target.closest(".res__stats");
      var i = row ? Array.prototype.indexOf.call(
        row.querySelectorAll(".stat__n"), e.target) : 0;
      /* ride the wave: each card enters 140ms behind the last (css --wd),
         and its figures land 550ms after that — the count starts as the
         stat lands, so the jump IS the landing */
      var card = e.target.closest(".res");
      var ci = card && card.parentNode
        ? Array.prototype.indexOf.call(card.parentNode.children, card) : 0;
      window.setTimeout(function () { run(e.target); }, 550 + 160 * i + ci * 140);
    });
  }, { threshold: 0.4 });
  ns.forEach(function (el) { io.observe(el); });
})();
