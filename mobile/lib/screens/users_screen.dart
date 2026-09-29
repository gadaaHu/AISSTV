import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../core/network/dio_client.dart";

final usersProvider = FutureProvider.autoDispose((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get("/users", queryParameters: {"limit": 100});
  return res.data["items"] as List<dynamic>;
});

class UsersScreen extends ConsumerWidget {
  const UsersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usersAsync = ref.watch(usersProvider);

    return Scaffold(
      appBar: AppBar(title: const Text("User Management")),
      body: usersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text("Error: $err")),
        data: (users) {
          if (users.isEmpty) {
            return const Center(child: Text("No users found."));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(usersProvider.future),
            child: ListView.builder(
              itemCount: users.length,
              itemBuilder: (context, index) {
                final u = users[index];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: u["active"] == true ? Colors.blue : Colors.grey,
                    child: const Icon(Icons.person, color: Colors.white),
                  ),
                  title: Text(u["username"] ?? "Unknown"),
                  subtitle: Text("${u["full_name"] ?? 'No Name'} • Role: ${u["role"]}"),
                  trailing: Icon(
                    u["active"] == true ? Icons.check_circle : Icons.cancel,
                    color: u["active"] == true ? Colors.green : Colors.red,
                  ),
                  onTap: () => _showEditUserDialog(context, ref, u),
                );
              },
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateUserDialog(context, ref),
        child: const Icon(Icons.add),
      ),
    );
  }

  void _showCreateUserDialog(BuildContext context, WidgetRef ref) {
    final usernameCtrl = TextEditingController();
    final passwordCtrl = TextEditingController();
    final nameCtrl = TextEditingController();
    String role = "viewer";

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text("Create User"),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: usernameCtrl, decoration: const InputDecoration(labelText: "Username")),
                TextField(controller: passwordCtrl, decoration: const InputDecoration(labelText: "Password"), obscureText: true),
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: "Full Name")),
                DropdownButtonFormField<String>(
                  value: role,
                  decoration: const InputDecoration(labelText: "Role"),
                  items: const [
                    DropdownMenuItem(value: "admin", child: Text("Admin")),
                    DropdownMenuItem(value: "manager", child: Text("Manager")),
                    DropdownMenuItem(value: "viewer", child: Text("Viewer")),
                  ],
                  onChanged: (v) => setState(() => role = v!),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
            ElevatedButton(
              onPressed: () async {
                final dio = ref.read(dioProvider);
                try {
                  await dio.post("/users", data: {
                    "username": usernameCtrl.text,
                    "password": passwordCtrl.text,
                    "full_name": nameCtrl.text,
                    "role": role,
                    "active": true,
                  });
                  Navigator.pop(ctx);
                  ref.invalidate(usersProvider);
                } catch (e) {
                  ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text("Error: $e")));
                }
              },
              child: const Text("Create"),
            ),
          ],
        ),
      ),
    );
  }

  void _showEditUserDialog(BuildContext context, WidgetRef ref, Map<String, dynamic> user) {
    final nameCtrl = TextEditingController(text: user["full_name"]);
    String role = user["role"] ?? "viewer";
    bool active = user["active"] ?? true;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text("Edit User: ${user["username"]}"),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: "Full Name")),
                DropdownButtonFormField<String>(
                  value: role,
                  decoration: const InputDecoration(labelText: "Role"),
                  items: const [
                    DropdownMenuItem(value: "admin", child: Text("Admin")),
                    DropdownMenuItem(value: "manager", child: Text("Manager")),
                    DropdownMenuItem(value: "viewer", child: Text("Viewer")),
                  ],
                  onChanged: (v) => setState(() => role = v!),
                ),
                SwitchListTile(
                  title: const Text("Active Account"),
                  value: active,
                  onChanged: (v) => setState(() => active = v),
                )
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
            ElevatedButton(
              onPressed: () async {
                final dio = ref.read(dioProvider);
                try {
                  await dio.patch("/users/${user["username"]}", data: {
                    "full_name": nameCtrl.text,
                    "role": role,
                    "active": active,
                  });
                  Navigator.pop(ctx);
                  ref.invalidate(usersProvider);
                } catch (e) {
                  ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text("Error: $e")));
                }
              },
              child: const Text("Save"),
            ),
          ],
        ),
      ),
    );
  }
}
