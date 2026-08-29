const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function enhanceBoundedReveals(root: ParentNode = document) {
  const targets = [...root.querySelectorAll<HTMLElement>("[data-route-reveal]")];
  if (targets.length === 0) return;

  document.documentElement.dataset.routeEnhanced = "true";

  if (matchMedia(REDUCED_MOTION).matches || !("IntersectionObserver" in window)) {
    targets.forEach((target) => { target.dataset.routeResolved = "true"; });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      (entry.target as HTMLElement).dataset.routeResolved = "true";
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "-12% 0px -12%", threshold: 0.16 });

  targets.forEach((target) => observer.observe(target));
}
