export const PUBLICATION_STATUSES = Object.freeze([
  "approved",
  "requires-verification",
  "requires-partner-approval",
  "requires-startup-approval",
  "internal-only",
  "deferred",
  "prohibited",
] as const);

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_CLASSIFICATIONS = Object.freeze(["A", "B", "R"] as const);

export type PublicationClassification = (typeof PUBLICATION_CLASSIFICATIONS)[number];

export interface RuntimeSchema<T> {
  readonly parse: (input: unknown) => T;
}

export class ContentValidationError extends TypeError {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ContentValidationError";
  }
}

export interface AssetProvenance {
  readonly sourceRepository: string;
  readonly frozenSourceSha: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly sourceSha256: string;
  readonly destinationSha256: string;
  readonly publicationClassification: PublicationClassification;
  readonly approvalState: PublicationStatus;
}

export interface PublicationControlled {
  readonly publicApproved: boolean;
  readonly publicationStatus: PublicationStatus;
  readonly provenance?: readonly AssetProvenance[];
}

export type MediaKind = "image" | "video";

export interface ProofMedia extends PublicationControlled {
  readonly id: string;
  readonly kind: MediaKind;
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly provenance: readonly [AssetProvenance];
}

export interface Partner extends PublicationControlled {
  readonly id: string;
  readonly name: string;
  readonly relationshipLabel: string;
  readonly relationshipStatus: string;
  readonly logo?: ProofMedia;
  readonly logoApproved: boolean;
  readonly lastVerified?: string;
}

export type ProgrammeAudience = "industry" | "startups";

export interface Programme extends PublicationControlled {
  readonly id: string;
  readonly name: string;
  readonly audience: ProgrammeAudience;
  readonly summary: string;
  readonly status: string;
  readonly applicationOpen?: boolean;
}

export interface ProofRecord extends PublicationControlled {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly challenge: string;
  readonly technology: string;
  readonly testDesign: string;
  readonly execution: string;
  readonly evidence: string;
  readonly nextStep: string;
  readonly relatedCapabilities: readonly string[];
  readonly heroMedia: ProofMedia;
  readonly media: readonly ProofMedia[];
  readonly partnerApproved: boolean;
  readonly startupApproved: boolean;
}

export interface TeamMember extends PublicationControlled {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly group: string;
  readonly microBio: string;
  readonly portrait?: ProofMedia;
  readonly linkedin?: string;
  readonly active: boolean;
  readonly lastVerified?: string;
}

export interface Update extends PublicationControlled {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly category: string;
  readonly summary: string;
  readonly media?: readonly ProofMedia[];
  readonly route?: string;
}

export interface Metric extends PublicationControlled {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly context?: string;
}

type UnknownRecord = Record<string, unknown>;

function schema<T>(parser: (input: unknown, path: string) => T, name: string): RuntimeSchema<T> {
  return Object.freeze({
    parse(input: unknown): T {
      return parser(input, name);
    },
  });
}

function freezeValue<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as UnknownRecord)) freezeValue(child);
  return Object.freeze(value);
}

function objectAt(input: unknown, path: string): UnknownRecord {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ContentValidationError(path, "expected an object");
  }
  return input as UnknownRecord;
}

function knownKeys(record: UnknownRecord, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new ContentValidationError(path, `unexpected field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}`);
  }
}

function nonEmptyString(input: unknown, path: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new ContentValidationError(path, "expected a non-empty string");
  }
  if (input !== input.trim()) {
    throw new ContentValidationError(path, "must not have leading or trailing whitespace");
  }
  return input;
}

function optionalString(input: unknown, path: string): string | undefined {
  return input === undefined ? undefined : nonEmptyString(input, path);
}

function booleanAt(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") throw new ContentValidationError(path, "expected a boolean");
  return input;
}

function optionalBoolean(input: unknown, path: string): boolean | undefined {
  return input === undefined ? undefined : booleanAt(input, path);
}

function positiveInteger(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input <= 0) {
    throw new ContentValidationError(path, "expected a positive safe integer");
  }
  return input;
}

function oneOf<const T extends readonly string[]>(input: unknown, values: T, path: string): T[number] {
  if (typeof input !== "string" || !values.includes(input)) {
    throw new ContentValidationError(path, `expected one of: ${values.join(", ")}`);
  }
  return input as T[number];
}

