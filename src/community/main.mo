import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Array "mo:base/Array";
import Result "mo:base/Result";
import Nat "mo:base/Nat";
import Buffer "mo:base/Buffer";

/// Community — fraud reports, community voting, and reputation signals.
actor Community {

  // ──────────────────────────────────────────────────────────────────────
  // Types
  // ──────────────────────────────────────────────────────────────────────

  public type ReportCategory = {
    #phishing;
    #smishing;
    #scam;
    #malware;
    #spam;
    #fraud;
    #impersonation;
    #cryptoFraud;
    #other;
  };

  public type ReportStatus = {
    #pending;
    #confirmed;
    #rejected;
    #investigating;
  };

  public type Report = {
    id           : Text;
    reporter     : Text;
    category     : ReportCategory;
    target       : Text;
    description  : Text;
    evidence     : ?Text;
    status       : ReportStatus;
    createdAt    : Int;
    updatedAt    : Int;
    confirmVotes : Nat;
    rejectVotes  : Nat;
    riskScore    : Nat;   // 0–100
  };

  public type CommunityStats = {
    totalReports     : Nat;
    confirmedThreats : Nat;
    pendingReports   : Nat;
    totalVotes       : Nat;
  };

  public type SubmitResult = Result.Result<Text, Text>;
  public type VoidResult   = Result.Result<(), Text>;

  // ──────────────────────────────────────────────────────────────────────
  // Stable storage
  // ──────────────────────────────────────────────────────────────────────

  stable var reportsEntries : [(Text, Report)]   = [];
  stable var votesEntries   : [(Text, [Text])]   = [];
  stable var reportCounter  : Nat                = 0;

  var reports : HashMap.HashMap<Text, Report> =
    HashMap.fromIter<Text, Report>(
      reportsEntries.vals(), reportsEntries.size(), Text.equal, Text.hash
    );

  // voters: reportId → list of principal strings that already voted
  var voters : HashMap.HashMap<Text, [Text]> =
    HashMap.fromIter<Text, [Text]>(
      votesEntries.vals(), votesEntries.size(), Text.equal, Text.hash
    );

  system func preupgrade() {
    reportsEntries := Iter.toArray(reports.entries());
    votesEntries   := Iter.toArray(voters.entries());
  };

  system func postupgrade() {
    reports        := HashMap.fromIter<Text, Report>(
      reportsEntries.vals(), reportsEntries.size(), Text.equal, Text.hash
    );
    voters         := HashMap.fromIter<Text, [Text]>(
      votesEntries.vals(), votesEntries.size(), Text.equal, Text.hash
    );
    reportsEntries := [];
    votesEntries   := [];
  };

  // ──────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────

  func pt(p : Principal) : Text { Principal.toText(p) };

  func nextId() : Text {
    reportCounter += 1;
    "R" # Nat.toText(reportCounter)
  };

  func riskScore(confirm : Nat, reject : Nat) : Nat {
    let total = confirm + reject;
    if (total == 0) return 50;
    (confirm * 100) / total
  };

  func deriveStatus(confirm : Nat, reject : Nat) : ReportStatus {
    let total = confirm + reject;
    if (total < 3) return #pending;
    let score = (confirm * 100) / total;
    if      (score >= 70) #confirmed
    else if (score <= 30) #rejected
    else                  #investigating
  };

  func alreadyVoted(reportId : Text, voter : Text) : Bool {
    switch (voters.get(reportId)) {
      case (?vs) {
        for (v in vs.vals()) { if (v == voter) return true };
        false
      };
      case null false;
    }
  };

  func recordVote(reportId : Text, voter : Text) {
    let prev = switch (voters.get(reportId)) { case (?vs) vs; case null [] };
    voters.put(reportId, do { let b = Buffer.fromArray<Text>(prev); b.add(voter); Buffer.toArray(b) });
  };

  // ──────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────

  /// Submit a new fraud report. Returns the new report ID.
  public shared(msg) func submitReport(
    category    : ReportCategory,
    target      : Text,
    description : Text,
    evidence    : ?Text,
  ) : async SubmitResult {
    if (Text.size(target)      < 3)  return #err("Target must be ≥ 3 characters");
    if (Text.size(description) < 10) return #err("Description must be ≥ 10 characters");
    let id  = nextId();
    let now = Time.now();
    reports.put(id, {
      id           = id;
      reporter     = pt(msg.caller);
      category     = category;
      target       = target;
      description  = description;
      evidence     = evidence;
      status       = #pending;
      createdAt    = now;
      updatedAt    = now;
      confirmVotes = 0;
      rejectVotes  = 0;
      riskScore    = 50;
    });
    #ok(id)
  };

  /// Retrieve a single report by ID.
  public query func getReport(id : Text) : async ?Report {
    reports.get(id)
  };

  /// All reports for a given target identifier.
  public query func getReportsByTarget(target : Text) : async [Report] {
    let buf = Buffer.Buffer<Report>(4);
    for ((_, r) in reports.entries()) {
      if (r.target == target) buf.add(r);
    };
    Buffer.toArray(buf)
  };

  /// The most recent `limit` reports across all targets.
  public query func listRecentReports(limit : Nat) : async [Report] {
    let all = Iter.toArray(reports.vals());
    let sorted = Array.sort<Report>(all, func(a, b) {
      if      (a.createdAt > b.createdAt) #less
      else if (a.createdAt < b.createdAt) #greater
      else                                #equal
    });
    if (sorted.size() <= limit) sorted
    else {
      let buf = Buffer.Buffer<Report>(limit);
      var i = 0;
      while (i < limit) { buf.add(sorted[i]); i += 1 };
      Buffer.toArray(buf)
    }
  };

  /// Vote to confirm a report as a genuine threat.
  public shared(msg) func voteConfirm(id : Text) : async VoidResult {
    let voter = pt(msg.caller);
    switch (reports.get(id)) {
      case null  #err("Report not found");
      case (?r) {
        if (r.reporter == voter)    return #err("Cannot vote on your own report");
        if (alreadyVoted(id, voter)) return #err("Already voted");
        recordVote(id, voter);
        let nc = r.confirmVotes + 1;
        reports.put(id, {
          id = r.id; reporter = r.reporter; category = r.category;
          target = r.target; description = r.description; evidence = r.evidence;
          status       = deriveStatus(nc, r.rejectVotes);
          createdAt    = r.createdAt;
          updatedAt    = Time.now();
          confirmVotes = nc;
          rejectVotes  = r.rejectVotes;
          riskScore    = riskScore(nc, r.rejectVotes);
        });
        #ok(())
      };
    }
  };

  /// Vote to reject a report (false positive).
  public shared(msg) func voteReject(id : Text) : async VoidResult {
    let voter = pt(msg.caller);
    switch (reports.get(id)) {
      case null  #err("Report not found");
      case (?r) {
        if (r.reporter == voter)    return #err("Cannot vote on your own report");
        if (alreadyVoted(id, voter)) return #err("Already voted");
        recordVote(id, voter);
        let nr = r.rejectVotes + 1;
        reports.put(id, {
          id = r.id; reporter = r.reporter; category = r.category;
          target = r.target; description = r.description; evidence = r.evidence;
          status       = deriveStatus(r.confirmVotes, nr);
          createdAt    = r.createdAt;
          updatedAt    = Time.now();
          confirmVotes = r.confirmVotes;
          rejectVotes  = nr;
          riskScore    = riskScore(r.confirmVotes, nr);
        });
        #ok(())
      };
    }
  };

  /// All reports submitted by the caller.
  public shared query(msg) func getMyReports() : async [Report] {
    let caller = pt(msg.caller);
    let buf = Buffer.Buffer<Report>(4);
    for ((_, r) in reports.entries()) {
      if (r.reporter == caller) buf.add(r);
    };
    Buffer.toArray(buf)
  };

  /// Community-wide aggregate statistics.
  public query func getStats() : async CommunityStats {
    var confirmed = 0;
    var pending   = 0;
    var totalV    = 0;
    for ((_, r) in reports.entries()) {
      switch (r.status) {
        case (#confirmed)  { confirmed += 1 };
        case (#pending)    { pending   += 1 };
        case (_)           {};
      };
      totalV += r.confirmVotes + r.rejectVotes;
    };
    {
      totalReports     = reports.size();
      confirmedThreats = confirmed;
      pendingReports   = pending;
      totalVotes       = totalV;
    }
  };
}
