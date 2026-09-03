import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SCHEMA,
  STATUSES,
  honestStatus,
  parseArguments,
  recordingSpecifications,
  selfTest,
  validateOutputDirectory,
  validatePortableReport,
  validateResponsiveSnapshot,
  validateSettlementSnapshot,
  waitForFontsLoaded,
} from "../scripts/qa-phase7c-territory-proof.mjs";
import {
  PHASE7C_CORE_VIEWPORTS,
  PHASE7C_CYCLE_COUNT,
  PHASE7C_GATES,
  PHASE7C_INDUSTRIES,
  PHASE7C_PROOF_RECORD,
  PHASE7C_RECORDING_SCENARIOS,
  PHASE7C_STATE_SAMPLES,
} from "../scripts/phase7c-contract.mjs";
import { TARGET_MINIMUM_CSS_PIXELS } from "../scripts/phase7a-target-size.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISION = "a".repeat(40);
const EXTERNAL = path.join(os.tmpdir(), "phase7c-browser-qa-test-output");

function settlementFixture(overrides = {}) {
  return {
    rootPresent: true,
    fontsLoaded: true,
    backgroundInert: false,
    mode: "enhanced",
    state: "manufacturing",
    progress: 0.68,
    projection: "settled",
    raf: "idle",
    carrierCount: 1,
    trackCount: 1,
    ...overrides,
  };
}

function responsiveFixture(overrides = {}) {
  return {
    viewport: { width: 1440, height: 900 },
    mode: "enhanced",
    territoryCount: 4,
    territoryNames: [...PHASE7C_INDUSTRIES],
    proofTitle: PHASE7C_PROOF_RECORD,
    carrierCount: 1,
    trackCount: 1,
    staticFallbackCount: 4,
    visibleStaticFallbackCount: 0,
    titleVisible: true,
    titleClipped: false,
    internallyBrokenWords: [],
    horizontalOverflow: 0,
    territoryVideoCount: 0,
    proofRecordCount: 1,
    posterCount: 1,
    proofHref: "/pocs/maradin/",
    ...overrides,
  };
}

function reportFixture() {
  return {
    schema: SCHEMA,
    revision: REVISION,
    status: "LIMITATION",
    results: [
      {
        engine: "webkit",
        engineAuthority: "Playwright WebKit proxy; not physical Safari",
        status: "LIMITATION",
        limitations: ["Proxy evidence only"],
      },
    ],
    humanGates: PHASE7C_GATES.map((name) => ({ name, status: "PENDING HUMAN REVIEW" })),
  };
}

test("Phase 7C browser QA consumes the exact state, viewport, recording, lifecycle and gate contracts", () => {
  const authority = selfTest();
  assert.equal(authority.status, "PASS");
  assert.equal(PHASE7C_CORE_VIEWPORTS.length, 13);
  assert.equal(PHASE7C_STATE_SAMPLES.length, 10);
  assert.deepEqual(PHASE7C_STATE_SAMPLES.map(([state]) => state), [
    "release",
    "automotive",
    "automotive-logistics",
    "logistics",
    "logistics-manufacturing",
    "manufacturing",
    "manufacturing-energy",
    "energy",
    "registration",
    "proof",
  ]);
  assert.equal(PHASE7C_RECORDING_SCENARIOS.length, 12);
  assert.equal(PHASE7C_CYCLE_COUNT, 10);
  assert.equal(PHASE7C_GATES.length, 6);
  assert.equal(TARGET_MINIMUM_CSS_PIXELS, 44);
});

