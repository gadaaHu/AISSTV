import SwiftUI

/// Shared visual language: colours for API status strings and a few metrics.
///
/// Status values come from the backend as free-form strings, so every lookup
/// falls back to a neutral style rather than failing.
enum Theme {
    static let cardCornerRadius: CGFloat = 16
    static let controlCornerRadius: CGFloat = 12
    static let contentPadding: CGFloat = 16

    /// Colour pair for a status chip.
    struct ChipStyle {
        let label: String
        let color: Color
        let symbolName: String?
    }

    // MARK: - Attendance

    static func attendanceStyle(_ status: String) -> ChipStyle {
        switch status {
        case "present":
            return ChipStyle(label: "Present", color: .green, symbolName: "checkmark.circle.fill")
        case "late":
            return ChipStyle(label: "Late", color: .orange, symbolName: "clock.badge.exclamationmark.fill")
        case "absent":
            return ChipStyle(label: "Absent", color: .red, symbolName: "xmark.circle.fill")
        case "leave":
            return ChipStyle(label: "On leave", color: .blue, symbolName: "beach.umbrella.fill")
        case "holiday":
            return ChipStyle(label: "Holiday", color: .purple, symbolName: "star.fill")
        case "half_day":
            return ChipStyle(label: "Half day", color: .teal, symbolName: "circle.lefthalf.filled")
        default:
            return ChipStyle(label: status.capitalized, color: .secondary, symbolName: nil)
        }
    }

    // MARK: - Leaves

    static func leaveStyle(_ status: String) -> ChipStyle {
        switch status {
        case "pending":
            return ChipStyle(label: "Pending", color: .orange, symbolName: "hourglass")
        case "approved":
            return ChipStyle(label: "Approved", color: .green, symbolName: "checkmark.circle.fill")
        case "rejected":
            return ChipStyle(label: "Rejected", color: .red, symbolName: "xmark.circle.fill")
        default:
            return ChipStyle(label: status.capitalized, color: .secondary, symbolName: nil)
        }
    }

    // MARK: - Incidents

    static func incidentStyle(_ status: String) -> ChipStyle {
        switch status {
        case "open":
            return ChipStyle(label: "Open", color: .red, symbolName: "exclamationmark.circle.fill")
        case "investigating":
            return ChipStyle(label: "Investigating", color: .orange, symbolName: "magnifyingglass.circle.fill")
        case "resolved":
            return ChipStyle(label: "Resolved", color: .green, symbolName: "checkmark.circle.fill")
        case "dismissed":
            return ChipStyle(label: "Dismissed", color: .secondary, symbolName: "minus.circle.fill")
        default:
            return ChipStyle(label: status.capitalized, color: .secondary, symbolName: nil)
        }
    }

    static func severityStyle(_ severity: String) -> ChipStyle {
        switch severity {
        case "critical":
            return ChipStyle(label: "Critical", color: .red, symbolName: "exclamationmark.triangle.fill")
        case "high":
            return ChipStyle(label: "High", color: .orange, symbolName: "exclamationmark.triangle.fill")
        case "medium":
            return ChipStyle(label: "Medium", color: .yellow, symbolName: "exclamationmark.triangle")
        case "low":
            return ChipStyle(label: "Low", color: .secondary, symbolName: "info.circle")
        default:
            return ChipStyle(label: severity.capitalized, color: .secondary, symbolName: nil)
        }
    }

    // MARK: - Cameras and events

    static func cameraStyle(online: Bool) -> ChipStyle {
        online
            ? ChipStyle(label: "Online", color: .green, symbolName: "video.fill")
            : ChipStyle(label: "Offline", color: .secondary, symbolName: "video.slash.fill")
    }

    static func eventStyle(_ type: String) -> ChipStyle {
        switch type {
        case "ENTER", "EMPLOYEE_ENTER":
            return ChipStyle(label: EventType.label(type), color: .green, symbolName: "arrow.right.to.line")
        case "LATE":
            return ChipStyle(label: "Late", color: .orange, symbolName: "clock.badge.exclamationmark")
        case "EXIT":
            return ChipStyle(label: "Exit", color: .blue, symbolName: "arrow.left.to.line")
        case "RE_ENTER":
            return ChipStyle(label: "Re-enter", color: .teal, symbolName: "arrow.clockwise")
        case "EDGE_ONLINE":
            return ChipStyle(label: "Edge online", color: .green, symbolName: "wifi")
        case "EDGE_OFFLINE":
            return ChipStyle(label: "Edge offline", color: .secondary, symbolName: "wifi.slash")
        case "EDGE_ERROR":
            return ChipStyle(label: "Edge error", color: .red, symbolName: "exclamationmark.triangle")
        case "EDGE_HEARTBEAT":
            return ChipStyle(label: "Heartbeat", color: .secondary, symbolName: "waveform.path.ecg")
        case "VIOLENCE_SUSPECT":
            return ChipStyle(label: "Violence suspect", color: .red, symbolName: "exclamationmark.shield.fill")
        default:
            return ChipStyle(label: EventType.label(type), color: .secondary, symbolName: nil)
        }
    }

    // MARK: - Users

    static func userStyle(active: Bool) -> ChipStyle {
        active
            ? ChipStyle(label: "Active", color: .green, symbolName: "checkmark.circle.fill")
            : ChipStyle(label: "Disabled", color: .secondary, symbolName: "minus.circle.fill")
    }

    static func roleStyle(_ role: String) -> ChipStyle {
        switch role {
        case "admin":
            return ChipStyle(label: "Admin", color: .purple, symbolName: "shield.lefthalf.filled")
        case "manager":
            return ChipStyle(label: "Manager", color: .blue, symbolName: "person.badge.key")
        default:
            return ChipStyle(label: role.capitalized, color: .secondary, symbolName: "person")
        }
    }
}
