import SwiftUI

/// Chooses the top-level screen from the authentication state, mirroring the
/// Flutter router's redirect logic: unknown → splash, unauthenticated → login,
/// authenticated → the tab shell.
struct RootView: View {

    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        switch auth.state {
        case .unknown:
            SplashView()

        case .unauthenticated(let error, let canRetryBiometrics):
            LoginView(
                initialError: error,
                showBiometricUnlock: canRetryBiometrics
            )

        case .authenticated:
            HomeShellView()
        }
    }
}

#Preview("Root") {
    RootView()
        .environmentObject(AuthStore())
}
