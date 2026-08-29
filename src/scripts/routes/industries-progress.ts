import { bindDocumentProgress } from "./document-progress";

const root = document.querySelector<HTMLElement>("[data-industries-progress]");

if (root) {
  const phases = ["threshold", "horizon", "transfer", "fixture", "span", "context"];
  bindDocumentProgress(root, "[data-route-act]", (progress, acts) => {
    const [horizon = 0, transfer = 0, fixture = 0, span = 0] = acts;
    root.style.setProperty("--territory-horizon-shift", `${(horizon * 4).toFixed(2)}%`);
    root.style.setProperty("--territory-horizon-line", `${Math.round(74 + horizon * 22)}%`);
    root.style.setProperty("--territory-transfer-depth", `${(transfer * 3.5).toFixed(2)}rem`);
    root.style.setProperty("--territory-fixture-scale", (0.92 + fixture * 0.08).toFixed(3));
    root.style.setProperty("--territory-span-rise", `${(span * -3).toFixed(2)}rem`);
    root.style.setProperty("--territory-context-line", `${Math.round(42 + progress * 50)}%`);
    root.dataset.industriesPhase = phases[Math.min(phases.length - 1, Math.floor(progress * phases.length))];
  });
}
