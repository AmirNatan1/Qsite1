// QH_PHASE5AR_ROUTE_LAB_ONLY
(() => {
  const root = document.documentElement;
  root.dataset.js = "enhanced";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const route = root.dataset.route ?? "";
  const motionMode = new Map([
    ["for-industry", "C"],
    ["for-startups", "C"],
    ["industries", "C"],
    ["proof", "B"],
    ["maradin", "B"],
    ["spark", "B"],
    ["about", "B"],
    ["contact", "A"],
    ["404", "A"],
  ]).get(route) ?? "A";
  root.dataset.motionMode = motionMode;

  if (reduceMotion.matches || motionMode === "A") return;

  const acts = [...document.querySelectorAll("[data-act]")];
  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          entry.target.dataset.inView = entry.isIntersecting ? "true" : "false";
        }
      }, { rootMargin: "-18% 0px -18%", threshold: [0, 0.2, 0.6] })
    : null;
  if (observer) acts.forEach((act) => observer.observe(act));

})();
