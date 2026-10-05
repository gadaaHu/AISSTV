import Foundation

/// `LeaveOut` from `/leaves`.
///
/// `start_date` / `end_date` are calendar days (`"2026-09-28"`) and stay as
/// strings so they cannot drift by a timezone offset.
struct LeaveRequest: Decodable, Identifiable, Hashable {
    let id: String
    let employeeCode: String
    let leaveType: String
    let startDate: String
    let endDate: String
    let reason: String?
    let status: String
    let reviewedBy: String?
    let reviewedAt: Date?
    let createdAt: Date?
    let updatedAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, reason, status
        case employeeCode = "employee_code"
        case leaveType = "leave_type"
        case startDate = "start_date"
        case endDate = "end_date"
        case reviewedBy = "reviewed_by"
        case reviewedAt = "reviewed_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var isPending: Bool { status == "pending" }
    var isApproved: Bool { status == "approved" }
    var isRejected: Bool { status == "rejected" }

    static let preview = LeaveRequest(
        id: "00000000-0000-0000-0000-000000000030",
        employeeCode: "emp-001",
        leaveType: "annual",
        startDate: "2026-09-28",
        endDate: "2026-09-30",
        reason: "Family event",
        status: "pending",
        reviewedBy: nil,
        reviewedAt: nil,
        createdAt: Date(),
        updatedAt: Date()
    )
}

/// Body for `POST /leaves`.
///
/// `leave_type` is a free string on the server; the picker in the UI limits it
/// to the values the dashboard knows how to colour.
struct LeaveCreate: Encodable {
    let employeeCode: String
    let leaveType: String
    let startDate: String
    let endDate: String
    var reason: String?

    private enum CodingKeys: String, CodingKey {
        case reason
        case employeeCode = "employee_code"
        case leaveType = "leave_type"
        case startDate = "start_date"
        case endDate = "end_date"
    }
}

/// Body for `PATCH /leaves/{id}/review` (admin or manager).
struct LeaveReview: Encodable {
    /// `approved` or `rejected` — the server validates this and answers 400
    /// otherwise.
    let status: String
    var note: String?
}

/// The leave types the backend comment advertises. Not enforced server-side.
enum LeaveType {
    static let all = ["annual", "sick", "unpaid", "other"]

    static func label(_ raw: String) -> String {
        raw.isEmpty ? "—" : raw.replacingOccurrences(of: "_", with: " ").capitalized
    }
}
