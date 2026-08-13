export const idlFactory = ({ IDL }) => {
  const GeofenceAlertType = IDL.Variant({
    'entered' : IDL.Null,
    'exited' : IDL.Null,
  });
  const GeofenceAlert = IDL.Record({
    'alertType' : GeofenceAlertType,
    'zoneName' : IDL.Text,
    'timestamp' : IDL.Int,
    'zoneId' : IDL.Text,
  });
  const VoidResult = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const TrustedContact = IDL.Record({
    'id' : IDL.Text,
    'permissions' : IDL.Vec(IDL.Text),
    'relation' : IDL.Text,
    'name' : IDL.Text,
    'handle' : IDL.Text,
  });
  const SafeSettings = IDL.Record({
    'contacts' : IDL.Vec(TrustedContact),
    'owner' : IDL.Text,
    'defaultDuration' : IDL.Text,
    'highAccuracy' : IDL.Bool,
    'updatedAt' : IDL.Int,
    'emergencyMode' : IDL.Bool,
    'shareBattery' : IDL.Bool,
  });
  const SettingsResult = IDL.Variant({ 'ok' : SafeSettings, 'err' : IDL.Text });
  const LocationData = IDL.Record({
    'latitude' : IDL.Float64,
    'longitude' : IDL.Float64,
    'timestamp' : IDL.Int,
    'locationLabel' : IDL.Opt(IDL.Text),
    'accuracy' : IDL.Opt(IDL.Float64),
  });
  const LocResult = IDL.Variant({ 'ok' : LocationData, 'err' : IDL.Text });
  const GeofenceZone = IDL.Record({
    'id' : IDL.Text,
    'owner' : IDL.Text,
    'name' : IDL.Text,
    'createdAt' : IDL.Int,
    'isActive' : IDL.Bool,
    'alertOnExit' : IDL.Bool,
    'radiusMeters' : IDL.Float64,
    'alertOnEnter' : IDL.Bool,
    'centerLat' : IDL.Float64,
    'centerLng' : IDL.Float64,
  });
  const ShareInfo = IDL.Record({
    'token' : IDL.Text,
    'expiresAt' : IDL.Int,
    'owner' : IDL.Text,
    'createdAt' : IDL.Int,
    'recipient' : IDL.Opt(IDL.Text),
    'isActive' : IDL.Bool,
  });
  const ShareResult = IDL.Variant({ 'ok' : IDL.Text, 'err' : IDL.Text });
  return IDL.Service({
    'checkGeofences' : IDL.Func(
        [IDL.Float64, IDL.Float64],
        [IDL.Vec(GeofenceAlert)],
        ['query'],
      ),
    'deleteGeofence' : IDL.Func([IDL.Text], [VoidResult], []),
    'getMySettings' : IDL.Func([], [SettingsResult], ['query']),
    'getSharedLocation' : IDL.Func([IDL.Text], [LocResult], []),
    'listMyGeofences' : IDL.Func([], [IDL.Vec(GeofenceZone)], ['query']),
    'listMyShares' : IDL.Func([], [IDL.Vec(ShareInfo)], ['query']),
    'revokeShare' : IDL.Func([IDL.Text], [VoidResult], []),
    'setGeofence' : IDL.Func(
        [IDL.Text, IDL.Float64, IDL.Float64, IDL.Float64, IDL.Bool, IDL.Bool],
        [ShareResult],
        [],
      ),
    'setMySettings' : IDL.Func(
        [IDL.Vec(TrustedContact), IDL.Bool, IDL.Text, IDL.Bool, IDL.Bool],
        [SettingsResult],
        [],
      ),
    'shareLocation' : IDL.Func(
        [
          IDL.Float64,
          IDL.Float64,
          IDL.Opt(IDL.Float64),
          IDL.Nat,
          IDL.Opt(IDL.Text),
          IDL.Opt(IDL.Text),
        ],
        [ShareResult],
        [],
      ),
    'updateSharedLocation' : IDL.Func(
        [IDL.Text, IDL.Float64, IDL.Float64, IDL.Opt(IDL.Float64)],
        [VoidResult],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
