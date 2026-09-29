import "dart:math" as math;
import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:intl/intl.dart";

import "../core/network/dio_client.dart";

// --- Providers ---

final attendanceSummaryProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/attendance/summary");
  return res.data as Map<String, dynamic>;
});

final employeesCountProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/employees", queryParameters: {"limit": 1, "active": true});
  return res.data["total"] as int? ?? 0;
});

final pendingLeavesCountProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/leaves", queryParameters: {"limit": 1, "status": "pending"});
  return res.data["total"] as int? ?? 0;
});

final camerasSummaryProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/events/cameras/list");
  final cameras = res.data as List<dynamic>;
  int online = 0;
  for (var c in cameras) {
    if (c["active"] == true) online++;
  }
  return {"total": cameras.length, "online": online};
});

final recentEventsProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/events", queryParameters: {"limit": 5});
  return res.data["items"] as List<dynamic>;
});

// ─── Animated Gradient Card ───────────────────────────────────────────────────

class _AnimatedGradientCard extends StatefulWidget {
  final String title;
  final String value;
  final IconData icon;
  final List<Color> colors;
  final int delay;

  const _AnimatedGradientCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.colors,
    this.delay = 0,
  });

  @override
  State<_AnimatedGradientCard> createState() => _AnimatedGradientCardState();
}

class _AnimatedGradientCardState extends State<_AnimatedGradientCard>
    with TickerProviderStateMixin {
  late AnimationController _entranceCtrl;
  late AnimationController _pulseCtrl;
  late AnimationController _cornerCtrl;
  late Animation<double> _fadeIn;
  late Animation<Offset> _slideIn;
  late Animation<double> _pulse;
  late Animation<double> _cornerRot;

  @override
  void initState() {
    super.initState();
    _entranceCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 2000))
      ..repeat(reverse: true);
    _cornerCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 8000))
      ..repeat();

    _fadeIn = CurvedAnimation(parent: _entranceCtrl, curve: Curves.easeOut);
    _slideIn = Tween<Offset>(begin: const Offset(0, 0.3), end: Offset.zero)
        .animate(CurvedAnimation(parent: _entranceCtrl, curve: Curves.easeOutCubic));
    _pulse = Tween<double>(begin: 0.25, end: 0.65)
        .animate(CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));
    _cornerRot = Tween<double>(begin: 0, end: 2 * math.pi).animate(_cornerCtrl);

    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _entranceCtrl.forward();
    });
  }

  @override
  void dispose() {
    _entranceCtrl.dispose();
    _pulseCtrl.dispose();
    _cornerCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fadeIn,
      child: SlideTransition(
        position: _slideIn,
        child: AnimatedBuilder(
          animation: Listenable.merge([_pulseCtrl, _cornerCtrl]),
          builder: (_, __) => Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: widget.colors,
              ),
              boxShadow: [
                BoxShadow(
                  color: widget.colors[1].withOpacity(_pulse.value),
                  blurRadius: 28,
                  spreadRadius: 2,
                  offset: const Offset(0, 12),
                ),
                BoxShadow(
                  color: widget.colors[0].withOpacity(0.2),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            padding: const EdgeInsets.all(18),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  right: -4,
                  top: -4,
                  child: Transform.rotate(
                    angle: _cornerRot.value,
                    child: CustomPaint(
                      painter: _ArcPainter(color: Colors.white.withOpacity(0.3)),
                      size: const Size(40, 40),
                    ),
                  ),
                ),
                Positioned(
                  right: 2,
                  top: 2,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withOpacity(_pulse.value),
                      boxShadow: [BoxShadow(color: Colors.white.withOpacity(0.9), blurRadius: 8, spreadRadius: 2)],
                    ),
                  ),
                ),
                Positioned(
                  right: -10,
                  bottom: -10,
                  child: Icon(widget.icon, size: 68, color: Colors.white.withOpacity(0.1)),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(widget.icon, size: 16, color: Colors.white),
                    ),
                    const Spacer(),
                    Text(
                      widget.value,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 36,
                        fontWeight: FontWeight.bold,
                        height: 1,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.title,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.85),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ArcPainter extends CustomPainter {
  final Color color;
  _ArcPainter({required this.color});
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(Rect.fromLTWH(0, 0, size.width, size.height), 0, math.pi / 2, false, paint);
  }
  @override
  bool shouldRepaint(_ArcPainter old) => old.color != color;
}

