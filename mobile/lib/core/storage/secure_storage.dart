import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:flutter_secure_storage/flutter_secure_storage.dart";

class SecureStore {
  SecureStore(this._storage);
  final FlutterSecureStorage _storage;

  static const _tokenKey = "auth.jwt";
  static const _panicKey = "panic.token";

  Future<String?> readToken() => _storage.read(key: _tokenKey);
  Future<void> writeToken(String t) => _storage.write(key: _tokenKey, value: t);
  Future<void> clearToken() => _storage.delete(key: _tokenKey);
  Future<String?> readPanicToken() => _storage.read(key: _panicKey);
  Future<void> writePanicToken(String t) =>
      _storage.write(key: _panicKey, value: t);
  Future<void> clearAll() => _storage.deleteAll();
}

final secureStoreProvider = Provider<SecureStore>((ref) {
  return SecureStore(const FlutterSecureStorage());
});
