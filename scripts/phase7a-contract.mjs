import path from "node:path";

export const PHASE7A_BRANCH = "redirect/phase-7a-signal-field-threshold";
export const PHASE7A_PARENT = "371e3e8a21a1d215ecaf2bf14b9f509432b230b0";
export const PHASE7A_ACCEPTED_HEAD = "a87de3c08135e594199db1cebddc427dd8763fcb";
export const PHASE7A_R1_BRANCH = "repair/phase-7a-r1-signal-field-authority";
export const PHASE7A_R1_PARENT = PHASE7A_ACCEPTED_HEAD;
export const PHASE7A_R1_REVIEW_ZIP_NAME = "phase-7a-r1-signal-field-authority-human-review.zip";
export const FROZEN_MAIN = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_NODE = "22.16.0";

export const PUBLIC_ROUTES = Object.freeze([
  { route: "/", file: "index.html", h1: "We turn industrial needs into field evidence." },
  { route: "/for-partners/", file: "for-partners/index.html", h1: "Turn industrial needs into testable decisions." },
  { route: "/for-startups/", file: "for-startups/index.html", h1: "Bring your technology into the real world." },
  { route: "/industries/", file: "industries/index.html", h1: "Industry is where relevance is tested." },
  { route: "/pocs/", file: "pocs/index.html", h1: "Evidence before scale." },
  { route: "/pocs/maradin/", file: "pocs/maradin/index.html", h1: "Maradin — Dynamic Ground Projection" },
  { route: "/spark/", file: "spark/index.html", h1: "A runway from MVP+ to industrial POC." },
  { route: "/about/", file: "about/index.html", h1: "Built between industry and technology." },
  { route: "/contact/", file: "contact/index.html", h1: "Start with the challenge." },
]);

export const FIELD_MAP_DESTINATIONS = Object.freeze([
  "/#entry",
  "/for-partners/",
  "/for-startups/",
  "/industries/",
  "/pocs/",
  "/spark/",
  "/about/",
  "/contact/",
]);

export const PHYSICAL_ASSETS = Object.freeze([
  ["public/brand/quantum-icon-white.svg", "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff"],
  ["public/brand/quantum-icon-color.svg", "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9"],
  ["public/media/cinematic/phase-4r2/media/phase-4r2-desktop-h264-f31b0d4582af.mp4", "f31b0d4582af6c54e722e628f72601ea851d8886dde36aca9379bd2bfddee2d3"],
  ["public/media/cinematic/phase-4r2/media/phase-4r2-portrait-h264-eff1d8c39a99.mp4", "eff1d8c39a9987c24a1c1cf176b5ddc7c4daeca0f992991d59a505cdf47950db"],
  ["public/media/cinematic/phase-4r2/media/phase-4r2-landscape-h264-b3f197b17edd.mp4", "b3f197b17edd060195b15e5652ff23343d895bdbb32457ad183b62f1906f2dae"],
  ["public/media/cinematic/phase-4r2/posters/phase-4r2-desktop-poster-8dc538810811.png", "8dc5388108116da7202a6b8b24ea8fccb42ebc4cdfb50b861427488436e35979"],
  ["public/media/cinematic/phase-4r2/posters/phase-4r2-portrait-poster-e104fe5e3d0e.png", "e104fe5e3d0e471df2059919eb26eca7bb493929eca1000d8ab6ce95a611dee9"],
  ["public/media/cinematic/phase-4r2/posters/phase-4r2-landscape-poster-5692f67493fa.png", "5692f67493faf34844a6e2eaa838999babbaaf6d1c7d10e51505587daeb1d679"],
  ["public/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json", "06f9f5b256577ed1b0f159a435135fca6a78185be57b4db8853b9b276c080a54"],
]);

