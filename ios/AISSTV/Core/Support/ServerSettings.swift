import Foundation

/// Which backend the app talks to.
///
/// Resolution order, highest priority first:
///
/// 1. an address the user typed into the app, persisted in `UserDefaults`
/// 2. the `AISSTV_API_BASE_URL` environment variable (useful per Xcode scheme)
/// 3. the `AISSTVAPIBaseURL` Info.plist value, i.e. the build setting
/// 4. a localhost default
///
/// A *runtime* override exists because a build-time constant cannot cover every
/// way the app is run. A physical iPhone cannot reach the Mac's `localhost`, and
/// rebuilding (or editing the scheme) just to change a server address is a poor
/// loop while testing on a device. It also means the address can be fixed from
/// the sign-in screen, before any session exists.
enum ServerSettings {

    /// `UserDefaults` key for the user-supplied address.
    static let overrideDefaultsKey = "AISSTV.serverURLOverride"

    // MARK: - Stored override

    /// The address the user set in the app, or `nil` to use the built-in one.
    static var overrideURL: URL? {
        get { normalise(UserDefaults.standard.string(forKey: overrideDefaultsKey)) }
        set {
            if let newValue {
                UserDefaults.standard.set(newValue.absoluteString, forKey: overrideDefaultsKey)
            } else {
                UserDefaults.standard.removeObject(forKey: overrideDefaultsKey)
            }
        }
    }

    static var hasOverride: Bool {
        normalise(UserDefaults.standard.string(forKey: overrideDefaultsKey)) != nil
    }

    /// Clears the override and falls back to the built-in address.
    static func clearOverride() {
        UserDefaults.standard.removeObject(forKey: overrideDefaultsKey)
    }

    // MARK: - Effective address

    /// The address to use right now. Read per request, so changing it takes
    /// effect immediately without restarting the app.
    static var current: URL {
        if let overrideURL { return overrideURL }
        if let url = normalise(ProcessInfo.processInfo.environment["AISSTV_API_BASE_URL"]) {
            return url
        }
        if let raw = Bundle.main.object(forInfoDictionaryKey: "AISSTVAPIBaseURL") as? String,
           let url = normalise(raw) {
            return url
        }
        return URL(string: "http://localhost:8000")!
    }

    /// The address compiled into the app, ignoring any runtime override.
    /// Shown in the UI as the thing you fall back to.
    static var builtIn: URL {
        if let url = normalise(ProcessInfo.processInfo.environment["AISSTV_API_BASE_URL"]) {
            return url
        }
        if let raw = Bundle.main.object(forInfoDictionaryKey: "AISSTVAPIBaseURL") as? String,
           let url = normalise(raw) {
            return url
        }
        return URL(string: "http://localhost:8000")!
    }

    // MARK: - Parsing

    /// Validates and normalises user input.
    ///
    /// Accepts `192.168.1.20:8000` as well as a full `http://…` URL, because
    /// typing the scheme is easy to forget on a phone keyboard. Returns `nil`
    /// for anything that is not a usable http(s) address.
    static func normalise(_ raw: String?) -> URL? {
        guard let raw else { return nil }
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        // An unexpanded build setting such as "$(AISSTV_API_BASE_URL)".
        guard !text.hasPrefix("$(") else { return nil }

        if !text.contains("://") {
            text = "http://" + text
        }
        while text.hasSuffix("/") {
            text.removeLast()
        }

        guard let url = URL(string: text),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host,
              !host.isEmpty
        else {
            return nil
        }
        return url
    }

    /// A one-line description for the UI, noting when an override is active.
    static var summary: String {
        hasOverride ? "\(current.absoluteString) (custom)" : current.absoluteString
    }
}
