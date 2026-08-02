import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Array "mo:base/Array";
import Result "mo:base/Result";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Buffer "mo:base/Buffer";

/// Backend Core — coordinates platform services, manages user profiles,
/// and exposes system statistics.
actor Backend {

  // ──────────────────────────────────────────────────────────────────────
  // Types
  // ──────────────────────────────────────────────────────────────────────

  public type UserProfile = {
    principal       : Text;
    displayName     : Text;
    createdAt       : Int;
    updatedAt       : Int;
    reputationScore : Nat;
    totalReports    : Nat;
    totalScans      : Nat;
    isActive        : Bool;
  };

  public type SystemStats = {
    totalUsers : Nat;
    version    : Text;
    startTime  : Int;
  };

  public type ProfileResult = Result.Result<UserProfile, Text>;
  public type VoidResult    = Result.Result<(), Text>;

  // ──────────────────────────────────────────────────────────────────────
  // Stable storage
  // ──────────────────────────────────────────────────────────────────────

  stable var usersEntries : [(Text, UserProfile)] = [];
  stable let startTime    : Int  = Time.now();
  stable let version      : Text = "1.0.0";

  var users : HashMap.HashMap<Text, UserProfile> =
    HashMap.fromIter<Text, UserProfile>(
      usersEntries.vals(), usersEntries.size(), Text.equal, Text.hash
    );

  system func preupgrade() {
    usersEntries := Iter.toArray(users.entries());
  };

  system func postupgrade() {
    users        := HashMap.fromIter<Text, UserProfile>(
      usersEntries.vals(), usersEntries.size(), Text.equal, Text.hash
    );
    usersEntries := [];
  };

  // ──────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────

  func pt(p : Principal) : Text { Principal.toText(p) };

  // ──────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────

  /// Register a new user or update the display name of an existing one.
  public shared(msg) func registerUser(displayName : Text) : async ProfileResult {
    if (Text.size(displayName) < 2 or Text.size(displayName) > 64) {
      return #err("displayName must be 2–64 characters");
    };
    let key = pt(msg.caller);
    let now = Time.now();
    switch (users.get(key)) {
      case (?p) {
        let updated : UserProfile = {
          principal       = p.principal;
          displayName     = displayName;
          createdAt       = p.createdAt;
          updatedAt       = now;
          reputationScore = p.reputationScore;
          totalReports    = p.totalReports;
          totalScans      = p.totalScans;
          isActive        = true;
        };
        users.put(key, updated);
        #ok(updated)
      };
      case null {
        let profile : UserProfile = {
          principal       = key;
          displayName     = displayName;
          createdAt       = now;
          updatedAt       = now;
          reputationScore = 50;
          totalReports    = 0;
          totalScans      = 0;
          isActive        = true;
        };
        users.put(key, profile);
        #ok(profile)
      };
    }
  };

  /// Return the caller's own profile.
  public shared query(msg) func getUserProfile() : async ProfileResult {
    switch (users.get(pt(msg.caller))) {
      case (?p) #ok(p);
      case null #err("User not registered");
    }
  };

  /// Return any user's public profile by their principal string.
  public query func getProfile(principal : Text) : async ?UserProfile {
    users.get(principal)
  };

  /// True when the caller already has a registered profile.
  public shared query(msg) func isRegistered() : async Bool {
    users.get(pt(msg.caller)) != null
  };

  /// Increment the scan counter for the caller.
  public shared(msg) func recordScan() : async VoidResult {
    let key = pt(msg.caller);
    switch (users.get(key)) {
      case null #err("User not registered");
      case (?p) {
        users.put(key, {
          principal       = p.principal;
          displayName     = p.displayName;
          createdAt       = p.createdAt;
          updatedAt       = Time.now();
          reputationScore = p.reputationScore;
          totalReports    = p.totalReports;
          totalScans      = p.totalScans + 1;
          isActive        = p.isActive;
        });
        #ok(())
      };
    }
  };

  /// Increment the report counter and slightly boost the caller's reputation.
  public shared(msg) func recordReport() : async VoidResult {
    let key = pt(msg.caller);
    switch (users.get(key)) {
      case null #err("User not registered");
      case (?p) {
        users.put(key, {
          principal       = p.principal;
          displayName     = p.displayName;
          createdAt       = p.createdAt;
          updatedAt       = Time.now();
          reputationScore = Nat.min(100, p.reputationScore + 1);
          totalReports    = p.totalReports + 1;
          totalScans      = p.totalScans;
          isActive        = p.isActive;
        });
        #ok(())
      };
    }
  };

  /// Platform-wide statistics.
  public query func getSystemStats() : async SystemStats {
    { totalUsers = users.size(); version = version; startTime = startTime }
  };

  /// Returns true when the canister is running.
  public query func healthCheck() : async Bool { true };

  /// Canister version string.
  public query func getVersion() : async Text { version };
}
