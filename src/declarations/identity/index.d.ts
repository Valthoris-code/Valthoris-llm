import type { ActorMethod } from '@dfinity/agent';

export type IdentifierType =
  | { phone: null } | { email: null }  | { domain: null }
  | { iban: null }  | { walletAddress: null } | { nif: null } | { company: null };

export interface ReputationEntry {
  identifier         : string;
  identifierType     : IdentifierType;
  reportCount        : bigint;
  trustScore         : bigint;
  riskScore          : bigint;
  isKnownScammer     : boolean;
  isVerifiedBusiness : boolean;
  firstSeen          : bigint;
  lastUpdated        : bigint;
  notes              : string[];
}

export interface LookupResult {
  found              : boolean;
  trustScore         : bigint;
  riskScore          : bigint;
  reportCount        : bigint;
  isKnownScammer     : boolean;
  isVerifiedBusiness : boolean;
  notes              : string[];
  lastSeen           : bigint;
}

export interface SuspiciousContactInput {
  identifier     : string;
  identifierType : IdentifierType;
  reason         : string;
}

export type VoidResult = { ok: null } | { err: string };

export interface _SERVICE {
  lookupPhone        : ActorMethod<[string], LookupResult>;
  lookupEmail        : ActorMethod<[string], LookupResult>;
  lookupDomain       : ActorMethod<[string], LookupResult>;
  lookupIBAN         : ActorMethod<[string], LookupResult>;
  lookupWallet       : ActorMethod<[string], LookupResult>;
  registerSuspicious : ActorMethod<[SuspiciousContactInput], VoidResult>;
  getReputationEntry : ActorMethod<[string], [] | [ReputationEntry]>;
  lookupBatch        : ActorMethod<[string[]], LookupResult[]>;
  getDatabaseSize    : ActorMethod<[], bigint>;
}

export declare const idlFactory: ({ IDL }: { IDL: any }) => any;
export declare const init: ({ IDL }: { IDL: any }) => never[];
