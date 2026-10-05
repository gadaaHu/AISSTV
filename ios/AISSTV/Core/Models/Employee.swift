import Foundation

/// `EmployeeOut` from `/employees`.
///
/// `shift_start` / `shift_end` are serialized as `"09:00:00"` strings. They are
/// kept as strings rather than `Date` so a shift time never picks up a spurious
/// calendar date or timezone shift.
struct Employee: Codable, Identifiable, Hashable {
    let id: String
    let code: String
    let name: String
    let email: String?
    let department: String?
    let title: String?
    let shiftStart: String?
    let shiftEnd: String?
    let timezone: String?
    let active: Bool
    let createdAt: Date?
    let updatedAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, code, name, email, department, title, timezone, active
        case shiftStart = "shift_start"
        case shiftEnd = "shift_end"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    /// `"09:00:00"` → `"09:00"`.
    static func shortTime(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        let parts = raw.split(separator: ":")
        guard parts.count >= 2 else { return raw }
        return "\(parts[0]):\(parts[1])"
    }

    var shiftDescription: String? {
        guard let start = Self.shortTime(shiftStart),
              let end = Self.shortTime(shiftEnd) else { return nil }
        return "\(start) – \(end)"
    }

    var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init)
        return letters.isEmpty ? "?" : letters.joined().uppercased()
    }

    static let preview = Employee(
        id: "00000000-0000-0000-0000-000000000010",
        code: "emp-001",
        name: "Abebe Kebede",
        email: "abebe@example.com",
        department: "Operations",
        title: "Supervisor",
        shiftStart: "09:00:00",
        shiftEnd: "18:00:00",
        timezone: "Africa/Addis_Ababa",
        active: true,
        createdAt: Date(),
        updatedAt: Date()
    )
}

/// Body for `POST /employees` (admin only).
///
/// The synthesized `Encodable` implementation encodes optional properties with
/// `encodeIfPresent`, so `nil` fields are omitted from the JSON — which is what
/// the backend wants (`exclude_none=True` there).
struct EmployeeCreate: Encodable {
    let code: String
    let name: String
    var email: String?
    var department: String?
    var title: String?
    var shiftStart: String?
    var shiftEnd: String?
    var timezone: String?

    private enum CodingKeys: String, CodingKey {
        case code, name, email, department, title, timezone
        case shiftStart = "shift_start"
        case shiftEnd = "shift_end"
    }
}

/// Body for `PATCH /employees/{code}` (admin only).
///
/// Note the backend applies `exclude_none=True` here, so omitting a field and
/// sending `null` are equivalent — you cannot clear a value through this call.
struct EmployeeUpdate: Encodable {
    var name: String?
    var email: String?
    var department: String?
    var title: String?
    var shiftStart: String?
    var shiftEnd: String?
    var timezone: String?
    var active: Bool?

    private enum CodingKeys: String, CodingKey {
        case name, email, department, title, timezone, active
        case shiftStart = "shift_start"
        case shiftEnd = "shift_end"
    }
}

/// Response from `POST /employees/{code}/face`.
struct FaceUploadResponse: Decodable {
    let message: String?
    let path: String?
}
