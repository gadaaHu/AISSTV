import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../providers/auth_provider.dart";

class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.child});
  final Widget child;

  static const _tabs = ["/home", "/cameras", "/employees", "/leaves", "/events", "/users", "/profile"];

  int _indexFor(String location, List<String> tabs) {
    final i = tabs.indexWhere((t) => location.startsWith(t));
    return i >= 0 ? i : 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;
    final isAdmin = ref.watch(currentUserProvider)?.isAdmin == true;

    final tabs = [
      "/home",
      if (isAdmin) "/cameras",
      "/employees",
      "/leaves",
      "/events",
      if (isAdmin) "/users",
      "/profile"
    ];

    final index = _indexFor(location, tabs);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => context.go(tabs[i]),
        destinations: [
          const NavigationDestination(
              icon: Icon(Icons.dashboard_outlined),
              selectedIcon: Icon(Icons.dashboard),
              label: "Home"),
          if (isAdmin)
            const NavigationDestination(
                icon: Icon(Icons.videocam_outlined),
                selectedIcon: Icon(Icons.videocam),
                label: "Cameras"),
          const NavigationDestination(
              icon: Icon(Icons.people_outline),
              selectedIcon: Icon(Icons.people),
              label: "Employees"),
          const NavigationDestination(
              icon: Icon(Icons.beach_access_outlined),
              selectedIcon: Icon(Icons.beach_access),
              label: "Leaves"),
          const NavigationDestination(
              icon: Icon(Icons.timeline_outlined),
              selectedIcon: Icon(Icons.timeline),
              label: "Events"),
          if (isAdmin)
            const NavigationDestination(
                icon: Icon(Icons.manage_accounts_outlined),
                selectedIcon: Icon(Icons.manage_accounts),
                label: "Users"),
          const NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: "Profile"),
        ],
      ),
    );
  }
}
