import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:go_router/go_router.dart";
import "package:intl/intl.dart";

import "../core/network/dio_client.dart";

final eventsProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/events", queryParameters: {"limit": 50});
  return res.data["items"] as List<dynamic>;
});

class EventsScreen extends ConsumerWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final eventsAsync = ref.watch(eventsProvider);

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          "Camera Events",
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.bold,
            color: isDark ? Colors.white : const Color(0xFF1E293B),
          ),
        ),
        actions: [
          IconButton(
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.warning_amber_rounded, color: Colors.red),
            ),
            tooltip: "Review Incidents",
            onPressed: () => context.push("/incidents"),
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: Icon(Icons.refresh, color: isDark ? Colors.white : Colors.black87),
            onPressed: () => ref.invalidate(eventsProvider),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: eventsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text("Error: $err")),
        data: (events) {
          if (events.isEmpty) {
            return const Center(child: Text("No events found."));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(eventsProvider.future),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: events.length,
              itemBuilder: (context, index) {
                final ev = events[index];
                final tsStr = ev["ts"] as String?;
                final ts = tsStr != null ? DateTime.tryParse(tsStr)?.toLocal() : null;
                final formattedTs = ts != null ? DateFormat('MMM d, hh:mm a').format(ts) : "Unknown Time";
                
                final type = ev["type"] as String? ?? "UNKNOWN";
                final config = _getEventConfig(type);

                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: isDark ? [] : [
                      BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4)),
                    ],
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    leading: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: config.color.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(config.icon, color: config.color, size: 24),
                    ),
                    title: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          type,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: isDark ? Colors.white : const Color(0xFF1E293B),
                          ),
                        ),
                        Text(
                          formattedTs,
                          style: TextStyle(fontSize: 12, color: isDark ? Colors.grey[400] : Colors.grey[500]),
                        ),
                      ],
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 8.0),
                      child: Row(
                        children: [
                          Icon(Icons.person_outline, size: 14, color: isDark ? Colors.grey[400] : Colors.grey[600]),
                          const SizedBox(width: 4),
                          Text(ev["employee_code"] ?? 'Unknown', style: TextStyle(color: isDark ? Colors.grey[300] : Colors.grey[700])),
                          const SizedBox(width: 12),
                          Icon(Icons.videocam_outlined, size: 14, color: isDark ? Colors.grey[400] : Colors.grey[600]),
                          const SizedBox(width: 4),
                          Text(ev["camera_id"] ?? 'Unknown', style: TextStyle(color: isDark ? Colors.grey[300] : Colors.grey[700])),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }

  ({IconData icon, Color color}) _getEventConfig(String type) {
    switch (type) {
      case "ENTER":
        return (icon: Icons.login, color: Colors.green);
      case "EXIT":
        return (icon: Icons.logout, color: Colors.blue);
      case "LATE":
        return (icon: Icons.schedule_sharp, color: Colors.orange);
      case "EDGE_ERROR":
      case "FRAUD":
      case "SAFETY":
      case "PANIC":
        return (icon: Icons.warning_rounded, color: Colors.red);
      default:
        return (icon: Icons.info_outline, color: Colors.grey);
    }
  }
}
