/* SEMÖRA — motion. Vanilla, ~1KB. Respects prefers-reduced-motion. */
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
      el.style.setProperty("--rvd", (Math.min(i, 6) * 0.07) + "s");
      groups.set(section, i + 1);
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add("in"); });
  }

  /* hero slashes: two-speed parallax drift */
  var slashes = document.querySelectorAll(".hero__slash");
  if (slashes.length) {
    var rates = [0.12, 0.05];
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        slashes.forEach(function (s, i) {
          s.style.transform =
            "skewX(-20deg) translateY(" + (window.scrollY * (rates[i] || 0.05)) + "px)";
        });
        ticking = false;
      });
    }, { passive: true });
  }

  /* price count-up on reveal */
  var counters = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window && counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        var el = e.target;
        var target = parseInt(el.getAttribute("data-count"), 10);
        var prefix = el.getAttribute("data-prefix") || "";
        var suffix = el.getAttribute("data-suffix") || "";
        var t0 = null;
        function step(t) {
          if (!t0) t0 = t;
          var k = Math.min((t - t0) / 900, 1);
          k = 1 - Math.pow(1 - k, 3);   /* ease-out cubic */
          el.textContent = prefix +
            Math.round(target * k).toLocaleString("en-AU") + suffix;
          if (k < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  }
})();

/* ---------------------------------------------- contact form
   Posts to Web3Forms via fetch so the visitor stays on the page.
   The form still works with JS off — a plain POST lands on the
   service's thank-you page — but nobody should be sent away from
   an enquiry they just completed. On success the form is replaced
   rather than reset: leaving the filled fields on screen is an
   invitation to send the same enquiry twice. */
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

    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
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
