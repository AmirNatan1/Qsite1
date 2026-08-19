import type { AssetProvenance, PublicationControlled, RuntimeSchema } from "./schema";

const INTERNAL_PUBLICATION_KEYS = new Set([
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

type InternalPublicationKey =
  | "publicApproved"
  | "publicationStatus"
  | "partnerApproved"
  | "startupApproved"
  | "logoApproved"
  | "lastVerified"
  | "active"
  | "provenance"
  | keyof AssetProvenance;

export type PublicShape<T> = T extends readonly (infer Item)[]
  ? readonly PublicShape<Item>[]
  : T extends object
    ? { readonly [Key in keyof T as Key extends InternalPublicationKey ? never : Key]: PublicShape<T[Key]> }
    : T;

export class PublicationEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicationEligibilityError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isApprovedProvenance(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    value.approvalState === "approved" &&
    (value.publicationClassification === "A" || value.publicationClassification === "B") &&
    typeof value.sourceSha256 === "string" &&
    typeof value.destinationSha256 === "string" &&
    value.sourceSha256 === value.destinationSha256
  );
}

function eligibilityFailure(value: unknown, path: string, requireControl = false): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const failure = eligibilityFailure(value[index], `${path}[${index}]`);
      if (failure) return failure;
    }
    return null;
  }
  if (!isObject(value)) return null;

  const hasPublicationControl = "publicApproved" in value || "publicationStatus" in value;
  if (requireControl || hasPublicationControl) {
    if (value.publicApproved !== true) return `${path}.publicApproved must be explicitly true`;
    if (value.publicationStatus !== "approved") return `${path}.publicationStatus must be approved`;
  }

  if ("partnerApproved" in value && value.partnerApproved !== true) {
    return `${path}.partnerApproved must be explicitly true`;
  }
  if ("startupApproved" in value && value.startupApproved !== true) {
    return `${path}.startupApproved must be explicitly true`;
  }
  if ("active" in value && value.active !== true) {
    return `${path}.active must be explicitly true`;
  }
  if (value.logo !== undefined && value.logo !== null && value.logoApproved !== true) {
    return `${path}.logoApproved must be explicitly true when a logo is present`;
  }

  if ("provenance" in value) {
    if (!Array.isArray(value.provenance) || value.provenance.length === 0) {
      return `${path}.provenance must contain an explicit approval record`;
    }
    for (let index = 0; index < value.provenance.length; index += 1) {
      if (!isApprovedProvenance(value.provenance[index])) {
        return `${path}.provenance[${index}] is not an approved, byte-identical public asset`;
      }
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "provenance") continue;
    const failure = eligibilityFailure(child, `${path}.${key}`);
    if (failure) return failure;
  }
  return null;
}

export function isPubliclyEligible(record: PublicationControlled): boolean {
  return eligibilityFailure(record, "record", true) === null;
}

export function assertPublicEligibility(record: PublicationControlled): void {
  const failure = eligibilityFailure(record, "record", true);
  if (failure) throw new PublicationEligibilityError(failure);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export function stripInternalPublicationFields<T>(value: T): PublicShape<T> {
  if (Array.isArray(value)) {
    return deepFreeze(value.map((item) => stripInternalPublicationFields(item))) as PublicShape<T>;
  }
  if (!isObject(value)) return value as PublicShape<T>;

  const publicEntries = Object.entries(value)
    .filter(([key]) => !INTERNAL_PUBLICATION_KEYS.has(key))
    .map(([key, child]) => [key, stripInternalPublicationFields(child)] as const);
  return deepFreeze(Object.fromEntries(publicEntries)) as PublicShape<T>;
}

export function requirePublicRecord<T extends PublicationControlled>(
  recordSchema: RuntimeSchema<T>,
  candidate: unknown,
): PublicShape<T> {
  const record = recordSchema.parse(candidate);
  assertPublicEligibility(record);
  return stripInternalPublicationFields(record);
}

export function filterPublicRecords<T extends PublicationControlled>(
  recordSchema: RuntimeSchema<T>,
  candidates: readonly unknown[],
): readonly PublicShape<T>[] {
  const records = candidates
    .map((candidate) => recordSchema.parse(candidate))
    .filter(isPubliclyEligible)
    .map((record) => stripInternalPublicationFields(record));
  return deepFreeze(records);
}
