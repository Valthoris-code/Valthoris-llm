import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Result "mo:base/Result";
import Nat "mo:base/Nat";
import Buffer "mo:base/Buffer";

/// Backend Core — coordinates platform services, manages user profiles,
/// and exposes system statistics.
///
/// First-administrator bootstrap
/// ─────────────────────────────
/// The first administrator is provisioned at canister install time by the
/// deployer, who supplies their Internet Identity principal as a constructor
/// argument.  This happens before any user can call the canister, so the
/// identity of the first administrator is set by a trusted, deployment-
/// authorised authority rather than by any browser client or runtime caller.
///
/// Deployment command (run once when installing the canister):
///
///   dfx deploy backend --argument '(principal "YOUR-II-PRINCIPAL-ID")'
///
/// On subsequent upgrades the constructor is NOT called again; stable storage
/// preserves all managed-user records across upgrades.
persistent actor class Backend(initialAdminPrincipal : Principal) {

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

  public type UserRole = {
    #member;
    #moderator;
    #administrator;
  };

  public type ManagedUser = {
    principal    : Text;
    displayName  : Text;
    role         : UserRole;
    isActive     : Bool;
    registeredAt : Int;
  };

  /// Extended profile fields owned by the user.
  ///
  /// These live in the canister — not in Supabase — because the Internet
  /// Identity principal is the only identity the browser actually holds.
  /// The browser has no Supabase auth session, so `auth.uid()` /
  /// `request.jwt.claims->>'sub'` can never equal the ICP principal and any
  /// browser write to `public.profiles` is rejected by RLS. Keeping the
  /// extended profile here makes reads and writes use the *same* identity,
  /// which is what makes the data survive a reload on any device.
  ///
  /// Stored in its own stable variable so the existing `UserProfile` record
  /// type stays binary-compatible across canister upgrades.
  public type ProfileDetails = {
    principal     : Text;
    displayName   : ?Text;
    avatarUrl     : ?Text;
    bio           : ?Text;
    country       : ?Text;
    publicProfile : Bool;
    twoFactor     : Bool;
    updatedAt     : Int;
  };

  public type SystemStats = {
    totalUsers : Nat;
    version    : Text;
    startTime  : Int;
  };

  public type ProfileResult = Result.Result<UserProfile, Text>;
  public type ProfileDetailsResult = Result.Result<ProfileDetails, Text>;
  public type ManagedUserResult = Result.Result<ManagedUser, Text>;
  public type ManagedUsersResult = Result.Result<[ManagedUser], Text>;
  public type VoidResult    = Result.Result<(), Text>;

  // ──────────────────────────────────────────────────────────────────────
  // Stable storage
  // ──────────────────────────────────────────────────────────────────────

  stable var usersEntries : [(Text, UserProfile)] = [];
  stable var managedUserEntries : [(Text, ManagedUser)] = [];
  stable var profileDetailsEntries : [(Text, ProfileDetails)] = [];
  stable let startTime    : Int  = Time.now();
  stable let version      : Text = "1.0.0";

  transient var users : HashMap.HashMap<Text, UserProfile> =
    HashMap.fromIter<Text, UserProfile>(
      usersEntries.vals(), usersEntries.size(), Text.equal, Text.hash
    );

  transient var managedUsers : HashMap.HashMap<Text, ManagedUser> =
    HashMap.fromIter<Text, ManagedUser>(
      managedUserEntries.vals(), managedUserEntries.size(), Text.equal, Text.hash
    );

  transient var profileDetails : HashMap.HashMap<Text, ProfileDetails> =
    HashMap.fromIter<Text, ProfileDetails>(
      profileDetailsEntries.vals(), profileDetailsEntries.size(), Text.equal, Text.hash
    );

  system func preupgrade() {
    usersEntries := Iter.toArray(users.entries());
    managedUserEntries := Iter.toArray(managedUsers.entries());
    profileDetailsEntries := Iter.toArray(profileDetails.entries());
  };

  system func postupgrade() {
    users        := HashMap.fromIter<Text, UserProfile>(
      usersEntries.vals(), usersEntries.size(), Text.equal, Text.hash
    );
    managedUsers := HashMap.fromIter<Text, ManagedUser>(
      managedUserEntries.vals(), managedUserEntries.size(), Text.equal, Text.hash
    );
    profileDetails := HashMap.fromIter<Text, ProfileDetails>(
      profileDetailsEntries.vals(), profileDetailsEntries.size(), Text.equal, Text.hash
    );
    usersEntries := [];
    managedUserEntries := [];
    profileDetailsEntries := [];
  };

  // ──────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────

  func pt(p : Principal) : Text { Principal.toText(p) };

  func isAnonymousCaller(caller : Principal) : Bool {
    Principal.isAnonymous(caller)
  };

  /// Compile-time allow-list of Valthoris platform administrators.
  ///
  /// These are the Internet Identity principals that control the production
  /// canisters. They are baked into the canister code — not into the browser
  /// bundle and not into any mutable table — so administrator authorization
  /// survives upgrades and cannot be granted by a runtime caller supplying an
  /// arbitrary principal or e-mail address. A browser-provided identity string
  /// is never trusted: `msg.caller` is authenticated by the IC itself.
  ///
  /// This complements (and does not replace) the `initialAdminPrincipal`
  /// install argument, which cannot be re-run on an already deployed,
  /// stateful canister without a destructive reinstall.
  transient let PLATFORM_ADMINISTRATORS : [Text] = [
    "6wzpv-jfxnt-kzbeg-4isuv-vd2m2-yfzmk-znnho-tpvrg-lmarn-afsnw-tae",
    "5zuwu-tg4w3-24k2i-oj4co-jtrvg-awxcp-cb3kq-a44yk-oug3q-zes7x-6ae",
  ];

  func isPlatformAdministrator(principal : Text) : Bool {
    for (admin in PLATFORM_ADMINISTRATORS.vals()) {
      if (admin == principal) return true;
    };
    false
  };

  func isAdministrator(principal : Text) : Bool {
    if (isPlatformAdministrator(principal)) return true;
    switch (managedUsers.get(principal)) {
      case (?u) { u.role == #administrator and u.isActive };
      case null false;
    }
  };

  func hasPrivilegedAccess(caller : Principal) : Bool {
    isAdministrator(pt(caller))
  };

  func ensureManagedUserInternal(principal : Text, displayName : ?Text) : ManagedUser {
    let resolved = switch (managedUsers.get(principal)) {
      case (?existing) {
        switch (displayName) {
          case (?name) {
            if (Text.size(name) > 0 and existing.displayName != name) {
              let updated : ManagedUser = {
                principal    = existing.principal;
                displayName  = name;
                role         = existing.role;
                isActive     = existing.isActive;
                registeredAt = existing.registeredAt;
              };
              managedUsers.put(principal, updated);
              updated
            } else {
              existing
            }
          };
          case null existing;
        }
      };
      case null {
        let now = Time.now();
        let created : ManagedUser = {
          principal    = principal;
          displayName  = switch (displayName) {
            case (?name) {
              if (Text.size(name) > 0) name else principal
            };
            case null principal;
          };
          role         = #member;
          isActive     = true;
          registeredAt = now;
        };
        managedUsers.put(principal, created);
        created
      };
    };

    // Platform administrators are authorised by their principal, so their
    // stored record is reconciled on every login: the role is restored even if
    // it was never set, and the account can never stay deactivated.
    if (
      isPlatformAdministrator(principal)
      and (resolved.role != #administrator or not resolved.isActive)
    ) {
      let elevated : ManagedUser = {
        principal    = resolved.principal;
        displayName  = resolved.displayName;
        role         = #administrator;
        isActive     = true;
        registeredAt = resolved.registeredAt;
      };
      managedUsers.put(principal, elevated);
      return elevated;
    };
    resolved
  };

  func ensureManagedUserForCaller(caller : Principal, displayName : ?Text) : ManagedUser {
    ensureManagedUserInternal(pt(caller), displayName)
  };

  func callerIsActive(caller : Principal) : Bool {
    switch (managedUsers.get(pt(caller))) {
      case (?managed) managed.isActive;
      case null {
        // Backward-compatibility: users who registered before the ManagedUser
        // overlay was introduced have a UserProfile but no ManagedUser record.
        // Treat them as active members so they are not locked out.
        // They are NOT granted any elevated role; RBAC functions (listManagedUsers,
        // setUserRole, setUserActive) still require isAdministrator() which
        // explicitly returns false for unmanaged callers.
        users.get(pt(caller)) != null
      };
    }
  };

  func wouldRemoveLastActiveAdministrator(principal : Text) : Bool {    var otherActiveAdmins = 0;
    for ((key, user) in managedUsers.entries()) {
      if (key != principal and user.role == #administrator and user.isActive) {
        otherActiveAdmins += 1;
      };
    };
    otherActiveAdmins == 0
  };

  /// Trim surrounding whitespace and collapse an empty result to `null`, so a
  /// cleared form field erases the stored value instead of storing "".
  func trimmedOpt(value : ?Text) : ?Text {
    switch (value) {
      case null null;
      case (?raw) {
        let trimmed = Text.trim(raw, #char ' ');
        if (Text.size(trimmed) == 0) null else ?trimmed
      };
    }
  };

  func emptyDetails(principal : Text) : ProfileDetails {
    {
      principal     = principal;
      displayName   = null;
      avatarUrl     = null;
      bio           = null;
      country       = null;
      publicProfile = false;
      twoFactor     = false;
      updatedAt     = 0;
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────

  public shared(msg) func ensureManagedUser() : async ManagedUserResult {
    if (isAnonymousCaller(msg.caller)) {
      return #err("Authentication required");
    };
    let managed = ensureManagedUserForCaller(msg.caller, null);
    if (not managed.isActive) {
      return #err("User account is inactive");
    };
    #ok(managed)
  };

  public shared(msg) func listManagedUsers() : async ManagedUsersResult {
    if (not hasPrivilegedAccess(msg.caller)) {
      return #err("Access denied");
    };

    let buf = Buffer.Buffer<ManagedUser>(managedUsers.size());
    for ((_, user) in managedUsers.entries()) {
      buf.add(user);
    };
    #ok(Buffer.toArray(buf))
  };

  public shared(msg) func setUserRole(principal : Text, role : UserRole) : async ManagedUserResult {
    if (not hasPrivilegedAccess(msg.caller)) {
      return #err("Access denied");
    };

    switch (managedUsers.get(principal)) {
      case null #err("User not found");
      case (?existing) {
        if (isPlatformAdministrator(principal) and role != #administrator) {
          return #err("Cannot change the role of a Valthoris platform administrator");
        };
        if (existing.role == #administrator and existing.isActive and role != #administrator and wouldRemoveLastActiveAdministrator(principal)) {
          return #err("Cannot remove the last active administrator");
        };
        let updated : ManagedUser = {
          principal    = existing.principal;
          displayName  = existing.displayName;
          role         = role;
          isActive     = existing.isActive;
          registeredAt = existing.registeredAt;
        };
        managedUsers.put(principal, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func setUserActive(principal : Text, isActive : Bool) : async ManagedUserResult {
    if (not hasPrivilegedAccess(msg.caller)) {
      return #err("Access denied");
    };

    switch (managedUsers.get(principal)) {
      case null #err("User not found");
      case (?existing) {
        if (isPlatformAdministrator(principal) and not isActive) {
          return #err("Cannot deactivate a Valthoris platform administrator");
        };
        if (existing.role == #administrator and existing.isActive and not isActive and wouldRemoveLastActiveAdministrator(principal)) {
          return #err("Cannot deactivate the last active administrator");
        };
        let updated : ManagedUser = {
          principal    = existing.principal;
          displayName  = existing.displayName;
          role         = existing.role;
          isActive     = isActive;
          registeredAt = existing.registeredAt;
        };
        managedUsers.put(principal, updated);
        #ok(updated)
      };
    }
  };

  /// Register a new user or update the display name of an existing one.
  public shared(msg) func registerUser(displayName : Text) : async ProfileResult {
    if (isAnonymousCaller(msg.caller)) {
      return #err("Authentication required");
    };
    if (Text.size(displayName) < 2 or Text.size(displayName) > 64) {
      return #err("displayName must be 2–64 characters");
    };
    let key = pt(msg.caller);
    let now = Time.now();
    let managed = ensureManagedUserForCaller(msg.caller, ?displayName);
    if (not managed.isActive) {
      return #err("User account is inactive");
    };
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
    if (isAnonymousCaller(msg.caller)) {
      return #err("Authentication required");
    };
    switch (managedUsers.get(pt(msg.caller))) {
      case (?managed) {
        if (not managed.isActive) {
          return #err("User account is inactive");
        };
      };
      case null ();
    };
    switch (users.get(pt(msg.caller))) {
      case (?p) #ok(p);
      case null #err("User not registered");
    }
  };

  /// Return the caller's extended profile (avatar, bio, preferences).
  /// Returns an empty, unsaved record when the caller never saved one, so the
  /// UI can distinguish "nothing stored yet" from a read failure.
  public shared query(msg) func getProfileDetails() : async ProfileDetailsResult {
    if (isAnonymousCaller(msg.caller)) {
      return #err("Authentication required");
    };
    let key = pt(msg.caller);
    switch (profileDetails.get(key)) {
      case (?d) #ok(d);
      case null #ok(emptyDetails(key));
    }
  };

  /// Create or replace the caller's extended profile.
  /// Every field is validated here: the canister — not the browser — is the
  /// authority for what ends up persisted.
  public shared(msg) func setProfileDetails(
    displayName   : ?Text,
    avatarUrl     : ?Text,
    bio           : ?Text,
    country       : ?Text,
    publicProfile : Bool,
    twoFactor     : Bool,
  ) : async ProfileDetailsResult {
    if (isAnonymousCaller(msg.caller)) {
      return #err("Authentication required");
    };
    if (not callerIsActive(msg.caller)) {
      return #err("User account is inactive");
    };
    let key = pt(msg.caller);
    if (users.get(key) == null) {
      return #err("User not registered");
    };

    let cleanName = trimmedOpt(displayName);
    switch (cleanName) {
      case (?n) { if (Text.size(n) > 64) return #err("displayName must be at most 64 characters") };
      case null ();
    };

    let cleanAvatar = trimmedOpt(avatarUrl);
    switch (cleanAvatar) {
      case (?u) {
        if (Text.size(u) > 512) return #err("avatarUrl must be at most 512 characters");
        if (not (Text.startsWith(u, #text "https://") or Text.startsWith(u, #text "http://"))) {
          return #err("avatarUrl must be an http(s) URL");
        };
      };
      case null ();
    };

    let cleanBio = trimmedOpt(bio);
    switch (cleanBio) {
      case (?b) { if (Text.size(b) > 500) return #err("bio must be at most 500 characters") };
      case null ();
    };

    let cleanCountry = trimmedOpt(country);
    switch (cleanCountry) {
      case (?c) { if (Text.size(c) > 64) return #err("country must be at most 64 characters") };
      case null ();
    };

    let details : ProfileDetails = {
      principal     = key;
      displayName   = cleanName;
      avatarUrl     = cleanAvatar;
      bio           = cleanBio;
      country       = cleanCountry;
      publicProfile = publicProfile;
      twoFactor     = twoFactor;
      updatedAt     = Time.now();
    };
    profileDetails.put(key, details);
    #ok(details)
  };

  /// Return any user's public profile by their principal string.
  public query func getProfile(principal : Text) : async ?UserProfile {
    users.get(principal)
  };

  /// True when the caller already has a registered profile.
  public shared query(msg) func isRegistered() : async Bool {
    if (isAnonymousCaller(msg.caller)) {
      return false;
    };
    users.get(pt(msg.caller)) != null
  };

  /// Increment the scan counter for the caller.
  public shared(msg) func recordScan() : async VoidResult {
    if (isAnonymousCaller(msg.caller)) {
      return #err("Authentication required");
    };
    if (not callerIsActive(msg.caller)) {
      return #err("User account is inactive");
    };
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
    if (isAnonymousCaller(msg.caller)) {
      return #err("Authentication required");
    };
    if (not callerIsActive(msg.caller)) {
      return #err("User account is inactive");
    };
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

  // ──────────────────────────────────────────────────────────────────────
  // First-administrator bootstrap
  // ──────────────────────────────────────────────────────────────────────
  // Runs exactly once, at canister install time, before any user call can
  // reach the canister.  The deployer supplies their Internet Identity
  // principal via the dfx --argument flag:
  //
  //   dfx deploy backend --argument '(principal "YOUR-II-PRINCIPAL-ID")'
  //
  // Guards:
  //   1. initialAdminPrincipal must be non-anonymous (rejects the default
  //      anonymous identity and any accidental omission of the argument).
  //   2. managedUsers must be empty (ensures this only runs on a fresh
  //      install, not if the canister is upgraded with --reinstall later
  //      when an administrator already exists).
  //
  // On upgrade (dfx deploy without --reinstall) this block is NOT re-executed;
  // stable storage preserves all managedUser records across upgrades.
  if (not Principal.isAnonymous(initialAdminPrincipal) and managedUsers.size() == 0) {
    let p = pt(initialAdminPrincipal);
    managedUsers.put(p, {
      principal    = p;
      displayName  = p;
      role         = #administrator;
      isActive     = true;
      registeredAt = Time.now();
    });
  };
}
