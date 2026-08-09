import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Text "mo:base/Text";
import Char "mo:base/Char";
import Iter "mo:base/Iter";
import Result "mo:base/Result";
import Nat "mo:base/Nat";
import Buffer "mo:base/Buffer";

/// Threat Intelligence — IOC database with fast indicator lookup
/// across URLs, IPs, domains, file hashes, and email addresses.
actor ThreatIntelligence {

  // ──────────────────────────────────────────────────────────────────────
  // Types
  // ──────────────────────────────────────────────────────────────────────

  public type ThreatCategory = {
    #phishing;
    #malware;
    #ransomware;
    #commandAndControl;
    #spam;
    #cryptoMining;
    #botnet;
    #exploit;
    #bruteForce;
    #scam;
    #other;
  };

  public type ThreatSeverity = { #low; #medium; #high; #critical };

  public type IndicatorType = { #url; #ip; #domain; #fileHash; #email; #walletAddress };

  public type ThreatEntry = {
    id            : Text;
    indicator     : Text;
    indicatorType : IndicatorType;
    category      : ThreatCategory;
    severity      : ThreatSeverity;
    description   : Text;
    reportedBy    : Text;
    reportedAt    : Int;
    lastSeen      : Int;
    confidence    : Nat;   // 0–100
    tags          : [Text];
    isActive      : Bool;
  };

  public type ThreatResult = {
    isThreat          : Bool;
    severity          : ?ThreatSeverity;
    category          : ?ThreatCategory;
    confidence        : Nat;
    matchedIndicators : Nat;
    details           : [Text];
    lastUpdated       : Int;
  };

  public type ThreatStats = {
    totalEntries    : Nat;
    activeThreats   : Nat;
    criticalThreats : Nat;
    highThreats     : Nat;
  };

  public type NewThreatInput = {
    indicator     : Text;
    indicatorType : IndicatorType;
    category      : ThreatCategory;
    severity      : ThreatSeverity;
    description   : Text;
    confidence    : Nat;
    tags          : [Text];
  };

  public type SubmitResult = Result.Result<Text, Text>;
  public type VoidResult   = Result.Result<(), Text>;

  // ──────────────────────────────────────────────────────────────────────
  // Stable storage
  // ──────────────────────────────────────────────────────────────────────

  stable var threatEntries       : [(Text, ThreatEntry)] = [];
  stable var indicatorIdxEntries : [(Text, [Text])]      = [];
  stable var threatCounter       : Nat                   = 0;

  // Primary store: id → ThreatEntry
  var threats : HashMap.HashMap<Text, ThreatEntry> =
    HashMap.fromIter<Text, ThreatEntry>(
      threatEntries.vals(), threatEntries.size(), Text.equal, Text.hash
    );

  // Inverted index: normalised indicator → [entry ids]
  var indicatorIdx : HashMap.HashMap<Text, [Text]> =
    HashMap.fromIter<Text, [Text]>(
      indicatorIdxEntries.vals(), indicatorIdxEntries.size(), Text.equal, Text.hash
    );

  system func preupgrade() {
    threatEntries       := Iter.toArray(threats.entries());
    indicatorIdxEntries := Iter.toArray(indicatorIdx.entries());
  };

  system func postupgrade() {
    threats      := HashMap.fromIter<Text, ThreatEntry>(
      threatEntries.vals(), threatEntries.size(), Text.equal, Text.hash
    );
    indicatorIdx := HashMap.fromIter<Text, [Text]>(
      indicatorIdxEntries.vals(), indicatorIdxEntries.size(), Text.equal, Text.hash
    );
    threatEntries       := [];
    indicatorIdxEntries := [];
  };

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  func toLower(t : Text) : Text {
    Text.map(t, func(c : Char) : Char {
      if (c >= 'A' and c <= 'Z') Char.fromNat32(Char.toNat32(c) + 32) else c
    })
  };

  func normalise(s : Text) : Text { toLower(s) };

  func nextId() : Text {
    threatCounter += 1;
    "T" # Nat.toText(threatCounter)
  };

  func indexIndicator(indicator : Text, id : Text) {
    let key  = normalise(indicator);
    let prev = switch (indicatorIdx.get(key)) { case (?ids) ids; case null [] };
    indicatorIdx.put(key, do { let b = Buffer.fromArray<Text>(prev); b.add(id); Buffer.toArray(b) });
  };

  func noThreat() : ThreatResult {
    { isThreat = false; severity = null; category = null;
      confidence = 0; matchedIndicators = 0; details = []; lastUpdated = Time.now() }
  };

  func lookupIndicator(indicator : Text) : ThreatResult {
    let key = normalise(indicator);
    let ids = switch (indicatorIdx.get(key)) { case (?i) i; case null [] };
    if (ids.size() == 0) return noThreat();

    var maxConf    : Nat = 0;
    var bestSev    : ?ThreatSeverity  = null;
    var bestCat    : ?ThreatCategory  = null;
    var lastUpdate : Int              = 0;
    var active     : Nat              = 0;
    let detBuf = Buffer.Buffer<Text>(4);

    for (id in ids.vals()) {
      switch (threats.get(id)) {
        case (?e) {
          if (e.isActive) {
            active += 1;
            if (e.confidence > maxConf) {
              maxConf  := e.confidence;
              bestSev  := ?e.severity;
              bestCat  := ?e.category;
            };
            detBuf.add(e.description);
            if (e.lastSeen > lastUpdate) lastUpdate := e.lastSeen;
          };
        };
        case null {};
      };
    };

    if (active == 0) return noThreat();

    { isThreat          = true;
      severity          = bestSev;
      category          = bestCat;
      confidence        = maxConf;
      matchedIndicators = active;
      details           = Buffer.toArray(detBuf);
      lastUpdated       = lastUpdate }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────

  public query func checkUrl(url : Text)       : async ThreatResult { lookupIndicator(url)    };
  public query func checkIp(ip : Text)         : async ThreatResult { lookupIndicator(ip)     };
  public query func checkDomain(domain : Text) : async ThreatResult { lookupIndicator(domain) };
  public query func checkHash(hash : Text)     : async ThreatResult { lookupIndicator(hash)   };
  public query func checkEmail(email : Text)   : async ThreatResult { lookupIndicator(email)  };

  /// Submit a new threat indicator. Returns the new entry ID.
  public shared(msg) func submitThreat(input : NewThreatInput) : async SubmitResult {
    if (Text.size(input.indicator)   < 3)  return #err("Indicator too short");
    if (Text.size(input.description) < 10) return #err("Description must be ≥ 10 characters");
    if (input.confidence > 100)            return #err("Confidence must be 0–100");

    let id  = nextId();
    let now = Time.now();
    let entry : ThreatEntry = {
      id            = id;
      indicator     = normalise(input.indicator);
      indicatorType = input.indicatorType;
      category      = input.category;
      severity      = input.severity;
      description   = input.description;
      reportedBy    = Principal.toText(msg.caller);
      reportedAt    = now;
      lastSeen      = now;
      confidence    = input.confidence;
      tags          = input.tags;
      isActive      = true;
    };
    threats.put(id, entry);
    indexIndicator(input.indicator, id);
    #ok(id)
  };

  public query func getThreat(id : Text) : async ?ThreatEntry { threats.get(id) };

  /// Return the first `limit` active threat entries.
  public query func listActiveThreats(limit : Nat) : async [ThreatEntry] {
    let buf = Buffer.Buffer<ThreatEntry>(limit);
    for ((_, e) in threats.entries()) {
      if (e.isActive and buf.size() < limit) buf.add(e);
    };
    Buffer.toArray(buf)
  };

  /// Only the original reporter can deactivate an entry.
  public shared(msg) func deactivateThreat(id : Text) : async VoidResult {
    switch (threats.get(id)) {
      case null  #err("Threat not found");
      case (?e) {
        if (e.reportedBy != Principal.toText(msg.caller)) {
          return #err("Only the original reporter can deactivate");
        };
        threats.put(id, {
          id = e.id; indicator = e.indicator; indicatorType = e.indicatorType;
          category = e.category; severity = e.severity; description = e.description;
          reportedBy = e.reportedBy; reportedAt = e.reportedAt; lastSeen = e.lastSeen;
          confidence = e.confidence; tags = e.tags; isActive = false;
        });
        #ok(())
      };
    }
  };

  public query func getStats() : async ThreatStats {
    var active   = 0;
    var critical = 0;
    var high     = 0;
    for ((_, e) in threats.entries()) {
      if (e.isActive) {
        active += 1;
        switch (e.severity) {
          case (#critical) { critical += 1 };
          case (#high)     { high     += 1 };
          case (_)         {};
        };
      };
    };
    { totalEntries = threats.size(); activeThreats = active;
      criticalThreats = critical; highThreats = high }
  };
}
