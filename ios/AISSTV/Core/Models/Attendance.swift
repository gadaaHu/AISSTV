import Foundation

/// `day`-scoped totals from `GET /attendance/summary`.
///
/// Note `total_employees` counts *currently active* employees even for a
/// historical `day`, so `absent` is only authoritative for today.
struct AttendanceSummary: Decodable, Hashable {
    let day: String
    let totalEmployees: Int
    let present: Int
    let late: Int
    let absent: Int
    let onLeave: Int
    let checkedOut: Int
    let stillIn: Int

    private enum CodingKeys: String, CodingKey {
        case day, present, late, absent
        case totalEmployees = "total_employees"
        case onLeave = "on_leave"
        case checkedOut = "checked_out"
        case stillIn = "still_in"
    }

    static let preview = AttendanceSummary(
        day: "2026-09-28",
        totalEmployees: 24,
        present: 18,
        late: 3,
        absent: 2,
        onLeave: 1,
        checkedOut: 12,
        stillIn: 9
    )
}

/// A row of `GET /attendance` — a join projection with **no `id`**, so rows are
/// identified here by employee code plus day.
struct AttendanceRow: Decodable, Identifiable, Hashable {
    let employeeCode: String
    let employeeName: String
    let department: String?
    let day: String
    let checkIn: Date?
    let checkOut: Date?
    let status: String
    let minutesLate: Int
    let dwellSeconds: Int

    var id: String { "\(employeeCode)|\(day)" }

    private enum CodingKeys: String, CodingKey {
        case day, status
        case employeeCode = "employee_code"
        case employeeName = "employee_name"
        case department
        case checkIn = "check_in"
        case checkOut = "check_out"
        case minutesLate = "minutes_late"
        case dwellSeconds = "dwell_seconds"
    }

    var initials: String {
        let parts = employeeName.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init)
        return letters.isEmpty ? "?" : letters.joined().uppercased()
    }

    var dwellDescription: String? {
        guard dwellSeconds > 0 else { return nil }
        let hours = dwellSeconds / 3600
        let minutes = (dwellSeconds % 3600) / 60
        if hours > 0 { return "\(hours)h \(minutes)m" }
        return "\(minutes)m"
    }
}

/// `AttendanceOut` from `GET /attendance/employee/{code}` (a bare array).
struct AttendanceRecord: Decodable, Identifiable, Hashable {
    let id: String
    let employeeCode: String
    let day: String
    let checkIn: Date?
    let checkOut: Date?
    let status: String
    let minutesLate: Int
    let dwellSeconds: Int
    let updatedAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, day, status
        case employeeCode = "employee_code"
        case checkIn = "check_in"
        case checkOut = "check_out"
        case minutesLate = "minutes_late"
        case dwellSeconds = "dwell_seconds"
        case updatedAt = "updated_at"
    }
}
