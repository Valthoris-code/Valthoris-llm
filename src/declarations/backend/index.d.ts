import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';

export interface UserProfile {
  principal       : string;
  displayName     : string;
  createdAt       : bigint;
  updatedAt       : bigint;
  reputationScore : bigint;
  totalReports    : bigint;
  totalScans      : bigint;
  isActive        : boolean;
}

export interface SystemStats {
  totalUsers : bigint;
  version    : string;
  startTime  : bigint;
}

export type ProfileResult = { ok: UserProfile } | { err: string };
export type VoidResult    = { ok: null } | { err: string };

export interface _SERVICE {
  registerUser   : ActorMethod<[string], ProfileResult>;
  getUserProfile : ActorMethod<[], ProfileResult>;
  getProfile     : ActorMethod<[string], [] | [UserProfile]>;
  isRegistered   : ActorMethod<[], boolean>;
  recordScan     : ActorMethod<[], VoidResult>;
  recordReport   : ActorMethod<[], VoidResult>;
  getSystemStats : ActorMethod<[], SystemStats>;
  healthCheck    : ActorMethod<[], boolean>;
  getVersion     : ActorMethod<[], string>;
}

export declare const idlFactory: ({ IDL }: { IDL: any }) => any;
export declare const init: ({ IDL }: { IDL: any }) => never[];
