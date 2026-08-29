export const ACCEPTED_PHASE5AR = "b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c";
export const FROZEN_MAIN = "501040c42bba30b9d9517b88a8f9857992a2dba4";

export const PHASE5B_ROUTES = Object.freeze([
  { id: "for-industry", path: "/for-partners/", acts: 4, mode: "C", cssBudget: 7_000, jsBudget: 2_500, media: "none" },
  { id: "for-startups", path: "/for-startups/", acts: 4, mode: "C", cssBudget: 7_000, jsBudget: 2_500, media: "none" },
  { id: "industries", path: "/industries/", acts: 4, regions: 6, mode: "C", cssBudget: 10_000, jsBudget: 4_000, media: "none" },
  { id: "proof", path: "/pocs/", acts: 2, mode: "B", cssBudget: 6_000, jsBudget: 1_500, media: "governed-poster" },
  { id: "maradin", path: "/pocs/maradin/", acts: 6, mode: "B", cssBudget: 9_000, jsBudget: 2_000, media: "governed-documentary" },
  { id: "spark", path: "/spark/", acts: 3, mode: "B", cssBudget: 6_000, jsBudget: 1_500, media: "none" },
  { id: "about", path: "/about/", acts: 3, mode: "B", cssBudget: 6_000, jsBudget: 1_500, media: "none" },
  { id: "contact", path: "/contact/", acts: 1, mode: "A", cssBudget: 4_000, jsBudget: 0, media: "none" },
  { id: "404", path: "/__phase5b-intentional-404__/", sourcePath: "/404.html", acts: 1, mode: "A", cssBudget: 2_000, jsBudget: 0, media: "none" },
]);

export const RESPONSIVE_MATRIX = Object.freeze([
  [1440, 900], [1366, 650], [1280, 800], [1024, 768], [768, 1024],
  [390, 844], [360, 800], [320, 800], [844, 390], [740, 360],
  [800, 360], [896, 414], [900, 480],
]);

export const PHASE5B_HUMAN_GATES = Object.freeze([
  "SUPPORTING-ROUTE PRODUCTION FIDELITY",
  "ROUTE-SPECIFIC SPATIAL IDENTITY",
  "RESPONSIVE + ACCESSIBLE INTEGRATION",
  "PUBLICATION + MEDIA SAFETY",
  "PERFORMANCE + RUNTIME SAFETY",
  "HOMEPAGE + PHASE 4/5A REGRESSION",
]);
