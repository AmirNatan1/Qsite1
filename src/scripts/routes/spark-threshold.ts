import { enhanceReversibleReveals } from "./reversible-reveal";

const spark = document.querySelector<HTMLElement>("[data-route-architecture='sealed-programme-runway']");
if (spark) enhanceReversibleReveals(spark);
