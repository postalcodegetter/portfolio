(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---------- stagger helper ---------- */
  $$("[data-stagger]").forEach((g) => [...g.children].forEach((el, i) => el.style.setProperty("--i", i)));

  /* ---------- hero entrance ---------- */
  const hero = $(".hero");
  requestAnimationFrame(() => requestAnimationFrame(() => hero && hero.classList.add("in")));

  /* ---------- count-up ---------- */
  const countUp = (el) => {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    if (reduce) { el.textContent = target + suffix; return; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / 1400, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 4))) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /* ---------- reveal on scroll ---------- */
  const targets = $$(".reveal, .panel, .planet");
  if (reduce || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in"));
    $$("[data-count]").forEach(countUp);
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add("in");
        $$("[data-count]", en.target).forEach(countUp);
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    targets.forEach((el) => io.observe(el));
  }

  /* ---------- quick-read toggle ---------- */
  const toggle = $("#view-toggle");
  const label = $("#view-label");
  const applyView = (plain) => {
    root.classList.toggle("plain", plain);
    toggle.setAttribute("aria-pressed", String(plain));
    label.textContent = plain ? "Explore" : "Quick read";
    try { localStorage.setItem("view", plain ? "plain" : "tour"); } catch (_) { /* storage may be unavailable */ }
    measure();
    if (uni) uni.setEnabled(!plain);
  };
  const flip = () => applyView(!root.classList.contains("plain"));
  toggle.addEventListener("click", flip);
  $$("[data-toggle-view]").forEach((b) => b.addEventListener("click", flip));

  /* ---------- star map (mobile overlay + desktop dots) ---------- */
  const map = $("#starmap");
  const mapBtn = $("#map-btn");
  const setMap = (open) => {
    map.classList.toggle("is-open", open);
    mapBtn.setAttribute("aria-expanded", String(open));
    mapBtn.setAttribute("aria-label", open ? "Close star map" : "Open star map");
  };
  mapBtn.addEventListener("click", () => setMap(!map.classList.contains("is-open")));
  $$("a", map).forEach((a) => a.addEventListener("click", () => setMap(false)));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && map.classList.contains("is-open")) { setMap(false); mapBtn.focus(); } });
  matchMedia("(min-width: 901px)").addEventListener("change", (e) => { if (e.matches) setMap(false); });

  /* ---------- sector tracking (HUD, map, nebula tint) ---------- */
  const stops = $$(".stop");
  const hudSector = $("#hud-sector");
  const mapLinks = new Map($$("a", map).map((a) => [a.getAttribute("href").slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = en.target.id;
      root.dataset.sector = id;
      hudSector.textContent = `Sector ${String(en.target.dataset.i).padStart(2, "0")} · ${en.target.dataset.sector}`;
      mapLinks.forEach((a) => { a.classList.remove("is-active"); a.removeAttribute("aria-current"); });
      const a = mapLinks.get(id);
      if (a) { a.classList.add("is-active"); a.setAttribute("aria-current", "true"); }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  stops.forEach((s) => spy.observe(s));

  /* ---------- scroll-driven parallax + progress + distance ---------- */
  const bar = $(".progress");
  const dist = $("#hud-dist");
  let vh = innerHeight;
  let tops = [];
  const measure = () => {
    vh = innerHeight;
    tops = stops.map((s) => { const r = s.getBoundingClientRect(); return { el: s, top: r.top + scrollY, h: r.height }; });
  };

  const updateParallax = () => {
    const y = scrollY;
    const plain = root.classList.contains("plain");
    const max = root.scrollHeight - vh;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    dist.textContent = (y / 120).toFixed(1);
  };

  /* ---------- 3D universe ---------- */
  const ids = ["launch", "home", "orka", "market", "reels", "clients", "chart", "log", "signal"];
  let uni = null;
  const schedule = () => { if (uni) uni.request(); };
  const initUniverse = () => {
    if (uni || !window.UniverseMod) return;
    try { uni = UniverseMod.create({ canvas: $("#space"), ids, reduce }); } catch (_) { uni = null; }
    if (!uni) { applyView(true); root.classList.add("no-webgl"); return; }
    root.classList.add("has-3d");
    if (root.classList.contains("plain")) uni.setEnabled(false);
    uni.onStage((st) => { root.classList.toggle("is-flying", st.flying); });
  };
  const boot = () => { measure(); updateParallax(); initUniverse(); };
  boot();
  addEventListener("scroll", updateParallax, { passive: true });
  addEventListener("resize", () => { measure(); updateParallax(); });
  addEventListener("load", () => { measure(); updateParallax(); if (uni) uni.measure(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); updateParallax(); if (uni) uni.measure(); });

  /* ---------- planets say hello ---------- */
  let talkTimer;
  $$(".planet").forEach((p) => {
    const bubble = $(".bubble", p);
    p.addEventListener("click", () => {
      $$(".planet.is-talking").forEach((o) => { if (o !== p) o.classList.remove("is-talking"); });
      bubble.textContent = p.dataset.say;
      p.classList.add("is-talking");
      clearTimeout(talkTimer);
      talkTimer = setTimeout(() => p.classList.remove("is-talking"), 4500);
    });
  });

  /* ---------- fun facts ---------- */
  const facts = [
    "I've been building websites for clients since 2023.",
    "I captained my school chess team for three years in a row.",
    "I did four years of school drama, so I'm fine explaining my work out loud.",
    "My trading system's main job is to try to prove itself wrong.",
    "A small bot of mine can render and publish a short video without me touching it.",
    "I work on cable routing and React in the same week. It's a good mix.",
  ];
  let fi = -1;
  const factBtn = $("#fact-btn"), factText = $("#fact-text");
  if (factBtn) factBtn.addEventListener("click", () => {
    fi = (fi + 1) % facts.length;
    factText.textContent = facts[fi];
  });

  /* ---------- photo: show it when the file exists ---------- */
  const img = $(".photo img");
  if (img) {
    img.addEventListener("load", () => { img.hidden = false; const ph = $(".photo__ph"); if (ph) ph.hidden = true; });
    img.hidden = false;
    img.addEventListener("error", () => { img.hidden = true; });
    if (img.complete && img.naturalWidth === 0) img.hidden = true;
  }

  /* ---------- magnetic buttons ---------- */
  if (!reduce && matchMedia("(hover: hover)").matches) {
    $$("[data-magnetic]").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.translate = `${(e.clientX - (r.left + r.width / 2)) * 0.18}px ${(e.clientY - (r.top + r.height / 2)) * 0.25}px`;
      });
      el.addEventListener("mouseleave", () => { el.style.translate = ""; });
    });
  }

  /* ---------- contact form ---------- */
  const form = $("form[name=contact]");
  if (form) {
    const msg = $(".form__msg", form);
    const btn = $("button[type=submit]", form);
    const original = btn.innerHTML;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.classList.remove("is-error");
      msg.textContent = "Sending…";
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      try {
        const body = new URLSearchParams(new FormData(form)).toString();
        const res = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        msg.textContent = "Signal received. Thank you, I'll be in touch.";
      } catch (_) {
        msg.classList.add("is-error");
        msg.innerHTML = 'That signal got lost. Please email me directly: <a href="mailto:rolandoosthuizen09@gmail.com">rolandoosthuizen09@gmail.com</a>';
      } finally {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = original;
      }
    });
  }

  /* ---------- initial state ---------- */
  const startPlain = root.classList.contains("plain");
  toggle.setAttribute("aria-pressed", String(startPlain));
  label.textContent = startPlain ? "Explore" : "Quick read";
  root.dataset.sector = "launch";
})();
