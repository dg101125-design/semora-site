/* The free AI visibility report funnel — progressive enhancement only.
 *
 * WHAT SHIPS WITHOUT THIS FILE. The page is one <form> of nine <fieldset>s of
 * real radios. With JavaScript off it is a long, working, POSTable form and
 * every question is readable by a crawler — which is the point, because this
 * is the page that sells AI visibility and a JS-only funnel would leave the
 * answer engines nothing to read (founder confirmed the static layer, 13 Sep
 * 2026). This file only shows one fieldset at a time.
 *
 * site.js owns submission. This enhancement supplies a synchronous validation
 * hook to that owner so all steps are checked before sending; it does not add
 * another asynchronous submit handler. Selection alone never advances.
 *
 * `prompt` is REQUIRED by api/enquiry.mjs and is rendered as the message block
 * of the notification email, pre-wrap. It has a named default in the markup
 * so the form still works if this enhancement does not load. Qualification
 * answers are sent in their own fields.
 */
(function () {
  var root = document.querySelector(".fnl");
  if (!root) return;

  var sets = [].slice.call(root.querySelectorAll(".fnl__set"));
  if (!sets.length) return;

  var ladder = root.querySelector(".fnl__steps");
  var count = root.querySelector(".fnl__count");
  var hidden = root.querySelector("#fnl-prompt");   /* named in the markup now */
  var form = root.querySelector("#contact-form");

  root.classList.add("js-fnl");
  var at = 0;

  /* Park every `required` and hand it back only to the step on screen. The
   * attribute is right for the no-JS form, where all nine sets are visible,
   * and wrong the moment one step is shown at a time: the browser cannot
   * focus an invalid control inside a hidden fieldset, so submission fails
   * with no message. */
  [].slice.call(root.querySelectorAll("[required]")).forEach(function (el) {
    el.setAttribute("data-req", "1");
    el.removeAttribute("required");
  });
  /* Parking `required` is not enough, and Codex caught why: a `type="url"`
   * control with a malformed value stays INVALID whether or not it is
   * required, so a hidden step could still fail checkValidity() on a control
   * the browser cannot focus — submission dies silently. Hidden fields are
   * therefore demoted to `type="text"`, which carries no format constraint at
   * all, and restored to their real type the moment their step is on screen. */
  [].slice.call(root.querySelectorAll("input[type=url], input[type=email], input[type=tel]"))
    .forEach(function (el) { el.setAttribute("data-type", el.type); });

  function syncValidation() {
    [].slice.call(root.querySelectorAll("[data-req], [data-type]")).forEach(function (el) {
      var mine = el.closest(".fnl__set") === sets[at];
      if (el.hasAttribute("data-req")) {
        if (mine) el.setAttribute("required", "required");
        else el.removeAttribute("required");
      }
      if (el.hasAttribute("data-type")) {
        el.type = mine ? el.getAttribute("data-type") : "text";
      }
    });
  }

  /* ---------------------------------------------------------------- ladder */
  /* Built ONCE. Re-rendering innerHTML on every step restarted the entrance
   * stagger each time, so the ladder flickered its way back in at every
   * answer and, caught mid-stagger, looked like rows had gone missing. Now
   * only the state classes change. */
  function buildLadder() {
    if (!ladder) return;
    ladder.innerHTML = sets.map(function (s, i) {
      return '<li style="--s:' + i + '"><b>' + ("0" + (i + 1)).slice(-2) +
        "</b><span>" + (s.getAttribute("data-tag") || "") + "</span></li>";
    }).join("");
  }

  function drawLadder() {
    if (ladder) {
      [].slice.call(ladder.children).forEach(function (li, i) {
        li.classList.toggle("is-done", i < at);
        li.classList.toggle("is-at", i === at);
      });
    }
    if (count) {
      count.innerHTML = "Step <b>" + (at + 1) + "</b> of " + sets.length;
    }
  }

  function show(i) {
    at = Math.max(0, Math.min(sets.length - 1, i));
    sets.forEach(function (s, n) { s.classList.toggle("is-at", n === at); });
    drawLadder();
    syncValidation();
    var focusable = sets[at].querySelector("input:not([type=hidden]), textarea, select");
    if (focusable && focusable.type !== "radio") focusable.focus();
    var top = root.getBoundingClientRect().top + window.pageYOffset - 12;
    if (window.pageYOffset > top) window.scrollTo(0, top);
  }

  /* A radio step needs a choice; native requirements are restored for the
   * active step and all steps are checked again before final submission. */
  /* People type their own domain, not a URL. `www.axisplatform.au` is exactly
   * what a buyer writes, and `type=url` rejects it for having no scheme — so
   * the first screen refused the first thing anyone would enter. Prepend the
   * scheme rather than lecture them about it. Anything that already carries
   * one is left alone, including http:// and mailto-style oddities, which
   * then fail validation on their own merits. */
  function normaliseUrl(el) {
    if (!el) return;
    var v = el.value.trim();
    if (!v) return;
    if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(v)) {
      el.value = "https://" + v.replace(/^\/+/, "");
    }
  }

  /* `checkValidity()` alone is not enough either: Chrome accepts plenty that
   * is not a website, including "https://not a website at all". The report is
   * run against a real host, so require one — labels, a dot, a TLD. */
  function looksLikeSite(el) {
    normaliseUrl(el);
    var v = el.value.trim();
    if (!v) return false;
    try {
      var u = new URL(v);
      /* http(s) only, and no user-info construction — Codex found the old
         check would take a mailto: or a user@host and call it a website. */
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      if (u.username || u.password) return false;
      return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i
        .test(u.hostname);
    } catch (e) {
      return false;
    }
  }

  function answered(set) {
    var url = set.querySelector('input[data-site]');
    if (url && !looksLikeSite(url)) return false;
    var radios = set.querySelectorAll('input[type=radio]');
    if (!radios.length) return true;
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) return true;
    return false;
  }

  function nudge(set) {
    var hint = set.querySelector(".fnl__hint");
    if (!hint) return;
    var url = set.querySelector('input[data-site]');
    var msg = "Choose one to continue";
    if (url) {
      msg = url.value.trim() ? "That does not look like a website address"
                             : "Add your website to continue";
      url.focus();
    }
    var was = hint.dataset.was || hint.textContent;
    hint.dataset.was = was;
    hint.textContent = msg;
    hint.classList.add("is-nudge");
    setTimeout(function () {
      hint.textContent = was; hint.classList.remove("is-nudge");
    }, 2600);
  }

  /* -------------------------------------------------------------- the note */
  /* The six answers used to be packed in here because the API discarded their
   * own field names. It accepts them now, and the notification email prints
   * them in their own block, so repeating them would put the same six lines in
   * the email twice. This only has to be non-empty: `prompt` is required. */
  function compose() {
    if (!hidden) return;
    hidden.value = "Free AI visibility report requested through the funnel.";
  }

  /* ------------------------------------------------------------ navigation */
  // Called by the existing submission owner after enhancement has loaded.
  // Check hidden steps with their real constraints, then focus the first error.
  if (form) form.semoraValidate = function () {
    for (var i = 0; i < sets.length; i++) {
      var ok = answered(sets[i]);
      var invalid = null;
      [].slice.call(sets[i].querySelectorAll("[data-req], [data-type]")).forEach(function (el) {
        if (el.hasAttribute("data-req")) el.required = true;
        if (el.hasAttribute("data-type")) el.type = el.getAttribute("data-type");
        if (!el.checkValidity()) { ok = false; if (!invalid) invalid = el; }
      });
      syncValidation();
      if (!ok) {
        show(i);
        if (invalid) { invalid.focus(); invalid.reportValidity(); }
        else nudge(sets[i]);
        return false;
      }
    }
    return true;
  };

  root.addEventListener("click", function (ev) {
    var next = ev.target.closest("[data-next]");
    if (next) {
      ev.preventDefault();
      if (!answered(sets[at])) { nudge(sets[at]); return; }
      show(at + 1);
      return;
    }
    var back = ev.target.closest("[data-back]");
    if (back) { ev.preventDefault(); show(at - 1); return; }

  });

  /* A choice stays on its step until the person activates Continue. */
  root.addEventListener("blur", function (ev) {
    if (ev.target && ev.target.hasAttribute && ev.target.hasAttribute("data-site")) normaliseUrl(ev.target);
  }, true);

  root.addEventListener("change", function (ev) {
    compose();
  });

  /* Bound to the funnel, NOT the document. On `document` this swallowed Enter
   * everywhere on the page — masthead and footer links, the Back button and
   * the real submit button all stopped working, and Back advanced instead of
   * going back. Codex found it; it is the worst defect in this wave. Buttons
   * and links keep their native Enter, so only a bare step takes the shortcut. */
  root.addEventListener("keydown", function (ev) {
    var t = ev.target;
    var tag = (t.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || tag === "select";
    var native = tag === "button" || tag === "a";

    if (ev.key === "Enter") {
      if (native) return;                    /* let the control do its job */
      if (at === sets.length - 1) return;    /* native final submission */
      if (typing && t.type !== "url" && t.type !== "text") return;
      ev.preventDefault();
      if (answered(sets[at])) show(at + 1); else nudge(sets[at]);
      return;
    }
    if (typing || native) return;
    if (/^[1-9]$/.test(ev.key)) {
      var radios = sets[at].querySelectorAll("input[type=radio]");
      var i = Number(ev.key) - 1;
      if (radios[i]) {
        radios[i].checked = true;
        radios[i].dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });

  /* The day-and-time chooser that used to live here is gone. Cal.com under
   * team@semora.com.au went live on 14 Sep 2026, so the page links to a real
   * calendar instead of collecting a request it could not confirm. Nothing
   * replaced it in JS: a link needs no script.
   */
  buildLadder();
  compose();
  show(0);
})();
