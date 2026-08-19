export const PUBLIC_INDUSTRIES = Object.freeze([
  Object.freeze({ id: "automotive-mobility", name: "Automotive & Mobility" }),
  Object.freeze({ id: "logistics-supply-chain", name: "Logistics & Supply Chain" }),
  Object.freeze({ id: "advanced-manufacturing", name: "Industry 4.0 / Advanced Manufacturing" }),
  Object.freeze({ id: "energy-infrastructure", name: "Energy & Infrastructure" }),
] as const);

export type PublicIndustry = (typeof PUBLIC_INDUSTRIES)[number];
export type PublicIndustryName = PublicIndustry["name"];

if (PUBLIC_INDUSTRIES.length !== 4 || new Set(PUBLIC_INDUSTRIES.map(({ name }) => name)).size !== 4) {
  throw new Error("The public industry boundary must contain exactly four unique industries.");
}
