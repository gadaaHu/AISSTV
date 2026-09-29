import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../core/network/dio_client.dart";
import "../providers/auth_provider.dart";

final leavesProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/leaves", queryParameters: {"limit": 50});
  return res.data["items"] as List<dynamic>;
});

class LeavesScreen extends ConsumerWidget {
  const LeavesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final leavesAsync = ref.watch(leavesProvider);
    final isManager = ref.watch(currentUserProvider)?.isManager == true;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          "Leave Management",
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
                color: const Color(0xFF3B82F6).withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.add, color: Color(0xFF3B82F6)),
            ),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Request Leave coming soon")));
            },
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: Icon(Icons.refresh, color: isDark ? Colors.white : Colors.black87),
            onPressed: () => ref.invalidate(leavesProvider),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: leavesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text("Error: $err")),
        data: (leaves) {
          if (leaves.isEmpty) {
            return const Center(child: Text("No leave requests found."));
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(leavesProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: leaves.length,
              itemBuilder: (context, index) {
                final leave = leaves[index];
                
                final status = leave["status"] as String? ?? "pending";
                Color statusColor = Colors.orange;
                Color statusBgColor = Colors.orange.withOpacity(0.1);
                IconData statusIcon = Icons.access_time;
                
                if (status == "approved") {
                  statusColor = Colors.green;
                  statusBgColor = Colors.green.withOpacity(0.1);
                  statusIcon = Icons.check_circle;
                }
                if (status == "rejected") {
                  statusColor = Colors.red;
                  statusBgColor = Colors.red.withOpacity(0.1);
                  statusIcon = Icons.cancel;
                }

                return Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: isDark ? [] : [
                      BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4)),
                    ],
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: statusBgColor,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(statusIcon, color: statusColor, size: 24),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        "EMP: ${leave["employee_code"]}",
                                        style: theme.textTheme.titleMedium?.copyWith(
                                          fontWeight: FontWeight.bold,
                                          color: isDark ? Colors.white : const Color(0xFF1E293B),
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: statusBgColor,
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          status.toUpperCase(),
                                          style: TextStyle(
                                            color: statusColor,
                                            fontSize: 10,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    "Type: ${leave["leave_type"]}",
                                    style: TextStyle(
                                      color: isDark ? Colors.grey[300] : Colors.grey[800],
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    "${leave["start_date"]} to ${leave["end_date"]}",
                                    style: TextStyle(color: isDark ? Colors.grey[400] : Colors.grey[600], fontSize: 13),
                                  ),
                                  if (leave["reason"] != null && leave["reason"].toString().isNotEmpty) ...[
                                    const SizedBox(height: 8),
                                    Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color: isDark ? Colors.black26 : Colors.grey[50],
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(
                                        "Reason: ${leave["reason"]}",
                                        style: TextStyle(
                                          color: isDark ? Colors.grey[400] : Colors.grey[600],
                                          fontSize: 13,
                                          fontStyle: FontStyle.italic,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (isManager && status == "pending") ...[
                        const Divider(height: 1),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              TextButton(
                                onPressed: () => _reviewLeave(context, ref, leave["id"], "rejected"),
                                child: const Text("Reject", style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
                              ),
                              const SizedBox(width: 8),
                              FilledButton(
                                onPressed: () => _reviewLeave(context, ref, leave["id"], "approved"),
                                style: FilledButton.styleFrom(
                                  backgroundColor: Colors.green,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                ),
                                child: const Text("Approve"),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }

  Future<void> _reviewLeave(BuildContext context, WidgetRef ref, String leaveId, String status) async {
    final dio = ref.read(dioProvider);
    try {
      await dio.patch("/leaves/$leaveId/review", data: {"status": status});
      ref.invalidate(leavesProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Leave $status")));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
      }
    }
  }
}
