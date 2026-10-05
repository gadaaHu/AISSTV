import Foundation

/// Central configuration for the app.
///
/// The backend base URL is resolved by `ServerSettings`, which layers a runtime
/// override (set in the app, kept in `UserDefaults`) over the
/// `AISSTV_API_BASE_URL` build setting. Change the built-in value in Xcode under
/// *Target ▸ Build Settings* (per-configuration if you like), or override it for
/// one run with the `AISSTV_API_BASE_URL` environment variable in the scheme.
///
/// Note: the FastAPI app serves its routes at the root — there is **no** `/api`
/// prefix. The web frontend only sees `/api` because nginx rewrites it.
enum AppConfig {

    /// Backend root in use right now, with no trailing slash. Computed, so a
    /// change made in the app is picked up by the next request.
    static var apiBaseURL: URL { ServerSettings.current }

    /// Timeout for a single request, matching the Flutter client.
    static let requestTimeout: TimeInterval = 15

    /// Default refresh cadence for dashboard and list screens.
    static let pollInterval: TimeInterval = 15
}
