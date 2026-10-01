// Calculadora de tanda compartida por /agua/ y /leche/. Cada página pasa su modelo:
// t = hRef × (rRef/r)^n × q10^((tRef−T)/10) [× sugarFactor(azúcar), solo agua].
function kefirCalc(cfg) {
  "use strict";
  var $ = function (id) {
    return document.getElementById(id);
  };
  var temp = $("temp"),
    ratio = $("ratio"),
    sugar = $("sugar");
  var tempV = $("tempV"),
    ratioV = $("ratioV"),
    sugarV = $("sugarV");
  var hrsEl = $("hrs"),
    gramsEl = $("grams"),
    spoonsEl = $("spoons"),
    clockEl = $("clock"),
    sugarG = $("sugarg");
  var verdict = $("verdict"),
    chart = $("chart"),
    chartR = $("chartR"),
    grid = $("grid");
  var volGroup = $("volGroup"),
    volCustom = $("volCustom"),
    volCustomLabel = $("volCustomLabel");
  var buttons = volGroup.querySelectorAll("button[data-v]");
  var vol = cfg.vol,
    sVal = 0;

  function horas(T, r) {
    var h = cfg.hRef * Math.pow(cfg.rRef / r, cfg.n) * Math.pow(cfg.q10, (cfg.tRef - T) / 10);
    return cfg.sugarFactor ? h * cfg.sugarFactor(sVal) : h;
  }

  try {
    var s = JSON.parse(localStorage.getItem(cfg.key) || "null");
    if (s) {
      if (s.t) temp.value = s.t;
      if (s.r) ratio.value = s.r;
      if (s.v) vol = s.v;
      if (s.sg && sugar) sugar.value = s.sg;
    }
  } catch (e) {}

  function save() {
    try {
      localStorage.setItem(
        cfg.key,
        JSON.stringify({ t: temp.value, r: ratio.value, v: vol, sg: sugar ? sugar.value : undefined }),
      );
    } catch (e) {}
  }

  function num(x, d) {
    return x.toFixed(d === undefined ? 0 : d).replace(".", ",");
  }

  // ---------- geometría de los gráficos ----------
  // Ambos comparten ancho y eje de horas; el de proporción deja arriba sitio para las cucharadas.
  var W = 760,
    H = 330,
    ML = 62,
    MR = 34,
    MT = 16,
    MB = 46;
  var H2 = 350,
    MR2 = 50,
    MT2 = 46;
  var TMIN = 12,
    TMAX = cfg.tMax,
    RMIN = parseFloat(ratio.min),
    RMAX = parseFloat(ratio.max),
    YMIN = 8,
    YMAX = 140;
  var GHOSTS = [5, 10],
    ISO_T = [14, 16, 18, 20, 22],
    TICKS_H = [12, 18, 24, 36, 48, 72, 120];

  function yLog(h, top, bottom) {
    var v = Math.max(YMIN, Math.min(YMAX, h));
    return top + ((Math.log(YMAX) - Math.log(v)) / (Math.log(YMAX) - Math.log(YMIN))) * (bottom - top);
  }
  function px(T) {
    return ML + ((T - TMIN) / (TMAX - TMIN)) * (W - ML - MR);
  }
  function py(h) {
    return yLog(h, MT, H - MB);
  }
  function qx(r) {
    return ML + ((r - RMIN) / (RMAX - RMIN)) * (W - ML - MR2);
  }
  function qy(h) {
    return yLog(h, MT2, H2 - MB);
  }
  // curva h(u) para u en [lo, hi], proyectada con fx/fy
  function path(fx, fy, lo, hi, hOf) {
    var d = "";
    for (var i = 0; i <= 64; i++) {
      var u = lo + ((hi - lo) * i) / 64,
        h = hOf(u);
      if (h > YMAX * 1.02) continue;
      d += (d ? "L" : "M") + fx(u).toFixed(1) + " " + fy(h).toFixed(1);
    }
    return d;
  }
  function byTemp(r) {
    return path(px, py, TMIN, TMAX, function (T) {
      return horas(T, r);
    });
  }
  function byRatio(T) {
    return path(qx, qy, RMIN, RMAX, function (r) {
      return horas(T, r);
    });
  }
  // <tag attr="v" …>text</tag>
  function el(tag, attrs, text) {
    var s = "<" + tag;
    for (var k in attrs) s += " " + k + '="' + attrs[k] + '"';
    return text === undefined ? s + "/>" : s + ">" + text + "</" + tag + ">";
  }
  // anclaje publicado: cuadrado si alcanzó el pH meta, ✕ si nunca cuajó
  function anchorGlyph(a, x, y) {
    if (a.fail) return el("path", { class: "anchor-fail", d: "M" + (x - 5) + " " + (y - 5) + "l10 10m0-10l-10 10" });
    return el("rect", { class: "anchor", x: x - 5, y: y - 5, width: 10, height: 10 });
  }
  var anchors = cfg.anchors || [];
  $("anchors").innerHTML = anchors
    .map(function (a) {
      return '<li><svg viewBox="0 0 12 12" aria-hidden="true">' + anchorGlyph(a, 6, 6) + "</svg>" + a.label + "</li>";
    })
    .join("");

  function drawChart(T, r, h) {
    var p = [],
      plotH = H - MT - MB,
      i;
    p.push(el("rect", { class: "extrap", x: ML, y: MT, width: px(17) - ML, height: plotH }));
    p.push(el("rect", { class: "band", x: px(14), y: MT, width: px(20) - px(14), height: plotH, opacity: ".7" }));
    p.push(el("text", { class: "bandlabel", x: (px(14) + px(20)) / 2, y: MT + 14, "text-anchor": "middle" }, "BOGOTÁ"));

    TICKS_H.forEach(function (t) {
      p.push(el("line", { class: "gridline", x1: ML, y1: py(t), x2: W - MR, y2: py(t) }));
      p.push(el("text", { class: "axis", x: ML - 9, y: py(t) + 4, "text-anchor": "end" }, t + " h"));
    });
    for (i = TMIN; i <= TMAX; i += 2) {
      p.push(el("text", { class: "axis", x: px(i), y: H - MB + 20, "text-anchor": "middle" }, i));
    }
    p.push(
      el("text", { class: "axis", x: (ML + W - MR) / 2, y: H - MB + 40, "text-anchor": "middle" }, "Temperatura ambiente (°C)"),
    );
    p.push(el("line", { class: "extrapline", x1: px(17), y1: MT, x2: px(17), y2: H - MB }));
    p.push(
      el("text", { class: "axis", x: px(17) - 7, y: H - MB - 8, "text-anchor": "end", style: "font-style:italic" }, "extrapolado"),
    );

    GHOSTS.forEach(function (g) {
      if (Math.abs(g - r) > 0.6) p.push(el("path", { class: "curve-ghost", d: byTemp(g) }));
    });
    anchors.forEach(function (a) {
      p.push(anchorGlyph(a, px(a.T), py(a.h)));
    });
    p.push(el("path", { class: "curve", d: byTemp(r) }));

    var cx = px(T),
      cy = py(h),
      right = cx > W - 160;
    p.push(el("line", { class: "gridline", x1: cx, y1: cy, x2: cx, y2: H - MB, "stroke-dasharray": "3 3" }));
    p.push(el("circle", { class: "marker", cx: cx, cy: cy, r: 7 }));
    p.push(
      el(
        "text",
        { class: "readout", x: right ? cx - 13 : cx + 13, y: cy - 13, "text-anchor": right ? "end" : "start" },
        num(h) + " h · " + num(r, 1) + " %",
      ),
    );

    // etiquetas de las curvas fantasma
    GHOSTS.forEach(function (g) {
      if (Math.abs(g - r) <= 0.6) return;
      var hv = horas(TMAX, g);
      if (hv >= YMIN && hv <= YMAX) p.push(el("text", { class: "axis", x: px(TMAX) + 5, y: py(hv) + 4 }, g + "%"));
    });
    chart.innerHTML = p.join("");
  }

  // horas contra proporción: una curva por temperatura, la tuya resaltada
  function drawRatioChart(T, r, h) {
    var p = [],
      plotH = H2 - MT2 - MB,
      z0 = qx(cfg.zone[0]),
      z1 = qx(cfg.zone[1]);
    p.push(el("rect", { class: "band", x: z0, y: MT2, width: z1 - z0, height: plotH, opacity: ".7" }));
    p.push(el("text", { class: "bandlabel", x: (z0 + z1) / 2, y: MT2 + 14, "text-anchor": "middle" }, "RECOMENDADO"));
    p.push(el("rect", { class: "dayband", x: ML, y: qy(30), width: W - MR2 - ML, height: qy(20) - qy(30) }));
    p.push(el("text", { class: "bandlabel", x: ML + 8, y: qy(24.5) + 4 }, "UNA TANDA AL DÍA"));

    TICKS_H.forEach(function (t) {
      p.push(el("line", { class: "gridline", x1: ML, y1: qy(t), x2: W - MR2, y2: qy(t) }));
      p.push(el("text", { class: "axis", x: ML - 9, y: qy(t) + 4, "text-anchor": "end" }, t + " h"));
    });
    cfg.gridR.forEach(function (g) {
      var x = qx(g),
        d = g % 1 ? 1 : 0;
      p.push(el("text", { class: "axis", x: x, y: H2 - MB + 20, "text-anchor": "middle" }, num(g, d)));
      p.push(el("text", { class: "axis", x: x, y: MT2 - 8, "text-anchor": "middle" }, num((g * 10) / cfg.spoonG, 1)));
    });
    p.push(
      el("text", { class: "axis", x: (ML + W - MR2) / 2, y: H2 - MB + 40, "text-anchor": "middle" }, "Proporción (% p/v)"),
    );
    p.push(
      el(
        "text",
        { class: "axis", x: (ML + W - MR2) / 2, y: 14, "text-anchor": "middle" },
        "Cucharadas rasas por litro (1 cda ≈ " + cfg.spoonG + " g)",
      ),
    );

    ISO_T.forEach(function (t) {
      if (Math.abs(t - T) <= 0.6) return;
      p.push(el("path", { class: "curve-ghost", d: byRatio(t) }));
      p.push(el("text", { class: "axis", x: qx(RMAX) + 5, y: qy(horas(t, RMAX)) + 4 }, t + " °C"));
    });
    p.push(el("path", { class: "curve", d: byRatio(T) }));

    var cx = qx(r),
      cy = qy(h),
      right = cx > W - 170;
    p.push(el("line", { class: "gridline", x1: cx, y1: cy, x2: cx, y2: H2 - MB, "stroke-dasharray": "3 3" }));
    p.push(el("circle", { class: "marker", cx: cx, cy: cy, r: 7 }));
    p.push(
      el(
        "text",
        { class: "readout", x: right ? cx - 13 : cx + 13, y: cy - 13, "text-anchor": right ? "end" : "start" },
        num(h) + " h · " + num(T, T % 1 ? 1 : 0) + " °C",
      ),
    );
    chartR.innerHTML = p.join("");
  }

  // ---------- rejilla ----------
  function nearest(list, x) {
    return list.reduce(function (a, b) {
      return Math.abs(b - x) < Math.abs(a - x) ? b : a;
    });
  }
  function ramp(h) {
    return cfg.ramp.filter(function (limit) {
      return h >= limit;
    }).length;
  }
  function drawGrid(T, r) {
    var nearT = nearest(cfg.gridT, T),
      nearR = nearest(cfg.gridR, r);
    var html = "<thead><tr><th></th>";
    cfg.gridR.forEach(function (g) {
      html += '<th scope="col">' + num(g, g % 1 ? 1 : 0) + " %</th>";
    });
    html += "</tr></thead><tbody>";
    cfg.gridT.forEach(function (t) {
      html += '<tr><th scope="row">' + t + " °C</th>";
      cfg.gridR.forEach(function (g) {
        var h = horas(t, g),
          here = t === nearT && g === nearR ? " here" : "";
        html += '<td class="r' + ramp(h) + here + '">' + (h > 96 ? "> 96 h" : num(h) + " h") + "</td>";
      });
      html += "</tr>";
    });
    grid.innerHTML = html + "</tbody>";
  }

  // ---------- actualización ----------
  function update() {
    var T = parseFloat(temp.value),
      r = parseFloat(ratio.value);
    if (sugar) sVal = parseFloat(sugar.value);
    var h = horas(T, r);
    tempV.textContent = num(T, T % 1 ? 1 : 0) + " °C";
    ratioV.textContent = num(r, r % 1 ? 1 : 0) + " % p/v";
    hrsEl.textContent = h > 200 ? "> 200" : num(h);

    var g = (r / 100) * vol;
    gramsEl.textContent = num(g) + " g";
    spoonsEl.textContent = num(g / cfg.spoonG, 1) + " cda";

    if (sugar) {
      var total = Math.round((sVal / 1000) * vol),
        blanca = Math.round(total * 0.75);
      sugarV.textContent = num(sVal) + " g/L";
      sugarG.innerHTML = total + " g<br><small>" + blanca + " g blanca + " + (total - blanca) + " g panela</small>";
    }

    var end = new Date(Date.now() + h * 3600e3);
    var dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
    clockEl.textContent =
      dias[end.getDay()] +
      " " +
      String(end.getHours()).padStart(2, "0") +
      ":" +
      String(end.getMinutes()).padStart(2, "0");

    var v = cfg.verdict(h, sVal);
    verdict.className = "verdict " + v[0];
    verdict.innerHTML = v[1];

    drawChart(T, r, h);
    drawRatioChart(T, r, h);
    drawGrid(T, r);
    save();
  }

  // ---------- volumen ----------
  function pressVol() {
    var match = false;
    Array.prototype.forEach.call(buttons, function (b) {
      var on = parseInt(b.dataset.v, 10) === vol;
      match = match || on;
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    volCustomLabel.classList.toggle("active", !match);
    if (match) volCustom.value = "";
    else volCustom.value = vol;
  }

  volGroup.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]");
    if (!b) return;
    vol = parseInt(b.dataset.v, 10);
    pressVol();
    update();
  });
  volCustom.addEventListener("input", function () {
    var v = parseInt(volCustom.value, 10);
    if (!v || v < 1) return;
    vol = v;
    Array.prototype.forEach.call(buttons, function (b) {
      b.setAttribute("aria-pressed", "false");
    });
    volCustomLabel.classList.add("active");
    update();
  });

  temp.addEventListener("input", update);
  ratio.addEventListener("input", update);
  if (sugar) sugar.addEventListener("input", update);

  // arrastrar sobre un gráfico mueve el control de su eje x (temperatura o proporción)
  function draggable(svg, input, valueAt) {
    var dragging = false,
      lo = parseFloat(input.min),
      hi = parseFloat(input.max);
    function fromPointer(ev) {
      var box = svg.getBoundingClientRect();
      var v = valueAt(((ev.clientX - box.left) / box.width) * W);
      input.value = Math.max(lo, Math.min(hi, Math.round(v * 2) / 2));
      update();
    }
    svg.addEventListener("pointerdown", function (e) {
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    svg.addEventListener("pointermove", function (e) {
      if (dragging) fromPointer(e);
    });
    svg.addEventListener("pointerup", function () {
      dragging = false;
    });
    svg.addEventListener("pointercancel", function () {
      dragging = false;
    });
  }
  draggable(chart, temp, function (x) {
    return TMIN + ((x - ML) / (W - ML - MR)) * (TMAX - TMIN);
  });
  draggable(chartR, ratio, function (x) {
    return RMIN + ((x - ML) / (W - ML - MR2)) * (RMAX - RMIN);
  });

  pressVol();
  update();
}
