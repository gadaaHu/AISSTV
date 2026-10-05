import Foundation

/// Thin async/await wrapper over `URLSession` for the FastAPI backend.
///
/// Responsibilities:
/// * attaches `Authorization: Bearer <token>` from the Keychain to every request
/// * encodes JSON bodies and `application/x-www-form-urlencoded` login bodies
/// * decodes FastAPI error envelopes into `APIError`
/// * reports the first 401 so the app can drop back to the sign-in screen
///
/// The backend serves all routes at the root, so `path` values are absolute
/// (for example `/employees`) with no `/api` prefix.
final class APIClient: @unchecked Sendable {

    static let shared = APIClient()

    /// Placeholder for endpoints that answer `204 No Content` or that we
    /// otherwise do not need to read.
    struct EmptyResponse: Decodable {}

    /// Resolved per request rather than captured once, so an address changed in
    /// the app (see `ServerSettings`) takes effect on the very next call without
    /// restarting or recreating the client.
    private let baseURLProvider: () -> URL
    private let session: URLSession
    private let tokenStore: KeychainStore
    private let decoder = JSONCoding.decoder
    private let encoder = JSONCoding.encoder
    private let lock = NSLock()
    private var storedUnauthorizedHandler: (() -> Void)?

    /// The backend root currently in use.
    var baseURL: URL { baseURLProvider() }

    /// Called on the main queue when the backend rejects the stored token.
    /// The store uses this to clear the session and show the sign-in screen.
    var unauthorizedHandler: (() -> Void)? {
        get { lock.withLock { storedUnauthorizedHandler } }
        set { lock.withLock { storedUnauthorizedHandler = newValue } }
    }

    init(
        baseURLProvider: @escaping () -> URL = { ServerSettings.current },
        tokenStore: KeychainStore = KeychainStore()
    ) {
        self.baseURLProvider = baseURLProvider
        self.tokenStore = tokenStore

        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = AppConfig.requestTimeout
        configuration.timeoutIntervalForResource = AppConfig.requestTimeout * 2
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpAdditionalHeaders = ["Accept": "application/json"]
        self.session = URLSession(configuration: configuration)
    }

    // MARK: - Verbs

    func get<T: Decodable>(
        _ path: String,
        query: [URLQueryItem] = [],
        as type: T.Type = T.self
    ) async throws -> T {
        try await send(method: "GET", path: path, query: query, body: nil, contentType: nil, as: type)
    }

    func post<T: Decodable>(
        _ path: String,
        query: [URLQueryItem] = [],
        as type: T.Type = T.self
    ) async throws -> T {
        try await send(method: "POST", path: path, query: query, body: nil, contentType: nil, as: type)
    }

    func post<T: Decodable, Body: Encodable>(
        _ path: String,
        body: Body,
        as type: T.Type = T.self
    ) async throws -> T {
        try await send(
            method: "POST",
            path: path,
            query: [],
            body: try encode(body),
            contentType: "application/json",
            as: type
        )
    }

    func patch<T: Decodable, Body: Encodable>(
        _ path: String,
        body: Body,
        as type: T.Type = T.self
    ) async throws -> T {
        try await send(
            method: "PATCH",
            path: path,
            query: [],
            body: try encode(body),
            contentType: "application/json",
            as: type
        )
    }

    @discardableResult
    func delete<T: Decodable>(_ path: String, query: [URLQueryItem] = [], as type: T.Type = T.self) async throws -> T {
        try await send(method: "DELETE", path: path, query: query, body: nil, contentType: nil, as: type)
    }

    /// `POST /auth/login` expects `application/x-www-form-urlencoded`
    /// (FastAPI's `OAuth2PasswordRequestForm`), **not** JSON.
    func postForm<T: Decodable>(
        _ path: String,
        fields: [String: String],
        as type: T.Type = T.self
    ) async throws -> T {
        try await send(
            method: "POST",
            path: path,
            query: [],
            body: Self.formEncode(fields),
            contentType: "application/x-www-form-urlencoded",
            as: type
        )
    }

    // MARK: - Raw and multipart

    /// Fetches raw bytes — used for camera snapshots (`image/jpeg`), which are
    /// not JSON and must not go through the decoding pipeline.
    func data(_ path: String, query: [URLQueryItem] = []) async throws -> Data {
        let request = try makeRequest(method: "GET", path: path, query: query, body: nil, contentType: nil)
        return try await perform(request)
    }

