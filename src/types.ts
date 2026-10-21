export type Kind = "hackathon" | "program" | "grant" | "bounty" | "job";

/** Raw-ish fields as HackList shows them, before enrichment. */
export interface RawOpportunity {
  id: string;
  kind: Kind;
  url: string;
  title: string;
  organizer?: string;
  verified?: boolean;
  description?: string;
  /** e.g. "AI", "Web3", "AI + Web3", "Both" */
  category?: string;
  /** e.g. "Online", "Hybrid", "In-person", "Remote" */
  format?: string;
  /** Free-text location line from the card. */
  location?: string;
  /** e.g. "Fellowship", "Residency", "Accelerator" (programs). */
  subtype?: string;
  freeToEnter?: boolean;
  /** Prize / stipend / funding text exactly as listed. */
  prizeText?: string;
  /** "Total prizes" | "Stipend" | "Prize Pool" ... */
  prizeLabel?: string;
  /** ISO date (YYYY-MM-DD). */
  deadline?: string;
  /** Deadline as HackList writes it; kept when it isn't a date ("Rolling", "Ongoing"). */
  deadlineText?: string;
  duration?: string;
  applyUrl?: string;
  /** When HackList says the listing was created, if the page exposes it. */
  listedAt?: string;
  /** Last-modified time from HackList's sitemap. */
  updatedAt?: string;
  tags?: string[];
  /** Which sources contributed: feed, card, detail, rsc, sitemap. */
  sources: string[];
}

export interface PrizeInfo {
  /** Best-effort headline value in USD (largest single amount found). */
  usd: number | null;
  /** True when the reward is mostly credits / in-kind / hardware, not cash. */
  nonCash: boolean;
  /** "stated" | "unspecified" | "none" */
  status: "stated" | "unspecified" | "none";
  /** Notes on currency conversion or caveats. */
  notes: string[];
}

export interface Eligibility {
  studentsOnly: boolean;
  regionLocked: string | null;
  inPersonRequired: boolean;
  hybrid: boolean;
  applicationGated: boolean;
  partnerOnly: boolean;
  teamSize: string | null;
}

export interface Opportunity extends RawOpportunity {
  daysLeft: number | null;
  active: boolean;
  prize: PrizeInfo;
  eligibility: Eligibility;
  /** 0 = very specific brief, 1 = generic "build anything with AI". */
  genericScore: number;
  /** Concrete hooks found in the brief (APIs, datasets, metrics, tracks). */
  specificityHooks: string[];
  redFlags: string[];
  /** Other HackList ids that look like the same event listed twice. */
  duplicateIds: string[];
}
