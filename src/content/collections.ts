import { filterPublicRecords } from "./publication";
import { metricSchema, partnerSchema, teamMemberSchema, updateSchema } from "./schema";

export const publicPartners = filterPublicRecords(partnerSchema, []);
export const publicTeamMembers = filterPublicRecords(teamMemberSchema, []);
export const publicUpdates = filterPublicRecords(updateSchema, []);
export const publicMetrics = filterPublicRecords(metricSchema, []);

export interface ContactDestination {
  readonly href: string;
  readonly label: string;
}

export const contactDestination: ContactDestination | null = null;
