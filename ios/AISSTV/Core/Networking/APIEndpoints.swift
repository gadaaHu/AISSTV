import Foundation

/// Typed endpoint methods, grouped by domain.
///
/// Path segments are interpolated raw and encoded by `URLComponents` inside
/// `APIClient.makeRequest`; pre-encoding them here would double-encode.
extension APIClient {

    // MARK: - Auth

    /// `POST /auth/login` — form-encoded, unauthenticated.
    func login(username: String, password: String) async throws -> TokenResponse {
        try await postForm(
            "/auth/login",
            fields: ["username": username, "password": password],
            as: TokenResponse.self
        )
    }

    /// `GET /auth/me`
    func me() async throws -> AppUser {
        try await get("/auth/me", as: AppUser.self)
    }

    /// `POST /auth/change-password` — answers 204, requires the current password.
    func changePassword(oldPassword: String, newPassword: String) async throws {
        let body = ChangePasswordRequest(oldPassword: oldPassword, newPassword: newPassword)
        _ = try await post("/auth/change-password", body: body, as: EmptyResponse.self)
    }

    // MARK: - Employees

    func employees(
        query: String? = nil,
        active: Bool? = nil,
        limit: Int = 50,
        offset: Int = 0
    ) async throws -> Page<Employee> {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        if let query, !query.isEmpty {
            items.append(URLQueryItem(name: "q", value: query))
        }
        if let active {
            items.append(URLQueryItem(name: "active", value: active ? "true" : "false"))
        }
        return try await get("/employees", query: items, as: Page<Employee>.self)
    }

    func employee(code: String) async throws -> Employee {
        try await get("/employees/\(code)", as: Employee.self)
    }

    func createEmployee(_ body: EmployeeCreate) async throws -> Employee {
        try await post("/employees", body: body, as: Employee.self)
    }

    func updateEmployee(code: String, _ body: EmployeeUpdate) async throws -> Employee {
        try await patch("/employees/\(code)", body: body, as: Employee.self)
    }

    /// `DELETE /employees/{code}` — answers 204. Defaults to a soft delete;
    /// `hard: true` is destructive and answers 409 when history exists.
    func deleteEmployee(code: String, hard: Bool = false) async throws {
        _ = try await delete(
            "/employees/\(code)",
            query: [URLQueryItem(name: "hard", value: hard ? "true" : "false")],
            as: EmptyResponse.self
        )
    }

    /// `POST /employees/{code}/face` — multipart, field name `file`, admin only.
    func uploadFace(code: String, jpegData: Data, fileName: String = "face.jpg") async throws -> FaceUploadResponse {
        try await upload(
            "/employees/\(code)/face",
            fieldName: "file",
            fileName: fileName,
            mimeType: "image/jpeg",
            fileData: jpegData,
            as: FaceUploadResponse.self
        )
    }

    // MARK: - Attendance

    /// `GET /attendance` for a single day. Omitting `day` makes the server use
    /// *today*, which is the common case.
    ///
    /// Note this deliberately does not expose `start`/`end`: on the server,
    /// sending only one of the two silently removes the date filter entirely
    /// and returns the whole history. Use `attendanceRange` instead, which
    /// always sends both.
    func attendance(
        day: String? = nil,
        employeeCode: String? = nil,
        status: String? = nil,
        limit: Int = 200,
        offset: Int = 0
    ) async throws -> Page<AttendanceRow> {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        if let day { items.append(URLQueryItem(name: "day", value: day)) }
        if let employeeCode { items.append(URLQueryItem(name: "employee_code", value: employeeCode)) }
        if let status { items.append(URLQueryItem(name: "status", value: status)) }
        return try await get("/attendance", query: items, as: Page<AttendanceRow>.self)
    }

