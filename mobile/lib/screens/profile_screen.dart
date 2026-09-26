import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../providers/auth_provider.dart";

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (user == null) return const SizedBox();

    return Scaffold(
      appBar: AppBar(title: const Text("Profile")),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(user.username, style: const TextStyle(fontSize: 20)),
            Text(user.role),
            const SizedBox(height: 24),
            OutlinedButton(
              onPressed: () => ref.read(authProvider.notifier).logout(),
              child: const Text("Sign out"),
            ),
          ],
        ),
      ),
    );
  }
}
