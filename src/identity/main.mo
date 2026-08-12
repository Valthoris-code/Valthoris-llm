import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Text "mo:base/Text";
import Char "mo:base/Char";
import Iter "mo:base/Iter";
import Array "mo:base/Array";
import Result "mo:base/Result";
import Nat "mo:base/Nat";
import Buffer "mo:base/Buffer";

/// Identity — contact lookup, risk scoring, and reputation management.
persistent actor Identity {

  // ──────────────────────────────────────────────────────────────────────
  // Types
  // ──────────────────────────────────────────────────────────────────────

  public type IdentifierType = {
    #phone;
    #email;
    #domain;
    #iban;
    #walletAddress;
    #nif;
    #company;
  };

  public type ReputationEntry = {
    identifier         : Text;
    identifierType     : IdentifierType;
    reportCount        : Nat;
    trustScore         : Nat;
    riskScore          : Nat;
    isKnownScammer     : Bool;
    isVerifiedBusiness : Bool;
    firstSeen          : Int;
    lastUpdated        : Int;
    notes              : [Text];
  };

  public type LookupResult = {
    found              : Bool;
    trustScore         : Nat;
    riskScore          : Nat;
    reportCount        : Nat;
    isKnownScammer     : Bool;
    isVerifiedBusiness : Bool;
    notes              : [Text];
    lastSeen           : Int;
  };

  public type SuspiciousContactInput = {
    identifier     : Text;
    identifierType : IdentifierType;
    reason         : Text;
  };

  public type VoidResult = Result.Result<(), Text>;

  // ──────────────────────────────────────────────────────────────────────
  // Persistent storage
  // ──────────────────────────────────────────────────────────────────────

  stable var dbEntries : [(Text, ReputationEntry)] = [];

<<<<<<< Updated upstream
=======
  // HashMap is runtime/transient state.
  // The persistent data is stored in dbEntries.
>>>>>>> Stashed changes
  transient var db : HashMap.HashMap<Text, ReputationEntry> =
    HashMap.fromIter<Text, ReputationEntry>(
      dbEntries.vals(),
      dbEntries.size(),
      Text.equal,
      Text.hash
    );

  system func preupgrade() {
    dbEntries := Iter.toArray(db.entries());
  };

  system func postupgrade() {
    db := HashMap.fromIter<Text, ReputationEntry>(
      dbEntries.vals(),
      dbEntries.size(),
      Text.equal,
      Text.hash
    );
  };

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  func toLower(t : Text) : Text {
    Text.map(
      t,
      func(c : Char) : Char {
        if (c >= 'A' and c <= 'Z') {
          Char.fromNat32(Char.toNat32(c) + 32)
        } else {
          c
        }
      }
    )
  };

  func normalise(s : Text) : Text {
    toLower(s)
  };

  func notFound() : LookupResult {
    {
      found = false;
      trustScore = 50;
      riskScore = 0;
      reportCount = 0;
      isKnownScammer = false;
      isVerifiedBusiness = false;
      notes = [];
      lastSeen = 0;
    }
  };

  func toResult(e : ReputationEntry) : LookupResult {
    {
      found = true;
      trustScore = e.trustScore;
      riskScore = e.riskScore;
      reportCount = e.reportCount;
      isKnownScammer = e.isKnownScammer;
      isVerifiedBusiness = e.isVerifiedBusiness;
      notes = e.notes;
      lastSeen = e.lastUpdated;
    }
  };

  func appendNote(notes : [Text], reason : Text) : [Text] {
    let b = Buffer.Buffer<Text>(notes.size() + 1);

    for (note in notes.vals()) {
      b.add(note);
    };

    b.add(reason);

    Buffer.toArray(b)
  };

  func upsertSuspicious(
    key : Text,
    idType : IdentifierType,
    reason : Text
  ) {
    let now = Time.now();

    switch (db.get(key)) {

      case (?e) {
        let nc = e.reportCount + 1;

        let newRisk : Nat =
          Nat.min(
            100,
            e.riskScore + 5
          );

        let newTrust : Nat =
          if (e.trustScore > 5) {
            e.trustScore - 5
          } else {
            0
          };

        let newScammerStatus : Bool =
          nc >= 5 or newRisk >= 90;

        let newNotes : [Text] =
          appendNote(e.notes, reason);

        let updated : ReputationEntry = {
          identifier = e.identifier;
          identifierType = e.identifierType;
          reportCount = nc;
          trustScore = newTrust;
          riskScore = newRisk;
          isKnownScammer = newScammerStatus;
          isVerifiedBusiness = e.isVerifiedBusiness;
<<<<<<< Updated upstream
          firstSeen          = e.firstSeen;
          lastUpdated        = now;
          notes              = do { let b = Buffer.fromArray<Text>(e.notes); b.add(reason); Buffer.toArray(b) };
        });
=======
          firstSeen = e.firstSeen;
          lastUpdated = now;
          notes = newNotes;
        };

        db.put(key, updated);
>>>>>>> Stashed changes
      };

      case null {
        let entry : ReputationEntry = {
          identifier = key;
          identifierType = idType;
          reportCount = 1;
          trustScore = 45;
          riskScore = 10;
          isKnownScammer = false;
          isVerifiedBusiness = false;
          firstSeen = now;
          lastUpdated = now;
          notes = [reason];
        };

        db.put(key, entry);
      };
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────

  public query func lookupPhone(
    phone : Text
  ) : async LookupResult {
    switch (db.get(normalise(phone))) {
      case (?e) {
        toResult(e)
      };
      case null {
        notFound()
      };
    }
  };

  public query func lookupEmail(
    email : Text
  ) : async LookupResult {
    switch (db.get(normalise(email))) {
      case (?e) {
        toResult(e)
      };
      case null {
        notFound()
      };
    }
  };

  public query func lookupDomain(
    domain : Text
  ) : async LookupResult {
    switch (db.get(normalise(domain))) {
      case (?e) {
        toResult(e)
      };
      case null {
        notFound()
      };
    }
  };

  public query func lookupIBAN(
    iban : Text
  ) : async LookupResult {

    let key =
      normalise(
        Text.replace(
          iban,
          #char ' ',
          ""
        )
      );

    switch (db.get(key)) {
      case (?e) {
        toResult(e)
      };
      case null {
        notFound()
      };
    }
  };

  public query func lookupWallet(
    address : Text
  ) : async LookupResult {
    switch (db.get(normalise(address))) {
      case (?e) {
        toResult(e)
      };
      case null {
        notFound()
      };
    }
  };

  /// Report an identifier as suspicious.
  public shared(msg) func registerSuspicious(
    input : SuspiciousContactInput
  ) : async VoidResult {

    if (Text.size(input.identifier) < 3) {
      return #err("Identifier too short");
    };

    if (Text.size(input.reason) < 5) {
      return #err("Reason too short");
    };

    let key = normalise(input.identifier);

    upsertSuspicious(
      key,
      input.identifierType,
      input.reason
    );

    #ok(())
  };

  /// Return the raw reputation entry.
  public query func getReputationEntry(
    identifier : Text
  ) : async ?ReputationEntry {

    db.get(
      normalise(identifier)
    )
  };

  /// Batch lookup.
  public query func lookupBatch(
    identifiers : [Text]
  ) : async [LookupResult] {

    Array.map<Text, LookupResult>(
      identifiers,
      func(id : Text) : LookupResult {
        switch (db.get(normalise(id))) {
          case (?e) {
            toResult(e)
          };
          case null {
            notFound()
          };
        }
      }
    )
  };

  /// Number of reputation entries currently stored.
  public query func getDatabaseSize() : async Nat {
    db.size()
  };
}