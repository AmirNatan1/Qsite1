import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  FROZEN_MAIN_SHA,
  ALLOWED_R1_CHANGED_PATHS,
  ALLOWED_PACKAGE_SCRIPT_CHANGES,
  DEFAULT_DIST,
  EXPECTED_ADDED_PACKAGE_SCRIPTS,
  REQUIRED_BRANCH,
  REQUIRED_BRANCH_URL,
  REQUIRED_CLOUDFLARE_APP_SLUG,
  REQUIRED_PARENT,
  ROOT,
  REQUIRED_R1_TEST_FILES,
  SCHEMA,
  parseArguments,
  parseLinearR1History,
  runSelfTest,
  validateChangedPathAuthority,
  validatePackageAuthority,
  validateSignedR1Authority,
  validateOptions,
} from "../scripts/verify-phase6-r1-deployment.mjs";
import {
  parseHeadersFile,
  publicPathForDistFile,
  validateDeployedRecord,
} from "../scripts/verify-phase6-deployment.mjs";

const DEPLOYMENT_ID = "12345678-1234-4234-8234-123456789abc";
const HEAD = "b".repeat(40);

function options(extra = []) {
  return validateOptions(parseArguments([
    "--expected-head", HEAD,
    "--deployment-id", DEPLOYMENT_ID,
    "--immutable-url", "https://12345678.qsite1.pages.dev/",
    "--branch-url", REQUIRED_BRANCH_URL,
    ...extra,
  ]), { requireOutput: false });
}

test("R1 deployment contract fixes branch, exact parent and production main", () => {
  assert.equal(REQUIRED_BRANCH, "repair/phase-6-r1-validation-closure");
  assert.equal(REQUIRED_PARENT, "aee036740b129624c54b8f1b878229f955d187ae");
  assert.equal(FROZEN_MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_BRANCH_URL, "https://repair-phase-6-r1-validation.qsite1.pages.dev/");
  assert.equal(REQUIRED_CLOUDFLARE_APP_SLUG, "cloudflare-workers-and-pages");
  assert.equal(SCHEMA, "quantum-hub.phase-6-r1.deployment-verification.v1");
  assert.ok(path.isAbsolute(ROOT));
});

test("R1 preview inputs bind UUID, exact branch alias and repository dist", () => {
  const parsed = options();
  assert.equal(parsed.expectedHead, HEAD);
  assert.equal(parsed.dist, DEFAULT_DIST);
  assert.throws(() => options(["--immutable-url", "https://deadbeef.qsite1.pages.dev/"]), /must be exactly/);
  assert.throws(() => options(["--branch-url", "https://qsite1.pages.dev/"]), /exact R1 branch alias/);
  assert.throws(() => options(["--branch-url", "https://another-branch.qsite1.pages.dev/"]), /exact R1 branch alias/);
  assert.throws(() => options(["--dist", path.join(ROOT, "elsewhere")]), /repository dist/);
});

test("shared deployment URL, MIME and Cache-Control authority rejects parser ambiguities", () => {
  assert.throws(() => publicPathForDistFile("nested/%2e%2e/robots.txt"), /URL-ambiguous/);
  assert.throws(() => publicPathForDistFile("robots.txt#shadow.txt"), /URL-ambiguous/);
  assert.throws(() => publicPathForDistFile("robots.txt?shadow=1"), /URL-ambiguous/);
  assert.throws(() => publicPathForDistFile("404.html", "/missing-proof/#shadow"), /does not round-trip/);

  const policies = parseHeadersFile("/_astro/*\n  Cache-Control: public, max-age=31556952, immutable");
  const asset = { relativePath: "_astro/app.js", bytes: Buffer.from("export{}") };
  const response = {
    publicPath: "/_astro/app.js",
    status: 200,
    bytes: Buffer.from("export{}"),
    contentType: "application/javascript",
    cacheControl: "public, max-age=31556952, immutable",
  };
  assert.equal(validateDeployedRecord(response, asset, policies).status, "PASS");
  assert.throws(() => validateDeployedRecord({ ...response, contentType: "not-application/javascript" }, asset, policies), /MIME mismatch/);
  assert.throws(() => validateDeployedRecord({ ...response, contentType: ["application/javascript"] }, asset, policies), /MIME mismatch/);
  assert.throws(() => validateDeployedRecord({ ...response, cacheControl: ["public, max-age=31556952, immutable"] }, asset, policies), /primitive nonempty string/);
  assert.throws(() => validateDeployedRecord({ ...response, cacheControl: 'public, max-age=31556952, immutable, private="set-cookie"' }, asset, policies), /does not enforce|unsafe/);
  assert.throws(() => validateDeployedRecord({ ...response, cacheControl: "public, max-age=31556952, max-age=0, immutable" }, asset, policies), /duplicate, or conflicting/);
  assert.throws(() => validateDeployedRecord({ ...response, cacheControl: "public, max-age=31556952, immutable, no-cache" }, asset, policies), /does not enforce/);
});