function routePath(input: unknown, path: string): string {
  const value = nonEmptyString(input, path);
  if (!value.startsWith("/") || value.startsWith("//") || /[?#]/.test(value)) {
    throw new ContentValidationError(path, "expected a root-relative path without query or fragment");
  }
  return value;
}

function webUrl(input: unknown, path: string): string {
  const value = nonEmptyString(input, path);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ContentValidationError(path, "expected an absolute URL");
  }
  if (url.protocol !== "https:") throw new ContentValidationError(path, "expected an HTTPS URL");
  return value;
}

function routeOrWebUrl(input: unknown, path: string): string {
  return typeof input === "string" && input.startsWith("/") ? routePath(input, path) : webUrl(input, path);
}

function sha(input: unknown, length: 40 | 64, path: string): string {
  const value = nonEmptyString(input, path);
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    throw new ContentValidationError(path, `expected a lowercase ${length}-character hexadecimal digest`);
  }
  return value;
}

function isoDate(input: unknown, path: string): string {
  const value = nonEmptyString(input, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ContentValidationError(path, "expected a calendar date in YYYY-MM-DD format");
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new ContentValidationError(path, "expected a valid calendar date");
  }
  return value;
}

function stringList(input: unknown, path: string, minimum = 0): readonly string[] {
  if (!Array.isArray(input)) throw new ContentValidationError(path, "expected an array");
  if (input.length < minimum) throw new ContentValidationError(path, `expected at least ${minimum} item${minimum === 1 ? "" : "s"}`);
  const values = input.map((value, index) => nonEmptyString(value, `${path}[${index}]`));
  if (new Set(values).size !== values.length) throw new ContentValidationError(path, "duplicate values are not permitted");
  return freezeValue(values);
}

function parsePublicationStatus(input: unknown, path: string): PublicationStatus {
  return oneOf(input, PUBLICATION_STATUSES, path);
}

function parseAssetProvenance(input: unknown, path: string): AssetProvenance {
  const record = objectAt(input, path);
  knownKeys(
    record,
    [
      "sourceRepository",
      "frozenSourceSha",
      "sourcePath",
      "destinationPath",
      "sourceSha256",
      "destinationSha256",
      "publicationClassification",
      "approvalState",
    ],
    path,
  );

  return freezeValue({
    sourceRepository: webUrl(record.sourceRepository, `${path}.sourceRepository`),
    frozenSourceSha: sha(record.frozenSourceSha, 40, `${path}.frozenSourceSha`),
    sourcePath: nonEmptyString(record.sourcePath, `${path}.sourcePath`),
    destinationPath: nonEmptyString(record.destinationPath, `${path}.destinationPath`),
    sourceSha256: sha(record.sourceSha256, 64, `${path}.sourceSha256`),
    destinationSha256: sha(record.destinationSha256, 64, `${path}.destinationSha256`),
    publicationClassification: oneOf(
      record.publicationClassification,
      PUBLICATION_CLASSIFICATIONS,
      `${path}.publicationClassification`,
    ),
    approvalState: parsePublicationStatus(record.approvalState, `${path}.approvalState`),
  });
}

function parseProvenanceList(input: unknown, path: string): readonly AssetProvenance[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw new ContentValidationError(path, "expected an array");
  return freezeValue(input.map((item, index) => parseAssetProvenance(item, `${path}[${index}]`)));
}

function publicationFields(record: UnknownRecord, path: string): PublicationControlled {
  const provenance = parseProvenanceList(record.provenance, `${path}.provenance`);
  return freezeValue({
    publicApproved:
      record.publicApproved === undefined ? false : booleanAt(record.publicApproved, `${path}.publicApproved`),
    publicationStatus:
      record.publicationStatus === undefined
        ? "requires-verification"
        : parsePublicationStatus(record.publicationStatus, `${path}.publicationStatus`),
    ...(provenance === undefined ? {} : { provenance }),
  });
}

