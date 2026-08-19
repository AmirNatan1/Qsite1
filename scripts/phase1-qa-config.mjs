export const CANONICAL_ORIGIN = "https://qsite1.pages.dev";

export const PHASE1_ROUTES = Object.freeze([
  Object.freeze({ path: "/", source: "src/pages/index.astro", output: "index.html", navPath: "/" }),
  Object.freeze({
    path: "/for-partners/",
    source: "src/pages/for-partners.astro",
    output: "for-partners/index.html",
    navPath: "/for-partners/",
  }),
  Object.freeze({
    path: "/for-startups/",
    source: "src/pages/for-startups.astro",
    output: "for-startups/index.html",
    navPath: "/for-startups/",
  }),
  Object.freeze({
    path: "/industries/",
    source: "src/pages/industries.astro",
    output: "industries/index.html",
    navPath: "/industries/",
  }),
  Object.freeze({ path: "/pocs/", source: "src/pages/pocs.astro", output: "pocs/index.html", navPath: "/pocs/" }),
  Object.freeze({
    path: "/pocs/maradin/",
    source: "src/pages/pocs/maradin.astro",
    output: "pocs/maradin/index.html",
    navPath: "/pocs/",
  }),
  Object.freeze({ path: "/spark/", source: "src/pages/spark.astro", output: "spark/index.html", navPath: "/spark/" }),
  Object.freeze({ path: "/about/", source: "src/pages/about.astro", output: "about/index.html", navPath: "/about/" }),
  Object.freeze({ path: "/contact/", source: "src/pages/contact.astro", output: "contact/index.html", navPath: "/contact/" }),
]);

export const NOT_FOUND_ROUTE = Object.freeze({
  path: "/404/",
  source: "src/pages/404.astro",
  output: "404.html",
  navPath: null,
});

export const ALL_HTML_ROUTES = Object.freeze([...PHASE1_ROUTES, NOT_FOUND_ROUTE]);

export const NAVIGATION = Object.freeze([
  Object.freeze({ label: "Home", path: "/" }),
  Object.freeze({ label: "For industry", path: "/for-partners/" }),
  Object.freeze({ label: "For startups", path: "/for-startups/" }),
  Object.freeze({ label: "Industries", path: "/industries/" }),
  Object.freeze({ label: "Proof", path: "/pocs/" }),
  Object.freeze({ label: "SPARK", path: "/spark/" }),
  Object.freeze({ label: "About", path: "/about/" }),
  Object.freeze({ label: "Contact", path: "/contact/" }),
]);

export const REQUIRED_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "desktop-1440x900", width: 1440, height: 900 }),
  Object.freeze({ id: "short-desktop-1366x650", width: 1366, height: 650 }),
  Object.freeze({ id: "desktop-1280x800", width: 1280, height: 800 }),
  Object.freeze({ id: "tablet-landscape-1024x768", width: 1024, height: 768 }),
  Object.freeze({ id: "tablet-portrait-768x1024", width: 768, height: 1024 }),
  Object.freeze({ id: "mobile-390x844", width: 390, height: 844 }),
  Object.freeze({ id: "mobile-360x800", width: 360, height: 800 }),
  Object.freeze({ id: "narrow-320x800", width: 320, height: 800 }),
  Object.freeze({ id: "mobile-landscape-844x390", width: 844, height: 390 }),
]);

export const SOURCE_LIKE_PATHS = Object.freeze([
  "/definitely-not-real",
  "/package.json",
  "/src/pages/index.astro",
  "/private",
  "/api/contact",
  "/.git/config",
]);

export const PUBLIC_INDUSTRY_NAMES = Object.freeze([
  "Automotive & Mobility",
  "Logistics & Supply Chain",
  "Industry 4.0 / Advanced Manufacturing",
  "Energy & Infrastructure",
]);

export const INTERNAL_PROVENANCE_KEYS = Object.freeze([
  "publicApproved",
  "publicationStatus",
  "partnerApproved",
  "startupApproved",
  "logoApproved",
  "lastVerified",
  "active",
  "provenance",
  "sourceRepository",
  "frozenSourceSha",
  "sourcePath",
  "destinationPath",
  "sourceSha256",
  "destinationSha256",
  "publicationClassification",
  "approvalState",
]);

