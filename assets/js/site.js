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

/* ------------------------------------------- keep us: save the card
   Founder, 17 Aug 2026: "save the scan barcode to phone, for future
   access". On a phone that means the share sheet, not a download —
   iOS offers "Save Image" from navigator.share and puts the card in
   the camera roll, which is the only place a visitor will find it
   again six weeks later. Desktop has no share sheet worth using, so
   it falls through to a normal download.

   The button is inert until this runs, and the page ships without a
   plain <a download> alternative on purpose: the viewer sandbox and
   several in-app browsers silently swallow anchor downloads, and a
   button that appears to work and does nothing is worse than one
   that is honestly unavailable. If every path fails the card opens
   in a new tab, where long-press still saves it. */
(function () {
  var btn = document.querySelector(".qr-save");
  if (!btn || !window.fetch || !window.URL) return;
  var src = btn.getAttribute("data-card");
  var label = btn.querySelector(".qr-save__t");
  var name = "semora-studio.png";
  var idle = label.textContent;

  function say(t) { label.textContent = t; }
  function reset() { btn.disabled = false; say(idle); }
  function done() { btn.disabled = false; say("Saved"); }

  function download(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    done();
  }

  btn.addEventListener("click", function () {
    if (btn.disabled) return;
    btn.disabled = true;
    say("Preparing…");

    fetch(src).then(function (r) {
      if (!r.ok) throw new Error("card " + r.status);
      return r.blob();
    }).then(function (blob) {
      var file = null;
      try {
        file = new File([blob], name, { type: "image/png" });
      } catch (e) { /* no File constructor — download path handles it */ }

      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({
          files: [file],
          title: "SEMORA STUDIO",
          text: "SEMORA STUDIO — Melbourne. semora.com.au"
        }).then(done, function (err) {
          /* AbortError and ONLY AbortError is the visitor closing the sheet
             — a decision, so put the button back and say nothing. Everything
             else, NotAllowedError included, is the browser declining: it is
             also what a share with no user activation behind it raises, and
             answering that with silence is how a button ends up doing
             nothing at all. Fall through to the download. */
          if (err && err.name === "AbortError") { reset(); return; }
          download(blob);
        });
      }
      download(blob);
    }).catch(function () {
      window.open(src, "_blank", "noopener");
      reset();
    });
  });
})();

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
