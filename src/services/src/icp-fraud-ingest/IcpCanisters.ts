/**
 * icp-fraud-ingest/IcpCanisters.ts
 *
 * Creates typed ICP canister actors for the fraud ingest service.
 *
 * The IDL factories are inlined here (derived from src/declarations/) so that
 * this CommonJS package does not need to import ES-module declaration files.
 *
 * TODO: Keep this file in sync with src/declarations/ if the canister
 *       interfaces change.
 */

import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { IDL } from '@dfinity/candid';
import { IcpCommunityService, IcpThreatIntelligenceService } from '../types/icp';

// ─── Community IDL ────────────────────────────────────────────────────────

function communityIdlFactory(): IDL.ServiceClass {
  const ReportCategory = IDL.Variant({
    phishing: IDL.Null, smishing: IDL.Null, scam: IDL.Null,
    malware: IDL.Null, spam: IDL.Null, fraud: IDL.Null,
    impersonation: IDL.Null, cryptoFraud: IDL.Null, other: IDL.Null,
  });
  const ReportStatus = IDL.Variant({
    pending: IDL.Null, confirmed: IDL.Null,
    rejected: IDL.Null, investigating: IDL.Null,
  });
  const Report = IDL.Record({
    id: IDL.Text,
    reporter: IDL.Text,
    category: ReportCategory,
    target: IDL.Text,
    description: IDL.Text,
    evidence: IDL.Opt(IDL.Text),
    status: ReportStatus,
    createdAt: IDL.Int,
    updatedAt: IDL.Int,
    confirmVotes: IDL.Nat,
    rejectVotes: IDL.Nat,
    riskScore: IDL.Nat,
  });
  const SubmitResult = IDL.Variant({ ok: IDL.Text, err: IDL.Text });
  const VoidResult = IDL.Variant({ ok: IDL.Null, err: IDL.Text });

  return IDL.Service({
    submitReport: IDL.Func(
      [ReportCategory, IDL.Text, IDL.Text, IDL.Opt(IDL.Text)],
      [SubmitResult], [],
    ),
    getReport: IDL.Func([IDL.Text], [IDL.Opt(Report)], ['query']),
    getReportsByTarget: IDL.Func([IDL.Text], [IDL.Vec(Report)], ['query']),
    listRecentReports: IDL.Func([IDL.Nat], [IDL.Vec(Report)], ['query']),
    voteConfirm: IDL.Func([IDL.Text], [VoidResult], []),
    voteReject: IDL.Func([IDL.Text], [VoidResult], []),
    getMyReports: IDL.Func([], [IDL.Vec(Report)], ['query']),
    getStats: IDL.Func([], [IDL.Record({
      totalReports: IDL.Nat,
      confirmedThreats: IDL.Nat,
      pendingReports: IDL.Nat,
      totalVotes: IDL.Nat,
    })], ['query']),
  });
}

// ─── ThreatIntelligence IDL ───────────────────────────────────────────────

function threatIntelligenceIdlFactory(): IDL.ServiceClass {
  const ThreatCategory = IDL.Variant({
    phishing: IDL.Null, malware: IDL.Null, ransomware: IDL.Null,
    commandAndControl: IDL.Null, spam: IDL.Null, cryptoMining: IDL.Null,
    botnet: IDL.Null, exploit: IDL.Null, bruteForce: IDL.Null,
    scam: IDL.Null, other: IDL.Null,
  });
  const ThreatSeverity = IDL.Variant({
    low: IDL.Null, medium: IDL.Null, high: IDL.Null, critical: IDL.Null,
  });
  const IndicatorType = IDL.Variant({
    url: IDL.Null, ip: IDL.Null, domain: IDL.Null,
    fileHash: IDL.Null, email: IDL.Null, walletAddress: IDL.Null,
  });
  const ThreatEntry = IDL.Record({
    id: IDL.Text,
    indicator: IDL.Text,
    indicatorType: IndicatorType,
    category: ThreatCategory,
    severity: ThreatSeverity,
    description: IDL.Text,
    reportedBy: IDL.Text,
    reportedAt: IDL.Int,
    lastSeen: IDL.Int,
    confidence: IDL.Nat,
    tags: IDL.Vec(IDL.Text),
    isActive: IDL.Bool,
  });
  const ThreatResult = IDL.Record({
    isThreat: IDL.Bool,
    severity: IDL.Opt(ThreatSeverity),
    category: IDL.Opt(ThreatCategory),
    confidence: IDL.Nat,
    matchedIndicators: IDL.Nat,
    details: IDL.Vec(IDL.Text),
    lastUpdated: IDL.Int,
  });
  const NewThreatInput = IDL.Record({
    indicator: IDL.Text,
    indicatorType: IndicatorType,
    category: ThreatCategory,
    severity: ThreatSeverity,
    description: IDL.Text,
    tags: IDL.Vec(IDL.Text),
  });
  const ThreatStats = IDL.Record({
    totalEntries: IDL.Nat,
    activeThreats: IDL.Nat,
    criticalThreats: IDL.Nat,
    highThreats: IDL.Nat,
  });
  const AddResult = IDL.Variant({ ok: IDL.Text, err: IDL.Text });
  const VoidResult = IDL.Variant({ ok: IDL.Null, err: IDL.Text });

  return IDL.Service({
    addThreat: IDL.Func([NewThreatInput], [AddResult], []),
    checkThreat: IDL.Func([IDL.Text], [ThreatResult], ['query']),
    getThreatEntry: IDL.Func([IDL.Text], [IDL.Opt(ThreatEntry)], ['query']),
    getActiveThreats: IDL.Func([IDL.Nat], [IDL.Vec(ThreatEntry)], ['query']),
    deactivateThreat: IDL.Func([IDL.Text], [VoidResult], []),
    getStats: IDL.Func([], [ThreatStats], ['query']),
    healthCheck: IDL.Func([], [IDL.Bool], ['query']),
  });
}

// ─── Factory ─────────────────────────────────────────────────────────────

export interface IcpActors {
  community: IcpCommunityService;
  threatIntelligence: IcpThreatIntelligenceService;
}

function createAgent(host: string): HttpAgent {
  const agent = HttpAgent.createSync({ host });

  // Fetch root key only on local replica — never on mainnet
  if (host.includes('127.0.0.1') || host.includes('localhost')) {
    agent.fetchRootKey().catch((err: unknown) =>
      console.error('[IcpCanisters] Failed to fetch root key:', err),
    );
  }

  return agent;
}

export function createIcpActors(
  host: string,
  communityCanisterId: string,
  threatIntelligenceCanisterId: string,
): IcpActors {
  const agent = createAgent(host);

  const community = Actor.createActor<IcpCommunityService>(
    communityIdlFactory as unknown as Parameters<typeof Actor.createActor>[0],
    { agent, canisterId: Principal.fromText(communityCanisterId) },
  );

  const threatIntelligence = Actor.createActor<IcpThreatIntelligenceService>(
    threatIntelligenceIdlFactory as unknown as Parameters<typeof Actor.createActor>[0],
    { agent, canisterId: Principal.fromText(threatIntelligenceCanisterId) },
  );

  return { community, threatIntelligence };
}
