import Foundation

/// The rich camera model returned by `GET /cameras` and `GET /cameras/{id}`.
///
/// `password` is never returned by the API; `username` and `url` are.
struct Camera: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let zone: String
    let site: String?
    let url: String
    let rtspTransport: String?
    let username: String?
    let enabled: Bool
    let fpsProcess: Double?
    let detectionConfidence: Double?
    let faceThreshold: Double?
    let saveSnapshots: Bool?
    let tags: [String]?
    let notes: String?
    let lastSeenAt: Date?
    let lastState: String?
    let lastError: String?
    let edgeNode: String?
    let active: Bool?
    let createdAt: Date?
    let updatedAt: Date?
    /// Computed server-side: `last_seen_at` within the last 60 seconds.
    let online: Bool?

    private enum CodingKeys: String, CodingKey {
        case id, name, zone, site, url, username, enabled, tags, notes, active, online
        case rtspTransport = "rtsp_transport"
        case fpsProcess = "fps_process"
        case detectionConfidence = "detection_confidence"
        case faceThreshold = "face_threshold"
        case saveSnapshots = "save_snapshots"
        case lastSeenAt = "last_seen_at"
        case lastState = "last_state"
        case lastError = "last_error"
        case edgeNode = "edge_node"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var isOnline: Bool { online ?? false }
    var displayName: String { name.isEmpty ? id : name }

    /// Strips credentials from a stream URL before showing it in the UI.
    ///
    /// The backend lets a camera URL embed `user:pass@`, and it returns that URL
    /// to every authenticated user, so the raw value must not be rendered.
    var redactedURL: String {
        guard var components = URLComponents(string: url) else {
            return url.contains("@") ? "•••• (credentials hidden)" : url
        }
        if components.user != nil || components.password != nil {
            components.user = nil
            components.password = nil
        }
        return components.string ?? url
    }

    var hasEmbeddedCredentials: Bool {
        guard let components = URLComponents(string: url) else { return false }
        return components.user != nil || components.password != nil
    }

    static let preview = Camera(
        id: "cam-01",
        name: "Main entrance",
        zone: "main-entrance",
        site: "HQ",
        url: "rtsp://192.168.1.100:554/stream1",
        rtspTransport: "tcp",
        username: "admin",
        enabled: true,
        fpsProcess: 3,
        detectionConfidence: 0.45,
        faceThreshold: 0.45,
        saveSnapshots: false,
        tags: ["entrance"],
        notes: nil,
        lastSeenAt: Date(),
        lastState: "online",
        lastError: nil,
        edgeNode: "edge-01",
        active: true,
        createdAt: Date(),
        updatedAt: Date(),
        online: true
    )
}

/// The **thin** camera projection returned by `GET /events/cameras/list`.
/// It is a different schema from `Camera`, so it is a separate type.
struct CameraListItem: Decodable, Identifiable, Hashable {
    let id: String
    let zone: String
    let site: String?
    let lastSeenAt: Date?
    let lastState: String?
    let active: Bool

    private enum CodingKeys: String, CodingKey {
        case id, zone, site, active
        case lastSeenAt = "last_seen_at"
        case lastState = "last_state"
    }
}

/// Body for `POST /cameras` (admin only).
///
/// `id` is client-chosen and must match `^[a-zA-Z0-9_-]+$` with 2–64
/// characters.
struct CameraCreate: Encodable {
    let id: String
    var name: String = ""
    let zone: String
    var site: String?
    let url: String
    var rtspTransport: String = "tcp"
    var username: String?
    var password: String?
    var enabled: Bool = true
    var fpsProcess: Double = 3
    var detectionConfidence: Double = 0.45
    var faceThreshold: Double = 0.45
    var saveSnapshots: Bool = false
    var tags: [String] = []
    var notes: String?

    private enum CodingKeys: String, CodingKey {
        case id, name, zone, site, url, username, password, enabled, tags, notes
        case rtspTransport = "rtsp_transport"
        case fpsProcess = "fps_process"
        case detectionConfidence = "detection_confidence"
        case faceThreshold = "face_threshold"
        case saveSnapshots = "save_snapshots"
    }
}

/// Body for `PATCH /cameras/{id}` (admin only).
///
/// Unlike the employee and user endpoints, this one does **not** apply
/// `exclude_none`, so the server would accept an explicit `null` to clear
/// `username`/`password`. The synthesized encoder here omits `nil` instead,
/// which means leaving the password field blank keeps the stored password —
/// the behaviour the edit screen wants.
struct CameraUpdate: Encodable {
    var name: String?
    var zone: String?
    var site: String?
    var url: String?
    var rtspTransport: String?
    var username: String?
    var password: String?
    var enabled: Bool?
    var fpsProcess: Double?
    var detectionConfidence: Double?
    var faceThreshold: Double?
    var saveSnapshots: Bool?
    var tags: [String]?
    var notes: String?
    var active: Bool?

    private enum CodingKeys: String, CodingKey {
        case name, zone, site, url, username, password, enabled, tags, notes, active
        case rtspTransport = "rtsp_transport"
        case fpsProcess = "fps_process"
        case detectionConfidence = "detection_confidence"
        case faceThreshold = "face_threshold"
        case saveSnapshots = "save_snapshots"
    }
}

/// Body for `POST /cameras/test-url`.
struct CameraTestURLRequest: Encodable {
    let url: String
    var rtspTransport: String = "tcp"

    private enum CodingKeys: String, CodingKey {
        case url
        case rtspTransport = "rtsp_transport"
    }
}

/// Result of a camera probe.
///
/// Both probe endpoints answer **HTTP 200 even when the stream fails**, so
/// callers must inspect `ok` rather than relying on the status code.
struct CameraTestResult: Decodable, Hashable {
    let ok: Bool
    let message: String
    let width: Int?
    let height: Int?
    let fps: Double?
    let codec: String?
    let latencyMs: Int?

    private enum CodingKeys: String, CodingKey {
        case ok, message, width, height, fps, codec
        case latencyMs = "latency_ms"
    }

    var resolutionDescription: String? {
        guard let width, let height else { return nil }
        return "\(width)×\(height)"
    }
}
