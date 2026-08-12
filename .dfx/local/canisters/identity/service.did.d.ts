import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export type IdentifierType = { 'nif' : null } |
  { 'domain' : null } |
  { 'iban' : null } |
  { 'walletAddress' : null } |
  { 'email' : null } |
  { 'company' : null } |
  { 'phone' : null };
export interface LookupResult {
  'found' : boolean,
  'isKnownScammer' : boolean,
  'reportCount' : bigint,
  'isVerifiedBusiness' : boolean,
  'trustScore' : bigint,
  'notes' : Array<string>,
  'lastSeen' : bigint,
  'riskScore' : bigint,
}
export interface ReputationEntry {
  'firstSeen' : bigint,
  'isKnownScammer' : boolean,
  'reportCount' : bigint,
  'identifierType' : IdentifierType,
  'isVerifiedBusiness' : boolean,
  'trustScore' : bigint,
  'lastUpdated' : bigint,
  'notes' : Array<string>,
  'identifier' : string,
  'riskScore' : bigint,
}
export interface SuspiciousContactInput {
  'identifierType' : IdentifierType,
  'identifier' : string,
  'reason' : string,
}
export type VoidResult = { 'ok' : null } |
  { 'err' : string };
export interface _SERVICE {
  /**
   * / Number of reputation entries currently stored.
   */
  'getDatabaseSize' : ActorMethod<[], bigint>,
  /**
   * / Return the raw reputation entry.
   */
  'getReputationEntry' : ActorMethod<[string], [] | [ReputationEntry]>,
  /**
   * / Batch lookup.
   */
  'lookupBatch' : ActorMethod<[Array<string>], Array<LookupResult>>,
  'lookupDomain' : ActorMethod<[string], LookupResult>,
  'lookupEmail' : ActorMethod<[string], LookupResult>,
  'lookupIBAN' : ActorMethod<[string], LookupResult>,
  'lookupPhone' : ActorMethod<[string], LookupResult>,
  'lookupWallet' : ActorMethod<[string], LookupResult>,
  /**
   * / Report an identifier as suspicious.
   */
  'registerSuspicious' : ActorMethod<[SuspiciousContactInput], VoidResult>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
