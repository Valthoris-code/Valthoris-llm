import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export type IndicatorType = { 'ip' : null } |
  { 'url' : null } |
  { 'domain' : null } |
  { 'fileHash' : null } |
  { 'walletAddress' : null } |
  { 'email' : null };
export interface NewThreatInput {
  'tags' : Array<string>,
  'description' : string,
  'indicatorType' : IndicatorType,
  'indicator' : string,
  'category' : ThreatCategory,
  'severity' : ThreatSeverity,
  'confidence' : bigint,
}
export type SubmitResult = { 'ok' : string } |
  { 'err' : string };
export type ThreatCategory = { 'commandAndControl' : null } |
  { 'exploit' : null } |
  { 'other' : null } |
  { 'ransomware' : null } |
  { 'scam' : null } |
  { 'spam' : null } |
  { 'phishing' : null } |
  { 'botnet' : null } |
  { 'cryptoMining' : null } |
  { 'bruteForce' : null } |
  { 'malware' : null };
export interface ThreatEntry {
  'id' : string,
  'tags' : Array<string>,
  'description' : string,
  'indicatorType' : IndicatorType,
  'isActive' : boolean,
  'reportedAt' : bigint,
  'reportedBy' : string,
  'indicator' : string,
  'category' : ThreatCategory,
  'severity' : ThreatSeverity,
  'confidence' : bigint,
  'lastSeen' : bigint,
}
export interface ThreatResult {
  'matchedIndicators' : bigint,
  'lastUpdated' : bigint,
  'details' : Array<string>,
  'category' : [] | [ThreatCategory],
  'severity' : [] | [ThreatSeverity],
  'confidence' : bigint,
  'isThreat' : boolean,
}
export type ThreatSeverity = { 'low' : null } |
  { 'high' : null } |
  { 'critical' : null } |
  { 'medium' : null };
export interface ThreatStats {
  'activeThreats' : bigint,
  'criticalThreats' : bigint,
  'totalEntries' : bigint,
  'highThreats' : bigint,
}
export type VoidResult = { 'ok' : null } |
  { 'err' : string };
export interface _SERVICE {
  'checkDomain' : ActorMethod<[string], ThreatResult>,
  'checkEmail' : ActorMethod<[string], ThreatResult>,
  'checkHash' : ActorMethod<[string], ThreatResult>,
  'checkIp' : ActorMethod<[string], ThreatResult>,
  'checkUrl' : ActorMethod<[string], ThreatResult>,
  'deactivateThreat' : ActorMethod<[string], VoidResult>,
  'getStats' : ActorMethod<[], ThreatStats>,
  'getThreat' : ActorMethod<[string], [] | [ThreatEntry]>,
  'listActiveThreats' : ActorMethod<[bigint], Array<ThreatEntry>>,
  'submitThreat' : ActorMethod<[NewThreatInput], SubmitResult>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
