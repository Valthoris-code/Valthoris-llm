import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Text "mo:base/Text";
import Nat "mo:base/Nat";
import Nat32 "mo:base/Nat32";
import Int "mo:base/Int";
import Float "mo:base/Float";
import Iter "mo:base/Iter";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import Result "mo:base/Result";
import Option "mo:base/Option";

/// Safe Location — encrypted location sharing with TTL and geofencing.
actor SafeLocation {

  // ──────────────────────────────────────────────────────────────────────
  // Types
  // ──────────────────────────────────────────────────────────────────────

  public type LocationData = {
    latitude      : Float;
    longitude     : Float;
    accuracy      : ?Float;
    timestamp     : Int;
    locationLabel : ?Text;
  };

  public type ShareInfo = {
    token     : Text;
    owner     : Text;
    recipient : ?Text;   // null = anyone with the token
    createdAt : Int;
    expiresAt : Int;
    isActive  : Bool;
  };

  public type GeofenceZone = {
    id           : Text;
    owner        : Text;
    name         : Text;
    centerLat    : Float;
    centerLng    : Float;
    radiusMeters : Float;
    alertOnEnter : Bool;
    alertOnExit  : Bool;
    createdAt    : Int;
    isActive     : Bool;
  };

  public type GeofenceAlertType = { #entered; #exited };

  public type GeofenceAlert = {
    zoneId    : Text;
    zoneName  : Text;
    alertType : GeofenceAlertType;
    timestamp : Int;
  };

  public type ShareResult  = Result.Result<Text, Text>;
  public type LocResult    = Result.Result<LocationData, Text>;
  public type VoidResult   = Result.Result<(), Text>;

  // ──────────────────────────────────────────────────────────────────────
  // Stable storage
  // ──────────────────────────────────────────────────────────────────────

  stable var sharesEntries    : [(Text, ShareInfo)]    = [];
  stable var locationsEntries : [(Text, LocationData)] = [];
  stable var geofencesEntries : [(Text, GeofenceZone)] = [];
  stable var shareCounter     : Nat                    = 0;
  stable var geofenceCounter  : Nat                    = 0;

  var shares    : HashMap.HashMap<Text, ShareInfo>    =
    HashMap.fromIter<Text, ShareInfo>(sharesEntries.vals(), sharesEntries.size(), Text.equal, Text.hash);
  var locations : HashMap.HashMap<Text, LocationData> =
    HashMap.fromIter<Text, LocationData>(locationsEntries.vals(), locationsEntries.size(), Text.equal, Text.hash);
  var geofences : HashMap.HashMap<Text, GeofenceZone> =
    HashMap.fromIter<Text, GeofenceZone>(geofencesEntries.vals(), geofencesEntries.size(), Text.equal, Text.hash);

  system func preupgrade() {
    sharesEntries    := Iter.toArray(shares.entries());
    locationsEntries := Iter.toArray(locations.entries());
    geofencesEntries := Iter.toArray(geofences.entries());
  };

  system func postupgrade() {
    shares    := HashMap.fromIter<Text, ShareInfo>(sharesEntries.vals(), sharesEntries.size(), Text.equal, Text.hash);
    locations := HashMap.fromIter<Text, LocationData>(locationsEntries.vals(), locationsEntries.size(), Text.equal, Text.hash);
    geofences := HashMap.fromIter<Text, GeofenceZone>(geofencesEntries.vals(), geofencesEntries.size(), Text.equal, Text.hash);
    sharesEntries    := [];
    locationsEntries := [];
    geofencesEntries := [];
  };

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  func pt(p : Principal) : Text { Principal.toText(p) };

  // Token: "SL" + counter + "-" + hash of (caller + now + counter)
  func newToken(caller : Principal) : Text {
    shareCounter += 1;
    let seed = pt(caller) # Int.toText(Time.now()) # Nat.toText(shareCounter);
    let h    = Nat32.toNat(Text.hash(seed));
    "SL" # Nat.toText(shareCounter) # "-" # Nat.toText(h)
  };

  func newGfId() : Text {
    geofenceCounter += 1;
    "GF" # Nat.toText(geofenceCounter)
  };

  func expired(s : ShareInfo) : Bool { Time.now() > s.expiresAt };

  // Haversine distance in metres
  func haversine(lat1 : Float, lng1 : Float, lat2 : Float, lng2 : Float) : Float {
    let r    = 6_371_000.0;
    let phi1 = lat1 * Float.pi / 180.0;
    let phi2 = lat2 * Float.pi / 180.0;
    let dp   = (lat2 - lat1) * Float.pi / 180.0;
    let dl   = (lng2 - lng1) * Float.pi / 180.0;
    let a    = Float.sin(dp / 2.0) * Float.sin(dp / 2.0)
             + Float.cos(phi1) * Float.cos(phi2)
             * Float.sin(dl / 2.0) * Float.sin(dl / 2.0);
    let c    = 2.0 * Float.arctan2(Float.sqrt(a), Float.sqrt(1.0 - a));
    r * c
  };

  // ──────────────────────────────────────────────────────────────────────
  // Public API — Sharing
  // ──────────────────────────────────────────────────────────────────────

  /// Create a new location share. Returns a unique access token.
  /// `ttlSeconds` must be 1–2592000 (30 days max).
  public shared(msg) func shareLocation(
    lat           : Float,
    lng           : Float,
    accuracy      : ?Float,
    ttlSeconds    : Nat,
    recipient     : ?Text,
    locationLabel : ?Text,
  ) : async ShareResult {
    if (ttlSeconds == 0 or ttlSeconds > 2_592_000) return #err("TTL must be 1 s – 30 days");
    if (lat < -90.0 or lat > 90.0)                 return #err("Latitude out of range");
    if (lng < -180.0 or lng > 180.0)               return #err("Longitude out of range");

    let token = newToken(msg.caller);
    let now   = Time.now();
    shares.put(token, {
      token     = token;
      owner     = pt(msg.caller);
      recipient = recipient;
      createdAt = now;
      expiresAt = now + (ttlSeconds * 1_000_000_000);
      isActive  = true;
    });
    locations.put(token, {
      latitude      = lat;
      longitude     = lng;
      accuracy      = accuracy;
      timestamp     = now;
      locationLabel = locationLabel;
    });
    #ok(token)
  };

  /// Push a new coordinate to an existing, active share.
  public shared(msg) func updateSharedLocation(
    token    : Text,
    lat      : Float,
    lng      : Float,
    accuracy : ?Float,
  ) : async VoidResult {
    switch (shares.get(token)) {
      case null   #err("Share not found");
      case (?s) {
        if (s.owner != pt(msg.caller))      return #err("Not your share");
        if (not s.isActive or expired(s))   return #err("Share is no longer active");
        if (lat < -90.0 or lat > 90.0)      return #err("Latitude out of range");
        if (lng < -180.0 or lng > 180.0)    return #err("Longitude out of range");
        let prevLabel = switch (locations.get(token)) { case (?l) l.locationLabel; case null null };
        locations.put(token, {
          latitude = lat; longitude = lng;
          accuracy = accuracy; timestamp = Time.now(); locationLabel = prevLabel;
        });
        #ok(())
      };
    }
  };

  /// Read the current location of an active share.
  /// Access: owner, named recipient, or anyone when recipient is null.
  public shared(msg) func getSharedLocation(token : Text) : async LocResult {
    switch (shares.get(token)) {
      case null   #err("Share not found");
      case (?s) {
        if (not s.isActive) return #err("Share has been revoked");
        if (expired(s))     return #err("Share has expired");
        let caller  = pt(msg.caller);
        let allowed = caller == s.owner
          or Option.isNull(s.recipient)
          or (switch (s.recipient) { case (?r) r == caller; case null true });
        if (not allowed) return #err("Access denied");
        switch (locations.get(token)) {
          case (?loc) #ok(loc);
          case null   #err("Location data unavailable");
        }
      };
    }
  };

  /// Revoke a share before it expires.
  public shared(msg) func revokeShare(token : Text) : async VoidResult {
    switch (shares.get(token)) {
      case null   #err("Share not found");
      case (?s) {
        if (s.owner != pt(msg.caller)) return #err("Not your share");
        shares.put(token, {
          token = s.token; owner = s.owner; recipient = s.recipient;
          createdAt = s.createdAt; expiresAt = s.expiresAt; isActive = false;
        });
        #ok(())
      };
    }
  };

  /// List all shares created by the caller.
  public shared query(msg) func listMyShares() : async [ShareInfo] {
    let caller = pt(msg.caller);
    let buf    = Buffer.Buffer<ShareInfo>(4);
    for ((_, s) in shares.entries()) {
      if (s.owner == caller) buf.add(s);
    };
    Buffer.toArray(buf)
  };

  // ──────────────────────────────────────────────────────────────────────
  // Public API — Geofencing
  // ──────────────────────────────────────────────────────────────────────

  /// Create a geofence zone owned by the caller.
  public shared(msg) func setGeofence(
    name         : Text,
    centerLat    : Float,
    centerLng    : Float,
    radiusMeters : Float,
    alertOnEnter : Bool,
    alertOnExit  : Bool,
  ) : async ShareResult {
    if (Text.size(name) < 2)                        return #err("Name too short");
    if (radiusMeters < 10.0 or radiusMeters > 50_000.0) return #err("Radius: 10 m – 50 km");
    if (centerLat < -90.0 or centerLat > 90.0)     return #err("Latitude out of range");
    if (centerLng < -180.0 or centerLng > 180.0)   return #err("Longitude out of range");

    let id  = newGfId();
    geofences.put(id, {
      id = id; owner = pt(msg.caller); name = name;
      centerLat = centerLat; centerLng = centerLng;
      radiusMeters = radiusMeters;
      alertOnEnter = alertOnEnter; alertOnExit = alertOnExit;
      createdAt = Time.now(); isActive = true;
    });
    #ok(id)
  };

  /// List all active geofences owned by the caller.
  public shared query(msg) func listMyGeofences() : async [GeofenceZone] {
    let caller = pt(msg.caller);
    let buf    = Buffer.Buffer<GeofenceZone>(4);
    for ((_, g) in geofences.entries()) {
      if (g.owner == caller and g.isActive) buf.add(g);
    };
    Buffer.toArray(buf)
  };

  /// Soft-delete a geofence owned by the caller.
  public shared(msg) func deleteGeofence(id : Text) : async VoidResult {
    switch (geofences.get(id)) {
      case null   #err("Geofence not found");
      case (?g) {
        if (g.owner != pt(msg.caller)) return #err("Not your geofence");
        geofences.put(id, {
          id = g.id; owner = g.owner; name = g.name;
          centerLat = g.centerLat; centerLng = g.centerLng;
          radiusMeters = g.radiusMeters;
          alertOnEnter = g.alertOnEnter; alertOnExit = g.alertOnExit;
          createdAt = g.createdAt; isActive = false;
        });
        #ok(())
      };
    }
  };

  /// Check provided coordinates against all active geofences owned by the caller.
  /// Returns an alert for every zone the point falls inside.
  public shared query(msg) func checkGeofences(lat : Float, lng : Float) : async [GeofenceAlert] {
    if (lat < -90.0 or lat > 90.0 or lng < -180.0 or lng > 180.0) return [];
    let caller = pt(msg.caller);
    let buf    = Buffer.Buffer<GeofenceAlert>(4);
    let now    = Time.now();
    for ((_, g) in geofences.entries()) {
      if (g.owner == caller and g.isActive) {
        let dist = haversine(lat, lng, g.centerLat, g.centerLng);
        if (dist <= g.radiusMeters and g.alertOnEnter) {
          buf.add({ zoneId = g.id; zoneName = g.name; alertType = #entered; timestamp = now });
        };
      };
    };
    Buffer.toArray(buf)
  };
}
