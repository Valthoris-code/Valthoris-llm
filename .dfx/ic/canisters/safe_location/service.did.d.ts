import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface GeofenceAlert {
  'alertType' : GeofenceAlertType,
  'zoneName' : string,
  'timestamp' : bigint,
  'zoneId' : string,
}
export type GeofenceAlertType = { 'entered' : null } |
  { 'exited' : null };
export interface GeofenceZone {
  'id' : string,
  'owner' : string,
  'name' : string,
  'createdAt' : bigint,
  'isActive' : boolean,
  'alertOnExit' : boolean,
  'radiusMeters' : number,
  'alertOnEnter' : boolean,
  'centerLat' : number,
  'centerLng' : number,
}
export type LocResult = { 'ok' : LocationData } |
  { 'err' : string };
export interface LocationData {
  'latitude' : number,
  'longitude' : number,
  'timestamp' : bigint,
  'locationLabel' : [] | [string],
  'accuracy' : [] | [number],
}
export interface SafeSettings {
  'contacts' : Array<TrustedContact>,
  'owner' : string,
  'defaultDuration' : string,
  'highAccuracy' : boolean,
  'updatedAt' : bigint,
  'emergencyMode' : boolean,
  'shareBattery' : boolean,
}
export type SettingsResult = { 'ok' : SafeSettings } |
  { 'err' : string };
export interface ShareInfo {
  'token' : string,
  'expiresAt' : bigint,
  'owner' : string,
  'createdAt' : bigint,
  'recipient' : [] | [string],
  'isActive' : boolean,
}
export type ShareResult = { 'ok' : string } |
  { 'err' : string };
export interface TrustedContact {
  'id' : string,
  'permissions' : Array<string>,
  'relation' : string,
  'name' : string,
  'handle' : string,
}
export type VoidResult = { 'ok' : null } |
  { 'err' : string };
export interface _SERVICE {
  /**
   * / Check provided coordinates against all active geofences owned by the caller.
   * / Returns an alert for every zone the point falls inside.
   */
  'checkGeofences' : ActorMethod<[number, number], Array<GeofenceAlert>>,
  /**
   * / Soft-delete a geofence owned by the caller.
   */
  'deleteGeofence' : ActorMethod<[string], VoidResult>,
  /**
   * / Read the caller's Safe Location configuration.
   * / Returns the defaults when nothing has been saved yet, so the UI always
   * / hydrates from the canister instead of from browser storage.
   */
  'getMySettings' : ActorMethod<[], SettingsResult>,
  /**
   * / Read the current location of an active share.
   * / Access: owner, named recipient, or anyone when recipient is null.
   */
  'getSharedLocation' : ActorMethod<[string], LocResult>,
  /**
   * / List all active geofences owned by the caller.
   */
  'listMyGeofences' : ActorMethod<[], Array<GeofenceZone>>,
  /**
   * / List all shares created by the caller.
   */
  'listMyShares' : ActorMethod<[], Array<ShareInfo>>,
  /**
   * / Revoke a share before it expires.
   */
  'revokeShare' : ActorMethod<[string], VoidResult>,
  /**
   * / Create a geofence zone owned by the caller.
   */
  'setGeofence' : ActorMethod<
    [string, number, number, number, boolean, boolean],
    ShareResult
  >,
  /**
   * / Persist the caller's Safe Location configuration (trusted contacts,
   * / emergency mode and device preferences). Owner-scoped: a caller can only
   * / ever read or write their own record.
   */
  'setMySettings' : ActorMethod<
    [Array<TrustedContact>, boolean, string, boolean, boolean],
    SettingsResult
  >,
  /**
   * / Create a new location share. Returns a unique access token.
   * / `ttlSeconds` must be 1–2592000 (30 days max).
   */
  'shareLocation' : ActorMethod<
    [number, number, [] | [number], bigint, [] | [string], [] | [string]],
    ShareResult
  >,
  /**
   * / Push a new coordinate to an existing, active share.
   */
  'updateSharedLocation' : ActorMethod<
    [string, number, number, [] | [number]],
    VoidResult
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
