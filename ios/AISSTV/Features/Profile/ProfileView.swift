import SwiftUI

/// The signed-in user's own account screen.
///
/// Swift rewrite of `mobile/lib/screens/profile_screen.dart`, which showed only
/// a username, a role string and a sign-out button. This adds the details that
/// matter when something goes wrong in the field: the backend the app is
/// actually talking to, the biometry hardware present, and a change-password
/// form.
///
/// Two backend facts shape this screen and are stated in the UI itself:
///
/// * there is no revocation endpoint, so "Lock now" only clears the Keychain —
///   the 8-hour JWT stays valid server-side until it expires.
/// * `POST /auth/change-password` requires the **current** password and answers
///   204 with no body, so nothing is decoded from it.
struct ProfileView: View {

    @EnvironmentObject private var auth: AuthStore
    @StateObject private var model = ProfileViewModel()

    @State private var showingChangePassword = false
    @State private var showingLockConfirmation = false
    @State private var showingServerSettings = false

    var body: some View {
        List {
            if let message = model.actionError {
                Section {
                    ErrorBanner(message: message) { model.clearActionError() }
                        .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                        .listRowBackground(Color.clear)
                }
            }

            if let user = auth.currentUser {
                identitySection(user)
            } else {
                Section {
                    StatePlaceholder(
                        symbol: "person.crop.circle.badge.questionmark",
                        title: "No account loaded",
                        message: "Your session is no longer available. Sign in again to see your profile."
                    )
                    .listRowBackground(Color.clear)
                }
            }

            serverSection
            sessionSection
            securitySection
            diagnosticsSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Profile")
        .task { await model.loadHealth() }
        .sheet(isPresented: $showingChangePassword) {
            ChangePasswordSheet(model: model, username: auth.currentUser?.username)
        }
        .confirmationDialog(
            "Lock this app?",
            isPresented: $showingLockConfirmation,
            titleVisibility: .visible
        ) {
            Button("Lock now", role: .destructive) {
                // Clears the stored token and returns to the sign-in screen.
                // The server is not told: there is no revocation endpoint, so
                // the token itself remains valid until it expires.
                auth.logout()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The stored token is removed from the Keychain and you will need to sign in again. The server keeps the current token valid for the rest of its 8-hour lifetime — signing out is client-side only.")
        }
    }

    // MARK: - Identity

    private func identitySection(_ user: AppUser) -> some View {
        Section {
            HStack(alignment: .center, spacing: 14) {
                // `AvatarView` has a fixed default size; scale it up rather than
                // duplicating the component.
                AvatarView(initials: user.initials)
                    .scaleEffect(1.4)
                    .frame(width: 64, height: 64)

                VStack(alignment: .leading, spacing: 3) {
                    Text(user.displayName)
                        .font(.headline)
                    Text(user.username)
                        .font(.subheadline)
                        .fontDesign(.monospaced)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 6) {
                        StatusChip(style: Theme.roleStyle(user.role), compact: true)
                        StatusChip(style: Theme.userStyle(active: user.active), compact: true)
                    }
                    .padding(.top, 3)
                }
            }
            .padding(.vertical, 4)

            InfoRow(label: "Role value", value: user.role, monospacedValue: true)
            InfoRow(label: "Last login", value: Format.timestamp(user.lastLoginAt))
            InfoRow(label: "Created", value: Format.timestamp(user.createdAt))
            InfoRow(label: "Account ID", value: user.id, monospacedValue: true)
        } header: {
            Text("Signed in as")
        } footer: {
            Text("“Role value” is what the server stores. It is an exact, case-sensitive string — `Admin` and `admin` are different roles to the backend.")
        }
    }

    // MARK: - Server

    private var serverSection: some View {
        Section {
            Text(ServerSettings.summary)
                .font(.footnote)
                .fontDesign(.monospaced)
                .textSelection(.enabled)
                .foregroundStyle(.primary)

            Button {
                showingServerSettings = true
            } label: {
                Label("Change server address", systemImage: "network")
            }
        } header: {
            Text("Backend")
        } footer: {
            Text(
                ServerSettings.hasOverride
                ? "Set on this device. Clear it to fall back to the built-in address (\(ServerSettings.builtIn.absoluteString))."
                : "From the AISSTV_API_BASE_URL build setting. The app talks to this address directly, with no /api prefix."
            )
        }
        .sheet(isPresented: $showingServerSettings) {
            ServerSettingsView()
        }
    }

    // MARK: - Session

    private var sessionSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: auth.biometrySymbol)
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(auth.biometryLabel)
                    Text(auth.biometricsAvailable
                         ? "Used to unlock the saved session at launch."
                         : "Not available on this device; the app falls back to a password sign-in.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            InfoRow(label: "Saved session", value: auth.hasStoredSession ? "Yes" : "No")
            InfoRow(label: "Can review", value: auth.canReview ? "Yes" : "No")
            InfoRow(label: "Administrator", value: auth.isAdmin ? "Yes" : "No")

            Button(role: .destructive) {
                showingLockConfirmation = true
            } label: {
                Label("Lock now", systemImage: "lock.fill")
            }
        } header: {
            Text("Session")
        } footer: {
            Text("The server issues an 8-hour JWT and exposes no revocation endpoint, so locking removes the token from this device only. Anyone holding a copy of it can still use it until it expires.")
        }
    }

    // MARK: - Security

    private var securitySection: some View {
        Section {
            Button {
                showingChangePassword = true
            } label: {
                Label("Change password", systemImage: "key.fill")
            }
            .disabled(auth.currentUser == nil)
        } header: {
            Text("Security")
        } footer: {
            Text("Your current password is required. Changing it does not sign you out.")
        }
    }

    // MARK: - Diagnostics

    private var diagnosticsSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: healthSymbol)
                    .foregroundStyle(healthColor)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.healthStatus ?? "Not checked")
                    if let database = model.healthDatabase {
                        Text("Database: \(database ? "reachable" : "unreachable")")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                if model.isCheckingHealth {
                    ProgressView()
                } else {
                    Button("Check") {
                        Task { await model.loadHealth() }
                    }
                    .font(.caption.weight(.medium))
                }
            }

            if let message = model.healthError {
                Text(message)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Diagnostics")
        } footer: {
            Text("GET /health is unauthenticated and always answers HTTP 200, even when the database is down — the `db` flag is what actually matters.")
        }
    }

    private var healthSymbol: String {
        guard let status = model.healthStatus else { return "questionmark.circle" }
        if model.healthDatabase == false { return "exclamationmark.triangle.fill" }
        return status.lowercased() == "ok" ? "checkmark.circle.fill" : "questionmark.circle"
    }

    private var healthColor: Color {
        guard let status = model.healthStatus else { return Color.secondary }
        if model.healthDatabase == false { return Color.orange }
        return status.lowercased() == "ok" ? Color.green : Color.secondary
    }
}

