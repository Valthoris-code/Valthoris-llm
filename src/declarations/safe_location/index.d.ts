import type { ActorMethod } from '@dfinity/agent';

export interface LocationData {
  latitude      : number;
  longitude     : number;
  accuracy      : [] | [number];
  timestamp     : bigint;
  locationLabel : [] | [string];
}

export interface ShareInfo {
  token     : string;
  owner     : string;
  recipient : [] | [string];
  createdAt : bigint;
  expiresAt : bigint;
  isActive  : boolean;
}

export interface GeofenceZone {
  id           : string;
  owner        : string;
  name         : string;
  centerLat    : number;
  centerLng    : number;
  radiusMeters : number;
  alertOnEnter : boolean;
  alertOnExit  : boolean;
  createdAt    : bigint;
  isActive     : boolean;
}

export type GeofenceAlertType = { entered: null } | { exited: null };

export interface GeofenceAlert {
  zoneId    : string;
  zoneName  : string;
  alertType : GeofenceAlertType;
  timestamp : bigint;
}

export type ShareResult = { ok: string }       | { err: string };
export type LocResult   = { ok: LocationData } | { err: string };
export type VoidResult  = { ok: null }         | { err: string };

export interface _SERVICE {
  shareLocation        : ActorMethod<[number, number, [] | [number], bigint, [] | [string], [] | [string]], ShareResult>;
  updateSharedLocation : ActorMethod<[string, number, number, [] | [number]], VoidResult>;
  getSharedLocation    : ActorMethod<[string], LocResult>;
  revokeShare          : ActorMethod<[string], VoidResult>;
  listMyShares         : ActorMethod<[], ShareInfo[]>;
  setGeofence          : ActorMethod<[string, number, number, number, boolean, boolean], ShareResult>;
  listMyGeofences      : ActorMethod<[], GeofenceZone[]>;
  deleteGeofence       : ActorMethod<[string], VoidResult>;
  checkGeofences       : ActorMethod<[number, number], GeofenceAlert[]>;
}

export declare const idlFactory: ({ IDL }: { IDL: any }) => any;
export declare const init: ({ IDL }: { IDL: any }) => never[];
