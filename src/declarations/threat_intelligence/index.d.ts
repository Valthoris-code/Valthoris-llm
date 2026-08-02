import type { ActorMethod } from '@dfinity/agent';

export type ThreatCategory =
  | { phishing: null }  | { malware: null }    | { ransomware: null }
  | { commandAndControl: null } | { spam: null } | { cryptoMining: null }
  | { botnet: null }    | { exploit: null }     | { bruteForce: null }
  | { scam: null }      | { other: null };

export type ThreatSeverity =
  | { low: null } | { medium: null } | { high: null } | { critical: null };

export type IndicatorType =
  | { url: null } | { ip: null }    | { domain: null }
  | { fileHash: null } | { email: null } | { walletAddress: null };

export interface ThreatEntry {
  id            : string;
  indicator     : string;
  indicatorType : IndicatorType;
  category      : ThreatCategory;
  severity      : ThreatSeverity;
  description   : string;
  reportedBy    : string;
  reportedAt    : bigint;
  lastSeen      : bigint;
  confidence    : bigint;
  tags          : string[];
  isActive      : boolean;
}

export interface ThreatResult {
  isThreat          : boolean;
  severity          : [] | [ThreatSeverity];
  category          : [] | [ThreatCategory];
  confidence        : bigint;
  matchedIndicators : bigint;
  details           : string[];
  lastUpdated       : bigint;
}

export interface ThreatStats {
  totalEntries    : bigint;
  activeThreats   : bigint;
  criticalThreats : bigint;
  highThreats     : bigint;
}

export interface NewThreatInput {
  indicator     : string;
  indicatorType : IndicatorType;
  category      : ThreatCategory;
  severity      : ThreatSeverity;
  description   : string;
  confidence    : bigint;
  tags          : string[];
}

export type SubmitResult = { ok: string } | { err: string };
export type VoidResult   = { ok: null }   | { err: string };

export interface _SERVICE {
  checkUrl          : ActorMethod<[string], ThreatResult>;
  checkIp           : ActorMethod<[string], ThreatResult>;
  checkDomain       : ActorMethod<[string], ThreatResult>;
  checkHash         : ActorMethod<[string], ThreatResult>;
  checkEmail        : ActorMethod<[string], ThreatResult>;
  submitThreat      : ActorMethod<[NewThreatInput], SubmitResult>;
  getThreat         : ActorMethod<[string], [] | [ThreatEntry]>;
  listActiveThreats : ActorMethod<[bigint], ThreatEntry[]>;
  deactivateThreat  : ActorMethod<[string], VoidResult>;
  getStats          : ActorMethod<[], ThreatStats>;
}

export declare const idlFactory: ({ IDL }: { IDL: any }) => any;
export declare const init: ({ IDL }: { IDL: any }) => never[];
