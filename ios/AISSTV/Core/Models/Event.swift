import Foundation

/// `EventOut` from `/events`.
///
/// The model on the server also has `snapshot_path` and `received_at`, but
/// neither is serialized, so a client cannot retrieve a snapshot path here.
struct Event: Decodable, Identifiable, Hashable {
    let id: String
    let ts: Date
    let localTs: Date?
    let cameraId: String
    let zone: String?
    let type: String
    let employeeCode: String?
    let confidence: Double?
    let trackId: Int?
    let meta: [String: JSONValue]?

    private enum CodingKeys: String, CodingKey {
        case id, ts, type, zone, confidence, meta
        case localTs = "local_ts"
        case cameraId = "camera_id"
        case employeeCode = "employee_code"
        case trackId = "track_id"
    }

    /// The local (camera-side) wall clock if the edge provided one, otherwise
    /// the UTC timestamp. The backend files attendance by UTC day, so showing
    /// the local time is the honest thing to do when it is available.
    var effectiveTimestamp: Date { localTs ?? ts }

    /// Sortable list of `meta` entries for a detail view.
    var metaEntries: [(key: String, value: String)] {
        guard let meta else { return [] }
        return meta
            .map { (key: $0.key, value: $0.value.displayText) }
            .sorted { $0.key < $1.key }
    }

    static let preview = Event(
        id: "00000000-0000-0000-0000-000000000020",
        ts: Date(),
        localTs: Date(),
        cameraId: "cam-01",
        zone: "main-entrance",
        type: "ENTER",
        employeeCode: "emp-001",
        confidence: 0.92,
        trackId: 14,
        meta: ["minutes_late": .number(0)]
    )
}

/// The event `type` values the edge publishes. `type` is a free string on the
/// server, so this is a convenience list rather than a guarantee.
enum EventType {
    static let attendanceTypes = ["ENTER", "LATE", "EXIT", "RE_ENTER"]
    static let edgeTypes = ["EDGE_ONLINE", "EDGE_OFFLINE", "EDGE_ERROR", "EDGE_HEARTBEAT"]
    static let incidentTypes = ["VIOLENCE_SUSPECT"]

    /// Human label, e.g. `EDGE_ONLINE` → `Edge Online`.
    static func label(_ raw: String) -> String {
        if raw.hasPrefix("EMPLOYEE_") {
            return "Employee " + raw.dropFirst("EMPLOYEE_".count).capitalized
        }
        return raw
            .split(separator: "_")
            .map { $0.capitalized }
            .joined(separator: " ")
    }
}
