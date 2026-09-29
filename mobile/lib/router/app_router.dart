import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:go_router/go_router.dart";

import "../providers/auth_provider.dart";
import "../screens/camera_form_screen.dart";
import "../screens/cameras_screen.dart";
import "../screens/dashboard_screen.dart";
import "../screens/employees_screen.dart";
import "../screens/events_screen.dart";
import "../screens/face_enrollment_screen.dart";
import "../screens/home_shell.dart";
import "../screens/incidents_screen.dart";
import "../screens/leaves_screen.dart";
import "../screens/login_screen.dart";
import "../screens/profile_screen.dart";
import "../screens/splash_screen.dart";
import "../screens/users_screen.dart";

final _rootKey = GlobalKey<NavigatorState>();
final _shellKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = ValueNotifier<AuthState>(ref.read(authProvider));
  ref.listen(authProvider, (_, next) => notifier.value = next);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: "/",
    refreshListenable: notifier,
    redirect: (context, state) {
      final auth = notifier.value;
      final loc = state.matchedLocation;
      final isLogin = loc == "/login";
      final isSplash = loc == "/";

      if (auth is AuthUnknown) return isSplash ? null : "/";
      if (auth is AuthUnauthenticated) return isLogin ? null : "/login";
      if (auth is AuthAuthenticated) return (isLogin || isSplash) ? "/home" : null;
      return null;
    },
    routes: [
      GoRoute(path: "/", builder: (_, __) => const SplashScreen()),
      GoRoute(path: "/login", builder: (_, __) => const LoginScreen()),
      ShellRoute(
        navigatorKey: _shellKey,
        builder: (context, state, child) => HomeShell(child: child),
        routes: [
          GoRoute(path: "/home", builder: (_, __) => const DashboardScreen()),
          GoRoute(path: "/cameras", builder: (_, __) => const CamerasScreen()),
          GoRoute(path: "/employees", builder: (_, __) => const EmployeesScreen()),
          GoRoute(path: "/leaves", builder: (_, __) => const LeavesScreen()),
          GoRoute(path: "/events", builder: (_, __) => const EventsScreen()),
          GoRoute(path: "/incidents", builder: (_, __) => const IncidentsScreen()),
          GoRoute(path: "/users", builder: (_, __) => const UsersScreen()),
          GoRoute(path: "/profile", builder: (_, __) => const ProfileScreen()),
          GoRoute(
            path: "/camera-form", 
            builder: (context, state) => CameraFormScreen(initialData: state.extra as Map<String, dynamic>?),
          ),
          GoRoute(
            path: "/face-enroll",
            builder: (context, state) {
              final data = state.extra as Map<String, dynamic>;
              return FaceEnrollmentScreen(
                employeeCode: data["code"] as String,
                employeeName: data["name"] as String,
              );
            },
          ),
        ],
      ),
    ],
  );
});
