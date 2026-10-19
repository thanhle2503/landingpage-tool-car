(() => {
  const root = document.documentElement;
  if (!window.gsap) { root.classList.remove("js"); return; }
  window.__motion = true;
  const mm = gsap.matchMedia();
  mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, ctx => {
    if (ctx.conditions.reduce) { gsap.set("[data-hero],[data-reveal]", { autoAlpha: 1 }); return; }

    // Hero: one short sequence, the picker rows land last
    gsap.timeline({ defaults: { ease: "power3.out", duration: 0.6 } })
      .fromTo(".hero .tag", { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1 })
      .fromTo(".hero h1", { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7 }, "-=0.4")
      .fromTo(".hero p", { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1 }, "-=0.45")
      .fromTo(".needs a", { x: 18, autoAlpha: 0 }, { x: 0, autoAlpha: 1, stagger: 0.08, duration: 0.5 }, "-=0.35");

    // Sections below the first screen fade in as they scroll into view.
    // Anything already on screen at load stays put, so the page is never blank.
    const below = [...document.querySelectorAll("[data-reveal-group]")]
      .filter(g => g.getBoundingClientRect().top > window.innerHeight);
    below.forEach(g => gsap.set(g.querySelectorAll("[data-reveal]"), { autoAlpha: 0 }));
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      gsap.fromTo(e.target.querySelectorAll("[data-reveal]"),
        { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.55, ease: "power2.out", stagger: 0.08 });
    }), { rootMargin: "0px 0px -10% 0px" });
    below.forEach(g => io.observe(g));
  });
})();
