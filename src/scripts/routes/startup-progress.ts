import { bindDocumentProgress } from "./document-progress";

const root = document.querySelector<HTMLElement>("[data-startup-progress]");

if (root) {
  const phases = ["signal", "branch", "align", "cross", "field"];
  bindDocumentProgress(root, "[data-route-act]", (progress, acts) => {
    const [signal = 0, branch = 0, align = 0, field = 0] = acts;
    root.style.setProperty("--startup-signal-offset", `${(signal * 3).toFixed(2)}vw`);
    root.style.setProperty("--startup-reach", `${Math.round(82 + signal * 14)}%`);
    root.style.setProperty("--startup-branch-shift", `${(branch * 8).toFixed(2)}%`);
    root.style.setProperty("--startup-align-offset", `${(align * 3).toFixed(2)}vw`);
    root.style.setProperty("--startup-field-offset", `${(field * 2.5).toFixed(2)}rem`);
    root.dataset.startupPhase = phases[Math.min(phases.length - 1, Math.floor(progress * phases.length))];
  });
}
