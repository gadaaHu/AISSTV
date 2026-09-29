import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:go_router/go_router.dart";

import "../core/network/dio_client.dart";
import "../providers/auth_provider.dart";

final camerasListProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/cameras");
  return res.data as List<dynamic>;
});

class CamerasScreen extends ConsumerWidget {
  const CamerasScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final asyncCameras = ref.watch(camerasListProvider);
    final isAdmin = ref.watch(currentUserProvider)?.isAdmin == true;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Camera Dashboard",
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white : const Color(0xFF1E293B),
              ),
            ),
            Text(
              "AI Surveillance Network",
              style: theme.textTheme.bodyMedium?.copyWith(
                color: isDark ? Colors.grey[400] : Colors.grey[600],
              ),
            ),
          ],
        ),
        actions: [
          if (isAdmin)
            IconButton(
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF3B82F6).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.add, color: Color(0xFF3B82F6)),
              ),
              onPressed: () => context.push("/camera-form"),
            ),
          const SizedBox(width: 8),
          IconButton(
            icon: Icon(Icons.refresh, color: isDark ? Colors.white : Colors.black87),
            onPressed: () => ref.invalidate(camerasListProvider),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: asyncCameras.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text("Error: $e")),
        data: (cameras) => _buildDashboard(context, cameras, isDark, theme, isAdmin),
      ),
    );
  }

  Widget _buildDashboard(BuildContext context, List<dynamic> cameras, bool isDark, ThemeData theme, bool isAdmin) {
    int total = cameras.length;
    int online = cameras.where((c) => c["online"] == true).length;
    int offline = total - online;
    int aiEnabled = cameras.where((c) => c["enabled"] == true).length;

    return RefreshIndicator(
      onRefresh: () async {
        // Handled by invalidate on refresh button, but nice to have pull-to-refresh
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        physics: const BouncingScrollPhysics(),
        children: [
          // Top Stats
          Row(
            children: [
              Expanded(child: _buildStatCard("Total", total.toString(), Icons.videocam, Colors.blue, isDark)),
              const SizedBox(width: 12),
              Expanded(child: _buildStatCard("Online", online.toString(), Icons.wifi, Colors.green, isDark)),
              const SizedBox(width: 12),
              Expanded(child: _buildStatCard("Offline", offline.toString(), Icons.wifi_off, Colors.red, isDark)),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildStatCard(
                  "AI Active", 
                  "$aiEnabled / $total", 
                  Icons.memory, 
                  const Color(0xFF8B5CF6), 
                  isDark
                ),
              ),
            ],
          ),
          const SizedBox(height: 32),
          Text(
            "Live Camera Network",
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : const Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 16),
          if (cameras.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32.0),
                child: Text("No cameras configured in the network."),
              ),
            )
          else
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: cameras.length,
              itemBuilder: (context, index) {
                final cam = cameras[index];
                return _buildCameraCard(context, cam, isDark, theme, isAdmin);
              },
            ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _buildStatCard(String title, String value, IconData icon, Color color, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: isDark ? [] : [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: 12),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : const Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: TextStyle(
              fontSize: 12,
              color: isDark ? Colors.grey[400] : Colors.grey[600],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCameraCard(BuildContext context, dynamic cam, bool isDark, ThemeData theme, bool isAdmin) {
    final isOnline = cam["online"] == true;
    final isEnabled = cam["enabled"] == true;
    final name = cam["name"]?.toString().isNotEmpty == true ? cam["name"] : cam["id"];

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: isDark ? [] : [
          BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 12, offset: const Offset(0, 6)),
        ],
      ),
      child: Column(
        children: [
          // Feed Placeholder area
          Container(
            height: 160,
            width: double.infinity,
            decoration: BoxDecoration(
              color: isDark ? Colors.black : Colors.grey[200],
              image: const DecorationImage(
                image: NetworkImage("https://images.unsplash.com/photo-1557597774-9d273605dfa9?q=80&w=600&auto=format&fit=crop"), // Abstract background
                fit: BoxFit.cover,
                opacity: 0.2,
              ),
            ),
            child: Stack(
              children: [
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        isOnline ? Icons.videocam : Icons.videocam_off,
                        size: 48,
                        color: isOnline ? Colors.white.withOpacity(0.8) : Colors.red.withOpacity(0.8),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        isOnline ? "LIVE" : "OFFLINE",
                        style: TextStyle(
                          color: isOnline ? Colors.white : Colors.red,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  top: 12,
                  right: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: isOnline ? Colors.green : Colors.red,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8, height: 8,
                          decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          isOnline ? "ON" : "OFF",
                          style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
                if (isEnabled)
                  Positioned(
                    top: 12,
                    left: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF8B5CF6).withOpacity(0.9),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.memory, color: Colors.white, size: 12),
                          SizedBox(width: 4),
                          Text(
                            "AI DETECTING",
                            style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          // Info Area
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white : const Color(0xFF1E293B),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        "Zone: ${cam['zone']} • FPS: ${cam['fps_process']}",
                        style: TextStyle(color: isDark ? Colors.grey[400] : Colors.grey[600], fontSize: 13),
                      ),
                    ],
                  ),
                ),
                if (isAdmin)
                  IconButton(
                    onPressed: () => context.push("/camera-form", extra: cam),
                    style: IconButton.styleFrom(
                      backgroundColor: isDark ? Colors.grey[800] : Colors.grey[100],
                    ),
                    icon: const Icon(Icons.settings_outlined, size: 20),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

