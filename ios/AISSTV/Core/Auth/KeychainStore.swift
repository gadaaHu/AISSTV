import Foundation
import Security

/// Stores the JWT in the iOS Keychain.
///
/// This deliberately does **not** use `UserDefaults`: the web client keeps its
/// token in `sessionStorage`, and the equivalent on iOS is a Keychain item
/// rather than a plist file that ends up in an unencrypted backup.
struct KeychainStore {

    enum KeychainError: LocalizedError {
        case encodingFailed
        case unexpectedStatus(OSStatus)

        var errorDescription: String? {
            switch self {
            case .encodingFailed:
                return "Could not encode the credential"
            case .unexpectedStatus(let status):
                return "Keychain error (OSStatus \(status))"
            }
        }
    }

    private let service: String
    private let account = "accessToken"

    init(service: String = "com.aisstv.attendance") {
        self.service = service
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    /// Saves (replacing any existing token) with `AfterFirstUnlock` so the
    /// session can still be refreshed while the device is locked but has been
    /// unlocked once since boot.
    func saveToken(_ token: String) throws {
        guard let data = token.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }

        var query = baseQuery
        SecItemDelete(query as CFDictionary)

        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    func readToken() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty
        else {
            return nil
        }
        return token
    }

    @discardableResult
    func clearToken() -> Bool {
        let status = SecItemDelete(baseQuery as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    var hasToken: Bool {
        readToken() != nil
    }
}
