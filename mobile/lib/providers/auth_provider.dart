import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../core/errors/app_exception.dart";
import "../core/network/dio_client.dart";
import "../core/storage/secure_storage.dart";
import "../models/user.dart";

sealed class AuthState {
  const AuthState();
}

class AuthUnknown extends AuthState {
  const AuthUnknown();
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated({this.error});
  final String? error;
}

class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.user);
  final AppUser user;
}

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() {
    ref.read(authEventsProvider).listen(_onExpired);
    Future.microtask(bootstrap);
    return const AuthUnknown();
  }

  void _onExpired() {
    _clear();
    state = const AuthUnauthenticated(error: "Session expired");
  }

  Future<void> bootstrap() async {
    final store = ref.read(secureStoreProvider);
    final token = await store.readToken();
    if (token == null) {
      state = const AuthUnauthenticated();
      return;
    }
    try {
      final user = await _fetchMe();
      state = AuthAuthenticated(user);
    } catch (_) {
      await store.clearToken();
      state = const AuthUnauthenticated();
    }
  }

  Future<void> login(String username, String password) async {
    final dio = ref.read(dioProvider);
    final store = ref.read(secureStoreProvider);
    try {
      final form = "username=${Uri.encodeComponent(username)}"
          "&password=${Uri.encodeComponent(password)}";
      final response = await dio.post(
        "/auth/login",
        data: form,
        options: Options(contentType: "application/x-www-form-urlencoded"),
      );
      final token = response.data["access_token"] as String?;
      if (token == null) throw const ServerException("No token");
      await store.writeToken(token);
      final user = await _fetchMe();
      state = AuthAuthenticated(user);
    } on DioException catch (e) {
      final err = mapDioError(e);
      state = AuthUnauthenticated(error: err.message);
      rethrow;
    }
  }

  Future<void> logout() async {
    await _clear();
    state = const AuthUnauthenticated();
  }

  Future<AppUser> _fetchMe() async {
    final response = await ref.read(dioProvider).get("/auth/me");
    return AppUser.fromJson(Map<String, dynamic>.from(response.data));
  }

  Future<void> _clear() async {
    await ref.read(secureStoreProvider).clearToken();
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

final currentUserProvider = Provider<AppUser?>((ref) {
  final state = ref.watch(authProvider);
  return switch (state) {
    AuthAuthenticated(:final user) => user,
    _ => null,
  };
});
