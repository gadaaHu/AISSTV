import SwiftUI

/// Username / password sign-in, with a Face ID retry when a stored session
/// exists but the biometric prompt was cancelled or failed.
struct LoginView: View {

    @EnvironmentObject private var auth: AuthStore

    /// Error carried over from a failed bootstrap (e.g. an expired token).
    let initialError: String?
    /// True when a stored session exists and biometrics can be retried.
    let showBiometricUnlock: Bool

    @State private var username = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var isUnlocking = false
    @State private var showServerSettings = false
    @State private var localError: String?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case username
        case password
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                header

                if let message = localError ?? initialError {
                    ErrorBanner(message: message)
                }

                credentialsForm

                if showBiometricUnlock, auth.hasStoredSession {
                    biometricUnlockButton
                }

                serverFooter
            }
            .padding(Theme.contentPadding)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .scrollDismissesKeyboard(.interactively)
        .sheet(isPresented: $showServerSettings) {
            ServerSettingsView()
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(spacing: 10) {
            Image(systemName: "video.fill")
                .font(.system(size: 44))
                .foregroundStyle(Color.accentColor)
            Text("Sign in")
                .font(.title2.weight(.semibold))
            Text("Use the account your administrator created for you.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 12)
    }

    private var credentialsForm: some View {
        VStack(spacing: 14) {
            FormTextField(
                label: "Username",
                text: $username,
                prompt: "e.g. admin",
                autocapitalization: .never
            )
            .focused($focusedField, equals: .username)
            .submitLabel(.next)
            .onSubmit { focusedField = .password }

            FormTextField(
                label: "Password",
                text: $password,
                prompt: "Your password",
                isSecure: true
            )
            .focused($focusedField, equals: .password)
            .submitLabel(.go)
            .onSubmit { submit() }

            Button {
                submit()
            } label: {
                HStack {
                    if isSubmitting {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                    }
                    Text(isSubmitting ? "Signing in…" : "Sign in")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isSubmitting || username.isEmpty || password.isEmpty)

            #if DEBUG
            Text("Development build. The seeded backend account is admin / admin123 — change it before deploying.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            #endif
        }
    }

    private var biometricUnlockButton: some View {
        VStack(spacing: 8) {
            HStack {
                Rectangle().fill(.quaternary).frame(height: 1)
                Text("or").font(.caption).foregroundStyle(.secondary)
                Rectangle().fill(.quaternary).frame(height: 1)
            }

            Button {
                unlock()
            } label: {
                HStack {
                    if isUnlocking {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: auth.biometrySymbol)
                    }
                    Text("Unlock with \(auth.biometryLabel)")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(isUnlocking)
        }
    }

    /// Tappable so the address can be corrected before signing in — if it is
    /// wrong, nothing behind the login screen is reachable.
    private var serverFooter: some View {
        Button {
            showServerSettings = true
        } label: {
            VStack(spacing: 4) {
                Text("Server")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(AppConfig.apiBaseURL.absoluteString)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Text(ServerSettings.hasOverride ? "Changed on this device — tap to edit" : "Tap to change")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Actions

    private func submit() {
        guard !isSubmitting else { return }
        let trimmed = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !password.isEmpty else {
            localError = "Enter both your username and password."
            return
        }
        focusedField = nil
        Task { await signIn(username: trimmed) }
    }

    private func signIn(username trimmed: String) async {
        isSubmitting = true
        localError = nil
        do {
            try await auth.login(username: trimmed, password: password)
        } catch {
            localError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
        isSubmitting = false
    }

    private func unlock() {
        guard !isUnlocking else { return }
        isUnlocking = true
        localError = nil
        Task {
            await auth.unlockWithBiometrics()
            isUnlocking = false
        }
    }
}

#Preview {
    LoginView(initialError: nil, showBiometricUnlock: false)
        .environmentObject(AuthStore())
}
