import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

// MARK: - Screen

/// Face registration for one employee.
///
/// A photo is chosen from the library with `PhotosPicker` (out-of-process, so
/// no photo-library permission prompt and no third-party dependency) or taken
/// with the camera through `UIImagePickerController`. Whichever path is used,
/// the bytes are converted to JPEG and posted with
/// `APIClient.shared.uploadFace(code:jpegData:fileName:)`, which is the only
/// endpoint this screen calls (`POST /employees/{code}/face`, admin only —
/// the server enforces that independently of this view).
///
/// `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` are already
/// declared in the target's Info.plist.
struct FaceEnrollmentView: View {

    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel: FaceEnrollmentViewModel

    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var isReadingPicker = false

    private let employeeCode: String
    private let employeeName: String

    init(employeeCode: String, employeeName: String) {
        self.employeeCode = employeeCode
        self.employeeName = employeeName
        _viewModel = StateObject(
            wrappedValue: FaceEnrollmentViewModel(employeeCode: employeeCode, employeeName: employeeName)
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                headerCard
                previewCard
                if !viewModel.isAdmin {
                    ErrorBanner(message: "Uploading a face photo needs an administrator account. Sign in as an administrator to enroll \(employeeName).")
                }
                if let message = viewModel.errorMessage {
                    ErrorBanner(message: message) { viewModel.errorMessage = nil }
                }
                if let message = viewModel.successMessage {
                    successCard(message)
                }
                actions
                guidanceCard
            }
            .padding(Theme.contentPadding)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Face enrollment")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { viewModel.refreshAdminFlag(using: auth) }
        // `matching: .images` keeps the picker to stills; the picked item is
        // loaded as raw `Data` and converted to JPEG before upload.
        .photosPicker(
            isPresented: $viewModel.isPickerPresented,
            selection: $pickerItem,
            matching: .images,
            photoLibrary: .shared()
        )
        .onChange(of: pickerItem) { _, newItem in
            guard let newItem else { return }
            Task { await load(newItem) }
        }
        .sheet(isPresented: $showCamera) {
            CameraImagePicker(
                onPicked: { image in
                    showCamera = false
                    viewModel.adopt(image: image, fileName: "camera-\(employeeCode).jpg")
                },
                onCancel: { showCamera = false }
            )
            .ignoresSafeArea()
        }
    }

