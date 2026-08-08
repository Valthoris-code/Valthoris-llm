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

export type UserRole = { member: null } | { moderator: null } | { administrator: null };

export interface ManagedUser {
  principal    : string;
  displayName  : string;
  role         : UserRole;
  isActive     : boolean;
  registeredAt : bigint;
}

export interface SystemStats {
  totalUsers : bigint;
  version    : string;
  startTime  : bigint;
}

export type ProfileResult      = { ok: UserProfile } | { err: string };
export type ManagedUserResult  = { ok: ManagedUser } | { err: string };
export type ManagedUsersResult = { ok: ManagedUser[] } | { err: string };
export type VoidResult         = { ok: null } | { err: string };

export interface _SERVICE {
  ensureManagedUser      : ActorMethod<[], ManagedUserResult>;
  listManagedUsers       : ActorMethod<[], ManagedUsersResult>;
  setUserRole            : ActorMethod<[string, UserRole], ManagedUserResult>;
  setUserActive          : ActorMethod<[string, boolean], ManagedUserResult>;
  registerUser           : ActorMethod<[string], ProfileResult>;
  getUserProfile         : ActorMethod<[], ProfileResult>;
  getProfile             : ActorMethod<[string], [] | [UserProfile]>;
  isRegistered           : ActorMethod<[], boolean>;
  recordScan             : ActorMethod<[], VoidResult>;
  recordReport           : ActorMethod<[], VoidResult>;
  getSystemStats         : ActorMethod<[], SystemStats>;
  healthCheck            : ActorMethod<[], boolean>;
  getVersion             : ActorMethod<[], string>;
}

export declare const idlFactory: ({ IDL }: { IDL: any }) => any;
export declare const init: ({ IDL }: { IDL: any }) => any[];
