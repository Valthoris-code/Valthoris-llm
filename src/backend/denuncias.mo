import Debug "mo:base/Debug";

actor Denuncias {
  public query func ping() : async Text {
    return "Valthoris - Módulo Denúncias online";
  };

  public func submitDenuncia(tipo : Text, detalhe : Text) : async Text {
    Debug.print("Denúncia recebida: " # tipo);
    return "Denúncia registada com sucesso (mock)";
  };
};