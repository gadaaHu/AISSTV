import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../core/network/dio_client.dart";
import "../providers/auth_provider.dart";

final incidentsProvider = FutureProvider.family.autoDispose<List<dynamic>, String>((ref, type) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/$type", queryParameters: {"limit": 50});
  return res.data["items"] as List<dynamic>;
});

class IncidentsScreen extends ConsumerWidget {
  const IncidentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text("Incidents Review"),
          bottom: const TabBar(
            tabs: [
              Tab(text: "Fraud"),
              Tab(text: "Safety"),
              Tab(text: "Panic"),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _IncidentList(type: "fraud"),
            _IncidentList(type: "safety"),
            _IncidentList(type: "panic"),
          ],
        ),
      ),
    );
  }
}

class _IncidentList extends ConsumerWidget {
  const _IncidentList({required this.type});
  final String type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final incidentsAsync = ref.watch(incidentsProvider(type));
    final isManager = ref.watch(currentUserProvider)?.isManager == true;

    return incidentsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, stack) => Center(child: Text("Error: $err")),
      data: (incidents) {
        if (incidents.isEmpty) {
          return const Center(child: Text("No incidents found."));
        }
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(incidentsProvider(type)),
          child: ListView.builder(
            itemCount: incidents.length,
            itemBuilder: (context, index) {
              final inc = incidents[index];
              final status = inc["status"] ?? "open";
              
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: ListTile(
                  leading: Icon(
                    Icons.warning,
                    color: status == "resolved" || status == "dismissed" ? Colors.grey : Colors.red,
                  ),
                  title: Text("Cam: ${inc["camera_id"]} • ${inc["type"]}"),
                  subtitle: Text(
                    "Status: ${status.toUpperCase()}\n${inc["description"] ?? 'No description'}",
                  ),
                  isThreeLine: true,
                  trailing: isManager && status == "open"
                      ? PopupMenuButton<String>(
                          onSelected: (action) => _resolveIncident(context, ref, inc["id"], action),
                          itemBuilder: (context) => [
                            const PopupMenuItem(value: "resolved", child: Text("Mark Resolved")),
                            const PopupMenuItem(value: "dismissed", child: Text("Dismiss")),
                          ],
                        )
                      : null,
                ),
              );
            },
          ),
        );
      },
    );
  }

  Future<void> _resolveIncident(BuildContext context, WidgetRef ref, String id, String status) async {
    final dio = ref.read(dioProvider);
    try {
      await dio.patch("/$type/$id/resolve", data: {"status": status, "resolution_note": "Resolved via app"});
      ref.invalidate(incidentsProvider(type));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Incident $status")));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
      }
    }
  }
}
