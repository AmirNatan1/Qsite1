import { enhanceReversibleReveals } from "./reversible-reveal";

const proof = document.querySelector<HTMLElement>("[data-route-architecture='archive-threshold']");
if (proof) enhanceReversibleReveals(proof);
