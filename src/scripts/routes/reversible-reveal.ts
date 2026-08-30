const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function enhanceReversibleReveals(root: ParentNode = document) {
  const targets = [...root.querySelectorAll<HTMLElement>("[data-route-reveal]")];
  if (targets.length === 0) return;

  document.documentElement.dataset.routeEnhanced = "true";
  const resolveAll = () => targets.forEach((target) => { target.dataset.routeResolved = "true"; });

  if (matchMedia(REDUCED_MOTION).matches || !("IntersectionObserver" in window)) {
    resolveAll();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      (entry.target as HTMLElement).dataset.routeResolved = entry.isIntersecting ? "true" : "false";
    }
  }, { rootMargin: "-10% 0px -10%", threshold: 0.04 });

  targets.forEach((target) => observer.observe(target));
}