export const PROHIBITED_PUBLIC_PATTERNS = Object.freeze([
  Object.freeze({ id: "defense-taxonomy", pattern: /\bdefen[cs]e\b/i }),
  Object.freeze({ id: "dual-use-taxonomy", pattern: /\bdual[\s_-]*use\b/i }),
  Object.freeze({ id: "placeholder-copy", pattern: /\b(?:lorem ipsum|placeholder(?: copy| text)?|coming soon)\b/i }),
  Object.freeze({ id: "testimonial-copy", pattern: /\btestimonials?\b/i }),
  Object.freeze({ id: "private-windows-path", pattern: /[A-Z]:[\\/]Users[\\/][^\\/\s"'<>]+[\\/]/i }),
  Object.freeze({ id: "private-posix-path", pattern: /\/(?:Users|home)\/[^/\s"'<>]+\//i }),
  Object.freeze({ id: "frozen-qhub-sha", pattern: /70d8b5cc193311b9548c49399dde6a014583e13a/i }),
  Object.freeze({ id: "qhub-source-repository", pattern: /github\.com\/AmirNatan1\/Q-HUB(?:\.git)?/i }),
]);

export const INTENDED_PUBLIC_ASSETS = Object.freeze([
  Object.freeze({ path: "brand/quantum-full-logo-colors.svg", kind: "brand", allowUnreferenced: true, bytes: 5837, sha256: "3b978e3a639d38e5d869afdae02d5e01eea706829ba95f1b9ee82710ffb19196" }),
  Object.freeze({ path: "brand/quantum-full-logo-white.svg", kind: "brand", allowUnreferenced: false, bytes: 5834, sha256: "244f2bb9a95af7ce6d337e1946dedac3ace6cf01feab53c1b0c2d75e58a68032" }),
  Object.freeze({ path: "brand/quantum-icon-color.svg", kind: "brand", allowUnreferenced: false, bytes: 788, sha256: "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9" }),
  Object.freeze({ path: "brand/quantum-icon-white.svg", kind: "brand", allowUnreferenced: true, bytes: 785, sha256: "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff" }),
  Object.freeze({ path: "fonts/syne-latin-800.woff2", kind: "font", allowUnreferenced: false, bytes: 13684, sha256: "1a340e84b78c7e1e7ed24306d682fdcd6dc8cc6cb52b158fbaf22c03f7f001c3" }),
  Object.freeze({ path: "fonts/newsreader-latin-400.woff2", kind: "font", allowUnreferenced: false, bytes: 22480, sha256: "e66067814f1c672d33a457e4f4d102c818b481420e2234cf685ebdbf2f443904" }),
  Object.freeze({ path: "fonts/inter-latin-400-600.woff2", kind: "font", allowUnreferenced: false, bytes: 48256, sha256: "3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62" }),
  Object.freeze({ path: "fonts/licenses/OFL-Syne.txt", kind: "font-license", allowUnreferenced: true, bytes: 4402, sha256: "cc43cdce6f91c57989af8459341c276655e34224e954fa69c2ad700831a742d8" }),
  Object.freeze({ path: "fonts/licenses/OFL-Newsreader.txt", kind: "font-license", allowUnreferenced: true, bytes: 4394, sha256: "fdfad38143ec470553cae82a1e45320bdd1b9ec70415d37bd0171051d8a4ded8" }),
  Object.freeze({ path: "fonts/licenses/OFL-Inter.txt", kind: "font-license", allowUnreferenced: true, bytes: 4377, sha256: "5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57" }),
  Object.freeze({ path: "media/maradin/maradin-field-aperture-approved.mp4", kind: "approved-proof-media", allowUnreferenced: false, bytes: 3962341, sha256: "daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c" }),
  Object.freeze({ path: "media/maradin/maradin-field-aperture-poster-approved.jpg", kind: "approved-proof-media", allowUnreferenced: false, bytes: 86343, sha256: "6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd" }),
  Object.freeze({ path: "media/maradin/maradin-test-contact-approved.mp4", kind: "approved-proof-media", allowUnreferenced: false, bytes: 4133483, sha256: "076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d" }),
  Object.freeze({ path: "media/maradin/maradin-prove-field-frame-approved.jpg", kind: "approved-proof-media", allowUnreferenced: false, bytes: 169156, sha256: "b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c" }),
  Object.freeze({ path: "media/maradin/maradin-real-field-still-approved.jpg", kind: "approved-proof-media", allowUnreferenced: false, bytes: 961699, sha256: "49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741" }),
]);

export const PUBLIC_TEXT_EXTENSIONS = Object.freeze(new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".xml",
  ".txt",
  ".svg",
  ".map",
]));

export const ALLOWED_PAGE_ENDPOINTS = Object.freeze([
  "src/pages/robots.txt.ts",
  "src/pages/sitemap.xml.ts",
]);