test("CLI requires an exact revision and a fresh caller-specified external or ignored evidence directory", () => {
  const parsed = parseArguments([
    "--base-url", "http://127.0.0.1:4327/",
    "--output", EXTERNAL,
    "--revision", REVISION,
    "--engine", "webkit",
    "--suite", "responsive-smoke",
    "--headed",
  ]);
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4327");
  assert.equal(parsed.engine, "webkit");
  assert.equal(parsed.suite, "responsive-smoke");
  assert.equal(parsed.headed, true);
  assert.equal(parsed.output, path.resolve(EXTERNAL));

  assert.throws(() => parseArguments(["--base-url", "http://127.0.0.1:4327", "--output", EXTERNAL]), /revision/);
  assert.throws(() => parseArguments(["--base-url", "file:///tmp/index.html", "--output", EXTERNAL, "--revision", REVISION]), /http or https/);
  assert.throws(() => parseArguments(["--base-url", "http://127.0.0.1:4327", "--output", EXTERNAL, "--revision", "short"]), /40-character lowercase/);
  assert.throws(() => parseArguments(["--base-url", "http://127.0.0.1:4327", "--output", EXTERNAL, "--revision", REVISION.toUpperCase()]), /40-character lowercase/);
  assert.throws(() => parseArguments(["--base-url", "http://127.0.0.1:4327", "--output", EXTERNAL, "--revision", REVISION, "--engine", "safari"]), /all, chromium, firefox, or webkit/);
  assert.throws(() => parseArguments(["--base-url", "http://127.0.0.1:4327", "--output", EXTERNAL, "--revision", REVISION, "--suite", "quick"]), /full or responsive-smoke/);

  assert.equal(
    validateOutputDirectory(path.join(ROOT, "dist", "phase7c-test"), { ignoreProbe: () => true }),
    path.join(ROOT, "dist", "phase7c-test"),
  );
  assert.throws(
    () => validateOutputDirectory(path.join(ROOT, "evidence-not-ignored"), { ignoreProbe: () => false }),
    /must be ignored by Git/,
  );
  assert.throws(() => validateOutputDirectory(ROOT, { ignoreProbe: () => true }), /repository root/);
});

test("settlement validation is predicate-based and fails closed on state, inert, font, carrier, projection or RAF drift", () => {
  const pass = validateSettlementSnapshot(settlementFixture(), { state: "manufacturing", progress: 0.68 });
  assert.equal(pass.status, "PASS");
  assert.ok(Object.values(pass.checks).every(Boolean));

  for (const mutation of [
    { fontsLoaded: false },
    { backgroundInert: true },
    { state: "energy" },
    { progress: 0.82 },
    { projection: "pending" },
    { raf: "dirty" },
    { carrierCount: 2 },
    { trackCount: 0 },
  ]) {
    const result = validateSettlementSnapshot(
      settlementFixture(mutation),
      { state: "manufacturing", progress: 0.68 },
    );
    assert.equal(result.status, "FAIL", JSON.stringify(mutation));
  }

  const staticFallback = validateSettlementSnapshot(
    settlementFixture({ mode: "static", projection: "pending", raf: "dirty" }),
    { state: "manufacturing", progress: 0.68 },
  );
  assert.equal(staticFallback.status, "PASS");
});

test("responsive validation proves exact territory semantics, one carrier, fallback mode, clipping, overflow and proof isolation", () => {
  const viewport = { id: "1440x900", width: 1440, height: 900 };
  assert.equal(validateResponsiveSnapshot(responsiveFixture(), viewport, "enhanced").status, "PASS");

  const staticViewport = { id: "390x844", width: 390, height: 844 };
  const staticPass = responsiveFixture({
    viewport: { width: 390, height: 844 },
    mode: "static",
    visibleStaticFallbackCount: 4,
  });
  assert.equal(validateResponsiveSnapshot(staticPass, staticViewport, "static").status, "PASS");

  for (const mutation of [
    { territoryNames: [...PHASE7C_INDUSTRIES].reverse() },
    { carrierCount: 2 },
    { staticFallbackCount: 3 },
    { titleVisible: false },
    { titleClipped: true },
    { internallyBrokenWords: ["MANUFACTURING"] },
    { horizontalOverflow: 2 },
    { territoryVideoCount: 1 },
    { proofRecordCount: 2 },
    { posterCount: 0 },
    { proofHref: "/pocs/other/" },
  ]) {
    assert.equal(validateResponsiveSnapshot(responsiveFixture(mutation), viewport, "enhanced").status, "FAIL");
  }
});

test("recording inventory keeps every Phase 7C scenario and labels WebKit as proxy evidence", () => {
  for (const engine of ["chromium", "firefox", "webkit"]) {
    const records = recordingSpecifications(engine);
    assert.equal(records.length, PHASE7C_RECORDING_SCENARIOS.length);
    assert.deepEqual(records.map(({ scenario }) => scenario), PHASE7C_RECORDING_SCENARIOS);
    assert.ok(records.every(({ engineAuthority }) => engineAuthority.length > 0));
    assert.equal(records.filter(({ captureKind }) => captureKind === "video").length, 5);
    if (engine === "webkit") {
      assert.ok(records.every(({ engineAuthority }) => /proxy; not physical Safari/i.test(engineAuthority)));
      assert.ok(records.filter(({ evidencePath }) => evidencePath).every(({ evidencePath }) => evidencePath.includes("webkit-proxy")));
    }
  }
});

