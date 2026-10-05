import Foundation

/// The pagination envelope used by every list endpoint except
/// `/cameras`, `/events/cameras/list` and `/attendance/employee/{code}`,
/// which return bare arrays.
///
/// The backend exposes only `limit`/`offset` — there is no `page` or
/// `has_more`, so `hasMore` is derived from `total`.
struct Page<Item: Decodable>: Decodable {
    let items: [Item]
    let total: Int
    let limit: Int
    let offset: Int

    var hasMore: Bool { offset + items.count < total }

    private enum CodingKeys: String, CodingKey {
        case items, total, limit, offset
    }
}

/// `POST /auth/login` response.
struct TokenResponse: Decodable {
    let accessToken: String
    let tokenType: String?
    let expiresIn: Int?

    private enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
    }
}

/// `GET /auth/me` and the items of `GET /users`.
struct AppUser: Codable, Identifiable, Hashable {
    let id: String
    let username: String
    let fullName: String?
    let role: String
    let active: Bool
    let lastLoginAt: Date?
    let createdAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, username, role, active
        case fullName = "full_name"
        case lastLoginAt = "last_login_at"
        case createdAt = "created_at"
    }

    /// `require_role` on the server is a case-sensitive exact match, so these
    /// comparisons must not be case-insensitive either.
    var isAdmin: Bool { role == "admin" }
    var isManager: Bool { role == "manager" || isAdmin }
    var canReview: Bool { isManager }

    var displayName: String {
        if let fullName, !fullName.isEmpty { return fullName }
        return username
    }

    var initials: String {
        let source = displayName.trimmingCharacters(in: .whitespaces)
        let parts = source.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init)
        return letters.isEmpty ? "?" : letters.joined().uppercased()
    }

    var roleLabel: String {
        switch role {
        case "admin": return "Administrator"
        case "manager": return "Manager"
        case "viewer": return "Viewer"
        default: return role.capitalized
        }
    }

    /// Reusable sample for SwiftUI previews.
    static let preview = AppUser(
        id: "00000000-0000-0000-0000-000000000001",
        username: "admin",
        fullName: "Abebe Kebede",
        role: "admin",
        active: true,
        lastLoginAt: Date(),
        createdAt: Date()
    )
}

/// Payload for `POST /auth/change-password`.
struct ChangePasswordRequest: Encodable {
    let oldPassword: String
    let newPassword: String

    private enum CodingKeys: String, CodingKey {
        case oldPassword = "old_password"
        case newPassword = "new_password"
    }
}

/// `GET /health`.
struct HealthStatus: Decodable {
    let status: String
    let env: String?
    let db: Bool?

    var isHealthy: Bool { status.lowercased() == "ok" }
}