    /// Uploads a single file as `multipart/form-data`
    /// (`POST /employees/{code}/face` expects the field name `file`).
    func upload<T: Decodable>(
        _ path: String,
        fieldName: String,
        fileName: String,
        mimeType: String,
        fileData: Data,
        as type: T.Type = T.self
    ) async throws -> T {
        let boundary = "AISSTV-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(fileName)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(fileData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        let request = try makeRequest(
            method: "POST",
            path: path,
            query: [],
            body: body,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
        let responseData = try await perform(request)
        return try decodeResponse(responseData, path: path)
    }

    // MARK: - Plumbing

    private func encode<Body: Encodable>(_ body: Body) throws -> Data {
        do {
            return try encoder.encode(body)
        } catch {
            AppLog.network.error("Failed to encode request body: \(String(describing: error))")
            throw APIError.server("Could not encode the request body")
        }
    }

    private func send<T: Decodable>(
        method: String,
        path: String,
        query: [URLQueryItem],
        body: Data?,
        contentType: String?,
        as type: T.Type
    ) async throws -> T {
        let request = try makeRequest(method: method, path: path, query: query, body: body, contentType: contentType)
        let responseData = try await perform(request)
        return try decodeResponse(responseData, path: path)
    }

    private func decodeResponse<T: Decodable>(_ data: Data, path: String) throws -> T {
        if data.isEmpty, T.self == EmptyResponse.self, let empty = EmptyResponse() as? T {
            return empty
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            AppLog.network.error("Decode failed for \(path): \(String(describing: error))")
            throw APIError.decoding("Unexpected response from the server.")
        }
    }

    private func makeRequest(
        method: String,
        path: String,
        query: [URLQueryItem],
        body: Data?,
        contentType: String?
    ) throws -> URLRequest {
        let relative = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard var components = URLComponents(
            url: baseURL.appendingPathComponent(relative),
            resolvingAgainstBaseURL: false
        ) else {
            throw APIError.server("Invalid request path: \(path)")
        }
        if !query.isEmpty {
            components.queryItems = query
        }
        guard let url = components.url else {
            throw APIError.server("Invalid request path: \(path)")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        if let token = tokenStore.readToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue(contentType ?? "application/json", forHTTPHeaderField: "Content-Type")
        }
        // Echoed back by the backend as X-Request-ID, which makes support
        // correlation across client and server logs possible.
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-ID")
        return request
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw APIError.server("Malformed response from the server")
            }
            if (200...299).contains(http.statusCode) {
                return data
            }
            AppLog.network.warning("HTTP \(http.statusCode) for \(request.url?.path ?? "-")")
            if http.statusCode == 401 {
                notifyUnauthorized()
            }
            throw APIError.from(status: http.statusCode, body: data)
        } catch let error as APIError {
            throw error
        } catch is CancellationError {
            throw APIError.cancelled
        } catch let error as URLError {
            throw Self.mapURLError(error)
        } catch {
            throw APIError.network("Network error")
        }
    }

    private func notifyUnauthorized() {
        guard let handler = unauthorizedHandler else { return }
        DispatchQueue.main.async { handler() }
    }

    private static func mapURLError(_ error: URLError) -> APIError {
        switch error.code {
        case .timedOut:
            return .timeout("Request timed out")
        case .cancelled:
            return .cancelled
        case .appTransportSecurityRequiresSecureConnection:
            // Worth its own message: on a device this is the usual reason a
            // cleartext development server cannot be reached.
            return .network(
                "iOS blocked this cleartext HTTP request (App Transport Security). "
                + "Use an https:// address, or add the host to NSExceptionDomains in "
                + "Supporting/AISSTV-Info.plist."
            )
        case .notConnectedToInternet,
             .networkConnectionLost,
             .cannotConnectToHost,
             .cannotFindHost,
             .dnsLookupFailed,
             .secureConnectionFailed,
             .serverCertificateUntrusted,
             .serverCertificateHasBadDate,
             .serverCertificateNotYetValid,
             .clientCertificateRejected:
            return .network("Cannot reach the server at \(ServerSettings.current.absoluteString)")
        default:
            return .network(error.localizedDescription)
        }
    }

    /// Percent-encodes a form body. Note `+` must become `%2B`, which is why
    /// this does not use `URLComponents` (it leaves `+` alone).
    private static func formEncode(_ fields: [String: String]) -> Data {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")

        let pairs = fields.map { pair -> String in
            let key = pair.key.addingPercentEncoding(withAllowedCharacters: allowed) ?? pair.key
            let value = pair.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? pair.value
            return "\(key)=\(value)"
        }
        return Data(pairs.sorted().joined(separator: "&").utf8)
    }
}
