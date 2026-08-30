export const PHASE6_SCHEMA = "quantum-hub.phase-6.global-hardening.v1";

export const PHASE6_ENGINES = Object.freeze(["chromium", "webkit", "firefox"]);

export const PHASE6_ROUTES = Object.freeze([
  Object.freeze({ id: "home", path: "/", expectedStatus: 200, identity: "home" }),
  Object.freeze({ id: "for-industry", path: "/for-partners/", expectedStatus: 200, identity: "for-industry" }),
  Object.freeze({ id: "for-startups", path: "/for-startups/", expectedStatus: 200, identity: "for-startups" }),
  Object.freeze({ id: "industries", path: "/industries/", expectedStatus: 200, identity: "industries" }),
  Object.freeze({ id: "proof", path: "/pocs/", expectedStatus: 200, identity: "proof" }),
  Object.freeze({ id: "maradin", path: "/pocs/maradin/", expectedStatus: 200, identity: "maradin" }),
  Object.freeze({ id: "spark", path: "/spark/", expectedStatus: 200, identity: "spark" }),
  Object.freeze({ id: "about", path: "/about/", expectedStatus: 200, identity: "about" }),
  Object.freeze({ id: "contact", path: "/contact/", expectedStatus: 200, identity: "contact" }),
  Object.freeze({ id: "404", path: "/__phase6-intentional-404__/", expectedStatus: 404, identity: "404", real404: true }),
]);

const viewport = (id, width, height, family) => Object.freeze({ id, width, height, family });

export const CHROMIUM_VIEWPORTS = Object.freeze([
  viewport("desktop-1440x900", 1440, 900, "desktop"),
  viewport("short-desktop-1366x650", 1366, 650, "desktop"),
  viewport("desktop-1280x800", 1280, 800, "desktop"),
  viewport("tablet-landscape-1024x768", 1024, 768, "desktop"),
  viewport("tablet-portrait-768x1024", 768, 1024, "portrait"),
  viewport("mobile-390x844", 390, 844, "portrait"),
  viewport("mobile-360x800", 360, 800, "portrait"),
  viewport("narrow-320x800", 320, 800, "portrait"),
  viewport("mobile-landscape-844x390", 844, 390, "landscape"),
  viewport("narrow-landscape-740x360", 740, 360, "landscape"),
  viewport("landscape-800x360", 800, 360, "landscape"),
  viewport("landscape-896x414", 896, 414, "landscape"),
  viewport("landscape-900x480", 900, 480, "landscape"),
]);

export const CROSS_ENGINE_VIEWPORTS = Object.freeze([
  CHROMIUM_VIEWPORTS[0],
  CHROMIUM_VIEWPORTS[5],
  CHROMIUM_VIEWPORTS[8],
]);

export const HOME_EXTRA_VIEWPORTS = Object.freeze([
  CHROMIUM_VIEWPORTS[1],
  CHROMIUM_VIEWPORTS[3],
  CHROMIUM_VIEWPORTS[4],
  CHROMIUM_VIEWPORTS[7],
]);

export const EXPECTED_MATRIX_CASES = Object.freeze({
  chromium: PHASE6_ROUTES.length * CHROMIUM_VIEWPORTS.length,
  webkit: (PHASE6_ROUTES.length * CROSS_ENGINE_VIEWPORTS.length) + HOME_EXTRA_VIEWPORTS.length,
  firefox: (PHASE6_ROUTES.length * CROSS_ENGINE_VIEWPORTS.length) + HOME_EXTRA_VIEWPORTS.length,
  all: (PHASE6_ROUTES.length * CHROMIUM_VIEWPORTS.length)
    + (2 * ((PHASE6_ROUTES.length * CROSS_ENGINE_VIEWPORTS.length) + HOME_EXTRA_VIEWPORTS.length)),
});

export const HOME_CHECK_VIEWPORT = CHROMIUM_VIEWPORTS[5];
export const HISTORY_VIEWPORT = CHROMIUM_VIEWPORTS[0];
export const MARADIN_VIEWPORT = CHROMIUM_VIEWPORTS[0];

export function routeById(id) {
  return PHASE6_ROUTES.find((route) => route.id === id) ?? null;
}

export function matrixForEngine(engine) {
  if (!PHASE6_ENGINES.includes(engine)) throw new Error(`Unsupported engine: ${engine}`);
  if (engine === "chromium") {
    return CHROMIUM_VIEWPORTS.flatMap((candidateViewport) => (
      PHASE6_ROUTES.map((route) => Object.freeze({ engine, route, viewport: candidateViewport }))
    ));
  }
  return Object.freeze([
    ...CROSS_ENGINE_VIEWPORTS.flatMap((candidateViewport) => (
      PHASE6_ROUTES.map((route) => Object.freeze({ engine, route, viewport: candidateViewport }))
    )),
    ...HOME_EXTRA_VIEWPORTS.map((candidateViewport) => Object.freeze({
      engine,
      route: PHASE6_ROUTES[0],
      viewport: candidateViewport,
    })),
  ]);
}

export function validatePhase6Contract() {
  if (PHASE6_ROUTES.length !== 10) throw new Error("Phase 6 must cover exactly ten public route outcomes");
  if (new Set(PHASE6_ROUTES.map(({ id }) => id)).size !== PHASE6_ROUTES.length) throw new Error("Phase 6 route ids must be unique");
  if (new Set(PHASE6_ROUTES.map(({ path }) => path)).size !== PHASE6_ROUTES.length) throw new Error("Phase 6 route paths must be unique");
  if (PHASE6_ROUTES[0].id !== "home" || PHASE6_ROUTES[0].path !== "/") throw new Error("Home must be the first Phase 6 route");
  const missing404 = PHASE6_ROUTES.filter(({ real404, expectedStatus }) => real404 && expectedStatus === 404);
  if (missing404.length !== 1) throw new Error("Phase 6 must include exactly one real HTTP 404 outcome");
  if (CHROMIUM_VIEWPORTS.length !== 13) throw new Error("Chromium must use the exact thirteen-viewport matrix");
  if (CROSS_ENGINE_VIEWPORTS.length !== 3) throw new Error("WebKit and Firefox must use three route viewports");
  if (HOME_EXTRA_VIEWPORTS.length !== 4) throw new Error("WebKit and Firefox must use four extra Home viewports");
  for (const engine of PHASE6_ENGINES) {
    if (matrixForEngine(engine).length !== EXPECTED_MATRIX_CASES[engine]) throw new Error(`${engine} matrix count differs`);
  }
  return true;
}

validatePhase6Contract();
