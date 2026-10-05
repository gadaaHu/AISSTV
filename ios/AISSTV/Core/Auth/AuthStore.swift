import Foundation
import SwiftUI

/// Owns the session: the Keychain token, the current user, and the auth state
/// machine that drives root navigation.
///
/// The flow mirrors the Flutter client (`mobile/lib/providers/auth_provider.dart`):
/// on launch, a stored token is unlocked with Face ID; a failed prompt leaves
/// the user on the sign-in screen with a retry option rather than silently
/// discarding the session.
@MainActor
final class AuthStore: ObservableObject {

    enum State: Equatable {
        /// Still restoring a session — show the splash screen.
        case unknown
        case unauthenticated(error: String?, canRetryBiometrics: Bool)
        case authenticated(AppUser)
    }

    @Published private(set) var state: State = .unknown

    private let client: APIClient
    private let tokenStore: KeychainStore

    init(client: APIClient = .shared, tokenStore: KeychainStore = KeychainStore()) {
        self.client = client
        self.tokenStore = tokenStore
        // Any 401 from anywhere in the app ends the session.
        client.unauthorizedHandler = { [weak self] in
            self?.handleSessionExpired()
        }
    }

    // MARK: - Derived state

    var currentUser: AppUser? {
        if case .authenticated(let user) = state { return user }
        return nil
    }

    var isAdmin: Bool { currentUser?.isAdmin == true }
    var canReview: Bool { currentUser?.canReview == true }

    var biometricsAvailable: Bool { BiometricAuthenticator.isAvailable }

    var biometryLabel: String { BiometricAuthenticator.kind.label }

    var biometrySymbol: String { BiometricAuthenticator.kind.symbolName }

    /// A session exists in the Keychain and could be unlocked again.
    var hasStoredSession: Bool { tokenStore.hasToken }

    // MARK: - Lifecycle

    /// Restores a stored session at launch, gating it behind biometrics.
    ///
    /// Safe to call more than once: it is a no-op once the state has moved past
    /// `.unknown`, so a re-appearing root view cannot re-prompt for Face ID.
    func bootstrap() async {
        guard case .unknown = state else { return }

        guard tokenStore.hasToken else {
            state = .unauthenticated(error: nil, canRetryBiometrics: false)
            return
        }

        if BiometricAuthenticator.isAvailable {
            let unlocked = (try? await BiometricAuthenticator.authenticate(
                reason: "Unlock AISSTV to resume your saved session."
            )) ?? false

            guard unlocked else {
                state = .unauthenticated(error: nil, canRetryBiometrics: true)
                return
            }
        }

        await loadCurrentUser(clearingTokenOnFailure: true)
    }

    /// Retries the biometric prompt for a stored session.
    func unlockWithBiometrics() async {
        guard tokenStore.hasToken else {
            state = .unauthenticated(
                error: "Sign in with your password to enable \(biometryLabel).",
                canRetryBiometrics: false
            )
            return
        }
        guard BiometricAuthenticator.isAvailable else {
            state = .unauthenticated(
                error: "\(biometryLabel) is not available on this device.",
                canRetryBiometrics: false
            )
            return
        }

        do {
            let unlocked = try await BiometricAuthenticator.authenticate(
                reason: "Unlock AISSTV to resume your saved session."
            )
            guard unlocked else {
                state = .unauthenticated(error: nil, canRetryBiometrics: true)
                return
            }
            await loadCurrentUser(clearingTokenOnFailure: true)
        } catch {
            state = .unauthenticated(error: error.localizedDescription, canRetryBiometrics: true)
        }
    }

    /// Signs in with a username and password.
    ///
    /// Throws so the login screen can surface the failure inline while the
    /// store also records it in `state`.
    func login(username: String, password: String) async throws {
        do {
            let token = try await client.login(username: username, password: password)
            try tokenStore.saveToken(token.accessToken)
            await loadCurrentUser(clearingTokenOnFailure: true)
        } catch {
            let message = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            state = .unauthenticated(error: message, canRetryBiometrics: false)
            throw error
        }
    }

    func logout() {
        tokenStore.clearToken()
        state = .unauthenticated(error: nil, canRetryBiometrics: false)
    }

    /// Called when the backend rejects the stored token (401 from any request).
    func handleSessionExpired() {
        guard case .authenticated = state else { return }
        AppLog.auth.notice("Session expired; clearing stored token")
        tokenStore.clearToken()
        state = .unauthenticated(error: "Your session expired. Please sign in again.", canRetryBiometrics: false)
    }

    /// Refreshes the cached profile, e.g. after changing your own password.
    func refreshCurrentUser() async {
        await loadCurrentUser(clearingTokenOnFailure: false)
    }

    // MARK: - Private

    private func loadCurrentUser(clearingTokenOnFailure: Bool) async {
        do {
            let user = try await client.me()
            state = .authenticated(user)
        } catch {
            if clearingTokenOnFailure {
                tokenStore.clearToken()
            }
            let message = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            state = .unauthenticated(error: message, canRetryBiometrics: false)
            AppLog.auth.warning("Failed to load the current user: \(message)")
        }
    }
}

// NOTE: deliberately not wrapped in `#if DEBUG`.
//
// The `#Preview` macro is compiled in every build configuration, so a preview
// that calls `AuthStore.preview()` would fail a Release build if this factory
// only existed in Debug. Keeping it unconditional makes previews safe
// regardless of whether an individual `#Preview` is DEBUG-gated.
extension AuthStore {
    /// A store already signed in as `user`, for SwiftUI previews.
    static func preview(user: AppUser = .preview) -> AuthStore {
        let store = AuthStore()
        store.state = .authenticated(user)
        return store
    }

    /// A store with no session, for previewing the sign-in or splash screens.
    static func previewSignedOut() -> AuthStore {
        let store = AuthStore()
        store.state = .unauthenticated(error: nil, canRetryBiometrics: false)
        return store
    }
}
