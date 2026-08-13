export const idlFactory = ({ IDL }) => {
  const UserRole = IDL.Variant({
    'member' : IDL.Null,
    'moderator' : IDL.Null,
    'administrator' : IDL.Null,
  });
  const ManagedUser = IDL.Record({
    'principal' : IDL.Text,
    'displayName' : IDL.Text,
    'role' : UserRole,
    'isActive' : IDL.Bool,
    'registeredAt' : IDL.Int,
  });
  const ManagedUserResult = IDL.Variant({
    'ok' : ManagedUser,
    'err' : IDL.Text,
  });
  const UserProfile = IDL.Record({
    'principal' : IDL.Text,
    'reputationScore' : IDL.Nat,
    'displayName' : IDL.Text,
    'createdAt' : IDL.Int,
    'totalReports' : IDL.Nat,
    'isActive' : IDL.Bool,
    'totalScans' : IDL.Nat,
    'updatedAt' : IDL.Int,
  });
  const ProfileDetails = IDL.Record({
    'bio' : IDL.Opt(IDL.Text),
    'principal' : IDL.Text,
    'country' : IDL.Opt(IDL.Text),
    'displayName' : IDL.Opt(IDL.Text),
    'twoFactor' : IDL.Bool,
    'publicProfile' : IDL.Bool,
    'updatedAt' : IDL.Int,
    'avatarUrl' : IDL.Opt(IDL.Text),
  });
  const ProfileDetailsResult = IDL.Variant({
    'ok' : ProfileDetails,
    'err' : IDL.Text,
  });
  const SystemStats = IDL.Record({
    'startTime' : IDL.Int,
    'version' : IDL.Text,
    'totalUsers' : IDL.Nat,
  });
  const ProfileResult = IDL.Variant({ 'ok' : UserProfile, 'err' : IDL.Text });
  const ManagedUsersResult = IDL.Variant({
    'ok' : IDL.Vec(ManagedUser),
    'err' : IDL.Text,
  });
  const VoidResult = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const Backend = IDL.Service({
    'ensureManagedUser' : IDL.Func([], [ManagedUserResult], []),
    'getProfile' : IDL.Func([IDL.Text], [IDL.Opt(UserProfile)], ['query']),
    'getProfileDetails' : IDL.Func([], [ProfileDetailsResult], ['query']),
    'getSystemStats' : IDL.Func([], [SystemStats], ['query']),
    'getUserProfile' : IDL.Func([], [ProfileResult], ['query']),
    'getVersion' : IDL.Func([], [IDL.Text], ['query']),
    'healthCheck' : IDL.Func([], [IDL.Bool], ['query']),
    'isRegistered' : IDL.Func([], [IDL.Bool], ['query']),
    'listManagedUsers' : IDL.Func([], [ManagedUsersResult], []),
    'recordReport' : IDL.Func([], [VoidResult], []),
    'recordScan' : IDL.Func([], [VoidResult], []),
    'registerUser' : IDL.Func([IDL.Text], [ProfileResult], []),
    'setProfileDetails' : IDL.Func(
        [
          IDL.Opt(IDL.Text),
          IDL.Opt(IDL.Text),
          IDL.Opt(IDL.Text),
          IDL.Opt(IDL.Text),
          IDL.Bool,
          IDL.Bool,
        ],
        [ProfileDetailsResult],
        [],
      ),
    'setUserActive' : IDL.Func([IDL.Text, IDL.Bool], [ManagedUserResult], []),
    'setUserRole' : IDL.Func([IDL.Text, UserRole], [ManagedUserResult], []),
  });
  return Backend;
};
export const init = ({ IDL }) => { return [IDL.Principal]; };
