import Foundation
import SwiftUI
import UIKit

/// A single still frame from `GET /cameras/{id}/snapshot`, replaced every two
/// seconds while this screen is on screen.
///
/// The web client (`frontend/src/components/CameraPreview.tsx`) creates a new
/// object URL for every frame and never revokes it. There is no blob URL on
/// iOS, but the equivalent leak is a refresh loop that keeps fetching after the
/// screen is gone — so the loop task is cancelled on disappear, which also
/// cancels the request it is awaiting.
struct CameraPreviewView: View {

    @EnvironmentObject private var auth: AuthStore
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var viewModel: CameraPreviewViewModel

    let camera: Camera

    init(camera: Camera) {
        self.camera = camera
        _viewModel = StateObject(wrappedValue: CameraPreviewViewModel(cameraID: camera.id))
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            frameArea
            footer
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(camera.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    viewModel.refreshNow()
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .accessibilityLabel("Refresh snapshot")
                .disabled(viewModel.isLoading && viewModel.image == nil)
            }
        }
        .onAppear { viewModel.startAutoRefresh() }
        .onDisappear { viewModel.stopAutoRefresh() }
        .onChange(of: scenePhase) { _, phase in
            // Backgrounded apps must not keep polling the camera every 2 s.
            if phase == .active {
                viewModel.startAutoRefresh()
            } else {
                viewModel.stopAutoRefresh()
            }
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(camera.displayName)
                    .font(.headline)
                Spacer(minLength: 8)
                StatusChip(style: Theme.cameraStyle(online: camera.isOnline), compact: true)
            }

            Text("Zone: \(camera.zone)")
                .font(.caption)
                .foregroundStyle(.secondary)

            // Only ever the redacted URL: the raw value can embed user:pass@.
            Text(camera.redactedURL)
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)

            if camera.hasEmbeddedCredentials {
                Text("This stream URL contains credentials (user:pass@), visible to every signed-in user.")
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.contentPadding)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
    }

    private var frameArea: some View {
        ZStack {
            Color.black

            if let image = viewModel.image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Snapshot from \(camera.displayName)")
            } else if viewModel.isLoading {
                firstLoadPlaceholder
            } else {
                emptyPlaceholder
            }

            if viewModel.isLoading, viewModel.image != nil {
                // A refresh is in flight while the previous frame stays visible.
                ProgressView()
                    .tint(.white)
                    .padding(8)
                    .background(Color.black.opacity(0.5), in: Circle())
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(12)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .frame(minHeight: 220)
        .clipped()
    }

    private var firstLoadPlaceholder: some View {
        VStack(spacing: 10) {
            ProgressView()
                .tint(.white)
            Text("Loading snapshot…")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.85))
            Text("A snapshot can take up to 10 seconds.")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(24)
    }

    private var emptyPlaceholder: some View {
        VStack(spacing: 10) {
            Image(systemName: "camera.fill")
                .font(.system(size: 36))
                .foregroundStyle(.white.opacity(0.7))
            Text("No frame")
                .font(.headline)
                .foregroundStyle(.white)

            if let message = viewModel.errorMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.85))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 20)
            }

            Text("The request can take up to 10 seconds. Check the stream URL, its credentials, and that the camera is reachable.")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
        }
        .padding(24)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let message = viewModel.errorMessage, viewModel.image != nil {
                ErrorBanner(message: message)
            }

            HStack(spacing: 8) {
                Label(viewModel.frameTimestamp, systemImage: "clock")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Spacer(minLength: 8)

                Button {
                    viewModel.refreshNow()
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }

            Text("Auto-refreshes every \(CameraPreviewViewModel.refreshIntervalText) while this screen is open.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.contentPadding)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
    }
}

// MARK: - View model

@MainActor
final class CameraPreviewViewModel: ObservableObject {

    /// How often the still is replaced while the screen is visible.
    static let refreshInterval: TimeInterval = 2

    static var refreshIntervalText: String {
        String(format: "%.0f s", refreshInterval)
    }

    @Published private(set) var image: UIImage?
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var fetchedAt: Date?

    private let cameraID: String
    private var loopTask: Task<Void, Never>?

    init(cameraID: String) {
        self.cameraID = cameraID
    }

    /// When the frame currently on screen was received.
    var frameTimestamp: String {
        guard let fetchedAt = fetchedAt else { return "No frame yet" }
        return Format.timestamp(fetchedAt)
    }

    // MARK: - Lifecycle

    /// Fetches immediately, then every `refreshInterval` seconds.
    ///
    /// The fetch is awaited inside this task, so cancelling the loop cancels
    /// the in-flight request as well — no snapshot request survives the screen.
    func startAutoRefresh() {
        loopTask?.cancel()
        loopTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.fetch()
                do {
                    try await Task.sleep(nanoseconds: UInt64(CameraPreviewViewModel.refreshInterval * 1_000_000_000))
                } catch {
                    // Cancelled while sleeping: stop fetching.
                    return
                }
            }
        }
    }

    func stopAutoRefresh() {
        loopTask?.cancel()
        loopTask = nil
    }

    /// Manual refresh: restarting the loop replaces the frame immediately.
    func refreshNow() {
        startAutoRefresh()
    }

    // MARK: - Fetching

    private func fetch() async {
        isLoading = true
        defer { isLoading = false }

        do {
            // Raw JPEG bytes; `cameraSnapshot` is the only non-JSON camera route.
            let data = try await APIClient.shared.cameraSnapshot(id: cameraID)
            guard !Task.isCancelled else { return }
            guard let decoded = UIImage(data: data) else {
                errorMessage = "The server returned data that is not a JPEG image."
                return
            }
            image = decoded
            fetchedAt = Date()
            errorMessage = nil
        } catch let error as APIError {
            // A cancelled request is not a camera failure worth showing.
            if error != .cancelled, !Task.isCancelled {
                // 500 is `{"detail":"Snapshot failed: …"}` and 502 is
                // `{"detail":"No frame from camera"}`; `APIError` already
                // carries that detail as its message.
                errorMessage = error.localizedDescription
            }
        } catch {
            if !Task.isCancelled {
                errorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - Previews

#Preview {
    NavigationStack {
        CameraPreviewView(camera: .preview)
    }
    .environmentObject(AuthStore.preview())
}
