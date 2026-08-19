import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

import { INTERNAL_PROVENANCE_KEYS, PUBLIC_INDUSTRY_NAMES } from "../scripts/phase1-qa-config.mjs";

const requireFromTest = createRequire(import.meta.url);
const moduleCache = new Map();

function resolveTypeScriptModule(specifier, parentFile) {
  const base = path.resolve(path.dirname(parentFile), specifier);
  for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
    try {
      if (readFileSync(candidate)) return candidate;
    } catch {}
  }
  throw new Error(`Unable to resolve ${specifier} from ${path.relative(process.cwd(), parentFile)}`);
}

function loadTypeScriptModule(filename) {
  const absolute = path.resolve(filename);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute).exports;
  const module = { exports: {} };
  moduleCache.set(absolute, module);
  const source = readFileSync(absolute, "utf8");
  const output = ts.transpileModule(source, {
    fileName: absolute,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (specifier) => specifier.startsWith(".")
    ? loadTypeScriptModule(resolveTypeScriptModule(specifier, absolute))
    : requireFromTest(specifier);
  const execute = new Function("require", "module", "exports", "__filename", "__dirname", output);
  execute(localRequire, module, module.exports, absolute, path.dirname(absolute));
  return module.exports;
}

function loadContentModule() {
  return Promise.resolve(loadTypeScriptModule(path.join(process.cwd(), "src", "content", "index.ts")));
}

const digest = "a".repeat(64);
const frozenSha = "b".repeat(40);

function approvedProvenance() {
  return {
    sourceRepository: "https://example.com/source.git",
    frozenSourceSha: frozenSha,
    sourcePath: "public/media/proof.jpg",
    destinationPath: "public/media/proof.jpg",
    sourceSha256: digest,
    destinationSha256: digest,
    publicationClassification: "B",
    approvalState: "approved",
  };
}

function approvedMedia() {
  return {
    id: "proof-image",
    kind: "image",
    src: "/media/proof.jpg",
    alt: "A field-test record.",
    width: 1600,
    height: 900,
    publicApproved: true,
    publicationStatus: "approved",
    provenance: [approvedProvenance()],
  };
}

function approvedProof() {
  return {
    id: "proof-record",
    slug: "proof-record",
    title: "Approved proof record",
    summary: "A bounded public summary.",
    challenge: "A documented operating need.",
    technology: "A technology prepared for field testing.",
    testDesign: "A bounded comparison across relevant conditions.",
    execution: "The test followed the approved design.",
    evidence: "The record states only approved observations.",
    nextStep: "The parties can assess an appropriate next step.",
    relatedCapabilities: ["POC design"],
    heroMedia: approvedMedia(),
    media: [],
    partnerApproved: true,
    startupApproved: true,
    publicApproved: true,
    publicationStatus: "approved",
  };
}

function approvedProgramme() {
  return {
    id: "programme",
    name: "Programme",
    audience: "industry",
    summary: "An approved programme proposition.",
    status: "Approved public status",
    applicationOpen: false,
    publicApproved: true,
    publicationStatus: "approved",
  };
}

function collectObjectKeys(value, destination = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, destination);
    return destination;
  }
  if (value === null || typeof value !== "object") return destination;
  for (const [key, child] of Object.entries(value)) {
    destination.add(key);
    collectObjectKeys(child, destination);
  }
  return destination;
}

test("publication schemas default missing approval fields to deny", async () => {
  const { isPubliclyEligible, programmeSchema, proofRecordSchema } = await loadContentModule();

  const programme = approvedProgramme();
  delete programme.publicApproved;
  delete programme.publicationStatus;
  const parsedProgramme = programmeSchema.parse(programme);
  assert.equal(parsedProgramme.publicApproved, false);
  assert.equal(parsedProgramme.publicationStatus, "requires-verification");
  assert.equal(isPubliclyEligible(parsedProgramme), false);

  for (const field of ["partnerApproved", "startupApproved", "publicApproved", "publicationStatus"]) {
    const candidate = approvedProof();
    delete candidate[field];
    const parsed = proofRecordSchema.parse(candidate);
    assert.equal(isPubliclyEligible(parsed), false, `proof without ${field} must be denied`);
  }

  const nestedMediaCandidate = approvedProof();
  delete nestedMediaCandidate.heroMedia.publicApproved;
  assert.equal(isPubliclyEligible(proofRecordSchema.parse(nestedMediaCandidate)), false, "unapproved nested media must deny the proof");
});