function parseProofMedia(input: unknown, path: string): ProofMedia {
  const record = objectAt(input, path);
  knownKeys(record, ["id", "kind", "src", "alt", "width", "height", "publicApproved", "publicationStatus", "provenance"], path);
  if (!Array.isArray(record.provenance) || record.provenance.length !== 1) {
    throw new ContentValidationError(`${path}.provenance`, "expected exactly one asset-provenance record");
  }

  return freezeValue({
    id: nonEmptyString(record.id, `${path}.id`),
    kind: oneOf(record.kind, ["image", "video"] as const, `${path}.kind`),
    src: routePath(record.src, `${path}.src`),
    alt: nonEmptyString(record.alt, `${path}.alt`),
    width: positiveInteger(record.width, `${path}.width`),
    height: positiveInteger(record.height, `${path}.height`),
    ...publicationFields(record, path),
    provenance: freezeValue([parseAssetProvenance(record.provenance[0], `${path}.provenance[0]`)]) as readonly [AssetProvenance],
  });
}

function parseOptionalMedia(input: unknown, path: string): ProofMedia | undefined {
  return input === undefined ? undefined : parseProofMedia(input, path);
}

function parseMediaList(input: unknown, path: string): readonly ProofMedia[] {
  if (!Array.isArray(input)) throw new ContentValidationError(path, "expected an array");
  return freezeValue(input.map((item, index) => parseProofMedia(item, `${path}[${index}]`)));
}

function parsePartner(input: unknown, path: string): Partner {
  const record = objectAt(input, path);
  knownKeys(
    record,
    [
      "id",
      "name",
      "relationshipLabel",
      "relationshipStatus",
      "logo",
      "logoApproved",
      "publicApproved",
      "publicationStatus",
      "lastVerified",
      "provenance",
    ],
    path,
  );
  const logo = parseOptionalMedia(record.logo, `${path}.logo`);
  const lastVerified = record.lastVerified === undefined ? undefined : isoDate(record.lastVerified, `${path}.lastVerified`);
  return freezeValue({
    id: nonEmptyString(record.id, `${path}.id`),
    name: nonEmptyString(record.name, `${path}.name`),
    relationshipLabel: nonEmptyString(record.relationshipLabel, `${path}.relationshipLabel`),
    relationshipStatus: nonEmptyString(record.relationshipStatus, `${path}.relationshipStatus`),
    ...(logo === undefined ? {} : { logo }),
    logoApproved: record.logoApproved === undefined ? false : booleanAt(record.logoApproved, `${path}.logoApproved`),
    ...publicationFields(record, path),
    ...(lastVerified === undefined ? {} : { lastVerified }),
  });
}

function parseProgramme(input: unknown, path: string): Programme {
  const record = objectAt(input, path);
  knownKeys(record, ["id", "name", "audience", "summary", "status", "applicationOpen", "publicApproved", "publicationStatus", "provenance"], path);
  const applicationOpen = optionalBoolean(record.applicationOpen, `${path}.applicationOpen`);
  return freezeValue({
    id: nonEmptyString(record.id, `${path}.id`),
    name: nonEmptyString(record.name, `${path}.name`),
    audience: oneOf(record.audience, ["industry", "startups"] as const, `${path}.audience`),
    summary: nonEmptyString(record.summary, `${path}.summary`),
    status: nonEmptyString(record.status, `${path}.status`),
    ...(applicationOpen === undefined ? {} : { applicationOpen }),
    ...publicationFields(record, path),
  });
}

function parseProofRecord(input: unknown, path: string): ProofRecord {
  const record = objectAt(input, path);
  knownKeys(
    record,
    [
      "id",
      "slug",
      "title",
      "summary",
      "challenge",
      "technology",
      "testDesign",
      "execution",
      "evidence",
      "nextStep",
      "relatedCapabilities",
      "heroMedia",
      "media",
      "partnerApproved",
      "startupApproved",
      "publicApproved",
      "publicationStatus",
      "provenance",
    ],
    path,
  );
  return freezeValue({
    id: nonEmptyString(record.id, `${path}.id`),
    slug: nonEmptyString(record.slug, `${path}.slug`),
    title: nonEmptyString(record.title, `${path}.title`),
    summary: nonEmptyString(record.summary, `${path}.summary`),
    challenge: nonEmptyString(record.challenge, `${path}.challenge`),
    technology: nonEmptyString(record.technology, `${path}.technology`),
    testDesign: nonEmptyString(record.testDesign, `${path}.testDesign`),
    execution: nonEmptyString(record.execution, `${path}.execution`),
    evidence: nonEmptyString(record.evidence, `${path}.evidence`),
    nextStep: nonEmptyString(record.nextStep, `${path}.nextStep`),
    relatedCapabilities: stringList(record.relatedCapabilities, `${path}.relatedCapabilities`, 1),
    heroMedia: parseProofMedia(record.heroMedia, `${path}.heroMedia`),
    media: parseMediaList(record.media, `${path}.media`),
    partnerApproved:
      record.partnerApproved === undefined ? false : booleanAt(record.partnerApproved, `${path}.partnerApproved`),
    startupApproved:
      record.startupApproved === undefined ? false : booleanAt(record.startupApproved, `${path}.startupApproved`),
    ...publicationFields(record, path),
  });
}

