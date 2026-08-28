// QH_PHASE5A_ROUTE_LAB_ONLY
(() => {
  const root = document.documentElement;
  root.dataset.js = "enhanced";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let scheduled = false;

  const update = () => {
    scheduled = false;
    const travel = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / travel));
    root.style.setProperty("--route-progress", progress.toFixed(5));
  };

  const schedule = () => {
    if (scheduled || reduceMotion.matches) return;
    scheduled = true;
    requestAnimationFrame(update);
  };

  if (!reduceMotion.matches) {
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule, { passive: true });
    update();
  }

  const observer = "IntersectionObserver" in window && !reduceMotion.matches
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.dataset.seen = "true";
        }
      }, { rootMargin: "8% 0px", threshold: 0.12 })
    : null;

  if (observer) document.querySelectorAll(".chapter").forEach((chapter) => observer.observe(chapter));
})();
