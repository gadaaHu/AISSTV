import SwiftUI

/// Lets the backend address be changed on the device.
///
/// This is reachable from the sign-in screen on purpose: if the address is
/// wrong the user cannot authenticate, so anything behind the login would be
/// unreachable exactly when it is needed.
struct ServerSettingsView: View {

    @Environment(\.dismiss) private var dismiss

    /// The address being edited. Empty means "use the built-in address".
    @State private var text: String = ""
    @State private var isTesting = false
    @State private var outcome: TestOutcome?
    @State private var errorMessage: String?

    private enum TestOutcome {
        case reachable(String)
        case unreachable(String)
    }

    private var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The typed address, or `nil` when the field is empty or unusable.
    private var parsedAddress: URL? {
        ServerSettings.normalise(text)
    }

    /// An empty field is valid: it means "clear the override".
    private var canSave: Bool {
        trimmedText.isEmpty || parsedAddress != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                currentSection
                addressSection
                checkSection
                helpSection
            }
            .navigationTitle("Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(!canSave)
                }
            }
            .onAppear {
                if text.isEmpty, let override = ServerSettings.overrideURL {
                    text = override.absoluteString
                }
            }
        }
    }

    // MARK: - Sections

    private var currentSection: some View {
        Section("In use") {
            LabeledContent("Address") {
                Text(ServerSettings.summary)
                    .font(.footnote.monospaced())
                    .multilineTextAlignment(.trailing)
                    .textSelection(.enabled)
            }
            LabeledContent("Source") {
                Text(ServerSettings.hasOverride ? "Set on this device" : "Built in")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var addressSection: some View {
        Section {
            TextField("192.168.1.20:8000", text: $text)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.body.monospaced())

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            Button("Use the built-in address") {
                ServerSettings.clearOverride()
                text = ""
                outcome = nil
                errorMessage = nil
            }
            .disabled(!ServerSettings.hasOverride)
        } header: {
            Text("Server address")
        } footer: {
            Text(
                "Leave this empty to keep the address compiled into the app "
                + "(\(ServerSettings.builtIn.absoluteString)). "
                + "A phone cannot reach the Mac's localhost, so use the Mac's "
                + "address on your network when running on a real device."
            )
        }
    }

    private var checkSection: some View {
        Section {
            Button {
                Task { await test() }
            } label: {
                HStack {
                    if isTesting {
                        ProgressView().controlSize(.small)
                    }
                    Text(isTesting ? "Testing…" : "Test connection")
                }
            }
            .disabled(isTesting || parsedAddress == nil)

            if let outcome {
                switch outcome {
                case .reachable(let message):
                    Label(message, systemImage: "checkmark.seal.fill")
                        .font(.footnote)
                        .foregroundStyle(.green)
                case .unreachable(let message):
                    Label(message, systemImage: "xmark.seal.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
        } header: {
            Text("Check")
        } footer: {
            Text("Tests the address above without saving it. The health endpoint needs no sign-in.")
        }
    }

    private var helpSection: some View {
        // The font is applied per row rather than to the `Section`: a modifier
        // applied to a Section wraps it, which can stop `Form` treating it as a
        // section.
        Section("Where to find the address") {
            Text("• Simulator: http://localhost:8000 works, because it shares the Mac's network.")
                .font(.footnote)
            Text("• Device: use the Mac's LAN address, for example http://192.168.1.20:8000.")
                .font(.footnote)
            Text("• On the Mac, run `ipconfig getifaddr en0`, or open System Settings ▸ Wi-Fi ▸ Details.")
                .font(.footnote)
            Text("• The backend must be listening on 0.0.0.0, not only 127.0.0.1.")
                .font(.footnote)
        }
    }

    // MARK: - Actions

    private func save() {
        if trimmedText.isEmpty {
            ServerSettings.clearOverride()
            dismiss()
            return
        }
        guard let url = parsedAddress else {
            errorMessage = "Enter an address such as 192.168.1.20:8000 or https://api.example.com"
            return
        }
        if url == ServerSettings.builtIn {
            ServerSettings.clearOverride()
        } else {
            ServerSettings.overrideURL = url
        }
        dismiss()
    }

    private func test() async {
        guard let candidate = parsedAddress else {
            errorMessage = "Enter an address such as 192.168.1.20:8000 or https://api.example.com"
            return
        }
        errorMessage = nil
        outcome = nil
        isTesting = true

        // Probe a client bound to the *typed* address so the field can be
        // checked before it is saved.
        let probe = APIClient(baseURLProvider: { candidate })
        do {
            let health = try await probe.health()
            if health.db == true {
                outcome = .reachable(
                    "Reachable — \(health.status), database connected (env \(health.env ?? "unknown"))"
                )
            } else {
                // /health answers 200 even when the database is down, so the
                // `db` flag is what actually decides this.
                outcome = .unreachable(
                    "Server answered, but its database is not reachable (\(health.status))"
                )
            }
        } catch {
            let message = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            outcome = .unreachable(message)
        }
        isTesting = false
    }
}

#Preview {
    ServerSettingsView()
}
