/**
 * types/icp.ts
 *
 * Type definitions for the ICP canisters used by the fraud ingest service.
 * Derived from src/declarations/community/index.d.ts and
 * src/declarations/threat_intelligence/index.d.ts.
 *
 * These are kept here so the services package is self-contained and
 * does not import from sibling declaration files (which are ES-module
 * JS files incompatible with CommonJS at build time).
 */

// ─── Community canister types ─────────────────────────────────────────────

export type IcpReportCategory =
  | { phishing: null }
  | { smishing: null }
  | { scam: null }
  | { malware: null }
  | { spam: null }
  | { fraud: null }
  | { impersonation: null }
  | { cryptoFraud: null }
  | { other: null };

export type IcpReportStatus =
  | { pending: null }
  | { confirmed: null }
  | { rejected: null }
  | { investigating: null };

export interface IcpReport {
  id: string;
  reporter: string;
  category: IcpReportCategory;
  target: string;
  description: string;
  evidence: [] | [string];
  status: IcpReportStatus;
  createdAt: bigint;
  updatedAt: bigint;
  confirmVotes: bigint;
  rejectVotes: bigint;
  riskScore: bigint;
}

export interface IcpCommunityService {
  listRecentReports: (limit: bigint) => Promise<IcpReport[]>;
  getReport: (id: string) => Promise<[] | [IcpReport]>;
  getReportsByTarget: (target: string) => Promise<IcpReport[]>;
}

// ─── ThreatIntelligence canister types ────────────────────────────────────

export type IcpThreatCategory =
  | { phishing: null }
  | { malware: null }
  | { ransomware: null }
  | { commandAndControl: null }
  | { spam: null }
  | { cryptoMining: null }
  | { botnet: null }
  | { exploit: null }
  | { bruteForce: null }
  | { scam: null }
  | { other: null };

export type IcpThreatSeverity =
  | { low: null }
  | { medium: null }
  | { high: null }
  | { critical: null };

export type IcpIndicatorType =
  | { url: null }
  | { ip: null }
  | { domain: null }
  | { fileHash: null }
  | { email: null }
  | { walletAddress: null };

export interface IcpThreatEntry {
  id: string;
  indicator: string;
  indicatorType: IcpIndicatorType;
  category: IcpThreatCategory;
  severity: IcpThreatSeverity;
  description: string;
  reportedBy: string;
  reportedAt: bigint;
  lastSeen: bigint;
  confidence: bigint;
  tags: string[];
  isActive: boolean;
}

export interface IcpThreatResult {
  isThreat: boolean;
  severity: [] | [IcpThreatSeverity];
  category: [] | [IcpThreatCategory];
  confidence: bigint;
  matchedIndicators: bigint;
  details: string[];
  lastUpdated: bigint;
}

export interface IcpThreatIntelligenceService {
  checkThreat: (indicator: string) => Promise<IcpThreatResult>;
  listActiveThreats: (limit: bigint) => Promise<IcpThreatEntry[]>;
}

// ─── Helper utilities ────────────────────────────────────────────────────

/** Map an ICP variant object to its key string */
export function icpVariantKey(variant: Record<string, unknown>): string {
  return Object.keys(variant)[0] ?? 'unknown';
}

/**
 * Convert ICP nano-second timestamp (bigint) to a JavaScript Date.
 * ICP uses nanoseconds since Unix epoch.
 */
export function icpTimestampToDate(ns: bigint): Date {
  return new Date(Number(ns / BigInt(1_000_000)));
}
