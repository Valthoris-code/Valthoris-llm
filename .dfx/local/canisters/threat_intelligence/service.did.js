export const idlFactory = ({ IDL }) => {
  const ThreatCategory = IDL.Variant({
    'commandAndControl' : IDL.Null,
    'exploit' : IDL.Null,
    'other' : IDL.Null,
    'ransomware' : IDL.Null,
    'scam' : IDL.Null,
    'spam' : IDL.Null,
    'phishing' : IDL.Null,
    'botnet' : IDL.Null,
    'cryptoMining' : IDL.Null,
    'bruteForce' : IDL.Null,
    'malware' : IDL.Null,
  });
  const ThreatSeverity = IDL.Variant({
    'low' : IDL.Null,
    'high' : IDL.Null,
    'critical' : IDL.Null,
    'medium' : IDL.Null,
  });
  const ThreatResult = IDL.Record({
    'matchedIndicators' : IDL.Nat,
    'lastUpdated' : IDL.Int,
    'details' : IDL.Vec(IDL.Text),
    'category' : IDL.Opt(ThreatCategory),
    'severity' : IDL.Opt(ThreatSeverity),
    'confidence' : IDL.Nat,
    'isThreat' : IDL.Bool,
  });
  const VoidResult = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const ThreatStats = IDL.Record({
    'activeThreats' : IDL.Nat,
    'criticalThreats' : IDL.Nat,
    'totalEntries' : IDL.Nat,
    'highThreats' : IDL.Nat,
  });
  const IndicatorType = IDL.Variant({
    'ip' : IDL.Null,
    'url' : IDL.Null,
    'domain' : IDL.Null,
    'fileHash' : IDL.Null,
    'walletAddress' : IDL.Null,
    'email' : IDL.Null,
  });
  const ThreatEntry = IDL.Record({
    'id' : IDL.Text,
    'tags' : IDL.Vec(IDL.Text),
    'description' : IDL.Text,
    'indicatorType' : IndicatorType,
    'isActive' : IDL.Bool,
    'reportedAt' : IDL.Int,
    'reportedBy' : IDL.Text,
    'indicator' : IDL.Text,
    'category' : ThreatCategory,
    'severity' : ThreatSeverity,
    'confidence' : IDL.Nat,
    'lastSeen' : IDL.Int,
  });
  const NewThreatInput = IDL.Record({
    'tags' : IDL.Vec(IDL.Text),
    'description' : IDL.Text,
    'indicatorType' : IndicatorType,
    'indicator' : IDL.Text,
    'category' : ThreatCategory,
    'severity' : ThreatSeverity,
    'confidence' : IDL.Nat,
  });
  const SubmitResult = IDL.Variant({ 'ok' : IDL.Text, 'err' : IDL.Text });
  return IDL.Service({
    'checkDomain' : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    'checkEmail' : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    'checkHash' : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    'checkIp' : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    'checkUrl' : IDL.Func([IDL.Text], [ThreatResult], ['query']),
    'deactivateThreat' : IDL.Func([IDL.Text], [VoidResult], []),
    'getStats' : IDL.Func([], [ThreatStats], ['query']),
    'getThreat' : IDL.Func([IDL.Text], [IDL.Opt(ThreatEntry)], ['query']),
    'listActiveThreats' : IDL.Func(
        [IDL.Nat],
        [IDL.Vec(ThreatEntry)],
        ['query'],
      ),
    'submitThreat' : IDL.Func([NewThreatInput], [SubmitResult], []),
  });
};
export const init = ({ IDL }) => { return []; };
