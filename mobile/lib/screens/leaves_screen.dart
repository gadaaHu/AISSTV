import "package:flutter/material.dart";

class LeavesScreen extends StatelessWidget {
  const LeavesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Leaves")),
      body: const Center(child: Text("Leaves coming soon")),
    );
  }
}
