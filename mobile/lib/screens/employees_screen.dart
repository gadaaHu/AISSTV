import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:go_router/go_router.dart";

import "../core/network/dio_client.dart";
import "../providers/auth_provider.dart";

final employeesProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/employees", queryParameters: {"limit": 100});
  return res.data["items"] as List<dynamic>;
});

class _AddEmployeeDialog extends ConsumerStatefulWidget {
  const _AddEmployeeDialog();
  @override
  ConsumerState<_AddEmployeeDialog> createState() => _AddEmployeeDialogState();
}

class _AddEmployeeDialogState extends ConsumerState<_AddEmployeeDialog> {
  final _formKey = GlobalKey<FormState>();
  final _codeCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _deptCtrl = TextEditingController();
  final _shiftStartCtrl = TextEditingController(text: "09:00");
  final _shiftEndCtrl = TextEditingController(text: "18:00");
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _codeCtrl.dispose(); _nameCtrl.dispose(); _deptCtrl.dispose();
    _shiftStartCtrl.dispose(); _shiftEndCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _saving = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      await dio.post("/employees", data: {
        "code": _codeCtrl.text.trim(),
        "name": _nameCtrl.text.trim(),
        "department": _deptCtrl.text.trim().isEmpty ? null : _deptCtrl.text.trim(),
        "shift_start": _shiftStartCtrl.text.trim(),
        "shift_end": _shiftEndCtrl.text.trim(),
      });
      if (mounted) {
        ref.invalidate(employeesProvider);
        Navigator.pop(context, true);
      }
    } catch (e) {
      final msg = e.toString().contains("409") ? "Employee code already exists" : "Failed to create employee";
      setState(() { _error = msg; _saving = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF1E293B) : Colors.white;
    final hint = isDark ? Colors.grey[500]! : Colors.grey[400]!;
    final fieldBg = isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC);

    InputDecoration dec(String label, IconData icon) => InputDecoration(
      labelText: label,
      labelStyle: TextStyle(color: hint),
      prefixIcon: Icon(icon, color: const Color(0xFF6366F1), size: 20),
      filled: true,
      fillColor: fieldBg,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFF6366F1), width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );

    return Dialog(
      backgroundColor: bg,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)]), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.person_add, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text("Add Employee", style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                  Text("Fill in the details below", style: TextStyle(color: hint, fontSize: 12)),
                ]),
                const Spacer(),
                IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
              ]),
              const SizedBox(height: 24),
              TextFormField(
                controller: _codeCtrl,
                decoration: dec("Employee Code *", Icons.badge_outlined),
                validator: (v) => v == null || v.trim().isEmpty ? "Required" : null,
                style: TextStyle(color: isDark ? Colors.white : Colors.black87),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _nameCtrl,
                decoration: dec("Full Name *", Icons.person_outline),
                validator: (v) => v == null || v.trim().isEmpty ? "Required" : null,
                style: TextStyle(color: isDark ? Colors.white : Colors.black87),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _deptCtrl,
                decoration: dec("Department", Icons.business_outlined),
                style: TextStyle(color: isDark ? Colors.white : Colors.black87),
              ),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: TextFormField(
                  controller: _shiftStartCtrl,
                  decoration: dec("Shift Start", Icons.login),
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  validator: (v) { if (v == null || v.trim().isEmpty) return "Required"; if (!v.contains(":")) return "HH:MM"; return null; },
                )),
                const SizedBox(width: 12),
                Expanded(child: TextFormField(
                  controller: _shiftEndCtrl,
                  decoration: dec("Shift End", Icons.logout),
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  validator: (v) { if (v == null || v.trim().isEmpty) return "Required"; if (!v.contains(":")) return "HH:MM"; return null; },
                )),
              ]),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.red.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.red.withOpacity(0.3))),
                  child: Row(children: [
                    const Icon(Icons.error_outline, color: Colors.red, size: 16),
                    const SizedBox(width: 8),
                    Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                  ]),
                ),
              ],
              const SizedBox(height: 24),
              Row(children: [
                Expanded(child: OutlinedButton(
                  onPressed: _saving ? null : () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)), side: BorderSide(color: isDark ? Colors.grey[700]! : Colors.grey[300]!)),
                  child: const Text("Cancel"),
                )),
                const SizedBox(width: 12),
                Expanded(flex: 2, child: ElevatedButton(
                  onPressed: _saving ? null : _submit,
                  style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)), backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white, elevation: 0),
                  child: _saving
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text("Create Employee", style: TextStyle(fontWeight: FontWeight.bold)),
                )),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

