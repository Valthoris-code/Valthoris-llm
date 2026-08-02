export const idlFactory = ({ IDL }) => {
  const ReportCategory = IDL.Variant({
    phishing: IDL.Null, smishing: IDL.Null, scam: IDL.Null,
    malware: IDL.Null, spam: IDL.Null, fraud: IDL.Null,
    impersonation: IDL.Null, cryptoFraud: IDL.Null, other: IDL.Null,
  });
  const ReportStatus = IDL.Variant({
    pending: IDL.Null, confirmed: IDL.Null,
    rejected: IDL.Null, investigating: IDL.Null,
  });
  const Report = IDL.Record({
    id           : IDL.Text,
    reporter     : IDL.Text,
    category     : ReportCategory,
    target       : IDL.Text,
    description  : IDL.Text,
    evidence     : IDL.Opt(IDL.Text),
    status       : ReportStatus,
    createdAt    : IDL.Int,
    updatedAt    : IDL.Int,
    confirmVotes : IDL.Nat,
    rejectVotes  : IDL.Nat,
    riskScore    : IDL.Nat,
  });
  const CommunityStats = IDL.Record({
    totalReports     : IDL.Nat,
    confirmedThreats : IDL.Nat,
    pendingReports   : IDL.Nat,
    totalVotes       : IDL.Nat,
  });
  const SubmitResult = IDL.Variant({ ok: IDL.Text, err: IDL.Text });
  const VoidResult   = IDL.Variant({ ok: IDL.Null, err: IDL.Text });

  return IDL.Service({
    submitReport       : IDL.Func([ReportCategory, IDL.Text, IDL.Text, IDL.Opt(IDL.Text)], [SubmitResult], []),
    getReport          : IDL.Func([IDL.Text], [IDL.Opt(Report)], ['query']),
    getReportsByTarget : IDL.Func([IDL.Text], [IDL.Vec(Report)], ['query']),
    listRecentReports  : IDL.Func([IDL.Nat], [IDL.Vec(Report)], ['query']),
    voteConfirm        : IDL.Func([IDL.Text], [VoidResult], []),
    voteReject         : IDL.Func([IDL.Text], [VoidResult], []),
    getMyReports       : IDL.Func([], [IDL.Vec(Report)], ['query']),
    getStats           : IDL.Func([], [CommunityStats], ['query']),
  });
};

export const init = ({ IDL }) => { return []; };
