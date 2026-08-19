import { requirePublicRecord } from "./publication";
import { programmeSchema } from "./schema";

const sparkCandidate = {
  id: "spark",
  name: "SPARK",
  audience: "startups",
  summary: "A pathway for MVP+ technologies to develop relevant opportunities and structured POCs in real operating contexts.",
  status: "Applications closed",
  applicationOpen: false,
  publicApproved: true,
  publicationStatus: "approved",
} as const;

const champCandidate = {
  id: "champ",
  name: "CHAMP",
  audience: "industry",
  summary: "An industry-side programme context.",
  status: "Industry programme",
  publicApproved: true,
  publicationStatus: "approved",
} as const;

export const sparkProgramme = requirePublicRecord(programmeSchema, sparkCandidate);
export const champProgramme = requirePublicRecord(programmeSchema, champCandidate);
export const publicProgrammes = Object.freeze([sparkProgramme, champProgramme] as const);