class EmployeesScreen extends ConsumerWidget {
  const EmployeesScreen({super.key});

  void _showAddDialog(BuildContext context, WidgetRef ref) {
    showDialog(context: context, builder: (_) => const _AddEmployeeDialog());
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final employeesAsync = ref.watch(employeesProvider);
    final isAdmin = ref.watch(currentUserProvider)?.isAdmin == true;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text("Employee Directory", style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold, color: isDark ? Colors.white : const Color(0xFF1E293B))),
        actions: [
          if (isAdmin)
            IconButton(
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: const Color(0xFF6366F1).withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.add, color: Color(0xFF6366F1)),
              ),
              onPressed: () => _showAddDialog(context, ref),
            ),
          const SizedBox(width: 4),
          IconButton(icon: Icon(Icons.refresh, color: isDark ? Colors.white : Colors.black87), onPressed: () => ref.invalidate(employeesProvider)),
          const SizedBox(width: 8),
        ],
      ),
      body: employeesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text("Error: $err")),
        data: (employees) {
          if (employees.isEmpty) {
            return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.people_outline, size: 64, color: Colors.grey[400]),
              const SizedBox(height: 16),
              Text("No employees found", style: TextStyle(color: Colors.grey[500], fontSize: 16)),
              if (isAdmin) ...[
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: () => _showAddDialog(context, ref),
                  icon: const Icon(Icons.add),
                  label: const Text("Add First Employee"),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
                ),
              ],
            ]));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(employeesProvider.future),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: employees.length,
              itemBuilder: (context, index) {
                final emp = employees[index];
                final name = emp["name"] ?? "Unknown";
                final initial = name.isNotEmpty ? name[0].toUpperCase() : "?";
                final isActive = emp["active"] == true;
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4))],
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    leading: CircleAvatar(
                      radius: 24,
                      backgroundColor: const Color(0xFF6366F1).withOpacity(0.12),
                      child: Text(initial, style: const TextStyle(color: Color(0xFF6366F1), fontWeight: FontWeight.bold)),
                    ),
                    title: Text(name, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold, color: isDark ? Colors.white : const Color(0xFF1E293B))),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4.0),
                      child: Text("${emp["code"]} • ${emp["department"] ?? "No Dept"}", style: TextStyle(color: isDark ? Colors.grey[400] : Colors.grey[600])),
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(color: isActive ? Colors.green.withOpacity(0.1) : Colors.red.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
                      child: Text(isActive ? "Active" : "Inactive", style: TextStyle(color: isActive ? Colors.green : Colors.red, fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                    onTap: () {
                      if (!isAdmin) return;
                      showModalBottomSheet(
                        context: context,
                        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
                        builder: (_) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
                          Padding(padding: const EdgeInsets.all(16), child: Text(name, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold))),
                          ListTile(
                            leading: const CircleAvatar(backgroundColor: Color(0xFF6366F1), child: Icon(Icons.face_retouching_natural, color: Colors.white)),
                            title: const Text("Register Face"),
                            subtitle: const Text("Upload photos to teach the AI"),
                            onTap: () {
                              Navigator.pop(context);
                              context.push("/face-enroll", extra: {"code": emp["code"] as String, "name": name});
                            },
                          ),
                          const SizedBox(height: 8),
                        ])),
                      );
                    },
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
