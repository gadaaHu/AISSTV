import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:go_router/go_router.dart";

import "../core/network/dio_client.dart";
import "cameras_screen.dart"; // To invalidate provider

class CameraFormScreen extends ConsumerStatefulWidget {
  final Map<String, dynamic>? initialData;

  const CameraFormScreen({super.key, this.initialData});

  @override
  ConsumerState<CameraFormScreen> createState() => _CameraFormScreenState();
}

class _CameraFormScreenState extends ConsumerState<CameraFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;

  late final TextEditingController _idCtrl;
  late final TextEditingController _nameCtrl;
  late final TextEditingController _zoneCtrl;
  late final TextEditingController _urlCtrl;
  late final TextEditingController _userCtrl;
  late final TextEditingController _passCtrl;
  
  bool _enabled = true;
  double _fps = 3.0;

  @override
  void initState() {
    super.initState();
    final d = widget.initialData;
    _idCtrl = TextEditingController(text: d?["id"] ?? "");
    _nameCtrl = TextEditingController(text: d?["name"] ?? "");
    _zoneCtrl = TextEditingController(text: d?["zone"] ?? "main");
    _urlCtrl = TextEditingController(text: d?["url"] ?? "rtsp://");
    _userCtrl = TextEditingController(text: d?["username"] ?? "");
    _passCtrl = TextEditingController(text: d?["password"] ?? "");
    _enabled = d?["enabled"] ?? true;
    _fps = (d?["fps_process"] as num?)?.toDouble() ?? 3.0;
  }

  @override
  void dispose() {
    _idCtrl.dispose();
    _nameCtrl.dispose();
    _zoneCtrl.dispose();
    _urlCtrl.dispose();
    _userCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);
    try {
      final dio = ref.read(dioProvider);
      final payload = {
        "id": _idCtrl.text.trim(),
        "name": _nameCtrl.text.trim(),
        "zone": _zoneCtrl.text.trim(),
        "url": _urlCtrl.text.trim(),
        "username": _userCtrl.text.trim().isEmpty ? null : _userCtrl.text.trim(),
        "password": _passCtrl.text.trim().isEmpty ? null : _passCtrl.text.trim(),
        "enabled": _enabled,
        "fps_process": _fps,
      };

      if (widget.initialData == null) {
        // Create
        await dio.post("/cameras", data: payload);
      } else {
        // Update
        payload.remove("id"); // ID cannot be updated usually, or pass it in URL
        await dio.patch("/cameras/${widget.initialData!['id']}", data: payload);
      }

      if (!mounted) return;
      ref.invalidate(camerasListProvider);
      context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text("Error saving camera: $e"),
        backgroundColor: Colors.red,
      ));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isEdit = widget.initialData != null;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(isEdit ? "Edit Camera" : "Add Camera"),
        backgroundColor: Colors.transparent,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildCard(
                isDark: isDark,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Basic Information", style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _idCtrl,
                      enabled: !isEdit,
                      decoration: const InputDecoration(labelText: "Camera ID (e.g. cam_front_01)"),
                      validator: (v) => v!.trim().isEmpty ? "Required" : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _nameCtrl,
                      decoration: const InputDecoration(labelText: "Friendly Name"),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _zoneCtrl,
                      decoration: const InputDecoration(labelText: "Zone (e.g. entrance)"),
                      validator: (v) => v!.trim().isEmpty ? "Required" : null,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _buildCard(
                isDark: isDark,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Connection Stream", style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _urlCtrl,
                      decoration: const InputDecoration(labelText: "RTSP URL"),
                      validator: (v) => v!.trim().isEmpty ? "Required" : null,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _userCtrl,
                            decoration: const InputDecoration(labelText: "Stream Username"),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: TextFormField(
                            controller: _passCtrl,
                            obscureText: true,
                            decoration: const InputDecoration(labelText: "Stream Password"),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _buildCard(
                isDark: isDark,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("AI Processing Settings", style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    SwitchListTile(
                      title: const Text("Enable AI Detection"),
                      subtitle: const Text("Process frames for face recognition"),
                      value: _enabled,
                      onChanged: (val) => setState(() => _enabled = val),
                      contentPadding: EdgeInsets.zero,
                      activeColor: const Color(0xFF3B82F6),
                    ),
                    const SizedBox(height: 8),
                    Text("Processing FPS: ${_fps.toStringAsFixed(1)}", style: const TextStyle(fontWeight: FontWeight.w500)),
                    Slider(
                      value: _fps,
                      min: 1.0,
                      max: 10.0,
                      divisions: 9,
                      activeColor: const Color(0xFF3B82F6),
                      onChanged: (val) => setState(() => _fps = val),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              FilledButton(
                onPressed: _isLoading ? null : _submit,
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFF3B82F6)),
                child: _isLoading 
                    ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text("Save Camera Config"),
              ),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCard({required bool isDark, required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: isDark ? [] : [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4)),
        ],
      ),
      child: child,
    );
  }
}
