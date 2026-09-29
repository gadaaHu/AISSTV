import "dart:typed_data";

import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:image_picker/image_picker.dart";
import "package:dio/dio.dart";
import "package:flutter/foundation.dart";
import "package:camera/camera.dart";

import "../core/network/dio_client.dart";

class FaceEnrollmentScreen extends ConsumerStatefulWidget {
  final String employeeCode;
  final String employeeName;

  const FaceEnrollmentScreen({
    super.key,
    required this.employeeCode,
    required this.employeeName,
  });

  @override
  ConsumerState<FaceEnrollmentScreen> createState() => _FaceEnrollmentScreenState();
}

class _FaceEnrollmentScreenState extends ConsumerState<FaceEnrollmentScreen> {
  final List<_PhotoEntry> _photos = [];
  bool _isUploading = false;
  String? _lastResult;
  bool _lastSuccess = false;

  Future<void> _pickPhoto(ImageSource source) async {
    // If on web and camera is selected, use our custom webcam dialog
    if (kIsWeb && source == ImageSource.camera) {
      final bytes = await showDialog<Uint8List>(
        context: context,
        builder: (_) => const _WebcamDialog(),
      );
      if (bytes != null) {
        setState(() {
          _photos.add(_PhotoEntry(
            bytes: bytes,
            name: "webcam_${DateTime.now().millisecondsSinceEpoch}.jpg",
            path: "",
          ));
        });
      }
      return;
    }

    final picker = ImagePicker();
    XFile? file;
    try {
      file = await picker.pickImage(source: source, imageQuality: 90, maxWidth: 1024);
    } catch (e) {
      _showSnack("Could not pick image: $e", success: false);
      return;
    }
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _photos.add(_PhotoEntry(bytes: bytes, name: file!.name, path: file.path));
    });
  }

  Future<void> _uploadAll() async {
    if (_photos.isEmpty) {
      _showSnack("Please add at least one photo first.", success: false);
      return;
    }

    setState(() {
      _isUploading = true;
      _lastResult = null;
    });

    final dio = ref.read(dioProvider);
    int successCount = 0;

    for (final photo in _photos) {
      try {
        final formData = FormData.fromMap({
          "file": MultipartFile.fromBytes(photo.bytes, filename: photo.name),
        });
        await dio.post("/employees/${widget.employeeCode}/face", data: formData);
        successCount++;
      } catch (e) {
        // continue with others
      }
    }

    setState(() {
      _isUploading = false;
      _lastSuccess = successCount > 0;
      _lastResult = successCount == _photos.length
          ? "✅ All $successCount photo(s) uploaded. The AI will learn ${widget.employeeName}'s face on next edge sync."
          : "⚠️ $successCount / ${_photos.length} photos uploaded successfully.";
    });
  }

  void _showSnack(String msg, {required bool success}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: success ? Colors.green : Colors.red,
    ));
  }

  void _removePhoto(int index) {
    setState(() => _photos.removeAt(index));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Face Registration",
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white : const Color(0xFF1E293B),
              ),
            ),
            Text(
              widget.employeeName,
              style: theme.textTheme.bodySmall?.copyWith(
                color: const Color(0xFF6366F1),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.face_retouching_natural, color: Colors.white, size: 36),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          "AI Face Learning",
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "Upload 3–5 clear face photos. The edge AI will learn ${widget.employeeName}'s face for automatic attendance.",
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            Text(
              "Add Photos (${_photos.length} added)",
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white : const Color(0xFF1E293B),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _ActionButton(
                    icon: Icons.camera_alt_rounded,
                    label: "Camera",
                    color: const Color(0xFF6366F1),
                    onTap: () => _pickPhoto(ImageSource.camera),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _ActionButton(
                    icon: Icons.photo_library_rounded,
                    label: "Gallery",
                    color: const Color(0xFF8B5CF6),
                    onTap: () => _pickPhoto(ImageSource.gallery),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),

            if (_photos.isNotEmpty) ...[
              Expanded(
                child: GridView.builder(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: _photos.length,
                  itemBuilder: (context, index) {
                    return Stack(
                      fit: StackFit.expand,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.memory(_photos[index].bytes, fit: BoxFit.cover),
                        ),
                        Positioned(
                          top: 4,
                          right: 4,
                          child: GestureDetector(
                            onTap: () => _removePhoto(index),
                            child: Container(
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                color: Colors.red.withOpacity(0.9),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.close, size: 14, color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ] else ...[
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_a_photo_outlined, size: 64, color: isDark ? Colors.grey[600] : Colors.grey[400]),
                      const SizedBox(height: 12),
                      Text(
                        "No photos added yet",
                        style: TextStyle(color: isDark ? Colors.grey[500] : Colors.grey[500]),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        "Add 3–5 clear, front-facing photos",
                        style: TextStyle(fontSize: 12, color: isDark ? Colors.grey[600] : Colors.grey[400]),
                      ),
                    ],
                  ),
                ),
              ),
            ],

            if (_lastResult != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: _lastSuccess ? Colors.green.withOpacity(0.1) : Colors.orange.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _lastSuccess ? Colors.green.withOpacity(0.3) : Colors.orange.withOpacity(0.3),
                  ),
                ),
                child: Text(
                  _lastResult!,
                  style: TextStyle(color: _lastSuccess ? Colors.green : Colors.orange, fontSize: 13),
                ),
              ),
            ],

            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _isUploading ? null : _uploadAll,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF6366F1),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  disabledBackgroundColor: Colors.grey.withOpacity(0.3),
                ),
                icon: _isUploading
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Icon(Icons.cloud_upload_rounded),
                label: Text(
                  _isUploading ? "Uploading..." : "Train AI with ${_photos.length} Photo(s)",
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoEntry {
  final Uint8List bytes;
  final String name;
  final String path;
  _PhotoEntry({required this.bytes, required this.name, required this.path});
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 6),
            Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

// Custom Webcam Dialog for Web
class _WebcamDialog extends StatefulWidget {
  const _WebcamDialog();
  @override
  State<_WebcamDialog> createState() => _WebcamDialogState();
}

class _WebcamDialogState extends State<_WebcamDialog> {
  CameraController? _controller;
  List<CameraDescription> _cameras = [];
  bool _isInit = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  Future<void> _initCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        setState(() => _error = "No webcams found.");
        return;
      }
      _controller = CameraController(
        _cameras.first,
        ResolutionPreset.medium,
        enableAudio: false,
      );
      await _controller!.initialize();
      if (mounted) {
        setState(() => _isInit = true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = "Camera error: $e");
      }
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    
    Widget content;
    if (_error != null) {
      content = Padding(
        padding: const EdgeInsets.all(24.0),
        child: Text(_error!, style: const TextStyle(color: Colors.red)),
      );
    } else if (!_isInit || _controller == null) {
      content = const Padding(
        padding: EdgeInsets.all(40.0),
        child: CircularProgressIndicator(),
      );
    } else {
      content = Stack(
        alignment: Alignment.bottomCenter,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(
              aspectRatio: _controller!.value.aspectRatio,
              child: CameraPreview(_controller!),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: FloatingActionButton.extended(
              onPressed: () async {
                try {
                  final xfile = await _controller!.takePicture();
                  final bytes = await xfile.readAsBytes();
                  if (mounted) Navigator.pop(context, bytes);
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
                }
              },
              icon: const Icon(Icons.camera),
              label: const Text("Capture Frame"),
              backgroundColor: const Color(0xFF6366F1),
            ),
          )
        ],
      );
    }

    return Dialog(
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500),
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text("Webcam Capture", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                )
              ],
            ),
            const SizedBox(height: 16),
            content,
          ],
        ),
      ),
    );
  }
}
