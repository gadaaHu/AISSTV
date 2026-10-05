import Foundation

/// `IncidentOut`, shared by `/fraud`, `/safety` and `/panic`.
///
/// The three routers are byte-identical apart from the `type` filter, so one
/// model and one set of screens serve all three domains.
struct Incident: Decodable, Identifiable, Hashable {
    let id: String
    /// `FRAUD`, `SAFETY` or `PANIC`.
    let type: String
    let severity: String
    let status: String
    let cameraId: String?
    let employeeCode: String?
    let zone: String?
    let description: String?
    let evidence: [String: JSONValue]?
    let resolvedBy: String?
    let resolvedAt: Date?
    let resolutionNote: String?
    let occurredAt: Date
    let createdAt: Date?
    let updatedAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, type, severity, status, zone, description, evidence
        case cameraId = "camera_id"
        case employeeCode = "employee_code"
        case resolvedBy = "resolved_by"
        case resolvedAt = "resolved_at"
        case resolutionNote = "resolution_note"
        case occurredAt = "occurred_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var isOpen: Bool { status == "open" || status == "investigating" }
    var isResolved: Bool { status == "resolved" || status == "dismissed" }

    /// Resolution timestamps are written with a naive `datetime.now()` on the
    /// server, so their offset can be wrong. Prefer `updated_at` for ordering.
    var sortDate: Date { updatedAt ?? resolvedAt ?? occurredAt }

    var evidenceEntries: [(key: String, value: String)] {
        guard let evidence else { return [] }
        return evidence
            .map { (key: $0.key, value: $0.value.displayText) }
            .sorted { $0.key < $1.key }
    }

    static let preview = Incident(
        id: "00000000-0000-0000-0000-000000000040",
        type: "SAFETY",
        severity: "high",
        status: "open",
        cameraId: "cam-01",
        employeeCode: nil,
        zone: "warehouse",
        description: "Possible altercation detected near loading bay.",
        evidence: ["signals": .array([.string("VIOLENCE_SUSPECT")])],
        resolvedBy: nil,
        resolvedAt: nil,
        resolutionNote: nil,
        occurredAt: Date(),
        createdAt: Date(),
        updatedAt: Date()
    )
}

/// The three incident domains, which differ only by URL prefix and type filter.
enum IncidentDomain: String, CaseIterable, Identifiable {
    case fraud
    case safety
    case panic

    var id: String { rawValue }

    /// The `type` column value the router filters on.
    var incidentType: String { rawValue.uppercased() }

    var title: String { rawValue.capitalized }

    var symbolName: String {
        switch self {
        case .fraud: return "creditcard.trianglebadge.exclamationmark"
        case .safety: return "exclamationmark.shield"
        case .panic: return "sos"
        }
    }

    var emptyMessage: String {
        switch self {
        case .fraud: return "No fraud incidents have been reported."
        case .safety: return "No safety incidents have been reported."
        case .panic: return "No panic alerts have been raised."
        }
    }
}

/// Body for `PATCH /fraud|safety|panic/{id}/resolve` (admin or manager).
///
/// `status` is persisted verbatim — the server does not validate it — so the UI
/// constrains it to `resolved` and `dismissed`.
struct IncidentResolve: Encodable {
    let status: String
    var resolutionNote: String?

    private enum CodingKeys: String, CodingKey {
        case status
        case resolutionNote = "resolution_note"
    }
}
