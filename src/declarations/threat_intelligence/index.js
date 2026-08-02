export const idlFactory = ({ IDL }) => {
  const ThreatCategory = IDL.Variant({
    phishing: IDL.Null, malware: IDL.Null, ransomware: IDL.Null,
    commandAndControl: IDL.Null, spam: IDL.Null, cryptoMining: IDL.Null,
    botnet: IDL.Null, exploit: IDL.Null, bruteForce: IDL.Null,
    scam: IDL.Null, other: IDL.Null,
  });
  const ThreatSeverity = IDL.Variant({
    low: IDL.Null, medium: IDL.Null, high: IDL.Null, critical: IDL.Null,
  });
  const IndicatorType = IDL.Variant({
    url: IDL.Null, ip: IDL.Null, domain: IDL.Null,
    fileHash: IDL.Null, email: IDL.Null, walletAddress: IDL.Null,
  });
  const ThreatEntry = IDL.Record({
    id            : IDL.Text,
    indicator     : IDL.Text,
    indicatorType : IndicatorType,
    category      : ThreatCategory,
    severity      : ThreatSeverity,
    description   : IDL.Text,
    reportedBy    : IDL.Text,
    reportedAt    : IDL.Int,
    lastSeen      : IDL.Int,
    confidence    : IDL.Nat,
    tags          : IDL.Vec(IDL.Text),
    isActive      : IDL.Bool,
  });
  const ThreatResult = IDL.Record({
    isThreat          : IDL.Bool,
    severity          : IDL.Opt(ThreatSeverity),
    category          : IDL.Opt(ThreatCategory),
    confidence        : IDL.Nat,
    matchedIndicators : IDL.Nat,
    details           : IDL.Vec(IDL.Text),
    lastUpdated       : IDL.Int,
  });
  const ThreatStats = IDL.Record({
    totalEntries    : IDL.Nat,
    activeThreats   : IDL.Nat,
    criticalThreats : IDL.Nat,
    highThreats     : IDL.Nat,
  });
  const NewThreatInput = IDL.Record({
    indicator     : IDL.Text,
    indicatorType : IndicatorType,
    category      : ThreatCategory,
    severity      : ThreatSeverity,
    description   : IDL.Text,
    confidence    : IDL.Nat,
    tags          : IDL.Vec(IDL.Text),
  });
  const SubmitResult = IDL.Variant({ ok: IDL.Text, err: IDL.Text });
  const VoidResult   = IDL.Variant({ ok: IDL.Null, err: IDL.Text });

  return IDL.Service({
    checkUrl          : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    checkIp           : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    checkDomain       : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    checkHash         : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    checkEmail        : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    submitThreat      : IDL.Func([NewThreatInput], [SubmitResult], []),
    getThreat         : IDL.Func([IDL.Text], [IDL.Opt(ThreatEntry)], ['query']),
    listActiveThreats : IDL.Func([IDL.Nat], [IDL.Vec(ThreatEntry)], ['query']),
    deactivateThreat  : IDL.Func([IDL.Text], [VoidResult], []),
    getStats          : IDL.Func([], [ThreatStats], ['query']),
  });
};

export const init = ({ IDL }) => { return []; };
