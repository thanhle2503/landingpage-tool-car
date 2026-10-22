/* Tool.Cars page transitions (GSAP).
   Leaving: the clicked product's photo lifts off and flies to the centre while a white
   sheet grows from the click point and the brand name slides in. Arriving: the same photo
   lands on the matching picture in the new page's hero, then the sheet lifts away.
   Works on every page that loads gsap.min.js + this file. */
(() => {
  const KEY = "tc-transit";
  const reduce = false; // keep the page-change animation on every device (phones in battery saver report "reduce motion")
  const root = document.documentElement;

  // Brand names + a stand-in photo for links that carry no picture (header tabs)
  const DEST = {
    "icarzone/ma900/": { name: "MA900 scanner & battery tester", img: "https://www.icarzone.com/cdn/shop/files/MA900_2186dd7e-3f91-436d-9f80-54f632fb4097.png?v=1781594039&width=900" },
    "icarzone/": { name: "iCARZONE diagnostic tools", img: "https://www.icarzone.com/cdn/shop/files/JU2000MAX_19020c62-5f51-4d31-a787-17b494b93b37.png?v=1781593755&width=900" },
    "carplay-screen/": { name: "Youducar CarPlay screens", img: "https://cdn.shopify.com/s/files/1/0637/7527/7119/files/2020-2025_-RAV4.jpg?v=1781866897&width=900", cover: true },
    "": { name: "All brands", img: "" }
  };
  const siteRoot = (() => { const s = document.currentScript && document.currentScript.src; return s ? new URL("../../", s) : new URL("/", location.href); })();
  const keyFor = (url) => { const p = url.href.slice(siteRoot.href.length).split(/[?#]/)[0].replace(/index\.html$/, ""); return Object.keys(DEST).find((k) => p === k) ?? null; };
  const fileOf = (src) => (src || "").split("?")[0].split("/").pop();

  // ---------- the veil ----------
  function veil() {
    let v = document.querySelector(".tc-veil");
    if (v) return v;
    v = document.createElement("div");
    v.className = "tc-veil";
    v.setAttribute("aria-hidden", "true");
    v.innerHTML = '<div class="tc-sheet"></div><div class="tc-bar"></div><div class="tc-label"><span></span></div><div class="tc-fly"><img alt=""></div>';
    document.body.appendChild(v);
    return v;
  }
  const centreBox = (cover) => {
    const s = Math.min(innerWidth * (cover ? 0.78 : 0.52), cover ? 560 : 380);
    const h = cover ? s * 0.62 : s;
    return { left: (innerWidth - s) / 2, top: (innerHeight - h) / 2 - 24, width: s, height: h };
  };

  const placeLabel = (v, cover, hasPic) => { const b = centreBox(cover); v.querySelector(".tc-label").style.top = (hasPic ? b.top + b.height + 26 : innerHeight / 2 - 24) + "px"; };

  // the picture inside / behind a clicked link
  function pictureFor(a) {
    const host = a.closest("[data-fly]") || a;
    const img = host.querySelector("img");
    if (img && img.getBoundingClientRect().width > 20) return { src: img.currentSrc || img.src, rect: img.getBoundingClientRect(), cover: getComputedStyle(img).objectFit === "cover" };
    const bg = host.querySelector(".img");
    if (bg) {
      const m = getComputedStyle(bg).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
      if (m) return { src: m[1], rect: bg.getBoundingClientRect(), cover: bg.classList.contains("cover") };
    }
    return null;
  }

  // ---------- leaving ----------
  function leave(a, url, ev) {
    const k = keyFor(url);
    const d = DEST[k] || { name: "", img: "" };
    const pic = pictureFor(a) || (d.img ? { src: d.img, rect: null, cover: !!d.cover } : null);
    try { sessionStorage.setItem(KEY, JSON.stringify({ src: pic ? pic.src : "", cover: pic ? pic.cover : false, name: d.name, t: Date.now() })); } catch (e) {}
    const v = veil();
    v.querySelector(".tc-label span").textContent = d.name;
    placeLabel(v, pic && pic.cover, !!(pic && pic.src));
    const fly = v.querySelector(".tc-fly"), img = fly.querySelector("img");
    v.classList.add("on");
    const x = ev && ev.clientX ? ev.clientX : innerWidth / 2, y = ev && ev.clientY ? ev.clientY : innerHeight / 2;
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 20;
    const tl = gsap.timeline({ onComplete: () => { location.href = url.href; } });
    tl.fromTo(v.querySelector(".tc-sheet"), { clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)`, duration: 0.55, ease: "power3.inOut" }, 0)
      .fromTo(v.querySelector(".tc-bar"), { scaleX: 0 }, { scaleX: 0.35, duration: 0.6, ease: "power2.out" }, 0.15)
      .fromTo(v.querySelector(".tc-label span"), { y: 0, yPercent: 110 }, { yPercent: 0, duration: 0.45, ease: "power3.out" }, 0.28);
    if (pic && pic.src) {
      img.src = pic.src;
      fly.classList.toggle("cover", !!pic.cover);
      const from = pic.rect || centreBox(pic.cover), to = centreBox(pic.cover);
      gsap.set(fly, { display: "block", left: from.left, top: from.top, width: from.width, height: from.height, autoAlpha: pic.rect ? 1 : 0, rotation: 0 });
      tl.to(fly, { left: to.left, top: to.top, width: to.width, height: to.height, autoAlpha: 1, rotation: -2, duration: 0.7, ease: "power3.inOut" }, 0.02);
    } else gsap.set(fly, { display: "none" });
    tl.to({}, { duration: 0.12 });
  }

  // ---------- arriving ----------
  function arrive() {
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch (e) {}
    root.classList.remove("tc-arrive");
    if (!st || Date.now() - st.t > 6000 || reduce || !window.gsap) return;
    const v = veil();
    v.querySelector(".tc-label span").textContent = st.name || "";
    placeLabel(v, st.cover, !!st.src);
    gsap.set(v.querySelector(".tc-label span"), { y: 0, yPercent: 0 });
    const fly = v.querySelector(".tc-fly"), img = fly.querySelector("img");
    v.classList.add("on");
    const box = centreBox(st.cover);
    gsap.set(v.querySelector(".tc-sheet"), { clipPath: "inset(0% 0% 0% 0%)" });
    gsap.set(v.querySelector(".tc-bar"), { scaleX: 0.35 });
    // where to land: a hero picture with the same file, else the first [data-land]
    const cands = [...document.querySelectorAll("[data-land]")];
    const want = fileOf(st.src);
    const land = cands.find((el) => fileOf(el.currentSrc || el.src) === want) || cands[0];
    const tl = gsap.timeline({ onComplete: () => { v.classList.remove("on"); gsap.set(fly, { clearProps: "all" }); if (land) gsap.set(land, { clearProps: "opacity,visibility" }); } });
    if (st.src) {
      img.src = st.src;
      fly.classList.toggle("cover", !!st.cover);
      gsap.set(fly, { display: "block", left: box.left, top: box.top, width: box.width, height: box.height, rotation: -2, autoAlpha: 1 });
    } else gsap.set(fly, { display: "none" });
    tl.to(v.querySelector(".tc-bar"), { scaleX: 1, duration: 0.35, ease: "power2.in" }, 0.05)
      .to(v.querySelector(".tc-label span"), { yPercent: -110, duration: 0.35, ease: "power2.in" }, 0.15);
    if (land && st.src) {
      const r = land.getBoundingClientRect();
      const onScreen = r.bottom > 0 && r.top < innerHeight;
      if (onScreen) {
        gsap.set(land, { autoAlpha: 0 });
        const m = getComputedStyle(land).transform.match(/matrix\(([^,]+),\s*([^,]+)/);
        const rot = m ? (Math.atan2(+m[2], +m[1]) * 180) / Math.PI : 0;
        tl.to(fly, { left: r.left, top: r.top, width: r.width, height: r.height, rotation: rot, duration: 0.75, ease: "power3.inOut" }, 0.25)
          .to(land, { autoAlpha: 1, duration: 0.2 }, 0.95)
          .to(fly, { autoAlpha: 0, duration: 0.2 }, 1.0);
      } else tl.to(fly, { scale: 0.6, autoAlpha: 0, duration: 0.4, ease: "power2.in" }, 0.3);
    } else if (st.src) tl.to(fly, { scale: 0.6, autoAlpha: 0, duration: 0.4, ease: "power2.in" }, 0.3);
    tl.to(v.querySelector(".tc-sheet"), { clipPath: "inset(0% 0% 100% 0%)", duration: 0.6, ease: "power3.inOut" }, 0.4)
      .to(v.querySelector(".tc-bar"), { autoAlpha: 0, duration: 0.2 }, 0.5);
  }

  // ---------- wiring ----------
  document.addEventListener("click", (e) => {
    if (reduce || !window.gsap || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.getAttribute("href"), location.href);
    if (url.origin !== location.origin || !url.href.startsWith(siteRoot.href)) return;
    if (url.pathname === location.pathname && url.hash) return; // in-page jump
    if (url.pathname === location.pathname && !url.hash) { e.preventDefault(); return; } // current tab
    if (keyFor(url) === null) return;
    e.preventDefault();
    e.stopPropagation();
    leave(a, url, e);
  }, true);

  // back/forward cache: never come back to a covered page
  addEventListener("pageshow", (e) => { if (e.persisted) { const v = document.querySelector(".tc-veil"); if (v) v.classList.remove("on"); } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrive); else arrive();
})();
