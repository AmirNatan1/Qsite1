import { enhanceReversibleReveals } from "./reversible-reveal";

const about = document.querySelector("[data-about-interlock]");
if (about) enhanceReversibleReveals(about);
