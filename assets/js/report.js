/* The free AI visibility report funnel — progressive enhancement only.
 *
 * WHAT SHIPS WITHOUT THIS FILE. The page is one <form> of nine <fieldset>s of
 * real radios. With JavaScript off it is a long, working, POSTable form and
 * every question is readable by a crawler — which is the point, because this
 * is the page that sells AI visibility and a JS-only funnel would leave the
 * answer engines nothing to read (founder confirmed the static layer, 13 Sep
 * 2026). This file only shows one fieldset at a time.
 *
 * WHAT IT MUST NOT DO. site.js already owns submission for #contact-form and
 * registers its listener first (it is loaded before this file). So nothing
 * here listens for submit: the hidden `prompt` field is rewritten on every
 * change instead, and whatever FormData reads at submit time is already
 * current. Order-independent by construction.
 *
 * `prompt` is REQUIRED by api/enquiry.mjs and is rendered as the message block
 * of the notification email, pre-wrap. The qualification answers are composed
 * into it one per line. Without JS the <noscript> textarea carries the same
 * field name instead — which is why the hidden input below starts nameless.
 */
(function () {
  var root = document.querySelector(".fnl");
  if (!root) return;

  var sets = [].slice.call(root.querySelectorAll(".fnl__set"));
  if (!sets.length) return;

  var ladder = root.querySelector(".fnl__steps");
  var count = root.querySelector(".fnl__count");
  var hidden = root.querySelector("#fnl-prompt");
  if (hidden) hidden.name = "prompt";       /* no-JS uses the noscript field */

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

  /* A set that carries radios needs one chosen before it will advance. The
   * browser cannot enforce `required` on a hidden fieldset, so it is done here
   * and the native attribute is left off rather than fighting validation. */
  function answered(set) {
    /* `checkValidity()`, not a non-empty test: "example.com" is non-empty and
     * still not a URL, and letting it through was the defect. */
    var url = set.querySelector('input[type=url]');
    if (url && (!url.value.trim() || !url.checkValidity())) return false;
    var radios = set.querySelectorAll('input[type=radio]');
    if (!radios.length) return true;
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) return true;
    return false;
  }

  function nudge(set) {
    var hint = set.querySelector(".fnl__hint");
    if (!hint) return;
    var was = hint.textContent;
    hint.textContent = "Choose one to continue";
    setTimeout(function () { hint.textContent = was; }, 1800);
  }

  /* -------------------------------------------------------------- the note */
  function compose() {
    if (!hidden) return;
    var lines = [];
    sets.forEach(function (s) {
      var lab = s.getAttribute("data-note");
      if (!lab) return;
      var picked = s.querySelector("input[type=radio]:checked");
      if (picked) lines.push(lab + ": " + picked.value);
    });
    hidden.value = lines.length
      ? "Answers from the free report funnel\n\n" + lines.join("\n")
      : "Free AI visibility report requested from the funnel.";
  }

  /* ------------------------------------------------------------ navigation */
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

  /* choosing an option moves on by itself — the reference's one good habit */
  root.addEventListener("change", function (ev) {
    if (ev.target.type !== "radio") { compose(); return; }
    compose();
    var set = ev.target.closest(".fnl__set");
    if (!set || set !== sets[at]) return;
    if (at < sets.length - 1) setTimeout(function () { show(at + 1); }, 260);
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
