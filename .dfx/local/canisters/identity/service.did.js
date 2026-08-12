export const idlFactory = ({ IDL }) => {
  const IdentifierType = IDL.Variant({
    'nif' : IDL.Null,
    'domain' : IDL.Null,
    'iban' : IDL.Null,
    'walletAddress' : IDL.Null,
    'email' : IDL.Null,
    'company' : IDL.Null,
    'phone' : IDL.Null,
  });
  const ReputationEntry = IDL.Record({
    'firstSeen' : IDL.Int,
    'isKnownScammer' : IDL.Bool,
    'reportCount' : IDL.Nat,
    'identifierType' : IdentifierType,
    'isVerifiedBusiness' : IDL.Bool,
    'trustScore' : IDL.Nat,
    'lastUpdated' : IDL.Int,
    'notes' : IDL.Vec(IDL.Text),
    'identifier' : IDL.Text,
    'riskScore' : IDL.Nat,
  });
  const LookupResult = IDL.Record({
    'found' : IDL.Bool,
    'isKnownScammer' : IDL.Bool,
    'reportCount' : IDL.Nat,
    'isVerifiedBusiness' : IDL.Bool,
    'trustScore' : IDL.Nat,
    'notes' : IDL.Vec(IDL.Text),
    'lastSeen' : IDL.Int,
    'riskScore' : IDL.Nat,
  });
  const SuspiciousContactInput = IDL.Record({
    'identifierType' : IdentifierType,
    'identifier' : IDL.Text,
    'reason' : IDL.Text,
  });
  const VoidResult = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  return IDL.Service({
    'getDatabaseSize' : IDL.Func([], [IDL.Nat], ['query']),
    'getReputationEntry' : IDL.Func(
        [IDL.Text],
        [IDL.Opt(ReputationEntry)],
        ['query'],
      ),
    'lookupBatch' : IDL.Func(
        [IDL.Vec(IDL.Text)],
        [IDL.Vec(LookupResult)],
        ['query'],
      ),
    'lookupDomain' : IDL.Func([IDL.Text], [LookupResult], ['query']),
    'lookupEmail' : IDL.Func([IDL.Text], [LookupResult], ['query']),
    'lookupIBAN' : IDL.Func([IDL.Text], [LookupResult], ['query']),
    'lookupPhone' : IDL.Func([IDL.Text], [LookupResult], ['query']),
    'lookupWallet' : IDL.Func([IDL.Text], [LookupResult], ['query']),
    'registerSuspicious' : IDL.Func([SuspiciousContactInput], [VoidResult], []),
  });
};
export const init = ({ IDL }) => { return []; };