test("package authority requires exact R1 commands while preserving the complete parent test and check authority", () => {
  const verifySuffix = " && node scripts/verify-phase4-source.mjs --allow-phase5b-route-scope --allow-phase6-global-hardening";
  const parent = {
    name: "qsite1",
    dependencies: { astro: "1" },
    scripts: {
      build: "node scripts/run-phase4-build.mjs",
      check: `npm run stage:phase4-media && astro check && node --test tests/base.test.mjs${verifySuffix}`,
      test: "node --test tests/base.test.mjs",
    },
  };
  const current = structuredClone(parent);
  Object.assign(current.scripts, EXPECTED_ADDED_PACKAGE_SCRIPTS);
  const r1Tests = REQUIRED_R1_TEST_FILES.join(" ");
  current.scripts.test = `${parent.scripts.test} ${r1Tests}`;
  current.scripts.check = `${parent.scripts.check.slice(0, -verifySuffix.length)} ${r1Tests}${verifySuffix}`;
  assert.deepEqual(validatePackageAuthority(JSON.stringify(parent), JSON.stringify(current)), ALLOWED_PACKAGE_SCRIPT_CHANGES);
  assert.equal(current.scripts["package:phase6-r1-review"], "node scripts/package-phase6-human-review.mjs --authority-profile phase6-r1");
  assert.equal(current.scripts["audit:phase6-r1-review"], "node scripts/audit-phase6-human-review-package.mjs --authority-profile phase6-r1");

  const guttedTest = structuredClone(current);
  guttedTest.scripts.test = "node --test tests/phase6-r1-deployment-verifier.test.mjs";
  assert.throws(() => validatePackageAuthority(JSON.stringify(parent), JSON.stringify(guttedTest)), /script test differs from exact R1 authority/);
  const wrongProfile = structuredClone(current);
  wrongProfile.scripts["package:phase6-r1-review"] = "node scripts/package-phase6-human-review.mjs";
  assert.throws(() => validatePackageAuthority(JSON.stringify(parent), JSON.stringify(wrongProfile)), /package:phase6-r1-review differs from exact R1 authority/);
  const missingCommand = structuredClone(current);
  delete missingCommand.scripts["audit:phase6-r1-review"];
  assert.throws(() => validatePackageAuthority(JSON.stringify(parent), JSON.stringify(missingCommand)), /must change exactly the approved R1 scripts/);
  const changedBuild = structuredClone(current);
  changedBuild.scripts.build = "different";
  assert.throws(() => validatePackageAuthority(JSON.stringify(parent), JSON.stringify(changedBuild)), /must change exactly the approved R1 scripts/);
  const changedDependency = structuredClone(current);
  changedDependency.dependencies.astro = "2";
  assert.throws(() => validatePackageAuthority(JSON.stringify(parent), JSON.stringify(changedDependency)), /production\/dependency authority/);
});

test("R1 repository authority rejects every path outside the literal changed-path allowlist", () => {
  const allowed = ALLOWED_R1_CHANGED_PATHS.map((file) => `${file.startsWith("scripts/capture-") || file.startsWith("scripts/ingest-") || file.startsWith("scripts/qa-phase6-r1") || file.startsWith("scripts/verify-phase6-r1") || file.startsWith("tests/phase6-r1") || file === "PHASE_6_R1_VALIDATION_CLOSURE.md" ? "A" : "M"}\t${file}`).join("\n");
  assert.deepEqual(validateChangedPathAuthority(allowed), allowed.split("\n"));
  assert.throws(() => validateChangedPathAuthority(allowed.replace(/^A\t/, "M\t")), /statuses\/order differ/);
  assert.throws(() => validateChangedPathAuthority(`${allowed}\nM\tscripts/run-phase4-build.mjs`), /outside the exact allowlist/);
  assert.throws(() => validateChangedPathAuthority("M\tpublic/favicon.svg"), /outside the exact allowlist/);
  assert.throws(() => validateChangedPathAuthority("D\tscripts/assemble-phase6-final-evidence.mjs"), /forbidden status D/);
  assert.throws(() => validateChangedPathAuthority("M\tpackage.json\textra"), /malformed/);
  assert.throws(() => validateChangedPathAuthority("M\tpackage.json\nM\tpackage.json"), /duplicated/);
  assert.throws(() => validateChangedPathAuthority(allowed.split("\n").slice(1).join("\n")), /must contain every exact approved/);
  assert.throws(() => validateChangedPathAuthority(""), /must contain every exact approved/);
});

test("signed R1 authority binds Cloudflare app, SHA, UUID and exact branch alias", () => {
  const parsed = options();
  const authority = {
    status: "PASS",
    appSlug: REQUIRED_CLOUDFLARE_APP_SLUG,
    commitHash: parsed.expectedHead,
    deploymentId: parsed.deploymentId,
    immutableUrl: parsed.immutableUrl,
    branch: REQUIRED_BRANCH,
    branchUrl: REQUIRED_BRANCH_URL,
  };
  assert.equal(validateSignedR1Authority(authority, parsed).branchBinding.source, "SIGNED_CHECK_EXACT_BRANCH_ALIAS");
  assert.throws(() => validateSignedR1Authority({ ...authority, appSlug: "another-app" }, parsed), /Cloudflare Workers and Pages app/);
  assert.throws(() => validateSignedR1Authority({ ...authority, branch: "another-branch" }, parsed), /branch binding/);
  assert.throws(() => validateSignedR1Authority({ ...authority, branchUrl: "https://another.qsite1.pages.dev/" }, parsed), /branch alias/);
});

test("R1 history must begin directly at required parent and remain linear", () => {
  const first = "c".repeat(40);
  assert.equal(parseLinearR1History(`${first}\t${REQUIRED_PARENT}\tfirst\n${HEAD}\t${first}\tsecond`, HEAD).length, 2);
  assert.throws(() => parseLinearR1History(`${HEAD}\t${FROZEN_MAIN_SHA}\twrong`, HEAD), /exact linear child/);
  assert.throws(() => parseLinearR1History(`${HEAD}\t${REQUIRED_PARENT} ${first}\tmerge`, HEAD), /exact linear child/);
});

test("R1 deployment self-test is inert and complete", () => {
  assert.deepEqual(runSelfTest(), {
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    exactParent: REQUIRED_PARENT,
    frozenMain: FROZEN_MAIN_SHA,
    historyCommits: 2,
    routes: 10,
  });
});