    /// `GET /attendance` over an inclusive range. Always sends both bounds.
    func attendanceRange(
        start: String,
        end: String,
        employeeCode: String? = nil,
        status: String? = nil,
        limit: Int = 200,
        offset: Int = 0
    ) async throws -> Page<AttendanceRow> {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "start", value: start),
            URLQueryItem(name: "end", value: end),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        if let employeeCode { items.append(URLQueryItem(name: "employee_code", value: employeeCode)) }
        if let status { items.append(URLQueryItem(name: "status", value: status)) }
        return try await get("/attendance", query: items, as: Page<AttendanceRow>.self)
    }

    /// `GET /attendance/summary`
    func attendanceSummary(day: String? = nil) async throws -> AttendanceSummary {
        var items: [URLQueryItem] = []
        if let day { items.append(URLQueryItem(name: "day", value: day)) }
        return try await get("/attendance/summary", query: items, as: AttendanceSummary.self)
    }

    /// `GET /attendance/employee/{code}` — a **bare array**, and both date
    /// bounds are required by the server.
    func attendanceHistory(code: String, start: String, end: String, limit: Int = 100) async throws -> [AttendanceRecord] {
        let items: [URLQueryItem] = [
            URLQueryItem(name: "start", value: start),
            URLQueryItem(name: "end", value: end),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        return try await get("/attendance/employee/\(code)", query: items, as: [AttendanceRecord].self)
    }

    // MARK: - Events

    /// `GET /events`
    ///
    /// `since` must carry an explicit offset or the server compares a naive
    /// timestamp against a `timestamptz` column. Omitting it makes the server
    /// default to the last 60 minutes.
    func events(
        since: Date? = nil,
        cameraId: String? = nil,
        type: String? = nil,
        limit: Int = 200,
        offset: Int = 0
    ) async throws -> Page<Event> {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        if let since {
            items.append(URLQueryItem(name: "since", value: DateParsing.iso8601.string(from: since)))
        }
        if let cameraId { items.append(URLQueryItem(name: "camera_id", value: cameraId)) }
        if let type { items.append(URLQueryItem(name: "type", value: type)) }
        return try await get("/events", query: items, as: Page<Event>.self)
    }

    func event(id: String) async throws -> Event {
        try await get("/events/\(id)", as: Event.self)
    }

    /// `GET /events/cameras/list` — a bare array of the **thin** camera schema.
    func eventCameras() async throws -> [CameraListItem] {
        try await get("/events/cameras/list", as: [CameraListItem].self)
    }

    // MARK: - Cameras

    /// `GET /cameras` — a **bare array**, always limited to active cameras.
    func cameras(enabledOnly: Bool = false) async throws -> [Camera] {
        let items = [URLQueryItem(name: "enabled_only", value: enabledOnly ? "true" : "false")]
        return try await get("/cameras", query: items, as: [Camera].self)
    }

    func camera(id: String) async throws -> Camera {
        try await get("/cameras/\(id)", as: Camera.self)
    }

    func createCamera(_ body: CameraCreate) async throws -> Camera {
        try await post("/cameras", body: body, as: Camera.self)
    }

    func updateCamera(id: String, _ body: CameraUpdate) async throws -> Camera {
        try await patch("/cameras/\(id)", body: body, as: Camera.self)
    }

    /// `DELETE /cameras/{id}` — answers 204 and is not idempotent (a second
    /// call returns 404).
    func deleteCamera(id: String) async throws {
        _ = try await delete("/cameras/\(id)", as: EmptyResponse.self)
    }

    /// `POST /cameras/{id}/test` — probes the stored URL with ffprobe. Can take
    /// ~10 s, and answers 200 even when the probe fails.
    func testCamera(id: String) async throws -> CameraTestResult {
        try await post("/cameras/\(id)/test", as: CameraTestResult.self)
    }

    /// `POST /cameras/test-url`
    func testCameraURL(_ body: CameraTestURLRequest) async throws -> CameraTestResult {
        try await post("/cameras/test-url", body: body, as: CameraTestResult.self)
    }

    /// `GET /cameras/{id}/snapshot` — raw JPEG bytes, not JSON.
    func cameraSnapshot(id: String) async throws -> Data {
        try await data("/cameras/\(id)/snapshot")
    }

    // MARK: - Leaves

    func leaves(
        employeeCode: String? = nil,
        status: String? = nil,
        limit: Int = 100,
        offset: Int = 0
    ) async throws -> Page<LeaveRequest> {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        if let employeeCode { items.append(URLQueryItem(name: "employee_code", value: employeeCode)) }
        if let status { items.append(URLQueryItem(name: "status", value: status)) }
        return try await get("/leaves", query: items, as: Page<LeaveRequest>.self)
    }

    func createLeave(_ body: LeaveCreate) async throws -> LeaveRequest {
        try await post("/leaves", body: body, as: LeaveRequest.self)
    }

    /// `PATCH /leaves/{id}/review` — admin or manager only.
    func reviewLeave(id: String, _ body: LeaveReview) async throws -> LeaveRequest {
        try await patch("/leaves/\(id)/review", body: body, as: LeaveRequest.self)
    }

    /// `DELETE /leaves/{id}` — answers 204.
    func deleteLeave(id: String) async throws {
        _ = try await delete("/leaves/\(id)", as: EmptyResponse.self)
    }

    // MARK: - Incidents (fraud / safety / panic)

    func incidents(
        domain: IncidentDomain,
        status: String? = nil,
        limit: Int = 100,
        offset: Int = 0
    ) async throws -> Page<Incident> {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        if let status { items.append(URLQueryItem(name: "status", value: status)) }
        return try await get("/\(domain.rawValue)", query: items, as: Page<Incident>.self)
    }

    func incident(domain: IncidentDomain, id: String) async throws -> Incident {
        try await get("/\(domain.rawValue)/\(id)", as: Incident.self)
    }

    /// `PATCH /{domain}/{id}/resolve` — admin or manager only.
    func resolveIncident(domain: IncidentDomain, id: String, _ body: IncidentResolve) async throws -> Incident {
        try await patch("/\(domain.rawValue)/\(id)/resolve", body: body, as: Incident.self)
    }

    // MARK: - Users (admin only)

    func users(active: Bool? = nil, limit: Int = 50, offset: Int = 0) async throws -> Page<AppUser> {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        if let active {
            items.append(URLQueryItem(name: "active", value: active ? "true" : "false"))
        }
        return try await get("/users", query: items, as: Page<AppUser>.self)
    }

    func createUser(_ body: UserCreate) async throws -> AppUser {
        try await post("/users", body: body, as: AppUser.self)
    }

    /// Addressed by **username**, not id.
    func updateUser(username: String, _ body: UserUpdate) async throws -> AppUser {
        try await patch("/users/\(username)", body: body, as: AppUser.self)
    }

    /// `DELETE /users/{username}` — answers 204 and deactivates the account.
    func deleteUser(username: String) async throws {
        _ = try await delete("/users/\(username)", as: EmptyResponse.self)
    }

    // MARK: - Ops

    /// `GET /health` — unauthenticated. Always answers 200; inspect `db`.
    func health() async throws -> HealthStatus {
        try await get("/health", as: HealthStatus.self)
    }
}
