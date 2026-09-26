import "package:dio/dio.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../config.dart";
import "../storage/secure_storage.dart";

class AuthEvents {
  AuthEvents();
  final _listeners = <void Function()>[];

  void emitExpired() {
    for (final fn in List.of(_listeners)) {
      fn();
    }
  }

  void listen(void Function() fn) => _listeners.add(fn);
}

final authEventsProvider = Provider<AuthEvents>((_) => AuthEvents());

Dio buildDio(Ref ref) {
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.apiBase,
    connectTimeout: AppConfig.connectTimeout,
    receiveTimeout: AppConfig.requestTimeout,
    sendTimeout: AppConfig.requestTimeout,
    headers: {"Content-Type": "application/json"},
    validateStatus: (s) => s != null && s < 500,
  ));

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final token = await ref.read(secureStoreProvider).readToken();
      if (token != null) {
        options.headers["Authorization"] = "Bearer $token";
      }
      handler.next(options);
    },
    onError: (error, handler) {
      if (error.response?.statusCode == 401) {
        ref.read(authEventsProvider).emitExpired();
      }
      handler.next(error);
    },
  ));

  return dio;
}

final dioProvider = Provider<Dio>(buildDio);
