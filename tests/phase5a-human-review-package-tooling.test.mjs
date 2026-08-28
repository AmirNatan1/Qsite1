import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHIVE_FILENAME,
  AUDIT_FILENAME,
  AUTHORIZATION as PACKAGER_AUTHORIZATION,
  CRT_REQUIRED_FILES as PACKAGER_CRT_REQUIRED_FILES,
  CRT_REPORT_SCHEMAS as PACKAGER_CRT_REPORT_SCHEMAS,
  DETACHED_MANIFEST_FILENAME,
  HUMAN_REVIEW_GATES as PACKAGER_HUMAN_REVIEW_GATES,
  ROUTES as PACKAGER_ROUTES,
  CROSS_ROUTE_FILES as PACKAGER_CROSS_ROUTE_FILES,
  ROUTE_FIXED_ROLES as PACKAGER_ROUTE_FIXED_ROLES,
  ROUTE_MEDIA_ROLES as PACKAGER_ROUTE_MEDIA_ROLES,
  ROUTE_PLAN_HEADINGS as PACKAGER_ROUTE_PLAN_HEADINGS,
  ROUTE_REPORT_FILES as PACKAGER_ROUTE_REPORT_FILES,
  assertAllowedEntry as packagerAllows,
  assertNoPrivateText as packagerPrivacy,
  createStoredZipBuffer,
  validateRoutePlanText as validatePackagerRoutePlan,
} from "../scripts/package-phase5a-human-review.mjs";
import {
  AUTHORIZATION as AUDITOR_AUTHORIZATION,
  CRT_REQUIRED_FILES as AUDITOR_CRT_REQUIRED_FILES,
  CRT_REPORT_SCHEMAS as AUDITOR_CRT_REPORT_SCHEMAS,
  HUMAN_REVIEW_GATES as AUDITOR_HUMAN_REVIEW_GATES,
  ROUTES as AUDITOR_ROUTES,
  CROSS_ROUTE_FILES as AUDITOR_CROSS_ROUTE_FILES,
  ROUTE_FIXED_ROLES as AUDITOR_ROUTE_FIXED_ROLES,
  ROUTE_MEDIA_ROLES as AUDITOR_ROUTE_MEDIA_ROLES,
  ROUTE_PLAN_HEADINGS as AUDITOR_ROUTE_PLAN_HEADINGS,
  ROUTE_REPORT_FILES as AUDITOR_ROUTE_REPORT_FILES,
  assertAllowedEntry as auditorAllows,
  assertNoPrivateText as auditorPrivacy,
  parseStoredZip,
  validateRoutePlanText as validateAuditorRoutePlan,
} from "../scripts/audit-phase5a-human-review.mjs";

