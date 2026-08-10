/* SEMÖRA — the self-scoring tool. Vanilla, no data leaves the page. */
(function () {
  "use strict";
  var data = JSON.parse(document.getElementById("surface-data").textContent);
  var form = document.getElementById("score-form");
  var totalEl = document.getElementById("sb-total");
  var doneEl = document.getElementById("sb-done");
  var meterEl = document.getElementById("sb-meter");
  var btn = document.getElementById("sb-see");
  var result = document.getElementById("result");
  var weakWrap = document.getElementById("weak-list");
  var verdictEl = document.getElementById("verdict");
  var headEl = document.getElementById("weak-heading");

  function read() {
    var scores = {}, answered = 0, total = 0;
    data.forEach(function (s, i) {
      var v = form.querySelector('input[name="s' + (i + 1) + '"]:checked');
      if (v) { scores[i] = +v.value; answered += 1; total += +v.value; }
    });
    return { scores: scores, answered: answered, total: total };
  }

  function verdict(total) {
    if (total >= 36) return "Strong. Consistency is now the surface to guard.";
    if (total >= 26) return "Solid, with clear gaps — start with the surfaces below.";
    if (total >= 16) return "You are being chosen on fewer surfaces than you think.";
    return "The advice is likely better than every surface around it.";
  }

  function render(r) {
    var ranked = data.map(function (s, i) {
      return { i: i, name: s.name, why: s.why, score: r.scores[i] };
    }).sort(function (a, b) { return a.score - b.score || a.i - b.i; }).slice(0, 3);
    var anyWeak = ranked.some(function (s) { return s.score <= 2; });
    headEl.textContent = anyWeak ? "Your three weakest surfaces"
                                 : "Your three lowest surfaces — holding";
    weakWrap.innerHTML = ranked.map(function (s) {
      var line = s.score <= 2
        ? s.why
        : "Scored " + s.score + " — strong today. The risk here is drift, not absence: hold the line.";
      return '<div class="weak"><h3>' + String(s.i + 1).padStart(2, "0") + " " +
        s.name + " — scored " + s.score + "</h3><p>" + line + "</p></div>";
    }).join("");
    verdictEl.textContent = verdict(r.total);
  }

  function update() {
    var r = read();
    totalEl.textContent = r.total + " / 44";
    doneEl.textContent = r.answered + " of 11 scored";
    meterEl.style.width = (r.answered / 11 * 100) + "%";
    btn.disabled = r.answered < 11;
    if (r.answered === 11 && !result.hidden) render(r);
  }

  form.addEventListener("change", update);
  btn.addEventListener("click", function () {
    var r = read();
    if (r.answered < 11) return;
    render(r);
    result.hidden = false;
    /* behavior "auto" defers to CSS scroll-behavior, which the stylesheet
       already gates on prefers-reduced-motion */
    result.scrollIntoView({ block: "start" });
    result.focus({ preventScroll: true });
  });
  update();
})();
