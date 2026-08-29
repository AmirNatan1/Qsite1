import { bindDocumentProgress } from "./document-progress";

const root = document.querySelector<HTMLElement>("[data-industry-progress]");

if (root) {
  const phases = ["load", "bound", "narrow", "cross", "resolve"];
  bindDocumentProgress(root, "[data-route-act]", (progress, acts) => {
    const [load = 0, bound = 0, narrow = 0, resolve = 0] = acts;
    root.style.setProperty("--industry-shift", `${(2.4 + load * 1.1).toFixed(2)}vw`);
    root.style.setProperty("--industry-trace", `${Math.round(78 + load * 22)}%`);
    root.style.setProperty("--industry-bound-scale", (1 - bound * 0.045).toFixed(3));
    root.style.setProperty("--industry-search-shift", `${(narrow * 3.5).toFixed(2)}%`);
    root.style.setProperty("--industry-aperture-scale", (0.88 + resolve * 0.12).toFixed(3));
    root.dataset.industryPhase = phases[Math.min(phases.length - 1, Math.floor(progress * phases.length))];
  });
}
