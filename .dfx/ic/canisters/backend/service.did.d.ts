import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface Backend {
  'ensureManagedUser' : ActorMethod<[], ManagedUserResult>,
  'getProfile' : ActorMethod<[string], [] | [UserProfile]>,
  'getProfileDetails' : ActorMethod<[], ProfileDetailsResult>,
  'getSystemStats' : ActorMethod<[], SystemStats>,
  'getUserProfile' : ActorMethod<[], ProfileResult>,
  'getVersion' : ActorMethod<[], string>,
  'healthCheck' : ActorMethod<[], boolean>,
  'isRegistered' : ActorMethod<[], boolean>,
  'listManagedUsers' : ActorMethod<[], ManagedUsersResult>,
  'recordReport' : ActorMethod<[], VoidResult>,
  'recordScan' : ActorMethod<[], VoidResult>,
  'registerUser' : ActorMethod<[string], ProfileResult>,
  'setProfileDetails' : ActorMethod<
    [
      [] | [string],
      [] | [string],
      [] | [string],
      [] | [string],
      boolean,
      boolean,
    ],
    ProfileDetailsResult
  >,
  'setUserActive' : ActorMethod<[string, boolean], ManagedUserResult>,
  'setUserRole' : ActorMethod<[string, UserRole], ManagedUserResult>,
}
export interface ManagedUser {
  'principal' : string,
  'displayName' : string,
  'role' : UserRole,
  'isActive' : boolean,
  'registeredAt' : bigint,
}
export type ManagedUserResult = { 'ok' : ManagedUser } |
  { 'err' : string };
export type ManagedUsersResult = { 'ok' : Array<ManagedUser> } |
  { 'err' : string };
export interface ProfileDetails {
  'bio' : [] | [string],
  'principal' : string,
  'country' : [] | [string],
  'displayName' : [] | [string],
  'twoFactor' : boolean,
  'publicProfile' : boolean,
  'updatedAt' : bigint,
  'avatarUrl' : [] | [string],
}
export type ProfileDetailsResult = { 'ok' : ProfileDetails } |
  { 'err' : string };
export type ProfileResult = { 'ok' : UserProfile } |
  { 'err' : string };
export interface SystemStats {
  'startTime' : bigint,
  'version' : string,
  'totalUsers' : bigint,
}
export interface UserProfile {
  'principal' : string,
  'reputationScore' : bigint,
  'displayName' : string,
  'createdAt' : bigint,
  'totalReports' : bigint,
  'isActive' : boolean,
  'totalScans' : bigint,
  'updatedAt' : bigint,
}
export type UserRole = { 'member' : null } |
  { 'moderator' : null } |
  { 'administrator' : null };
export type VoidResult = { 'ok' : null } |
  { 'err' : string };
export interface _SERVICE extends Backend {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
