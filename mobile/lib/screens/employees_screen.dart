import "package:flutter/material.dart";

class EmployeesScreen extends StatelessWidget {
  const EmployeesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Employees")),
      body: const Center(child: Text("Employees coming soon")),
    );
  }
}
