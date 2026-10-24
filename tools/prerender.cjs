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
  { file: "icarzone/index.html", url: "icarzone/", name: "Scan tools",
    ids: ["revs", "xBrands", "xPresets", "xSide0", "xSide1", "xH2h", "xPills", "xTypes", "xGrid"] },
  { file: "carplay-screen/index.html", url: "carplay-screen/", name: "CarPlay",
    ids: ["makes", "count", "grid", "cpCode", "cpText", "revs", "xBrands", "xPresets", "xSide0", "xSide1", "xH2h", "xPills", "xTypes", "xGrid"] },
  { file: "dash-cams/index.html", url: "dash-cams/", name: "Dash cams", ids: ["revs", "xBrands", "xPresets", "xSide0", "xSide1", "xH2h", "xPills", "xTypes", "xGrid"] },
  { file: "tire-inflators/index.html", url: "tire-inflators/", name: "Tire inflators", ids: ["revs", "xBrands", "xPresets", "xSide0", "xSide1", "xH2h", "xPills", "xTypes", "xGrid"] },
  { file: "about/index.html", url: "about/", name: "About", ids: [] },
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
      // page data and the shared catalog renderer run; animation scripts and remote files do not
      if (!u.startsWith("file:") || (/\/assets\/js\//.test(u) && !/\/assets\/js\/catalog\.js$/.test(u))) return r.abort();
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
      try { out.items = ITEMS.filter((p) => p.link).map((p) => ({ name: p.name, img: p.img, price: p.price, link: p.link, brand: p.brand }));
        out.brandNames = Object.fromEntries(BRANDS.map((b) => [b.id, b.name])); } catch (e) {}
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
    const year = new Date().getFullYear();
    html = html.replace(/<span id="y">[^<]*<\/span>/, '<span id="y">' + year + "</span>");

    /* ---------- JSON-LD ---------- */
    const url = SITE + pg.url;
    const graph = [];
    graph.push({ "@type": pg.url === "about/" ? "AboutPage" : "WebPage", "@id": url + "#page", url, name: got.title, description: got.desc,
      ...(got.updated ? { dateModified: got.updated } : {}), isPartOf: { "@id": SITE + "#site" }, publisher: { "@id": SITE + "#org" } });
    if (!pg.url) {
      graph.push({ "@type": "Organization", "@id": SITE + "#org", name: "Tool.Cars", url: SITE,
        description: "Independent comparison site for DIY car tech: OBD2 scan tools, CarPlay screens and adapters, dash cams, tire inflators and jump starters." });
      graph.push({ "@type": "WebSite", "@id": SITE + "#site", name: "Tool.Cars", url: SITE, publisher: { "@id": SITE + "#org" } });
    } else {
      const crumbs = [{ name: "Tool.Cars", item: SITE }];
      if (pg.url.startsWith("icarzone/")) crumbs.push({ name: "Scan tools", item: SITE + "icarzone/" });
      if (pg.url === "carplay-screen/") crumbs.push({ name: "CarPlay", item: url });
      if (pg.url === "dash-cams/") crumbs.push({ name: "Dash cams", item: url });
      if (pg.url === "tire-inflators/") crumbs.push({ name: "Tire inflators", item: url });
      if (pg.url === "about/") crumbs.push({ name: "About", item: url });
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
    if (got.items && got.items.length) {
      const items = got.items.slice(0, 40).map((p) => ({ "@type": "Product", name: p.name,
        brand: { "@type": "Brand", name: got.brandNames[p.brand] || p.brand }, ...(p.img ? { image: p.img } : {}),
        ...(p.price ? { offers: { "@type": "Offer", price: String(p.price), priceCurrency: "USD", url: p.link } } : {}) }));
      graph.push({ "@type": "ItemList", name: pg.name + " compared on Tool.Cars",
        itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, item: it })) });
    }
    const ld = '<script type="application/ld+json" id="ld-main">\n' +
      JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 1).replace(/</g, "\\u003c") + "\n</script>";
    html = setHead(html, "ld-main", ld);
    /* ---------- share cards (Facebook, Zalo, X...) ---------- */
    const ogImg = /^https?:/.test(got.h1img) ? got.h1img : SITE + "assets/img/logo-t-512.png";
    [["og-type", "property", "og:type", "website"], ["og-site", "property", "og:site_name", "Tool.Cars"],
     ["og-title", "property", "og:title", got.title], ["og-desc", "property", "og:description", got.desc],
     ["og-url", "property", "og:url", url], ["og-img", "property", "og:image", ogImg],
     ["tw-card", "name", "twitter:card", "summary_large_image"]].forEach(([id, attr, key, val]) => {
      html = setHead(html, id, '<meta id="' + id + '" ' + attr + '="' + key + '" content="' + esc(val) + '">');
    });
    html = setHead(html, "canonical", '<link rel="canonical" id="canonical" href="' + url + '">');

    fs.writeFileSync(file, html);
    console.log("ok", pg.file, "| blocks:", pg.ids.length, "| faq:", got.faq.length, "| schema nodes:", graph.length);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
