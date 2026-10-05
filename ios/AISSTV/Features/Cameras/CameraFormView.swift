import Foundation
import SwiftUI

/// Create (`POST /cameras`) or edit (`PATCH /cameras/{id}`) one camera.
///
/// Mirrors `mobile/lib/screens/camera_form_screen.dart`. The backend restricts
/// both routes to administrators; this screen is presented from the admin-only
/// "Add" / "Edit" affordances in `CamerasView`.
struct CameraFormView: View {

    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @StateObject private var viewModel: CameraFormViewModel

    /// Called after a successful save so the list can reload immediately
    /// instead of waiting for its next poll.
    private let onSaved: () -> Void

    /// `existing == nil` creates a camera; otherwise the camera is edited and
    /// its identifier is immutable.
    init(existing: Camera?, onSaved: @escaping () -> Void = {}) {
        _viewModel = StateObject(wrappedValue: CameraFormViewModel(existing: existing))
        self.onSaved = onSaved
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !auth.isAdmin {
                    ErrorBanner(message: "Only administrators can create or change cameras. The server will reject this save.")
                }

                if let message = viewModel.actionError {
                    ErrorBanner(message: message) { viewModel.actionError = nil }
                }

                basicSection
                connectionSection
                processingSection
                metadataSection
                testSection
                saveSection
            }
            .padding(Theme.contentPadding)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(viewModel.isEdit ? "Edit camera" : "New camera")
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .disabled(viewModel.isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }
                    .disabled(!viewModel.canSave || viewModel.isSaving)
            }
        }
    }

    // MARK: - Sections

    private var basicSection: some View {
        SectionCard(title: "Basic information") {
            VStack(alignment: .leading, spacing: 14) {
                if viewModel.isEdit {
                    // The identifier is the primary key and appears in every
                    // log line, so it is shown but never editable.
                    InfoRow(label: "Camera ID", value: viewModel.cameraID, monospacedValue: true)
                    Text("The identifier cannot be changed after the camera is created.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    FormTextField(
                        label: "Camera ID",
                        text: $viewModel.cameraID,
                        prompt: "e.g. cam_front_01",
                        autocapitalization: .never
                    )
                    Text("2–64 characters: letters, digits, “_” or “-” (^[a-zA-Z0-9_-]{2,64}$).")
                        .font(.caption2)
                        .foregroundStyle(viewModel.isCameraIDValid ? Color.secondary : Color.red)
                }

                FormTextField(label: "Name", text: $viewModel.name, prompt: "e.g. Main entrance")
                FormTextField(
                    label: "Zone",
                    text: $viewModel.zone,
                    prompt: "e.g. main-entrance",
                    autocapitalization: .never
                )
                FormTextField(label: "Site", text: $viewModel.site, prompt: "Optional, e.g. HQ")
            }
        }
    }

    private var connectionSection: some View {
        SectionCard(title: "Connection") {
            VStack(alignment: .leading, spacing: 14) {
                FormTextField(
                    label: "Stream URL",
                    text: $viewModel.url,
                    prompt: "rtsp://192.168.1.100:554/stream1",
                    keyboard: .URL,
                    autocapitalization: .never
                )

                VStack(alignment: .leading, spacing: 6) {
                    Text("RTSP transport")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.secondary)
                    Picker("RTSP transport", selection: $viewModel.rtspTransport) {
                        Text("TCP").tag("tcp")
                        Text("UDP").tag("udp")
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }

                FormTextField(
                    label: "Username",
                    text: $viewModel.username,
                    prompt: "Optional stream user",
                    autocapitalization: .never
                )
                FormTextField(
                    label: "Password",
                    text: $viewModel.password,
                    prompt: viewModel.isEdit ? "Leave blank to keep the stored password" : "Optional stream password",
                    isSecure: true
                )

                if viewModel.isEdit {
                    Text("Leaving the password blank keeps the stored one. Enter a value only to replace it.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var processingSection: some View {
        SectionCard(title: "AI processing") {
            VStack(alignment: .leading, spacing: 14) {
                FormToggle(
                    label: "AI detection enabled",
                    isOn: $viewModel.enabled,
                    caption: "Process frames from this camera for face recognition."
                )
                FormTextField(
                    label: "Processing FPS",
                    text: $viewModel.fpsProcess,
                    prompt: "3",
                    keyboard: .decimalPad
                )
                FormTextField(
                    label: "Detection confidence",
                    text: $viewModel.detectionConfidence,
                    prompt: "0.45",
                    keyboard: .decimalPad
                )
                FormTextField(
                    label: "Face match threshold",
                    text: $viewModel.faceThreshold,
                    prompt: "0.45",
                    keyboard: .decimalPad
                )
                FormToggle(
                    label: "Save snapshots",
                    isOn: $viewModel.saveSnapshots,
                    caption: "Store a JPEG alongside each detected event."
                )
            }
        }
    }

    private var metadataSection: some View {
        SectionCard(title: "Metadata") {
            VStack(alignment: .leading, spacing: 14) {
                FormTextField(
                    label: "Tags",
                    text: $viewModel.tags,
                    prompt: "Comma separated, e.g. entrance, hq",
                    autocapitalization: .never
                )
                if !viewModel.parsedTags.isEmpty {
                    Text("Tags: \(viewModel.parsedTags.joined(separator: ", "))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                FormTextField(label: "Notes", text: $viewModel.notes, prompt: "Optional free text")
            }
        }
    }

    private var testSection: some View {
        SectionCard(title: "Connection test") {
            VStack(alignment: .leading, spacing: 12) {
                Text(viewModel.testHint)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    runTest()
                } label: {
                    HStack(spacing: 8) {
                        if viewModel.isTesting {
                            ProgressView()
                                .controlSize(.small)
                        }
                        Text(viewModel.isTesting ? "Testing… (can take 10 s)" : "Test connection")
                    }
                }
                .buttonStyle(.bordered)
                .disabled(!viewModel.canTest || viewModel.isTesting)

                if let result = viewModel.testResult {
                    FormProbeResultView(result: result)
                }
            }
        }
    }

    private var saveSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                save()
            } label: {
                HStack {
                    if viewModel.isSaving {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                    }
                    Text(viewModel.isSaving ? "Saving…" : "Save camera")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!viewModel.canSave || viewModel.isSaving)

            ForEach(viewModel.validationIssues, id: \.self) { issue in
                Label(issue, systemImage: "exclamationmark.circle")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Actions

    private func save() {
        guard viewModel.canSave, !viewModel.isSaving else { return }
        Task {
            if await viewModel.save() {
                onSaved()
                dismiss()
            }
        }
    }

    private func runTest() {
        Task { await viewModel.testConnection() }
    }
}

// MARK: - Probe result

/// Create mode probes the URL typed above (`POST /cameras/test-url`); edit mode
/// probes the camera as stored (`POST /cameras/{id}/test`). Both answer HTTP 200
/// even when the stream fails, so `result.ok` decides what is shown.
private struct FormProbeResultView: View {

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
final class CameraFormViewModel: ObservableObject {

    /// The identifier the client must match. The server rejects anything else.
    static let cameraIDPattern = "^[a-zA-Z0-9_-]{2,64}$"

    /// `nil` means create mode.
    let existing: Camera?

    @Published var cameraID: String
    @Published var name: String
    @Published var zone: String
    @Published var site: String
    @Published var url: String
    @Published var rtspTransport: String
    @Published var username: String
    @Published var password: String
    @Published var enabled: Bool
    @Published var fpsProcess: String
    @Published var detectionConfidence: String
    @Published var faceThreshold: String
    @Published var saveSnapshots: Bool
    @Published var tags: String
    @Published var notes: String

    @Published private(set) var isSaving = false
    @Published private(set) var isTesting = false
    @Published private(set) var testResult: CameraTestResult?
    @Published var actionError: String?

    var isEdit: Bool { existing != nil }

    init(existing: Camera?) {
        self.existing = existing
        self.cameraID = existing?.id ?? ""
        self.name = existing?.name ?? ""
        self.zone = existing?.zone ?? ""
        self.site = existing?.site ?? ""
        self.url = existing?.url ?? ""
        self.rtspTransport = existing?.rtspTransport ?? "tcp"
        self.username = existing?.username ?? ""
        // The API never returns a password, so the field always starts empty.
        self.password = ""
        self.enabled = existing?.enabled ?? true
        self.fpsProcess = CameraFormViewModel.numberText(existing?.fpsProcess ?? 3)
        self.detectionConfidence = CameraFormViewModel.numberText(existing?.detectionConfidence ?? 0.45)
        self.faceThreshold = CameraFormViewModel.numberText(existing?.faceThreshold ?? 0.45)
        self.saveSnapshots = existing?.saveSnapshots ?? false
        self.tags = (existing?.tags ?? []).joined(separator: ", ")
        self.notes = existing?.notes ?? ""
    }

    // MARK: - Derived values

    var trimmedID: String { cameraID.trimmingCharacters(in: .whitespacesAndNewlines) }
    var trimmedZone: String { zone.trimmingCharacters(in: .whitespacesAndNewlines) }
    var trimmedURL: String { url.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedSite: String { site.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedUsername: String { username.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedNotes: String { notes.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedPassword: String { password.trimmingCharacters(in: .whitespaces) }

    var isCameraIDValid: Bool {
        trimmedID.range(of: Self.cameraIDPattern, options: .regularExpression) != nil
    }

    var parsedTags: [String] {
        tags.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    /// Empty numeric fields fall back to the model defaults; anything that is
    /// typed must parse, so a typo can never be sent as the default.
    var fpsValue: Double { parse(fpsProcess) ?? 3 }
    var detectionConfidenceValue: Double { parse(detectionConfidence) ?? 0.45 }
    var faceThresholdValue: Double { parse(faceThreshold) ?? 0.45 }

    /// Everything that still blocks saving, in the order the fields appear.
    var validationIssues: [String] {
        var issues: [String] = []
        if !isEdit, !isCameraIDValid {
            issues.append("Camera ID must be 2–64 characters using letters, digits, “_” or “-”.")
        }
        if trimmedZone.isEmpty {
            issues.append("Zone is required.")
        }
        if trimmedURL.isEmpty {
            issues.append("Stream URL is required.")
        }
        if !isValidFPS {
            issues.append("Processing FPS must be a number greater than 0.")
        }
        if !isValidProbability(detectionConfidence) {
            issues.append("Detection confidence must be a number between 0 and 1.")
        }
        if !isValidProbability(faceThreshold) {
            issues.append("Face match threshold must be a number between 0 and 1.")
        }
        return issues
    }

    var canSave: Bool { validationIssues.isEmpty }

    /// Editing probes the stored camera, so only create mode needs a URL here.
    var canTest: Bool { isEdit || !trimmedURL.isEmpty }

    var testHint: String {
        if isEdit {
            return "Probes the camera as saved on the server (POST /cameras/{id}/test). Save your changes first to probe new values."
        }
        return "Probes the URL entered above (POST /cameras/test-url)."
    }

    // MARK: - Actions

    /// Saves the camera. Returns `true` on success so the caller can dismiss.
    func save() async -> Bool {
        guard canSave, !isSaving else { return false }

        isSaving = true
        actionError = nil
        defer { isSaving = false }

        do {
            if let existing = existing {
                let update = CameraUpdate(
                    name: trimmedName.isEmpty ? nil : trimmedName,
                    zone: trimmedZone,
                    site: trimmedSite.isEmpty ? nil : trimmedSite,
                    url: trimmedURL,
                    rtspTransport: rtspTransport,
                    username: trimmedUsername.isEmpty ? nil : trimmedUsername,
                    // PATCH /cameras/{id} is the one camera endpoint that would
                    // honour an explicit `null` to clear a stored password,
                    // because the server does not apply `exclude_none` here.
                    // `CameraUpdate`'s synthesized encoder omits `nil`
                    // properties instead, so passing `nil` for an untouched
                    // field keeps the stored password — which is what the blank
                    // password field promises. Sending the empty string would
                    // blank it.
                    password: nil,
                    enabled: enabled,
                    fpsProcess: fpsValue,
                    detectionConfidence: detectionConfidenceValue,
                    faceThreshold: faceThresholdValue,
                    saveSnapshots: saveSnapshots,
                    tags: parsedTags,
                    notes: trimmedNotes.isEmpty ? nil : trimmedNotes
                )
                _ = try await APIClient.shared.updateCamera(id: existing.id, update)
            } else {
                let create = CameraCreate(
                    id: trimmedID,
                    name: trimmedName,
                    zone: trimmedZone,
                    site: trimmedSite.isEmpty ? nil : trimmedSite,
                    url: trimmedURL,
                    rtspTransport: rtspTransport,
                    username: trimmedUsername.isEmpty ? nil : trimmedUsername,
                    password: trimmedPassword.isEmpty ? nil : trimmedPassword,
                    enabled: enabled,
                    fpsProcess: fpsValue,
                    detectionConfidence: detectionConfidenceValue,
                    faceThreshold: faceThresholdValue,
                    saveSnapshots: saveSnapshots,
                    tags: parsedTags,
                    notes: trimmedNotes.isEmpty ? nil : trimmedNotes
                )
                _ = try await APIClient.shared.createCamera(create)
            }
            return true
        } catch {
            actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            return false
        }
    }

    /// Probes the camera. Also answers 200 on failure, so `testResult.ok` is
    /// what the UI must read.
    func testConnection() async {
        guard canTest, !isTesting else { return }

        isTesting = true
        actionError = nil
        testResult = nil
        defer { isTesting = false }

        do {
            if let existing = existing {
                testResult = try await APIClient.shared.testCamera(id: existing.id)
            } else {
                testResult = try await APIClient.shared.testCameraURL(
                    CameraTestURLRequest(url: trimmedURL, rtspTransport: rtspTransport)
                )
            }
        } catch {
            actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
    }

    // MARK: - Helpers

    private func parse(_ text: String) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return Double(trimmed)
    }

    private var isValidFPS: Bool {
        if let value = parse(fpsProcess) { return value > 0 }
        return true
    }

    private func isValidProbability(_ text: String) -> Bool {
        if let value = parse(text) { return value >= 0 && value <= 1 }
        return true
    }

    private static func numberText(_ value: Double) -> String {
        if value.rounded() == value {
            return String(Int(value))
        }
        return String(format: "%g", value)
    }
}

// MARK: - Previews

#Preview("Create") {
    NavigationStack {
        CameraFormView(existing: nil)
    }
    .environmentObject(AuthStore.preview())
}

#Preview("Edit") {
    NavigationStack {
        CameraFormView(existing: .preview)
    }
    .environmentObject(AuthStore.preview())
}