function parseTeamMember(input: unknown, path: string): TeamMember {
  const record = objectAt(input, path);
  knownKeys(
    record,
    [
      "id",
      "name",
      "role",
      "group",
      "microBio",
      "portrait",
      "linkedin",
      "active",
      "publicApproved",
      "publicationStatus",
      "lastVerified",
      "provenance",
    ],
    path,
  );
  const portrait = parseOptionalMedia(record.portrait, `${path}.portrait`);
  const linkedin = optionalString(record.linkedin, `${path}.linkedin`);
  const lastVerified = record.lastVerified === undefined ? undefined : isoDate(record.lastVerified, `${path}.lastVerified`);
  return freezeValue({
    id: nonEmptyString(record.id, `${path}.id`),
    name: nonEmptyString(record.name, `${path}.name`),
    role: nonEmptyString(record.role, `${path}.role`),
    group: nonEmptyString(record.group, `${path}.group`),
    microBio: nonEmptyString(record.microBio, `${path}.microBio`),
    ...(portrait === undefined ? {} : { portrait }),
    ...(linkedin === undefined ? {} : { linkedin: routeOrWebUrl(linkedin, `${path}.linkedin`) }),
    active: booleanAt(record.active, `${path}.active`),
    ...publicationFields(record, path),
    ...(lastVerified === undefined ? {} : { lastVerified }),
  });
}

function parseUpdate(input: unknown, path: string): Update {
  const record = objectAt(input, path);
  knownKeys(record, ["id", "title", "date", "category", "summary", "media", "route", "publicApproved", "publicationStatus", "provenance"], path);
  const media = record.media === undefined ? undefined : parseMediaList(record.media, `${path}.media`);
  const route = optionalString(record.route, `${path}.route`);
  return freezeValue({
    id: nonEmptyString(record.id, `${path}.id`),
    title: nonEmptyString(record.title, `${path}.title`),
    date: isoDate(record.date, `${path}.date`),
    category: nonEmptyString(record.category, `${path}.category`),
    summary: nonEmptyString(record.summary, `${path}.summary`),
    ...(media === undefined ? {} : { media }),
    ...(route === undefined ? {} : { route: routePath(route, `${path}.route`) }),
    ...publicationFields(record, path),
  });
}

function parseMetric(input: unknown, path: string): Metric {
  const record = objectAt(input, path);
  knownKeys(record, ["id", "label", "value", "context", "publicApproved", "publicationStatus", "provenance"], path);
  const context = optionalString(record.context, `${path}.context`);
  return freezeValue({
    id: nonEmptyString(record.id, `${path}.id`),
    label: nonEmptyString(record.label, `${path}.label`),
    value: nonEmptyString(record.value, `${path}.value`),
    ...(context === undefined ? {} : { context }),
    ...publicationFields(record, path),
  });
}

export const publicationStatusSchema = schema(parsePublicationStatus, "PublicationStatus");
export const assetProvenanceSchema = schema(parseAssetProvenance, "AssetProvenance");
export const proofMediaSchema = schema(parseProofMedia, "ProofMedia");
export const partnerSchema = schema(parsePartner, "Partner");
export const programmeSchema = schema(parseProgramme, "Programme");
export const proofRecordSchema = schema(parseProofRecord, "ProofRecord");
export const teamMemberSchema = schema(parseTeamMember, "TeamMember");
export const updateSchema = schema(parseUpdate, "Update");
export const metricSchema = schema(parseMetric, "Metric");