test("status taxonomy never promotes unavailable or indeterminate evidence to PASS", () => {
  assert.equal(honestStatus([true, true]), "PASS");
  assert.equal(honestStatus([true, null]), "LIMITATION");
  assert.equal(honestStatus([true], ["engine unavailable"]), "LIMITATION");
  assert.equal(honestStatus([true, false], ["also unavailable"]), "FAIL");
  for (const status of ["PASS", "FAIL", "LIMITATION", "NOT OBSERVED", "NOT AVAILABLE TO EXECUTION ENVIRONMENT", "PENDING HUMAN REVIEW"]) {
    assert.ok(STATUSES.includes(status));
  }
});

test("font settlement observes a bounded loaded predicate without adopting FontFaceSet.ready", async () => {
  let call = null;
  const page = {
    async waitForFunction(predicate, argument, options) {
      call = { predicate: predicate.toString(), argument, options };
    },
  };
  const result = await waitForFontsLoaded(page, 12_345);
  assert.equal(result.settled, true);
  assert.equal(call.options.timeout, 12_345);
  assert.match(call.predicate, /document\.fonts\.status === "loaded"/);
  assert.doesNotMatch(call.predicate, /fonts\.ready/);
  await assert.rejects(
    () => waitForFontsLoaded({ waitForFunction: async () => { throw new Error("timeout"); } }, 10),
    /timeout/,
  );
});

test("portable report rejects private paths, secrets, accepted gates and renamed gate metadata", () => {
  assert.equal(validatePortableReport(reportFixture()).status, "PASS");

  const accepted = reportFixture();
  accepted.humanGates[0].status = "ACCEPT";
  assert.equal(validatePortableReport(accepted).status, "FAIL");

  const renamed = reportFixture();
  renamed.humanGates[0].name = "CREATIVE QUALITY";
  assert.equal(validatePortableReport(renamed).status, "FAIL");

  const privatePath = reportFixture();
  privatePath.results[0].debugPath = "C:\\Users\\person\\trace.json";
  assert.equal(validatePortableReport(privatePath).status, "FAIL");

  const secret = reportFixture();
  secret.results[0].authorization = "Bearer token";
  assert.equal(validatePortableReport(secret).status, "FAIL");
});

test("source implements all browser matrices, predicate settlement, timestamped CLS and bounded lifecycle without fixed sleeps or zoom emulation", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "qa-phase7c-territory-proof.mjs"), "utf8");
  assert.match(source, /from "\.\/phase7c-contract\.mjs"/);
  assert.match(source, /chromium, firefox, webkit/);
  assert.match(source, /Playwright WebKit proxy; not physical Safari/);
  assert.match(source, /waitForControllerSettled/);
  assert.match(source, /waitForFieldMap/);
  assert.match(source, /predicateComponents/);
  assert.match(source, /PHASE7C_CORE_VIEWPORTS/);
  assert.match(source, /mobile-forward-reverse\.webm/);
  assert.match(source, /reduced-motion/);
  assert.match(source, /no-javascript/);
  assert.match(source, /fallback-font/);
  assert.match(source, /targetInventory/);
  assert.match(source, /TARGET_MINIMUM_CSS_PIXELS/);
  assert.match(source, /horizontalOverflow/);
  assert.match(source, /PHASE7C_CYCLE_COUNT/);
  assert.match(source, /performance\.now\(\)/);
  assert.match(source, /entry\.startTime >= boundary\.timestamp/);
  assert.match(source, /cycleAttributableCls/);
  assert.match(source, /runtimeScrollWrites/);
  assert.match(source, /pendingRafCount/);
  assert.match(source, /intervalCount/);
  assert.match(source, /requestfailed/);
  assert.match(source, /maradinVideoRequestCount/);
  assert.match(source, /poster retry count/);
  assert.match(source, /pagehide/);
  assert.match(source, /evidence-manifest/);
  assert.match(source, /page\.screenshot/);
  assert.match(source, /recordVideo/);
  assert.doesNotMatch(source, /waitForTimeout\s*\(/);
  assert.doesNotMatch(source, /setTimeout\s*\(/);
  assert.doesNotMatch(source, /style\.zoom|document\.body\.style\.zoom|transform:\s*scale/i);
});