    // MARK: - Sections

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: "face.smiling")
                    .font(.title2)
                    .foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text(employeeName)
                        .font(.headline)
                    Text(employeeCode)
                        .font(.subheadline.monospaced())
                        .foregroundStyle(.secondary)
                }
            }
            Text("The face photo is sent to the server and picked up by the edge cameras at their next sync. From then on the cameras can recognise \(employeeName) and mark attendance automatically, with no badge or manual check-in.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous)
        )
    }

    private var previewCard: some View {
        SectionCard(title: "Photo") {
            if let data = viewModel.previewData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .frame(height: 260)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.controlCornerRadius, style: .continuous))
                    .accessibilityLabel("Selected face photo")
                HStack {
                    Text(viewModel.previewFileName ?? "Selected photo")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer()
                    Button("Remove", role: .destructive) {
                        viewModel.clearSelection()
                        pickerItem = nil
                    }
                    .font(.caption)
                }
            } else if isReadingPicker {
                LoadingPlaceholder(text: "Loading the photo…")
            } else {
                StatePlaceholder(
                    symbol: "person.crop.square.badge.camera",
                    title: "No photo selected",
                    message: "Use a clear, front-facing photo in good light.",
                    actionTitle: nil,
                    action: nil
                )
            }
        }
    }

    private func successCard(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            Text(message)
                .font(.footnote)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var actions: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Button {
                    viewModel.isPickerPresented = true
                } label: {
                    Label("Choose photo", systemImage: "photo.on.rectangle.angled")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(viewModel.isUploading)

                Button {
                    showCamera = true
                } label: {
                    Label("Take photo", systemImage: "camera")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                // The simulator (and any device without a camera) cannot use
                // `UIImagePickerController` with `.camera`, so the button is
                // disabled rather than failing once tapped.
                .disabled(viewModel.isUploading || !FaceEnrollmentViewModel.isCameraAvailable)
            }

            if !FaceEnrollmentViewModel.isCameraAvailable {
                Text("No camera is available on this device, so the camera button is disabled. Choose a photo from the library instead.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                Task { await viewModel.upload() }
            } label: {
                HStack {
                    if viewModel.isUploading {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.up.circle")
                    }
                    Text(viewModel.isUploading ? "Uploading…" : "Upload face photo")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!viewModel.canUpload)
            .opacity(viewModel.canUpload ? 1 : 0.6)

            // The multipart helper in `APIClient` has no byte-level progress
            // callback, so this is an indeterminate indicator rather than a
            // percentage.
            if viewModel.isUploading {
                ProgressView()
                    .progressViewStyle(.linear)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var guidanceCard: some View {
        SectionCard(title: "Good photos") {
            bullet("Front-facing, eyes open, no sunglasses or mask.")
            bullet("Bright, even light — avoid strong backlight and heavy shadow.")
            bullet("One face per photo, close enough to fill most of the frame.")
            bullet("Upload several photos if recognition is unreliable; the latest upload is what the cameras sync.")
            if !viewModel.isAdmin {
                bullet("Only an administrator can upload a face photo.")
            }
        }
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "circle.fill")
                .font(.system(size: 4))
                .padding(.top, 6)
            Text(text)
                .font(.footnote)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(.secondary)
    }

    // MARK: - Picker loading

    /// Loads the picked asset as `Data`, then hands it to the view model, which
    /// converts it to JPEG. A picked `Data` payload may be HEIC, so it must not
    /// be uploaded untouched.
    private func load(_ item: PhotosPickerItem) async {
        isReadingPicker = true
        defer { isReadingPicker = false }

        do {
            guard let data = try await item.loadTransferable(type: Data.self), !data.isEmpty else {
                viewModel.errorMessage = "That photo could not be read. Try another one."
                return
            }
            viewModel.adopt(imageData: data, fileName: suggestedFileName(from: item))
        } catch {
            viewModel.errorMessage = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
    }

    /// `PhotosPickerItem` exposes no filename, so a stable JPEG name is used —
    /// the backend only needs a name for the multipart part.
    private func suggestedFileName(from item: PhotosPickerItem) -> String {
        let identifier = item.itemIdentifier?.replacingOccurrences(of: "/", with: "-")
        if let identifier, !identifier.isEmpty {
            return "face-\(employeeCode)-\(identifier.prefix(24)).jpg"
        }
        return "face-\(employeeCode).jpg"
    }
}

// MARK: - Camera bridge

/// Minimal `UIImagePickerController` wrapper for the camera.
///
/// The Flutter screen used the `camera` plugin; on iOS the equivalent with no
/// third-party dependency is this bridge. The captured `UIImage` is converted
/// to JPEG inside the view model before it is uploaded.
struct CameraImagePicker: UIViewControllerRepresentable {

    let onPicked: (UIImage) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let controller = UIImagePickerController()
        // Guarded at the call site by `isSourceTypeAvailable(.camera)`; this
        // fallback only matters if that check raced with the presentation.
        controller.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        controller.allowsEditing = false
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {
        // Nothing to update: the controller is configured once.
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onPicked: onPicked, onCancel: onCancel)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {

        private let onPicked: (UIImage) -> Void
        private let onCancel: () -> Void

        init(onPicked: @escaping (UIImage) -> Void, onCancel: @escaping () -> Void) {
            self.onPicked = onPicked
            self.onCancel = onCancel
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            let image = (info[.originalImage] as? UIImage) ?? (info[.editedImage] as? UIImage)
            // UIKit calls this on the main thread, but the callback is hopped to
            // it explicitly so the `@MainActor` view model is always safe.
            DispatchQueue.main.async { [onPicked, onCancel] in
                if let image {
                    onPicked(image)
                } else {
                    onCancel()
                }
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            DispatchQueue.main.async { [onCancel] in
                onCancel()
            }
        }
    }
}

// MARK: - View model

/// Holds the pending photo and performs the single upload call.
@MainActor
final class FaceEnrollmentViewModel: ObservableObject {

    let employeeCode: String
    let employeeName: String

    /// JPEG bytes ready for `uploadFace`. Always JPEG: bytes that came from a
    /// `UIImage` are re-encoded, and picker data is re-encoded too, because the
    /// library may hand back HEIC.
    @Published private(set) var jpegData: Data?
    /// What the preview renders — the original bytes when they already decode,
    /// otherwise the JPEG re-encode.
    @Published private(set) var previewData: Data?
    @Published private(set) var previewFileName: String?

    @Published var isPickerPresented = false
    @Published private(set) var isUploading = false
    @Published var errorMessage: String?
    @Published private(set) var successMessage: String?
    /// `@Published` matters here: the value is filled in from `.onAppear`, and
    /// without it the first render (which assumes a non-admin) would never be
    /// invalidated, leaving an administrator stuck on a blocked screen.
    @Published private(set) var isAdmin = false

    init(employeeCode: String, employeeName: String) {
        self.employeeCode = employeeCode
        self.employeeName = employeeName
    }

    /// `UIImagePickerController` cannot present a `.camera` source on the
    /// simulator, so the camera button is driven by this flag.
    static var isCameraAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    var canUpload: Bool {
        jpegData != nil && !isUploading && isAdmin
    }

    var hasSelection: Bool { jpegData != nil }

    func refreshAdminFlag(using auth: AuthStore) {
        isAdmin = auth.isAdmin
    }

    // MARK: - Selection

    func adopt(imageData: Data, fileName: String) {
        guard let image = UIImage(data: imageData), let jpeg = image.jpegData(compressionQuality: 0.85) else {
            errorMessage = "That image could not be converted to JPEG. Pick a different photo."
            return
        }
        jpegData = jpeg
        previewData = imageData
        previewFileName = fileName
        successMessage = nil
        errorMessage = nil
    }

    func adopt(image: UIImage, fileName: String) {
        guard let jpeg = image.jpegData(compressionQuality: 0.85) else {
            errorMessage = "The captured photo could not be converted to JPEG."
            return
        }
        jpegData = jpeg
        previewData = jpeg
        previewFileName = fileName
        successMessage = nil
        errorMessage = nil
    }

    func clearSelection() {
        jpegData = nil
        previewData = nil
        previewFileName = nil
        successMessage = nil
    }

    // MARK: - Upload

    func upload() async {
        guard let jpegData else {
            errorMessage = "Choose or take a photo first."
            return
        }
        guard isAdmin else {
            errorMessage = "Only an administrator can upload a face photo. The server rejects this request for non-admins."
            return
        }

        isUploading = true
        errorMessage = nil
        successMessage = nil

        do {
            let response = try await APIClient.shared.uploadFace(
                code: employeeCode,
                jpegData: jpegData,
                fileName: previewFileName ?? "face-\(employeeCode).jpg"
            )
            let detail = response.message?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let detail, !detail.isEmpty {
                successMessage = detail
            } else {
                successMessage = "Face photo uploaded. The edge cameras will pick it up for \(employeeName) at their next sync."
            }
        } catch {
            errorMessage = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }

        isUploading = false
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        FaceEnrollmentView(employeeCode: "emp-001", employeeName: "Abebe Kebede")
    }
    .environmentObject(AuthStore.preview())
}