// MARK: - Change password

/// Collects the current password plus a confirmed replacement.
///
/// The only reliable way to know whether the old password was right is the
/// server's 400 "Old password is incorrect", so the form validates the parts it
/// can locally and lets the backend own the rest.
private struct ChangePasswordSheet: View {

    @ObservedObject var model: ProfileViewModel
    let username: String?

    @Environment(\.dismiss) private var dismiss

    @State private var oldPassword = ""
    @State private var newPassword = ""
    @State private var confirmation = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var successMessage: String?

    /// bcrypt only reads the first 72 bytes of a password; beyond that the extra
    /// characters are silently ignored (and some server configurations reject
    /// the request outright).
    private static let bcryptByteLimit = 72

    private var newPasswordBytes: Int { newPassword.utf8.count }

    private var isTooLong: Bool { newPasswordBytes > Self.bcryptByteLimit }

    private var canSave: Bool {
        !isSaving && !oldPassword.isEmpty && !newPassword.isEmpty && !confirmation.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                if let successMessage {
                    Section {
                        Label(successMessage, systemImage: "checkmark.seal.fill")
                            .font(.footnote)
                            .foregroundStyle(.green)
                    }
                }

                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage)
                    }
                }

                Section("Current") {
                    FormTextField(
                        label: "Current password",
                        text: $oldPassword,
                        prompt: "Required by the server",
                        isSecure: true
                    )
                }

                Section {
                    FormTextField(
                        label: "New password",
                        text: $newPassword,
                        prompt: "New password",
                        isSecure: true
                    )
                    FormTextField(
                        label: "Confirm new password",
                        text: $confirmation,
                        prompt: "Repeat the new password",
                        isSecure: true
                    )

                    if isTooLong {
                        Label(
                            "\(newPasswordBytes) bytes. bcrypt only uses the first \(Self.bcryptByteLimit), so the rest is ignored — shorten the password.",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .font(.caption2)
                        .foregroundStyle(.orange)
                    }
                } header: {
                    Text("New password")
                } footer: {
                    Text("Signing in again is not required after a change, and this screen cannot change anyone else's password.")
                }
            }
            .navigationTitle("Change password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("Save")
                        }
                    }
                    .disabled(!canSave)
                }
            }
        }
    }

    private func save() async {
        guard !isSaving else { return }
        successMessage = nil
        errorMessage = nil

        // Client-side checks: the server re-validates, but there is no reason to
        // spend a round trip on an obviously bad form.
        guard !newPassword.isEmpty else {
            errorMessage = "Enter a new password."
            return
        }
        guard newPassword == confirmation else {
            errorMessage = "The new password and its confirmation do not match."
            return
        }
        guard newPassword != oldPassword else {
            errorMessage = "The new password must be different from the current one."
            return
        }

        isSaving = true
        do {
            // Answers 204 with no body; the endpoint wrapper returns Void.
            try await model.changePassword(oldPassword: oldPassword, newPassword: newPassword)
            oldPassword = ""
            newPassword = ""
            confirmation = ""
            successMessage = username.map { "Password changed for \($0)." } ?? "Password changed."
        } catch {
            errorMessage = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
        isSaving = false
    }
}

