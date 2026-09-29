import 'package:flutter/foundation.dart' show kIsWeb;

class AppConfig {
  const AppConfig._();

  static String get apiBase {
    const envOverride = String.fromEnvironment("API_BASE", defaultValue: "");
    if (envOverride.isNotEmpty) return envOverride;
    // Android emulator reaches host via 10.0.2.2; web/desktop uses localhost
    return kIsWeb ? "http://localhost:8000" : "http://10.0.2.2:8000";
  }

  static const String mqttHost = String.fromEnvironment(
    "MQTT_HOST",
    defaultValue: "10.0.2.2",
  );

  static const int mqttPort = int.fromEnvironment(
    "MQTT_PORT",
    defaultValue: 1883,
  );

  static const Duration requestTimeout = Duration(seconds: 15);
  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration pollInterval = Duration(seconds: 15);
}
