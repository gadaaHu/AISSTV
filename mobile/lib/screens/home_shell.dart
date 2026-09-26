import "package:flutter/material.dart";
import "package:go_router/go_router.dart";

class HomeShell extends StatelessWidget {
  const HomeShell({super.key, required this.child});
  final Widget child;

  static const _tabs = ["/home", "/employees", "/leaves", "/events", "/profile"];

  int _indexFor(String location) {
    final i = _tabs.indexWhere((t) => location.startsWith(t));
    return i >= 0 ? i : 0;
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final index = _indexFor(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => context.go(_tabs[i]),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.dashboard_outlined),
              selectedIcon: Icon(Icons.dashboard),
              label: "Home"),
          NavigationDestination(
              icon: Icon(Icons.people_outline),
              selectedIcon: Icon(Icons.people),
              label: "Employees"),
          NavigationDestination(
              icon: Icon(Icons.beach_access_outlined),
              selectedIcon: Icon(Icons.beach_access),
              label: "Leaves"),
          NavigationDestination(
              icon: Icon(Icons.timeline_outlined),
              selectedIcon: Icon(Icons.timeline),
              label: "Events"),
          NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: "Profile"),
        ],
      ),
    );
  }
}
