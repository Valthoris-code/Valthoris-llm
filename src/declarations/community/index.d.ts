import type { ActorMethod } from '@dfinity/agent';

export type ReportCategory =
  | { phishing: null }   | { smishing: null }    | { scam: null }
  | { malware: null }    | { spam: null }         | { fraud: null }
  | { impersonation: null } | { cryptoFraud: null } | { other: null };

export type ReportStatus =
  | { pending: null } | { confirmed: null }
  | { rejected: null } | { investigating: null };

export interface Report {
  id           : string;
  reporter     : string;
  category     : ReportCategory;
  target       : string;
  description  : string;
  evidence     : [] | [string];
  status       : ReportStatus;
  createdAt    : bigint;
  updatedAt    : bigint;
  confirmVotes : bigint;
  rejectVotes  : bigint;
  riskScore    : bigint;
}

export interface CommunityStats {
  totalReports     : bigint;
  confirmedThreats : bigint;
  pendingReports   : bigint;
  totalVotes       : bigint;
}

export type SubmitResult = { ok: string } | { err: string };
export type VoidResult   = { ok: null }   | { err: string };

export interface _SERVICE {
  submitReport       : ActorMethod<[ReportCategory, string, string, [] | [string]], SubmitResult>;
  getReport          : ActorMethod<[string], [] | [Report]>;
  getReportsByTarget : ActorMethod<[string], Report[]>;
  listRecentReports  : ActorMethod<[bigint], Report[]>;
  voteConfirm        : ActorMethod<[string], VoidResult>;
  voteReject         : ActorMethod<[string], VoidResult>;
  getMyReports       : ActorMethod<[], Report[]>;
  getStats           : ActorMethod<[], CommunityStats>;
}

export declare const idlFactory: ({ IDL }: { IDL: any }) => any;
export declare const init: ({ IDL }: { IDL: any }) => never[];
