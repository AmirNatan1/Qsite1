export const PHASE7B_BRANCH = "feature/phase-7b-operating-field-workpiece";
export const PHASE7B_PARENT = "626812c85f84ee8a48228a1f168d58c07d7943e7";
export const PHASE7B_ACCEPTED_PHASE6 = "371e3e8a21a1d215ecaf2bf14b9f509432b230b0";
export const PHASE7B_FROZEN_MAIN = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const PHASE7B_REQUIRED_NODE = "22.16.0";
export const PHASE7B_REVIEW_ZIP_NAME = "phase-7b-operating-field-workpiece-human-review.zip";
export const PHASE7B_BRANCH_PREVIEW = "https://feature-phase-7b-operating-f.qsite1.pages.dev/";

export const PHASE7B_METHOD_STAGES = Object.freeze([
  "FRAME",
  "SOURCE",
  "ASSESS",
  "TEST",
  "DECIDE",
]);

export const PHASE7B_MACRO_STATES = Object.freeze([
  "OPEN_FIELD",
  ...PHASE7B_METHOD_STAGES,
  "RELEASE",
]);

export const PHASE7B_STAGE_RANGES = Object.freeze({
  OPEN_FIELD: Object.freeze([0, 0.08]),
  FRAME: Object.freeze([0.08, 0.27]),
  SOURCE: Object.freeze([0.27, 0.46]),
  ASSESS: Object.freeze([0.46, 0.65]),
  TEST: Object.freeze([0.65, 0.84]),
  DECIDE: Object.freeze([0.84, 0.97]),
  RELEASE: Object.freeze([0.97, 1]),
});

export const PHASE7B_CORE_VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900]),
  Object.freeze([1366, 650]),
  Object.freeze([1280, 800]),
  Object.freeze([1024, 768]),
  Object.freeze([768, 1024]),
  Object.freeze([390, 844]),
  Object.freeze([360, 800]),
  Object.freeze([320, 800]),
  Object.freeze([844, 390]),
  Object.freeze([740, 360]),
  Object.freeze([800, 360]),
  Object.freeze([896, 414]),
  Object.freeze([900, 480]),
]);

export const PHASE7B_RECORDING_SCENARIOS = Object.freeze([
  "full-forward-method",
  "full-reverse-method",
  "resolved-stop-states",
  "fast-forward-immediate-reverse",
  "responsive-matrix",
  "mobile-authored-forward-reverse",
  "reduced-motion-resolved-states",
  "no-javascript-semantic-method",
  "installed-chrome-200-percent",
  "lifecycle-ten-cycles",
]);

export const PHASE7B_ENGINES = Object.freeze([
  "chromium",
  "firefox",
  "webkit-proxy",
]);

export const PHASE7B_CYCLE_COUNT = 10;

export const PHASE7B_GATES = Object.freeze([
  "CONTINUOUS WORKPIECE AUTHORITY",
  "OPERATING-STORY CLARITY",
  "SIGNAL FIELD CREATIVE CONTINUITY",
  "NATIVE-SCROLL + REVERSE INTEGRITY",
  "RESPONSIVE + ACCESSIBLE AUTHORSHIP",
  "PERFORMANCE + REGRESSION SAFETY",
]);

export const PHASE7B_ALLOWED_STATUSES = Object.freeze([
  "PASS",
  "FAIL",
  "LIMITATION",
  "NOT OBSERVED",
  "PENDING HUMAN REVIEW",
  "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
]);

export const PHASE7B_PERFORMANCE_BUDGET = Object.freeze({
  runtimeDependencyDelta: 0,
  runtimeRequestDelta: 1,
  assetByteDelta: 0,
  rawJavaScriptDeltaMaximum: 12_000,
  rawCssDeltaMaximum: 24_000,
  methodDomNodeMaximum: 220,
  methodSvgElementMaximum: 90,
  activeObserverMaximum: 1,
  idleRafMaximum: 0,
  idleIntervalMaximum: 0,
  clsMaximum: 0.01,
  attributableLongTaskMaximum: 0,
});

export const PHASE7B_PRODUCTION_PATHS = Object.freeze([
  "src/pages/index.astro",
  "src/components/home/OperatingField.astro",
  "src/scripts/operating-field-state.mjs",
  "src/scripts/operating-field.ts",
  "src/styles/routes/phase-7b-operating-field.css",
]);

export const PHASE7B_FORBIDDEN_RESTORATIONS = Object.freeze([
  "src/components/home/MethodField.astro",
  "src/scripts/home-operating-field.ts",
  "src/styles/routes/home-method.css",
]);
