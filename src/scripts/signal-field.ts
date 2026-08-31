export function initSignalField() {
  const field = document.querySelector<HTMLElement>("[data-signal-field]");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  if (!field || !finePointer.matches || reducedMotion.matches) return;
  if (field.dataset.probeController === "ready") return;

  const probeSurface = field.closest<HTMLElement>("[data-manifesto-threshold]") ?? field;
  field.dataset.probeController = "ready";

  const abortController = new AbortController();
  const { signal } = abortController;
  let frame = 0;
  let pendingX = 50;
  let pendingY = 50;

  const write = () => {
    frame = 0;
    field.style.setProperty("--probe-x", `${pendingX.toFixed(2)}%`);
    field.style.setProperty("--probe-y", `${pendingY.toFixed(2)}%`);
  };

  const schedule = () => {
    if (frame || document.hidden) return;
    frame = requestAnimationFrame(write);
  };

  probeSurface.addEventListener("pointermove", (event) => {
    const bounds = field.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    pendingX = Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100));
    pendingY = Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100));
    field.dataset.probe = "active";
    schedule();
  }, { passive: true, signal });

  const settle = () => {
    pendingX = 50;
    pendingY = 50;
    field.dataset.probe = "settled";
    schedule();
  };

  probeSurface.addEventListener("pointerleave", settle, { passive: true, signal });
  probeSurface.addEventListener("pointercancel", settle, { passive: true, signal });

  reducedMotion.addEventListener("change", () => {
    if (!reducedMotion.matches) return;
    settle();
    abortController.abort();
    delete field.dataset.probeController;
  }, { signal });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pendingX = 50;
    pendingY = 50;
    field.style.setProperty("--probe-x", "50%");
    field.style.setProperty("--probe-y", "50%");
    field.dataset.probe = "settled";
  }, { signal });

  addEventListener("pagehide", (event) => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!event.persisted) {
      abortController.abort();
      delete field.dataset.probeController;
    }
  }, { signal });
}