test("packager and independent auditor duplicate the exact Phase 5A contract", () => {
  assert.deepEqual(PACKAGER_AUTHORIZATION, AUDITOR_AUTHORIZATION);
  assert.deepEqual(PACKAGER_HUMAN_REVIEW_GATES, AUDITOR_HUMAN_REVIEW_GATES);
  assert.deepEqual(PACKAGER_CRT_REQUIRED_FILES, AUDITOR_CRT_REQUIRED_FILES);
  assert.deepEqual(PACKAGER_CRT_REPORT_SCHEMAS, AUDITOR_CRT_REPORT_SCHEMAS);
  assert.deepEqual(PACKAGER_ROUTES, AUDITOR_ROUTES);
  assert.deepEqual(PACKAGER_CROSS_ROUTE_FILES, AUDITOR_CROSS_ROUTE_FILES);
  assert.deepEqual(PACKAGER_ROUTE_FIXED_ROLES, AUDITOR_ROUTE_FIXED_ROLES);
  assert.deepEqual(PACKAGER_ROUTE_MEDIA_ROLES, AUDITOR_ROUTE_MEDIA_ROLES);
  assert.deepEqual(PACKAGER_ROUTE_PLAN_HEADINGS, AUDITOR_ROUTE_PLAN_HEADINGS);
  assert.deepEqual(PACKAGER_ROUTE_REPORT_FILES, AUDITOR_ROUTE_REPORT_FILES);
  assert.equal(PACKAGER_ROUTES.length, 9);
  assert.equal(Object.keys(PACKAGER_ROUTE_FIXED_ROLES).length + Object.keys(PACKAGER_ROUTE_MEDIA_ROLES).length, 15);
  assert.equal(Object.keys(PACKAGER_CRT_REQUIRED_FILES).length, 31);
  assert.equal(Object.keys(PACKAGER_CRT_REPORT_SCHEMAS).length, 9);
  assert.equal(Object.keys(PACKAGER_HUMAN_REVIEW_GATES).length, 6);
  assert.ok(Object.values(PACKAGER_HUMAN_REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.deepEqual(PACKAGER_AUTHORIZATION, {
    authorSelfApproved: false,
    deployerSelfApproved: false,
    humanAccepted: false,
    mainMerged: false,
    phase5BAuthorized: false,
  });
  assert.equal(ARCHIVE_FILENAME, "phase-5a-scroll-crt-supporting-route-preproduction-human-review.zip");
  assert.equal(DETACHED_MANIFEST_FILENAME, "phase-5a-scroll-crt-supporting-route-preproduction-human-review-manifest.json");
  assert.equal(AUDIT_FILENAME, "phase-5a-scroll-crt-supporting-route-preproduction-human-review-audit.json");
});

test("all twenty route-plan sections must be substantive in both processes", () => {
  const valid = PACKAGER_ROUTE_PLAN_HEADINGS.map((heading) => `## ${heading}\n\nSubstantive human-review planning content for ${heading}.`).join("\n\n");
  assert.equal(validatePackagerRoutePlan(valid), true);
  assert.equal(validateAuditorRoutePlan(valid), true);
  const incomplete = valid.replace("Substantive human-review planning content for Dependencies.", "TBD");
  assert.throws(() => validatePackagerRoutePlan(incomplete), /Dependencies/);
  assert.throws(() => validateAuditorRoutePlan(incomplete), /Dependencies/);
  const numberedBrief = PACKAGER_ROUTE_PLAN_HEADINGS.map((heading, index) => `${index + 1}. **${heading === "Implementation risk" ? "Implementation risks" : heading}:** Substantive local preproduction decision for ${heading}.`).join("\n");
  assert.equal(validatePackagerRoutePlan(numberedBrief), true);
  assert.equal(validateAuditorRoutePlan(numberedBrief), true);
});

test("deterministic stored ZIP is source-order independent and independently parseable", () => {
  const entries = [
    { path: "route-preproduction/reports/publication-audit.md", data: Buffer.from("Publication audit PASS\n") },
    { path: "README.md", data: Buffer.from("Phase 5A review guide\n") },
    { path: "deployed-crt/reports/browser-qa.json", data: Buffer.from('{"status":"PASS"}\n') },
  ];
  const forward = createStoredZipBuffer(entries);
  const reverse = createStoredZipBuffer([...entries].reverse());
  assert.ok(forward.equals(reverse));
  const parsed = parseStoredZip(forward);
  assert.deepEqual(parsed.map((entry) => entry.path), [
    "README.md",
    "deployed-crt/reports/browser-qa.json",
    "route-preproduction/reports/publication-audit.md",
  ]);
  assert.deepEqual(parsed.map((entry) => entry.data.toString("utf8")), [
    "Phase 5A review guide\n",
    '{"status":"PASS"}\n',
    "Publication audit PASS\n",
  ]);
});

test("both processes reject source/cache/private paths, raw WebM, and secrets", () => {
  const forbidden = [
    "route-preproduction/src/prototype.html",
    "route-preproduction/cache/frame.png",
    "route-preproduction/private/notes.md",
    "deployed-crt/recordings/raw-capture.webm",
    "deployed-crt/reports/.env",
  ];
  for (const candidate of forbidden) {
    assert.throws(() => packagerAllows(candidate));
    assert.throws(() => auditorAllows(candidate));
  }
  const secret = Buffer.from("access_token=abcdefghijklmnopqrstuvwxyz123456");
  assert.throws(() => packagerPrivacy(secret, "route-preproduction/reports/publication-audit.md"));
  assert.throws(() => auditorPrivacy(secret, "route-preproduction/reports/publication-audit.md"));
  const privatePath = Buffer.from("C:\\Users\\reviewer\\private\\capture.png");
  assert.throws(() => packagerPrivacy(privatePath, "deployed-crt/reports/browser-qa.json"));
  assert.throws(() => auditorPrivacy(privatePath, "deployed-crt/reports/browser-qa.json"));
});
