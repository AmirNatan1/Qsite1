type ProgressUpdate = (progress: number, actProgress: readonly number[]) => void;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function bindDocumentProgress(root: HTMLElement, selector: string, update: ProgressUpdate) {
  const preference = matchMedia(REDUCED_MOTION);
  const acts = Array.from(root.querySelectorAll<HTMLElement>(selector));
  let frame = 0;
  let start = 0;
  let travel = 1;
  let ranges: ReadonlyArray<readonly [number, number]> = [];
  let running = false;
  let disposed = false;

  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  const commit = () => {
    frame = 0;
    if (!running) return;
    update(
      clamp((scrollY - start) / travel),
      ranges.map(([actStart, actTravel]) => clamp((scrollY - actStart) / actTravel)),
    );
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(commit);
  };
  const measure = () => {
    const currentScroll = scrollY;
    start = currentScroll + root.getBoundingClientRect().top;
    travel = Math.max(1, root.offsetHeight - innerHeight);
    ranges = acts.map((act) => {
      const rect = act.getBoundingClientRect();
      return [currentScroll + rect.top, Math.max(1, rect.height - innerHeight * 0.55)] as const;
    });
  };
  const remeasure = () => {
    measure();
    schedule();
  };
  const stop = () => {
    if (!running) return;
    running = false;
    removeEventListener("scroll", schedule);
    removeEventListener("resize", remeasure);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  const syncPreference = () => {
    stop();
    root.dataset.routeMotion = preference.matches ? "reduced" : "progress";
    if (preference.matches) root.removeAttribute("style");
    if (preference.matches || disposed) return;
    running = true;
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", remeasure, { passive: true });
    measure();
    commit();
  };
  const dispose = () => {
    disposed = true;
    stop();
    preference.removeEventListener("change", syncPreference);
    removeEventListener("pagehide", handlePageHide);
    removeEventListener("pageshow", handlePageShow);
  };
  const handlePageHide = (event: PageTransitionEvent) => {
    if (event.persisted) stop();
    else dispose();
  };
  const handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted && !disposed) syncPreference();
  };

  preference.addEventListener("change", syncPreference);
  addEventListener("pagehide", handlePageHide);
  addEventListener("pageshow", handlePageShow);
  document.fonts?.ready.then(() => {
    if (!disposed && running) remeasure();
  });
  syncPreference();
}