export const TYPOGRAPHY_ASSETS = Object.freeze([
  ["public/fonts/anybody-latin-variable.woff2", 69612, "27bf65457ce65fb6fdad625c5003cf14e2e6492afc30671ec9ec8fd1efb16fdb"],
  ["public/fonts/licenses/OFL-Anybody.txt", 4486, "7f0313b042b462fcae1934436cc747f9fd4433e3b08fd6459a4a5104b0bbd5db"],
  ["artifacts/original/phase-7a-typography-candidates/mona-sans-v2.0.27-variable.woff2", 307976, "875ad1fab0c1f4854927fa8086963fb6ddd4608b04a58b267cddf8a9d78f80d3"],
  ["artifacts/original/phase-7a-typography-candidates/OFL-Mona-Sans.txt", 4419, "9261dcb61fb5e3c587d50d7a9fdae12bc7422d8822d7ac06b8f34550479575de"],
  ["artifacts/original/phase-7a-typography-candidates/bricolage-grotesque-variable.woff2", 204636, "b51a8ebd169637e47cb7db430431ab3e122d2f09b03ee2a03ea06f4cb46f1a8e"],
  ["artifacts/original/phase-7a-typography-candidates/OFL-Bricolage-Grotesque.txt", 4403, "4b5a7d8f37f5602621c8a8d7358a6a2e71317e6c231c661e15aef0275d3e07ba"],
  ["artifacts/original/phase-7a-typography-candidates/archivo-variable.ttf", 658596, "664bbeb10522dac35c174a3860aaecad7b1ad3a0fc8b0d26888e26c824ec556d"],
  ["artifacts/original/phase-7a-typography-candidates/archivo-semi-condensed-bold.woff2", 53508, "1194eb36f975285a201e0605f3a98ad6946bfc2ca8f3947532373d491bef1bc8"],
  ["artifacts/original/phase-7a-typography-candidates/OFL-Archivo.txt", 4388, "108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b"],
]);

export const MARADIN_FROZEN_PATHS = Object.freeze([
  "src/pages/pocs/maradin.astro",
  "src/components/routes/maradin",
  "src/scripts/routes/maradin-documentary.ts",
  "src/scripts/routes/reversible-reveal.ts",
  "src/styles/routes/maradin.css",
  "src/styles/routes/production-foundations.css",
  "src/content/proofs.ts",
  "public/media/maradin",
]);

export const DELETED_PRODUCTION_PATHS = Object.freeze([
  "src/components/home/BuiltWithIndustry.astro",
  "src/components/home/ConversionField.astro",
  "src/components/home/EntryField.astro",
  "src/components/home/IndustryTerritories.astro",
  "src/components/home/MethodField.astro",
  "src/components/home/ProgrammesField.astro",
  "src/components/home/ProofField.astro",
  "src/scripts/home-operating-field.ts",
  "src/styles/routes/home.css",
  "src/styles/routes/home-method.css",
  "src/styles/routes/home-responsive.css",
  "src/styles/components.css",
  "src/styles/layout.css",
]);

export const PHASE7A_GATES = Object.freeze([
  "RETENTION + DEMOLITION DISCIPLINE",
  "FROZEN OPENING INTEGRITY",
  "SIGNAL FIELD CREATIVE AUTHORITY",
  "TYPOGRAPHY + MATERIAL AUTHORITY",
  "NATIVE-SCROLL + MOTION INTEGRITY",
  "ACCESSIBILITY + FALLBACK + PERFORMANCE",
]);

export const RECORDING_SCENARIOS = Object.freeze([
  "complete-threshold-entry",
  "complete-reverse",
  "stop-states",
  "home-intent",
  "responsive-authority",
  "reduced-motion-and-no-js",
  "typography",
]);

export const REVIEW_ZIP_NAME = "phase-7a-signal-field-threshold-human-review.zip";

const AUTHORITY_PROFILES = Object.freeze({
  phase7a: Object.freeze({
    id: "phase7a",
    branch: PHASE7A_BRANCH,
    parent: PHASE7A_PARENT,
    frozenMain: FROZEN_MAIN,
    reviewZipName: REVIEW_ZIP_NAME,
  }),
  "phase7a-r1": Object.freeze({
    id: "phase7a-r1",
    branch: PHASE7A_R1_BRANCH,
    parent: PHASE7A_R1_PARENT,
    frozenMain: FROZEN_MAIN,
    reviewZipName: PHASE7A_R1_REVIEW_ZIP_NAME,
  }),
});

export function authorityProfileById(id) {
  if (id !== "phase7a" && id !== "phase7a-r1") {
    throw new TypeError(`Unknown Phase 7A authority profile: ${String(id)}`);
  }

  return AUTHORITY_PROFILES[id];
}

export const resolveRepo = (...parts) => path.join(process.cwd(), ...parts);
