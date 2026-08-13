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

  /* The hero parallax went with the slashes it moved (11 Aug 2026). Nothing
     else on the page is scroll-driven, and a scroll listener that exists to
     translate elements that no longer exist is a cost with no effect. */

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
