/* Tool.Cars shared catalog: brand-vs-brand table, head-to-head picker and a
   product grid with brand and type filters. Each product-type page sets the data in its
   own SETTINGS block and calls TC.render({...}). Element ids start with "x".
   Every product shown must have an affiliate link: items without one are skipped. */
(function () {
  function $(id) { return document.getElementById(id); }
  function money(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function cell(v) {
    if (v === true) return '<span class="y">✓</span>';
    if (v === false) return '<span class="n">✗</span>';
    if (v == null || v === "") return '<span class="n">–</span>';
    return esc(v);
  }
  function num(v) { var m = String(v == null ? "" : v).replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; }
  function stars(r) { var n = Math.round(r); return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); }
  var EXT = ' target="_blank" rel="sponsored noopener"';

  function render(cfg) {
    var brands = cfg.brands, B = {};
    brands.forEach(function (b) { B[b.id] = b; });
    var items = cfg.items.filter(function (p) { return p.link && B[p.brand]; });
    var byId = {}; items.forEach(function (p) { byId[p.id] = p; });
    // product types for the type filter: each groups one or more categories (default: one type per category)
    var types = cfg.types || (cfg.cats || []).map(function (c) { return { id: c.id, label: c.title, cats: [c.id] }; });
    function typeOf(p) { for (var i = 0; i < types.length; i++) if (types[i].cats.indexOf(p.cat) > -1) return types[i].id; return ""; }
    // items whose category belongs to a type appear in the grid; the others only in the head-to-head
    function shown() { return items.filter(function (p) { return typeOf(p); }); }
    var curType = "all";
    var params = new URLSearchParams(location.search);
    var cur = B[params.get("brand")] ? params.get("brand") : "all";

    /* ---------- brand vs brand ---------- */
    if ($("xBrands")) {
      var counts = {}; shown().forEach(function (p) { counts[p.brand] = (counts[p.brand] || 0) + 1; });
      var head = '<tr><th></th>' + brands.map(function (b) {
        return '<th><b>' + esc(b.name) + '</b>' + (b.sub ? '<small>' + esc(b.sub) + '</small>' : '') + '</th>';
      }).join("") + '</tr>';
      var rows = cfg.brandRows.map(function (r) {
        return '<tr><th>' + esc(r.label) + '</th>' + brands.map(function (b) {
          var v = r.key === "count" ? (b.count || (counts[b.id] || 0) + ((counts[b.id] || 0) === 1 ? " product" : " products")) :
            r.key === "range" ? (b.range || range(b.id)) : b[r.key];
          return '<td>' + cell(v) + '</td>';
        }).join("") + '</tr>';
      }).join("");
      var foot = '<tr><th></th>' + brands.map(function (b) {
        return '<td><a class="btn sm" href="?brand=' + b.id + '#xShop" data-brand="' + b.id + '">See ' + esc(b.name) + '</a></td>';
      }).join("") + '</tr>';
      $("xBrands").innerHTML = '<thead>' + head + '</thead><tbody>' + rows + foot + '</tbody>';
    }
    function range(id) {
      var pr = items.filter(function (p) { return p.brand === id && p.price > 0; }).map(function (p) { return p.price; });
      if (!pr.length) return "";
      var lo = Math.min.apply(null, pr), hi = Math.max.apply(null, pr);
      return lo === hi ? money(lo) : money(lo) + " – " + money(hi);
    }

    /* ---------- head to head ---------- */
    var specs = cfg.specs || [], hsel = [];
    var h2hItems = items.filter(function (p) { return p.h2h !== false && (!cfg.h2hCats || cfg.h2hCats.indexOf(p.cat) > -1); });
    var presets = (cfg.presets || []).filter(function (p) { return byId[p.a] && byId[p.b]; });
    if ($("xH2h") && h2hItems.length > 1) {
      hsel = presets.length ? [presets[0].a, presets[0].b] : [h2hItems[0].id, h2hItems[1].id];
      $("xPresets").innerHTML = presets.map(function (p, i) { return '<button type="button" data-i="' + i + '">' + esc(p.label) + '</button>'; }).join("");
      $("xPresets").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; var p = presets[+b.getAttribute("data-i")]; hsel = [p.a, p.b]; h2hAll(); };
      $("xSide0").onchange = pick; $("xSide1").onchange = pick;
      h2hAll();
    }
    function pick(e) { var s = e.target; if (!s.hasAttribute("data-side")) return; hsel[+s.getAttribute("data-side")] = s.value; h2hAll(); }
    function options(sel) {
      return brands.map(function (b) {
        var list = h2hItems.filter(function (p) { return p.brand === b.id; });
        if (!list.length) return "";
        return '<optgroup label="' + esc(b.name) + '">' + list.map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === sel ? " selected" : "") + '>' + esc(p.short || p.name) + (p.price ? ' · ' + money(p.price) : '') + '</option>';
        }).join("") + '</optgroup>';
      }).join("");
    }
    function side(i) {
      var p = byId[hsel[i]];
      $("xSide" + i).innerHTML = '<select aria-label="Choose a product" data-side="' + i + '">' + options(p.id) + '</select>' +
        '<a class="pc-img"' + EXT + ' href="' + esc(p.link) + '">' + (p.img ? '<img alt="' + esc(p.name) + '" src="' + esc(p.img) + '">' : '') + '</a>' +
        '<div class="pc-brand">' + esc(B[p.brand].name) + '</div>' +
        '<div class="pc-name">' + esc(p.short || p.name) + '</div><div class="pc-price">' + (p.price ? money(p.price) : '') + '</div>' +
        '<a class="btn sm"' + EXT + ' href="' + esc(p.link) + '">' + esc(B[p.brand].cta || "See price") + '</a>';
    }
    function better(a, b, mode) {
      if (mode === "yes") { var x = a === true, y = b === true; return x === y ? -1 : (x ? 0 : 1); }
      var m = num(a), n = num(b); if (!m || !n || m === n || !mode) return -1;
      return (mode === "high" ? m > n : m < n) ? 0 : 1;
    }
    function h2hAll() {
      side(0); side(1);
      var a = byId[hsel[0]], b = byId[hsel[1]];
      var rows = [["Brand", esc(B[a.brand].name), esc(B[b.brand].name), -1],
        ["Price", a.price ? money(a.price) : "–", b.price ? money(b.price) : "–", better(a.price, b.price, "low")]];
      specs.forEach(function (s) {
        var va = (a.spec || {})[s.key], vb = (b.spec || {})[s.key];
        rows.push([s.label, cell(va), cell(vb), better(va, vb, s.best)]);
      });
      if (a.rating || b.rating) rows.push(["Customer rating",
        a.rating ? a.rating + " ★ (" + Number(a.reviews || 0).toLocaleString("en-US") + ")" : "–",
        b.rating ? b.rating + " ★ (" + Number(b.reviews || 0).toLocaleString("en-US") + ")" : "–", better(a.rating, b.rating, "high")]);
      rows.push(["Where to buy", esc(B[a.brand].store), esc(B[b.brand].store), -1]);
      $("xH2h").innerHTML = rows.map(function (r) {
        return '<tr><th>' + r[0] + '</th><td class="' + (r[3] === 0 ? "win" : "") + '">' + r[1] + '</td><td class="' + (r[3] === 1 ? "win" : "") + '">' + r[2] + '</td></tr>';
      }).join("");
      document.querySelectorAll("#xPresets button").forEach(function (bt) {
        var p = presets[+bt.getAttribute("data-i")]; bt.classList.toggle("on", hsel[0] === p.a && hsel[1] === p.b);
      });
    }

    /* ---------- products ---------- */
    function card(p) {
      var b = B[p.brand], badge = p.was > p.price ? "Save " + Math.round((1 - p.price / p.was) * 100) + "%" : (p.badge || "");
      var btns = (p.links || [{ label: b.cta || "See price", url: p.link }]).map(function (l, i) {
        return '<a class="btn sm' + (i ? ' ghost' : '') + '"' + EXT + ' href="' + esc(l.url) + '">' + esc(l.label) + '</a>';
      }).join("");
      return '<div class="card xcard" data-brand="' + p.brand + '" data-type="' + typeOf(p) + '">' +
        '<a class="thumb' + (p.img ? '' : ' noimg') + '"' + EXT + ' href="' + esc(p.link) + '">' + (badge ? '<span class="badge">' + esc(badge) + '</span>' : '') +
        (p.img ? '<img loading="lazy" alt="' + esc(p.name) + '" src="' + esc(p.img) + '" onerror="this.remove()">' : '') + '</a>' +
        '<div class="body"><span class="kind">' + esc(b.name) + (p.kind ? ' · ' + esc(p.kind) : '') + '</span><h4>' + esc(p.short || p.name) + '</h4>' +
        (p.points && p.points.length ? '<ul>' + p.points.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ul>' : '<ul></ul>') +
        (p.rating ? '<div class="rate"><span>' + stars(p.rating) + '</span> ' + p.rating + ' · ' + Number(p.reviews || 0).toLocaleString("en-US") + ' reviews</div>' : '') +
        (p.price ? '<div class="pr">' + money(p.price) + (p.was > p.price ? ' <s>' + money(p.was) + '</s>' : '') + '</div>' : '') +
        '<div class="btns">' + btns + '</div></div></div>';
    }
    if ($("xCats")) {
      $("xCats").innerHTML = cfg.cats.map(function (c) {
        var list = items.filter(function (p) { return p.cat === c.id; });
        if (!list.length) return "";
        return '<div class="cat xcat" id="cat-' + c.id + '"><h3 class="ct">' + esc(c.title) + '</h3>' + (c.desc ? '<p class="cd">' + esc(c.desc) + '</p>' : '') +
          '<div class="grid">' + list.map(card).join("") + '</div></div>';
      }).join("");
    }
    // one grid for every product, filtered by brand and by type
    if ($("xGrid")) {
      var list = [];
      types.forEach(function (t) { list = list.concat(items.filter(function (p) { return typeOf(p) === t.id; })); });
      $("xGrid").innerHTML = list.map(card).join("");
    }
    if ($("xTypes")) {
      $("xTypes").innerHTML = '<button type="button" data-type="all">All types</button>' + types.map(function (t) {
        return shown().some(function (p) { return typeOf(p) === t.id; }) ? '<button type="button" data-type="' + t.id + '">' + esc(t.label) + '</button>' : '';
      }).join("");
      $("xTypes").onclick = function (e) { var bt = e.target.closest("button"); if (!bt) return; curType = bt.getAttribute("data-type"); filter(cur, false); };
    }
    if ($("xPills")) {
      // extra: products a brand shows outside this grid (a number, or a label such as "250+")
      var extra = cfg.extra || {}, total = shown().length, plus = "";
      Object.keys(extra).forEach(function (k) { total += parseInt(extra[k], 10) || 0; if (typeof extra[k] === "string") plus = "+"; });
      total = total + plus;
      $("xPills").innerHTML = '<button type="button" data-brand="all">All brands<small>' + total + '</small></button>' + brands.map(function (b) {
        var ex = extra[b.id], n = typeof ex === "string" ? ex : shown().filter(function (p) { return p.brand === b.id; }).length + (ex || 0);
        return n ? '<button type="button" data-brand="' + b.id + '">' + esc(b.name) + '<small>' + n + '</small></button>' : '';
      }).join("");
      $("xPills").onclick = function (e) { var bt = e.target.closest("button"); if (!bt) return; filter(bt.getAttribute("data-brand"), true); };
    }
    if (!window.TC_BOUND) document.addEventListener("click", function (e) {
      var a = e.target.closest("#xBrands a[data-brand]"); if (!a) return;
      e.preventDefault(); filter(a.getAttribute("data-brand"), true);
      var s = $("xShop"); if (s) s.scrollIntoView({ behavior: "smooth" });
    });
    window.TC_BOUND = true;
    function filter(id, push) {
      cur = id;
      document.querySelectorAll("#xPills button").forEach(function (bt) { bt.classList.toggle("on", bt.getAttribute("data-brand") === id); });
      // a type the chosen brand doesn't sell is hidden; fall back to all types
      document.querySelectorAll("#xTypes button").forEach(function (bt) {
        var t = bt.getAttribute("data-type");
        bt.hidden = t !== "all" && !document.querySelector('#xGrid .xcard[data-type="' + t + '"]' + (id === "all" ? "" : '[data-brand="' + id + '"]'));
        if (bt.hidden && t === curType) curType = "all";
      });
      document.querySelectorAll("#xTypes button").forEach(function (bt) { bt.classList.toggle("on", bt.getAttribute("data-type") === curType); });
      document.querySelectorAll(".xcard").forEach(function (c) {
        c.hidden = (id !== "all" && c.getAttribute("data-brand") !== id) || (curType !== "all" && c.getAttribute("data-type") !== curType);
      });
      document.querySelectorAll(".xcat").forEach(function (c) { c.hidden = !c.querySelector(".xcard:not([hidden])"); });
      // whole sections that belong to one brand (e.g. a brand's own catalog further down)
      document.querySelectorAll("[data-brand-sec]").forEach(function (s) { s.hidden = id !== "all" && s.getAttribute("data-brand-sec").split(",").indexOf(id) < 0; });
      if (push && history.replaceState) {
        var u = new URL(location.href); if (id === "all") u.searchParams.delete("brand"); else u.searchParams.set("brand", id);
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    }
    filter(cur, false);
    return { items: items, byId: byId };
  }
  window.TC = { render: render, money: money };
})();
