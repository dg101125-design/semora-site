/* SIGNALHÄUS — the self-scoring tool. Vanilla, no data leaves the page. */
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
    if (total >= 26) return "Solid, with clear gaps — fix the three below, in order.";
    if (total >= 16) return "You are being chosen on fewer surfaces than you think.";
    return "The advice is likely better than every surface around it.";
  }

  function update() {
    var r = read();
    totalEl.textContent = r.total + " / 44";
    doneEl.textContent = r.answered + " of 11 scored";
    meterEl.style.width = (r.answered / 11 * 100) + "%";
    btn.disabled = r.answered < 11;
    if (r.answered === 11 && !result.hidden) render(r);
  }

  function render(r) {
    var ranked = data.map(function (s, i) {
      return { i: i, name: s.name, why: s.why, score: r.scores[i] };
    }).sort(function (a, b) { return a.score - b.score || a.i - b.i; }).slice(0, 3);
    weakWrap.innerHTML = ranked.map(function (s) {
      return '<div class="weak"><h3>' + String(s.i + 1).padStart(2, "0") + " " +
        s.name + ' — scored ' + s.score + "</h3><p>" + s.why + "</p></div>";
    }).join("");
    verdictEl.textContent = verdict(r.total);
  }

  form.addEventListener("change", update);
  btn.addEventListener("click", function () {
    var r = read();
    if (r.answered < 11) return;
    render(r);
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  update();
})();
