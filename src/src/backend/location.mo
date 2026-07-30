import Debug "mo:base/Debug";

actor Location {

  public query func ping() : async Text {
    return "Valthoris - módulo Safe Location online";
  };

  public func shareLocation(userId : Text, lat : Float, lon : Float) : async Text {
    Debug.print("Localização recebida de: " # userId);
    return "Partilha de localização ainda não implementada";
  };
};
