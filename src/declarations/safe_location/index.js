export const idlFactory = ({ IDL }) => {
  const LocationData = IDL.Record({
    latitude      : IDL.Float64,
    longitude     : IDL.Float64,
    accuracy      : IDL.Opt(IDL.Float64),
    timestamp     : IDL.Int,
    locationLabel : IDL.Opt(IDL.Text),
  });
  const ShareInfo = IDL.Record({
    token     : IDL.Text,
    owner     : IDL.Text,
    recipient : IDL.Opt(IDL.Text),
    createdAt : IDL.Int,
    expiresAt : IDL.Int,
    isActive  : IDL.Bool,
  });
  const GeofenceZone = IDL.Record({
    id           : IDL.Text,
    owner        : IDL.Text,
    name         : IDL.Text,
    centerLat    : IDL.Float64,
    centerLng    : IDL.Float64,
    radiusMeters : IDL.Float64,
    alertOnEnter : IDL.Bool,
    alertOnExit  : IDL.Bool,
    createdAt    : IDL.Int,
    isActive     : IDL.Bool,
  });
  const GeofenceAlertType = IDL.Variant({ entered: IDL.Null, exited: IDL.Null });
  const GeofenceAlert = IDL.Record({
    zoneId    : IDL.Text,
    zoneName  : IDL.Text,
    alertType : GeofenceAlertType,
    timestamp : IDL.Int,
  });
  const TrustedContact = IDL.Record({
    id          : IDL.Text,
    name        : IDL.Text,
    handle      : IDL.Text,
    relation    : IDL.Text,
    permissions : IDL.Vec(IDL.Text),
  });
  const SafeSettings = IDL.Record({
    owner           : IDL.Text,
    contacts        : IDL.Vec(TrustedContact),
    emergencyMode   : IDL.Bool,
    defaultDuration : IDL.Text,
    highAccuracy    : IDL.Bool,
    shareBattery    : IDL.Bool,
    updatedAt       : IDL.Int,
  });
  const ShareResult = IDL.Variant({ ok: IDL.Text,         err: IDL.Text });
  const LocResult   = IDL.Variant({ ok: LocationData,     err: IDL.Text });
  const VoidResult  = IDL.Variant({ ok: IDL.Null,         err: IDL.Text });
  const SettingsResult = IDL.Variant({ ok: SafeSettings,  err: IDL.Text });

  return IDL.Service({
    shareLocation        : IDL.Func(
      [IDL.Float64, IDL.Float64, IDL.Opt(IDL.Float64), IDL.Nat, IDL.Opt(IDL.Text), IDL.Opt(IDL.Text)],
      [ShareResult], []
    ),
    updateSharedLocation : IDL.Func(
      [IDL.Text, IDL.Float64, IDL.Float64, IDL.Opt(IDL.Float64)], [VoidResult], []
    ),
    getSharedLocation    : IDL.Func([IDL.Text], [LocResult], []),
    revokeShare          : IDL.Func([IDL.Text], [VoidResult], []),
    listMyShares         : IDL.Func([], [IDL.Vec(ShareInfo)], ['query']),
    setGeofence          : IDL.Func(
      [IDL.Text, IDL.Float64, IDL.Float64, IDL.Float64, IDL.Bool, IDL.Bool],
      [ShareResult], []
    ),
    listMyGeofences      : IDL.Func([], [IDL.Vec(GeofenceZone)], ['query']),
    deleteGeofence       : IDL.Func([IDL.Text], [VoidResult], []),
    checkGeofences       : IDL.Func([IDL.Float64, IDL.Float64], [IDL.Vec(GeofenceAlert)], ['query']),
    getMySettings        : IDL.Func([], [SettingsResult], ['query']),
    setMySettings        : IDL.Func(
      [IDL.Vec(TrustedContact), IDL.Bool, IDL.Text, IDL.Bool, IDL.Bool],
      [SettingsResult], []
    ),
  });
};

export const init = ({ IDL }) => { return []; };
