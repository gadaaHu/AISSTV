import Foundation

/// Body for `POST /users` (admin only).
///
/// `role` is a free string on the server and is compared with an exact,
/// case-sensitive match, so the UI restricts it to `viewer`/`manager`/`admin`.
struct UserCreate: Encodable {
    let username: String
    let password: String
    var fullName: String?
    var role: String = "viewer"
    var active: Bool = true

    private enum CodingKeys: String, CodingKey {
        case username, password, role, active
        case fullName = "full_name"
    }
}

/// Body for `PATCH /users/{username}` (admin only).
///
/// The server applies `exclude_none=True`, so this can change a role or
/// reactivate an account but cannot clear a field or set a password.
struct UserUpdate: Encodable {
    var fullName: String?
    var role: String?
    var active: Bool?

    private enum CodingKeys: String, CodingKey {
        case role, active
        case fullName = "full_name"
    }
}
