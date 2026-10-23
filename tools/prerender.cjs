/* Tool.Cars prerender: copies what the page scripts draw into the HTML files,
   so search engines and AI crawlers (which do not run JavaScript) see every
   product, comparison row, review and FAQ. Also writes JSON-LD schema.

   Run after editing a SETTINGS block:   node tools/prerender.cjs
   (needs Playwright + Chromium). The page scripts still run in the browser and
   redraw the same blocks, so nothing changes for visitors. */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://tool.goldenpasss.com/";

const PAGES = [
  { file: "index.html", url: "", name: "Tool.Cars",
    ids: ["nav", "chart", "brandGrid"] },
  { file: "icarzone/index.html", url: "icarzone/", name: "iCARZONE diagnostic tools",
    ids: ["presets", "side0", "side1", "h2hBody", "cmpBody", "pills", "cats", "revs"] },
  { file: "carplay-screen/index.html", url: "carplay-screen/", name: "CarPlay screens",
    ids: ["presets", "side0", "side1", "h2hBody", "makes", "count", "grid", "cpCode", "cpText"] },
  { file: "icarzone/ma900/index.html", url: "icarzone/ma900/", name: "iCARZONE MA900 review", ids: [] }
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const price = (s) => { const m = String(s || "").replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? m[0] : null; };

function setInner(html, id, inner) {
  const re = new RegExp('(id="' + id + '"[^>]*>)(?:<!--pre-->[\\s\\S]*?<!--/pre-->)?(?=</)');
  if (!re.test(html)) throw new Error("container #" + id + " not found or not empty");
  return html.replace(re, (_, open) => open + "<!--pre-->" + inner + "<!--/pre-->");
}

function setHead(html, id, tag) {
  const re = tag.startsWith("<script")
    ? new RegExp('\\n?<script[^>]+id="' + id + '"[^>]*>[\\s\\S]*?</script>')
    : new RegExp('\\n?<[^>]+id="' + id + '"[^>]*>');
  html = html.replace(re, "");
  return html.replace("</head>", () => tag + "\n</head>");
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  for (const pg of PAGES) {
    const file = path.join(ROOT, pg.file);
    const page = await browser.newPage();
    // offline and deterministic: built-in data only, no animation scripts
    await page.route("**/*", (r) => {
      const u = r.request().url();
      if (!u.startsWith("file:") || /\/assets\/js\//.test(u)) return r.abort();
      return r.continue();
    });
    await page.goto("file://" + file, { waitUntil: "load" });
    await page.waitForTimeout(800);

    const got = await page.evaluate((ids) => {
      const out = { blocks: {}, links: {} };
      ids.forEach((id) => { const el = document.getElementById(id); out.blocks[id] = el ? el.innerHTML : null; });
      ["data-main", "data-buy"].forEach((a) => { const el = document.querySelector("[" + a + "]"); if (el && el.href.indexOf("#") < 0) out.links[a] = el.getAttribute("href"); });
      out.faq = [...document.querySelectorAll(".faq details")].map((d) => ({
        q: d.querySelector("summary").textContent.trim(), a: d.querySelector("p").textContent.trim() }));
      out.title = document.title;
      out.desc = (document.querySelector('meta[name="description"]') || {}).content || "";
      const t = document.querySelector("footer time[datetime]"); out.updated = t ? t.getAttribute("datetime") : "";
      out.h1img = (document.querySelector("main img") || {}).src || "";
      /* page data for product schema */
      try { out.compare = COMPARE; out.products = PRODUCTS; out.site = SITE; } catch (e) {}
      try { out.all = ALL.map((p) => ({ name: p.name, title: p.title, lo: p.lo, img: p.img, h: p.h })); out.store = STORE; } catch (e) {}
      try { out.buy = BUY_LINK; } catch (e) {}
      return out;
    }, pg.ids);
    await page.close();

    let html = fs.readFileSync(file, "utf8");
    for (const id of pg.ids) {
      if (got.blocks[id] == null) throw new Error(pg.file + ": #" + id + " missing");
      html = setInner(html, id, got.blocks[id]);
    }
    for (const a in got.links) {
      html = html.replace(new RegExp(a + ' href="[^"]*"( target="_blank" rel="sponsored noopener")?', "g"),
        a + ' href="' + esc(got.links[a]) + '" target="_blank" rel="sponsored noopener"');
    }
    if (pg.file === "icarzone/ma900/index.html" && got.buy) {
      html = html.replace(/data-buy href="[^"]*"( target="_blank" rel="sponsored noopener")?/g,
        'data-buy href="' + esc(got.buy) + '" target="_blank" rel="sponsored noopener"');
    }
    const year = new Date().getFullYear();
    html = html.replace(/<span id="y">[^<]*<\/span>/, '<span id="y">' + year + "</span>");

    /* ---------- JSON-LD ---------- */
    const url = SITE + pg.url;
    const graph = [];
    graph.push({ "@type": "WebPage", "@id": url + "#page", url, name: got.title, description: got.desc,
      ...(got.updated ? { dateModified: got.updated } : {}), isPartOf: { "@id": SITE + "#site" }, publisher: { "@id": SITE + "#org" } });
    if (!pg.url) {
      graph.push({ "@type": "Organization", "@id": SITE + "#org", name: "Tool.Cars", url: SITE,
        description: "Independent review and comparison site for DIY car diagnostic tools and CarPlay screen upgrades." });
      graph.push({ "@type": "WebSite", "@id": SITE + "#site", name: "Tool.Cars", url: SITE, publisher: { "@id": SITE + "#org" } });
    } else {
      const crumbs = [{ name: "Tool.Cars", item: SITE }];
      if (pg.url.startsWith("icarzone/")) crumbs.push({ name: "iCARZONE diagnostic tools", item: SITE + "icarzone/" });
      if (pg.url === "carplay-screen/") crumbs.push({ name: "CarPlay screens", item: url });
      if (pg.url === "icarzone/ma900/") crumbs.push({ name: "MA900", item: url });
      graph.push({ "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })) });
    }
    if (got.faq.length) {
      graph.push({ "@type": "FAQPage", "@id": url + "#faq", mainEntity: got.faq.map((f) => ({
        "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
    }
    const slugOf = (l) => { const m = String(l).match(/\/products\/([^?#]+)/); return m ? m[1] : ""; };
    if (got.compare) {
      const items = got.compare.map((r) => {
        const p = got.products.find((x) => slugOf(x.link) === r.slug) || {};
        const pr = price(r.price);
        return { "@type": "Product", name: "iCARZONE " + (p.name || r.name), brand: { "@type": "Brand", name: "iCARZONE" },
          ...(p.img ? { image: p.img } : {}), description: (p.points || [r.sub]).join(". "),
          ...(pr ? { offers: { "@type": "Offer", price: pr, priceCurrency: "USD", url: got.site + r.slug } } : {}) };
      });
      graph.push({ "@type": "ItemList", name: "iCARZONE scan tools and battery testers compared",
        itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, item: it })) });
    }
    if (got.all) {
      const items = got.all.filter((p) => p.lo > 0).slice(0, 30).map((p) => ({ "@type": "Product", name: p.title,
        brand: { "@type": "Brand", name: "Youducar" }, ...(p.img ? { image: (p.img.indexOf("//") === 0 ? "https:" : "") + p.img } : {}),
        offers: { "@type": "Offer", price: String(p.lo), priceCurrency: "USD", url: got.store + "/products/" + p.h } }));
      graph.push({ "@type": "ItemList", name: "Youducar CarPlay and Android Auto head units by vehicle",
        itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, item: it })) });
    }
    if (pg.url === "icarzone/ma900/") {
      graph.push({ "@type": "Product", name: "iCARZONE MA900 OBD2 Scanner & 12V/24V Battery Tester", sku: "MA900",
        brand: { "@type": "Brand", name: "iCARZONE" }, image: url + "ma900.png",
        description: "2-in-1 handheld tool: full OBD2 code reader (all 10 modes, live data, freeze frame, I/M readiness) plus 12V/24V battery, cranking and charging system tester. Lifetime free updates, no subscription.",
        offers: { "@type": "Offer", price: "69.99", priceCurrency: "USD", url: "https://www.icarzone.com/products/ma900" } });
    }
    const ld = '<script type="application/ld+json" id="ld-main">\n' +
      JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 1).replace(/</g, "\\u003c") + "\n</script>";
    html = setHead(html, "ld-main", ld);
    html = setHead(html, "canonical", '<link rel="canonical" id="canonical" href="' + url + '">');

    fs.writeFileSync(file, html);
    console.log("ok", pg.file, "| blocks:", pg.ids.length, "| faq:", got.faq.length, "| schema nodes:", graph.length);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