test("only explicit approved status and approval publish a record", async () => {
  const {
    PUBLICATION_STATUSES,
    filterPublicRecords,
    isPubliclyEligible,
    programmeSchema,
    publicationStatusSchema,
    teamMemberSchema,
  } = await loadContentModule();

  const approved = programmeSchema.parse(approvedProgramme());
  assert.equal(isPubliclyEligible(approved), true);

  for (const status of PUBLICATION_STATUSES.filter((value) => value !== "approved")) {
    const candidate = programmeSchema.parse({ ...approvedProgramme(), publicationStatus: status });
    assert.equal(isPubliclyEligible(candidate), false, `${status} must not publish`);
  }
  assert.throws(() => publicationStatusSchema.parse("unknown"), /expected one of/i);

  const denied = approvedProgramme();
  delete denied.publicApproved;
  const filtered = filterPublicRecords(programmeSchema, [denied, approvedProgramme()]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "programme");
  assert.equal("publicApproved" in filtered[0], false);
  assert.equal("publicationStatus" in filtered[0], false);

  const inactiveTeamMember = teamMemberSchema.parse({
    id: "inactive-member",
    name: "Inactive Member",
    role: "Role",
    group: "Group",
    microBio: "A bounded approved biography.",
    active: false,
    publicApproved: true,
    publicationStatus: "approved",
  });
  assert.equal(isPubliclyEligible(inactiveTeamMember), false, "inactive team members must never publish");
  assert.deepEqual(filterPublicRecords(teamMemberSchema, [inactiveTeamMember]), []);
});

test("proof schemas reject ungoverned media provenance and unknown fields", async () => {
  const { proofRecordSchema } = await loadContentModule();
  const missingProvenance = approvedProof();
  missingProvenance.heroMedia.provenance = [];
  assert.throws(() => proofRecordSchema.parse(missingProvenance), /expected exactly one asset-provenance record/i);

  const mismatchedHash = approvedProof();
  mismatchedHash.heroMedia.provenance[0].destinationSha256 = "c".repeat(64);
  const parsed = proofRecordSchema.parse(mismatchedHash);
  const { isPubliclyEligible } = await loadContentModule();
  assert.equal(isPubliclyEligible(parsed), false, "non-identical provenance hashes must deny publication");

  assert.throws(
    () => proofRecordSchema.parse({ ...approvedProof(), inventedField: "not permitted" }),
    /unexpected field/i,
  );
});

test("the public content boundary contains only approved Phase 1 collections", async () => {
  const {
    PUBLIC_INDUSTRIES,
    publicMetrics,
    publicPartners,
    publicProofRecords,
    publicTeamMembers,
    publicUpdates,
  } = await loadContentModule();

  assert.deepEqual(PUBLIC_INDUSTRIES.map(({ name }) => name), [...PUBLIC_INDUSTRY_NAMES]);
  assert.equal(PUBLIC_INDUSTRIES.length, 4);
  assert.equal(new Set(PUBLIC_INDUSTRIES.map(({ name }) => name)).size, 4);

  assert.equal(publicProofRecords.length, 1);
  assert.equal(publicProofRecords[0].slug, "maradin");
  assert.equal(publicProofRecords[0].title, "Maradin — Dynamic Ground Projection");

  assert.deepEqual(publicPartners, []);
  assert.deepEqual(publicTeamMembers, []);
  assert.deepEqual(publicUpdates, []);
  assert.deepEqual(publicMetrics, []);
});

test("SPARK is public only as a closed programme without an application path", async () => {
  const { sparkProgramme } = await loadContentModule();
  assert.equal(sparkProgramme.name, "SPARK");
  assert.equal(sparkProgramme.status, "Applications closed");
  assert.equal(sparkProgramme.applicationOpen, false);
  assert.equal("publicApproved" in sparkProgramme, false);
  assert.equal("publicationStatus" in sparkProgramme, false);
});

test("public projection recursively strips approval and provenance fields", async () => {
  const { maradinProofRecord, stripInternalPublicationFields } = await loadContentModule();
  const projected = stripInternalPublicationFields({
    title: "Public",
    publicApproved: true,
    publicationStatus: "approved",
    nested: {
      partnerApproved: true,
      provenance: [approvedProvenance()],
      label: "Visible",
    },
  });
  assert.deepEqual(projected, { title: "Public", nested: { label: "Visible" } });
  assert.equal(Object.isFrozen(projected), true);
  assert.equal(Object.isFrozen(projected.nested), true);

  const keys = collectObjectKeys(maradinProofRecord);
  for (const key of INTERNAL_PROVENANCE_KEYS) {
    assert.equal(keys.has(key), false, `public Maradin projection leaked ${key}`);
  }
  const serialized = JSON.stringify(maradinProofRecord);
  assert.doesNotMatch(serialized, /Q-HUB|70d8b5cc193311b9548c49399dde6a014583e13a/i);
  assert.doesNotMatch(serialized, /\b[a-f0-9]{64}\b/i);
});

test("approved Maradin narrative fields contain no numeric claims", async () => {
  const { maradinProofRecord } = await loadContentModule();
  const claimFields = [
    "summary",
    "challenge",
    "technology",
    "testDesign",
    "execution",
    "evidence",
    "nextStep",
  ];
  for (const field of claimFields) {
    assert.equal(typeof maradinProofRecord[field], "string", `${field} must be present`);
    assert.doesNotMatch(maradinProofRecord[field], /\d/, `${field} contains an unapproved numeric claim`);
  }
});
