import Foundation
import SwiftUI

/// The camera inventory: list, probe, preview, and the administrator's
/// create / edit / delete actions.
///
/// Mirrors `mobile/lib/screens/cameras_screen.dart`, minus that screen's fake
/// "live" placeholder image: the backend exposes no video stream, only a still
/// from `GET /cameras/{id}/snapshot`, which `CameraPreviewView` renders.
///
/// Security note: `GET /cameras` returns the stream `url` — including any
/// embedded `user:pass@` — to **every** authenticated user. This screen renders
/// `camera.redactedURL` only; `camera.url` must never reach a `Text`.
struct CamerasView: View {

    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = CamerasViewModel()

    @State private var formTarget: FormTarget?
    @State private var cameraPendingDelete: Camera?

    /// One sheet for both create and edit, so the two presentations can never
    /// fight over the same presenter.
    private enum FormTarget: Identifiable {
        case create
        case edit(Camera)

        var id: String {
            switch self {
            case .create:
                return "create"
            case .edit(let camera):
                return "edit-\(camera.id)"
            }
        }

        /// `nil` means "create a new camera".
        var camera: Camera? {
            switch self {
            case .create:
                return nil
            case .edit(let camera):
                return camera
            }
        }
    }

    var body: some View {
        List {
            if let message = bannerMessage {
                ErrorBanner(message: message) { viewModel.dismissBanners() }
                    .listRowInsets(
                        EdgeInsets(
                            top: 8,
                            leading: Theme.contentPadding,
                            bottom: 4,
                            trailing: Theme.contentPadding
                        )
                    )
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            Section {
                Toggle("Only enabled cameras", isOn: $viewModel.enabledOnly)
            } header: {
                Text("Filter")
            } footer: {
                Text("Sets enabled_only on GET /cameras. Deactivated cameras are never returned.")
            }

            Section {
                content
            } header: {
                Text(viewModel.cameras.isEmpty ? "Cameras" : "Cameras (\(viewModel.cameras.count))")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Cameras")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 12) {
                    if auth.isAdmin {
                        Button {
                            formTarget = .create
                        } label: {
                            Label("Add camera", systemImage: "plus")
                        }
                        .accessibilityLabel("Add camera")
                    }
                    Button {
                        reload()
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .accessibilityLabel("Refresh cameras")
                    .disabled(viewModel.isLoading)
                }
            }
        }
        .refreshable { await viewModel.load() }
        .polling { await viewModel.load() }
        .onChange(of: viewModel.enabledOnly) { _, _ in
            viewModel.applyFilterChange()
        }
        .sheet(item: $formTarget) { target in
            NavigationStack {
                CameraFormView(existing: target.camera) { viewModel.requestReload() }
            }
            // Injected explicitly, matching every other sheet in the app:
            // `CameraFormView` reads `AuthStore` from the environment, and a
            // sheet does not reliably inherit it.
            .environmentObject(auth)
        }
        .alert("Delete camera?", isPresented: deleteConfirmation, presenting: cameraPendingDelete) { camera in
            // DELETE /cameras/{id} is not idempotent — a second attempt answers
            // 404. The row is gone either way, and the view model explains that.
            Button("Delete", role: .destructive) {
                Task { await viewModel.delete(camera) }
            }
            Button("Cancel", role: .cancel) { }
        } message: { camera in
            Text("“\(camera.displayName)” is removed on the server immediately. This cannot be undone.")
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.cameras.isEmpty {
            if viewModel.isLoading || !viewModel.hasLoadedOnce {
                LoadingPlaceholder(text: "Loading cameras…")
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else if let message = viewModel.loadError {
                StatePlaceholder.error(message) { reload() }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else {
                StatePlaceholder(
                    symbol: "video.slash",
                    title: "No cameras",
                    message: "No cameras match this filter yet."
                )
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
        } else {
            ForEach(viewModel.cameras) { camera in
                CameraRow(
                    camera: camera,
                    isAdmin: auth.isAdmin,
                    isTesting: viewModel.testingCameraID == camera.id,
                    testResult: viewModel.testResults[camera.id],
                    isDeleting: viewModel.deletingCameraID == camera.id,
                    onTest: { test(camera) },
                    onEdit: { formTarget = .edit(camera) },
                    onDelete: { cameraPendingDelete = camera }
                )
            }
        }
    }

    // MARK: - Actions

    private var bannerMessage: String? {
        viewModel.actionError ?? viewModel.loadError
    }

    private var deleteConfirmation: Binding<Bool> {
        Binding(
            get: { cameraPendingDelete != nil },
            set: { isPresented in
                if !isPresented {
                    cameraPendingDelete = nil
                }
            }
        )
    }

    private func reload() {
        Task { await viewModel.load() }
    }

    private func test(_ camera: Camera) {
        Task { await viewModel.test(camera) }
    }
}

// MARK: - Row

/// One camera in the list.
private struct CameraRow: View {

    let camera: Camera
    let isAdmin: Bool
    let isTesting: Bool
    let testResult: CameraTestResult?
    let isDeleting: Bool
    let onTest: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            details
            streamURL

            if camera.hasEmbeddedCredentials {
                credentialWarning
            }

            if let lastError = camera.lastError, !lastError.isEmpty {
                lastErrorView(lastError)
            }

            if let testResult {
                CameraProbeResultView(result: testResult)
            }

            actionBar
        }
        .padding(.vertical, 6)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if isAdmin {
                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(camera.displayName)
                    .font(.headline)
                // The server-assigned identifier is the stable key operators
                // correlate logs with, so it is always monospaced.
                Text(camera.id)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            Spacer(minLength: 8)
            StatusChip(style: Theme.cameraStyle(online: camera.isOnline), compact: true)
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 4) {
            InfoRow(label: "Zone", value: camera.zone)
            InfoRow(label: "Site", value: Format.optional(camera.site))
            InfoRow(label: "Last seen", value: Format.relative(camera.lastSeenAt))
            InfoRow(label: "Last state", value: Format.optional(camera.lastState))
            if !camera.enabled {
                Label("AI processing disabled", systemImage: "pause.circle")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var streamURL: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Stream URL")
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
            // `camera.redactedURL` strips user:pass@. Never use `camera.url`.
            Text(camera.redactedURL)
                .font(.caption.monospaced())
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)
        }
    }

    private var credentialWarning: some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.caption2)
                .foregroundStyle(.orange)
            Text("This stream URL has credentials stored in it (user:pass@). Every signed-in user can read them — move them into the username and password fields.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private func lastErrorView(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Label("Last error", systemImage: "exclamationmark.octagon.fill")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.red)
            Text(message)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var actionBar: some View {
        HStack(spacing: 8) {
            NavigationLink {
                CameraPreviewView(camera: camera)
            } label: {
                Label("Preview", systemImage: "photo")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)

            Button(action: onTest) {
                HStack(spacing: 6) {
                    if isTesting {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(isTesting ? "Testing…" : "Test")
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isTesting)

            if isAdmin {
                Button(action: onEdit) {
                    Label("Edit", systemImage: "pencil")
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Edit \(camera.displayName)")

                Button(role: .destructive, action: onDelete) {
                    if isDeleting {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Delete", systemImage: "trash")
                    }
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(isDeleting)
                .accessibilityLabel("Delete \(camera.displayName)")
            }
        }
    }
}

// MARK: - Probe result

/// Renders a camera probe result.
///
/// Both probe endpoints answer **HTTP 200 even when the stream fails**, so
/// `result.ok` — never the status code — decides what is shown, and the
/// server's `message` is displayed either way.
private struct CameraProbeResultView: View {

    let result: CameraTestResult

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: result.ok ? "checkmark.seal.fill" : "xmark.seal.fill")
                Text(result.ok ? "Stream reachable" : "Stream unreachable")
                    .font(.caption.weight(.semibold))
            }
            .foregroundStyle(result.ok ? Color.green : Color.red)

            Text(result.message)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if !metrics.isEmpty {
                Text(metrics.joined(separator: " · "))
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            (result.ok ? Color.green : Color.red).opacity(0.08),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
    }

    /// `1920×1080 · 25 fps · h264 · 180 ms`, omitting whatever the probe did
    /// not report.
    private var metrics: [String] {
        var parts: [String] = []
        if let resolution = result.resolutionDescription {
            parts.append(resolution)
        }
        if let fps = result.fps {
            let text = fps.rounded() == fps ? String(Int(fps)) : String(format: "%.1f", fps)
            parts.append("\(text) fps")
        }
        if let codec = result.codec, !codec.isEmpty {
            parts.append(codec)
        }
        if let latency = result.latencyMs {
            parts.append("\(latency) ms")
        }
        return parts
    }
}

// MARK: - View model

@MainActor
final class CamerasViewModel: ObservableObject {

    /// `GET /cameras` returns a **bare array** of `Camera`, not a `Page`.
    @Published private(set) var cameras: [Camera] = []
    @Published private(set) var isLoading = false
    @Published private(set) var hasLoadedOnce = false
    @Published private(set) var loadError: String?
    @Published var actionError: String?

    /// Bound to the `enabled_only` query parameter.
    @Published var enabledOnly = false

    @Published private(set) var testingCameraID: String?
    @Published private(set) var testResults: [String: CameraTestResult] = [:]
    @Published private(set) var deletingCameraID: String?

    private var isFetching = false
    private var pendingReload = false

    // MARK: - Loading

    /// Loads the list. Safe to call from `.polling`, `.refreshable` and the
    /// toggle at the same time: overlapping calls collapse into one follow-up
    /// fetch instead of stacking requests on the server.
    func load() async {
        if isFetching {
            pendingReload = true
            return
        }

        isFetching = true
        isLoading = true
        repeat {
            pendingReload = false
            await fetch()
        } while pendingReload
        isFetching = false
        isLoading = false
    }

    /// Starts a reload in the background, for callers that cannot await —
    /// the "saved" callback from the form sheet, for instance.
    func requestReload() {
        Task { await self.load() }
    }

    /// The `enabled_only` filter changed. Rows from the previous filter are
    /// dropped so they are never shown as if they matched the new one.
    func applyFilterChange() {
        cameras = []
        hasLoadedOnce = false
        loadError = nil
        Task { await self.load() }
    }

    func dismissBanners() {
        actionError = nil
        loadError = nil
    }

    private func fetch() async {
        do {
            let items = try await APIClient.shared.cameras(enabledOnly: enabledOnly)
            cameras = items
            loadError = nil
            hasLoadedOnce = true
        } catch let error as APIError {
            // A cancelled poll is not a failure worth reporting.
            if error != .cancelled {
                loadError = error.localizedDescription
                hasLoadedOnce = true
            }
        } catch {
            if !(error is CancellationError) {
                loadError = error.localizedDescription
                hasLoadedOnce = true
            }
        }
    }

    // MARK: - Actions

    /// Probes one camera. The request can take ~10 s, hence the spinner and the
    /// disabled button on the row.
    func test(_ camera: Camera) async {
        guard testingCameraID == nil else { return }

        testingCameraID = camera.id
        actionError = nil
        testResults[camera.id] = nil
        do {
            // Answers 200 even when the probe fails; `result.ok` decides.
            let result = try await APIClient.shared.testCamera(id: camera.id)
            testResults[camera.id] = result
        } catch {
            actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
        testingCameraID = nil
    }

    func delete(_ camera: Camera) async {
        guard deletingCameraID == nil else { return }

        deletingCameraID = camera.id
        actionError = nil
        do {
            try await APIClient.shared.deleteCamera(id: camera.id)
            remove(camera.id)
        } catch let error as APIError {
            if case .notFound = error {
                // DELETE is not idempotent: the second attempt on an already
                // deleted camera answers 404. It is gone either way.
                remove(camera.id)
                actionError = "“\(camera.displayName)” had already been deleted, so the list was refreshed."
            } else {
                actionError = error.localizedDescription
            }
        } catch {
            actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
        deletingCameraID = nil
    }

    private func remove(_ id: String) {
        cameras.removeAll { $0.id == id }
        testResults[id] = nil
    }
}

// MARK: - Previews

#Preview {
    NavigationStack {
        CamerasView()
    }
    .environmentObject(AuthStore.preview())
}

#Preview("Camera row") {
    List {
        CameraRow(
            camera: .preview,
            isAdmin: true,
            isTesting: false,
            testResult: nil,
            isDeleting: false,
            onTest: {},
            onEdit: {},
            onDelete: {}
        )
    }
    .environmentObject(AuthStore.preview())
}
