class AppConfig {
  const AppConfig._();

  static const String apiBase = String.fromEnvironment(
    "API_BASE",
    defaultValue: "http://10.0.2.2:8000",
  );

  static const String mqttHost = String.fromEnvironment(
    "MQTT_HOST",
    defaultValue: "10.0.2.2",
  );

  static const int mqttPort = int.fromEnvironment(
    "MQTT_PORT",
    defaultValue: 1883,
  );

  static const Duration requestTimeout = Duration(seconds: 15);
  static const Duration connectTimeout = Duration(seconds: 5);
  static const Duration pollInterval = Duration(seconds: 15);
}
