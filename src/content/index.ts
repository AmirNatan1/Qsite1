export { PUBLIC_INDUSTRIES } from "./industries";
export type { PublicIndustry, PublicIndustryName } from "./industries";

export { champProgramme, publicProgrammes, sparkProgramme } from "./programmes";
export { maradinProofRecord, publicProofRecords } from "./proofs";
export {
  contactDestination,
  publicMetrics,
  publicPartners,
  publicTeamMembers,
  publicUpdates,
} from "./collections";
export type { ContactDestination } from "./collections";

export {
  ContentValidationError,
  PUBLICATION_CLASSIFICATIONS,
  PUBLICATION_STATUSES,
  assetProvenanceSchema,
  metricSchema,
  partnerSchema,
  programmeSchema,
  proofMediaSchema,
  proofRecordSchema,
  publicationStatusSchema,
  teamMemberSchema,
  updateSchema,
} from "./schema";
export type {
  AssetProvenance,
  MediaKind,
  Metric,
  Partner,
  Programme,
  ProgrammeAudience,
  ProofMedia,
  ProofRecord,
  PublicationClassification,
  PublicationControlled,
  PublicationStatus,
  RuntimeSchema,
  TeamMember,
  Update,
} from "./schema";

export {
  PublicationEligibilityError,
  assertPublicEligibility,
  filterPublicRecords,
  isPubliclyEligible,
  requirePublicRecord,
  stripInternalPublicationFields,
} from "./publication";
export type { PublicShape } from "./publication";

import { contactDestination, publicMetrics, publicPartners, publicTeamMembers, publicUpdates } from "./collections";
import { PUBLIC_INDUSTRIES } from "./industries";
import { publicProgrammes } from "./programmes";
import { publicProofRecords } from "./proofs";

export const publicContent = Object.freeze({
  industries: PUBLIC_INDUSTRIES,
  programmes: publicProgrammes,
  proofs: publicProofRecords,
  partners: publicPartners,
  team: publicTeamMembers,
  updates: publicUpdates,
  metrics: publicMetrics,
  contactDestination,
});