// MARK: - View model

@MainActor
final class ProfileViewModel: ObservableObject {

    // MARK: Health

    @Published private(set) var healthStatus: String?
    @Published private(set) var healthDatabase: Bool?
    @Published private(set) var isCheckingHealth = false
    @Published private(set) var healthError: String?

    // MARK: Actions

    @Published var actionError: String?

    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    /// `GET /health` is unauthenticated and **always answers 200**, so a
    /// transport failure is only reported for a genuinely unreachable server;
    /// the `db` flag is the real signal.
    func loadHealth() async {
        guard !isCheckingHealth else { return }
        isCheckingHealth = true
        do {
            let health = try await client.health()
            healthStatus = health.status
            healthDatabase = health.db
            healthError = nil
        } catch {
            healthStatus = nil
            healthDatabase = nil
            healthError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
        isCheckingHealth = false
    }

    /// `POST /auth/change-password` — answers 204 and returns nothing to decode.
    ///
    /// Errors are left to the caller: `ChangePasswordSheet` owns the inline
    /// message so the failure appears next to the fields that caused it.
    func changePassword(oldPassword: String, newPassword: String) async throws {
        try await client.changePassword(oldPassword: oldPassword, newPassword: newPassword)
    }
}

/// `AuthStore.preview(user:)` only exists in DEBUG, so the previews are gated to
/// match.
#if DEBUG
#Preview("Administrator") {
    NavigationStack {
        ProfileView()
    }
    .environmentObject(AuthStore.preview())
}

#Preview("Viewer") {
    NavigationStack {
        ProfileView()
    }
    .environmentObject(
        AuthStore.preview(
            user: AppUser(
                id: "00000000-0000-0000-0000-000000000002",
                username: "viewer",
                fullName: "Sara Bekele",
                role: "viewer",
                active: true,
                lastLoginAt: Date(),
                createdAt: Date()
            )
        )
    )
}
#endif
