export const idlFactory = ({ IDL }) => {
  const IdentifierType = IDL.Variant({
    phone: IDL.Null, email: IDL.Null, domain: IDL.Null,
    iban: IDL.Null, walletAddress: IDL.Null, nif: IDL.Null, company: IDL.Null,
  });
  const ReputationEntry = IDL.Record({
    identifier         : IDL.Text,
    identifierType     : IdentifierType,
    reportCount        : IDL.Nat,
    trustScore         : IDL.Nat,
    riskScore          : IDL.Nat,
    isKnownScammer     : IDL.Bool,
    isVerifiedBusiness : IDL.Bool,
    firstSeen          : IDL.Int,
    lastUpdated        : IDL.Int,
    notes              : IDL.Vec(IDL.Text),
  });
  const LookupResult = IDL.Record({
    found              : IDL.Bool,
    trustScore         : IDL.Nat,
    riskScore          : IDL.Nat,
    reportCount        : IDL.Nat,
    isKnownScammer     : IDL.Bool,
    isVerifiedBusiness : IDL.Bool,
    notes              : IDL.Vec(IDL.Text),
    lastSeen           : IDL.Int,
  });
  const SuspiciousContactInput = IDL.Record({
    identifier     : IDL.Text,
    identifierType : IdentifierType,
    reason         : IDL.Text,
  });
  const VoidResult = IDL.Variant({ ok: IDL.Null, err: IDL.Text });

  return IDL.Service({
    lookupPhone          : IDL.Func([IDL.Text], [LookupResult], ['query']),
    lookupEmail          : IDL.Func([IDL.Text], [LookupResult], ['query']),
    lookupDomain         : IDL.Func([IDL.Text], [LookupResult], ['query']),
    lookupIBAN           : IDL.Func([IDL.Text], [LookupResult], ['query']),
    lookupWallet         : IDL.Func([IDL.Text], [LookupResult], ['query']),
    registerSuspicious   : IDL.Func([SuspiciousContactInput], [VoidResult], []),
    getReputationEntry   : IDL.Func([IDL.Text], [IDL.Opt(ReputationEntry)], ['query']),
    lookupBatch          : IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(LookupResult)], ['query']),
    getDatabaseSize      : IDL.Func([], [IDL.Nat], ['query']),
  });
};

export const init = ({ IDL }) => { return []; };