// ─── Animated Stat Card ───────────────────────────────────────────────────────

class _AnimatedStatCard extends StatefulWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;
  final bool isDark;
  final int delay;

  const _AnimatedStatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
    required this.isDark,
    this.delay = 0,
  });

  @override
  State<_AnimatedStatCard> createState() => _AnimatedStatCardState();
}

class _AnimatedStatCardState extends State<_AnimatedStatCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _fade;
  late Animation<Offset> _slide;
  bool _hovered = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _slide = Tween<Offset>(begin: const Offset(0.1, 0), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _ctrl.forward();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bg = widget.isDark ? const Color(0xFF1E293B) : Colors.white;
    final textColor = widget.isDark ? Colors.white : const Color(0xFF1E293B);
    return FadeTransition(
      opacity: _fade,
      child: SlideTransition(
        position: _slide,
        child: MouseRegion(
          onEnter: (_) => setState(() => _hovered = true),
          onExit: (_) => setState(() => _hovered = false),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: _hovered ? widget.color.withOpacity(0.45) : Colors.transparent,
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: _hovered
                      ? widget.color.withOpacity(0.28)
                      : Colors.black.withOpacity(widget.isDark ? 0.18 : 0.06),
                  blurRadius: _hovered ? 22 : 12,
                  offset: const Offset(0, 4),
                  spreadRadius: _hovered ? 2 : 0,
                ),
              ],
            ),
            child: Row(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: widget.color.withOpacity(_hovered ? 0.25 : 0.13),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(widget.icon, color: widget.color, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.title,
                        style: TextStyle(
                          fontSize: 11,
                          color: widget.isDark ? Colors.grey[400] : Colors.grey[500],
                          fontWeight: FontWeight.w500,
                          letterSpacing: 0.3,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(widget.value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: textColor)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Notification Bell ────────────────────────────────────────────────────────

class _NotificationBell extends StatefulWidget {
  final bool isDark;
  const _NotificationBell({required this.isDark});
  @override
  State<_NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<_NotificationBell>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _shake;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _shake = Tween<double>(begin: -0.1, end: 0.1)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.elasticIn));
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        _ctrl.repeat(reverse: true, period: const Duration(milliseconds: 140));
        Future.delayed(const Duration(milliseconds: 560), () {
          if (mounted) _ctrl.stop();
        });
      }
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, child) => Transform.rotate(angle: _shake.value, child: child),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          IconButton(
            icon: Icon(Icons.notifications_outlined,
                color: widget.isDark ? Colors.white : const Color(0xFF1E293B)),
            onPressed: () {},
          ),
          Positioned(
            top: 8,
            right: 8,
            child: Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Color(0xFF6366F1),
                boxShadow: [BoxShadow(color: Color(0xFF6366F1), blurRadius: 6, spreadRadius: 1)],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Animated Event Tile ──────────────────────────────────────────────────────

class _AnimatedEventTile extends StatefulWidget {
  final dynamic ev;
  final bool isAlert;
  final String formattedTs;
  final bool isDark;
  final int delay;

  const _AnimatedEventTile({
    required this.ev,
    required this.isAlert,
    required this.formattedTs,
    required this.isDark,
    this.delay = 0,
  });

  @override
  State<_AnimatedEventTile> createState() => _AnimatedEventTileState();
}

class _AnimatedEventTileState extends State<_AnimatedEventTile>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _fade;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 450));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _slide = Tween<Offset>(begin: const Offset(0, 0.2), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _ctrl.forward();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final accentColor = widget.isAlert ? Colors.red : const Color(0xFF6366F1);
    return FadeTransition(
      opacity: _fade,
      child: SlideTransition(
        position: _slide,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: widget.isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: widget.isAlert ? Colors.red.withOpacity(0.4) : Colors.transparent),
            boxShadow: [
              BoxShadow(color: accentColor.withOpacity(0.09), blurRadius: 16, offset: const Offset(0, 4)),
              BoxShadow(color: Colors.black.withOpacity(widget.isDark ? 0.18 : 0.04), blurRadius: 8, offset: const Offset(0, 2)),
            ],
          ),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: accentColor.withOpacity(0.12), borderRadius: BorderRadius.circular(14)),
              child: Icon(widget.isAlert ? Icons.warning_rounded : Icons.fingerprint, color: accentColor, size: 20),
            ),
            title: Text(
              widget.ev["type"] ?? "Event",
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: widget.isDark ? Colors.white : const Color(0xFF1E293B)),
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 4.0),
              child: Text(
                "Emp: ${widget.ev["employee_code"] ?? "N/A"} • Cam: ${widget.ev["camera_id"]}",
                style: TextStyle(color: widget.isDark ? Colors.grey[400] : Colors.grey[500], fontSize: 12),
              ),
            ),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(widget.formattedTs, style: TextStyle(color: widget.isDark ? Colors.grey[500] : Colors.grey[400], fontSize: 12, fontWeight: FontWeight.w500)),
                if (widget.isAlert)
                  Container(
                    margin: const EdgeInsets.only(top: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: Colors.red.withOpacity(0.12), borderRadius: BorderRadius.circular(4)),
                    child: const Text("ALERT", style: TextStyle(color: Colors.red, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Shimmer Box ──────────────────────────────────────────────────────────────

class _ShimmerBox extends StatefulWidget {
  final double height;
  final double radius;
  const _ShimmerBox({required this.height, this.radius = 12});
  @override
  State<_ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<_ShimmerBox> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;
  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut);
  }
  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) => Container(
        height: widget.height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(widget.radius),
          gradient: LinearGradient(
            begin: Alignment(-1.5 + _anim.value * 3, 0),
            end: Alignment(-0.5 + _anim.value * 3, 0),
            colors: const [Color(0xFF334155), Color(0xFF475569), Color(0xFF334155)],
          ),
        ),
      ),
    );
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  Future<void> _refreshAll(WidgetRef ref) async {
    ref.invalidate(attendanceSummaryProvider);
    ref.invalidate(employeesCountProvider);
    ref.invalidate(pendingLeavesCountProvider);
    ref.invalidate(camerasSummaryProvider);
    ref.invalidate(recentEventsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final attAsync = ref.watch(attendanceSummaryProvider);
    final empAsync = ref.watch(employeesCountProvider);
    final leavesAsync = ref.watch(pendingLeavesCountProvider);
    final camAsync = ref.watch(camerasSummaryProvider);
    final evAsync = ref.watch(recentEventsProvider);

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0A0F1E) : const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Dashboard",
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white : const Color(0xFF1E293B),
              ),
            ),
            Text(
              DateFormat("EEEE, MMMM d, yyyy").format(DateTime.now()),
              style: theme.textTheme.bodySmall?.copyWith(
                color: isDark ? Colors.grey[400] : Colors.grey[500],
                letterSpacing: 0.3,
              ),
            ),
          ],
        ),
        actions: [
          _NotificationBell(isDark: isDark),
          const SizedBox(width: 12),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _refreshAll(ref),
        color: const Color(0xFF6366F1),
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          physics: const BouncingScrollPhysics(),
          children: [
            _sectionTitle("Live Attendance", isDark, theme),
            attAsync.when(
              loading: () => _attendanceShimmer(),
              error: (e, _) => _errorBox(e.toString()),
              data: (data) => _buildAttendanceGrid(data),
            ),
            const SizedBox(height: 32),
            _sectionTitle("System Overview", isDark, theme),
            _buildOverviewRow(empAsync, leavesAsync, camAsync, isDark),
            const SizedBox(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _sectionTitle("Recent Activity", isDark, theme),
                TextButton(
                  onPressed: () {},
                  child: const Text("View All", style: TextStyle(color: Color(0xFF6366F1), fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            evAsync.when(
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
              error: (e, _) => _errorBox(e.toString()),
              data: (events) => _buildRecentEvents(events, isDark),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title, bool isDark, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 18,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            title,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: isDark ? Colors.white : const Color(0xFF1E293B),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttendanceGrid(Map<String, dynamic> data) {
    final cards = [
      ("Present", Icons.how_to_reg, [const Color(0xFF10B981), const Color(0xFF059669)], "present"),
      ("Late", Icons.schedule, [const Color(0xFFF59E0B), const Color(0xFFD97706)], "late"),
      ("Absent", Icons.person_off, [const Color(0xFFEF4444), const Color(0xFFDC2626)], "absent"),
      ("On Leave", Icons.flight_takeoff, [const Color(0xFF6366F1), const Color(0xFF4F46E5)], "on_leave"),
    ];
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 14,
      mainAxisSpacing: 14,
      childAspectRatio: 1.25,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        for (int i = 0; i < cards.length; i++)
          _AnimatedGradientCard(
            title: cards[i].$1,
            value: "${data[cards[i].$4] ?? 0}",
            icon: cards[i].$2,
            colors: cards[i].$3,
            delay: i * 100,
          ),
      ],
    );
  }

  Widget _buildOverviewRow(
    AsyncValue<int> empAsync,
    AsyncValue<int> leavesAsync,
    AsyncValue<Map<String, int>> camAsync,
    bool isDark,
  ) {
    final items = [
      ("Total Workforce", empAsync.valueOrNull?.toString() ?? "–", Icons.groups, const Color(0xFF8B5CF6)),
      ("Pending Leaves", leavesAsync.valueOrNull?.toString() ?? "–", Icons.event_busy, const Color(0xFFEC4899)),
      ("Cameras", camAsync.valueOrNull != null ? "${camAsync.value!["online"]}/${camAsync.value!["total"]}" : "–", Icons.videocam, const Color(0xFF06B6D4)),
      ("Alerts", "0", Icons.warning_amber_rounded, const Color(0xFFF43F5E)),
    ];
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: _AnimatedStatCard(title: items[0].$1, value: items[0].$2, icon: items[0].$3, color: items[0].$4, isDark: isDark, delay: 100)),
            const SizedBox(width: 14),
            Expanded(child: _AnimatedStatCard(title: items[1].$1, value: items[1].$2, icon: items[1].$3, color: items[1].$4, isDark: isDark, delay: 200)),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: _AnimatedStatCard(title: items[2].$1, value: items[2].$2, icon: items[2].$3, color: items[2].$4, isDark: isDark, delay: 300)),
            const SizedBox(width: 14),
            Expanded(child: _AnimatedStatCard(title: items[3].$1, value: items[3].$2, icon: items[3].$3, color: items[3].$4, isDark: isDark, delay: 400)),
          ],
        ),
      ],
    );
  }

  Widget _buildRecentEvents(List<dynamic> events, bool isDark) {
    if (events.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(40),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(isDark ? 0.2 : 0.05), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(
          children: [
            Icon(Icons.inbox_outlined, size: 48, color: Colors.grey[400]),
            const SizedBox(height: 12),
            Text("No recent activities", style: TextStyle(color: Colors.grey[500])),
          ],
        ),
      );
    }
    return Column(
      children: events.asMap().entries.map((e) {
        final i = e.key;
        final ev = e.value;
        final tsStr = ev["ts"] as String?;
        final ts = tsStr != null ? DateTime.tryParse(tsStr)?.toLocal() : null;
        final formattedTs = ts != null ? DateFormat("hh:mm a").format(ts) : "";
        final isAlert = ev["type"]?.toString().toLowerCase().contains("panic") ?? false;
        return _AnimatedEventTile(ev: ev, isAlert: isAlert, formattedTs: formattedTs, isDark: isDark, delay: i * 80);
      }).toList(),
    );
  }

  Widget _attendanceShimmer() {
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 14,
      mainAxisSpacing: 14,
      childAspectRatio: 1.25,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: List.generate(4, (_) => const _ShimmerBox(height: double.infinity, radius: 24)),
    );
  }

  Widget _errorBox(String msg) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.red.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.red.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(msg, style: const TextStyle(color: Colors.red, fontSize: 12))),
        ],
      ),
    );
  }
}
