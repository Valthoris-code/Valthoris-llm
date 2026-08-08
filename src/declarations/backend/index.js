export const idlFactory = ({ IDL }) => {
  const UserRole = IDL.Variant({
    member: IDL.Null,
    moderator: IDL.Null,
    administrator: IDL.Null,
  });
  const UserProfile = IDL.Record({
    principal       : IDL.Text,
    displayName     : IDL.Text,
    createdAt       : IDL.Int,
    updatedAt       : IDL.Int,
    reputationScore : IDL.Nat,
    totalReports    : IDL.Nat,
    totalScans      : IDL.Nat,
    isActive        : IDL.Bool,
  });
  const ManagedUser = IDL.Record({
    principal    : IDL.Text,
    displayName  : IDL.Text,
    role         : UserRole,
    isActive     : IDL.Bool,
    registeredAt : IDL.Int,
  });
  const ProfileResult      = IDL.Variant({ ok: UserProfile, err: IDL.Text });
  const ManagedUserResult  = IDL.Variant({ ok: ManagedUser, err: IDL.Text });
  const ManagedUsersResult = IDL.Variant({ ok: IDL.Vec(ManagedUser), err: IDL.Text });
  const VoidResult         = IDL.Variant({ ok: IDL.Null, err: IDL.Text });
  const SystemStats   = IDL.Record({
    totalUsers : IDL.Nat,
    version    : IDL.Text,
    startTime  : IDL.Int,
  });
  return IDL.Service({
    ensureManagedUser      : IDL.Func([], [ManagedUserResult], []),
    listManagedUsers       : IDL.Func([], [ManagedUsersResult], []),
    setUserRole            : IDL.Func([IDL.Text, UserRole], [ManagedUserResult], []),
    setUserActive          : IDL.Func([IDL.Text, IDL.Bool], [ManagedUserResult], []),
    registerUser           : IDL.Func([IDL.Text], [ProfileResult], []),
    getUserProfile         : IDL.Func([], [ProfileResult], ['query']),
    getProfile             : IDL.Func([IDL.Text], [IDL.Opt(UserProfile)], ['query']),
    isRegistered           : IDL.Func([], [IDL.Bool], ['query']),
    recordScan             : IDL.Func([], [VoidResult], []),
    recordReport           : IDL.Func([], [VoidResult], []),
    getSystemStats         : IDL.Func([], [SystemStats], ['query']),
    healthCheck            : IDL.Func([], [IDL.Bool], ['query']),
    getVersion             : IDL.Func([], [IDL.Text], ['query']),
  });
};

export const init = ({ IDL }) => { return []; };
