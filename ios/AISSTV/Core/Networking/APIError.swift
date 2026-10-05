import Foundation

/// Mirrors the error taxonomy of the Flutter client
/// (`mobile/lib/core/errors/app_exception.dart`) so both apps behave alike.
enum APIError: LocalizedError, Equatable {

    case network(String)
    case timeout(String)
    case unauthorized(String)
    case forbidden(String)
    case notFound(String)
    case conflict(String)
    case validation(String)
    case server(String)
    case decoding(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .network(let message),
             .timeout(let message),
             .unauthorized(let message),
             .forbidden(let message),
             .notFound(let message),
             .conflict(let message),
             .validation(let message),
             .server(let message),
             .decoding(let message):
            return message
        case .cancelled:
            return "Cancelled"
        }
    }

    /// True when the session is no longer valid and the user must sign in again.
    var isUnauthorized: Bool {
        if case .unauthorized = self { return true }
        return false
    }

    /// True for transport-level failures, where "retry" is the useful action.
    var isConnectivityProblem: Bool {
        switch self {
        case .network, .timeout: return true
        default: return false
        }
    }

    /// Maps an HTTP status code plus a FastAPI error body onto an `APIError`.
    static func from(status: Int, body: Data) -> APIError {
        let detail = detail(from: body)
        switch status {
        case 400:
            return .validation(detail ?? "Request failed")
        case 401:
            return .unauthorized(detail ?? "Session expired")
        case 403:
            return .forbidden(detail ?? "Access denied")
        case 404:
            return .notFound(detail ?? "Not found")
        case 409:
            return .conflict(detail ?? "Conflict")
        case 422:
            return .validation(detail ?? "Validation failed")
        default:
            if (500...599).contains(status) {
                return .server(detail ?? "Server error (\(status))")
            }
            return .server(detail ?? "Request failed (\(status))")
        }
    }

    /// Extracts a human-readable message from a FastAPI error body.
    ///
    /// FastAPI returns `detail` as a string for `HTTPException`, but as an
    /// **array** of objects for request-validation errors. The web client
    /// stringifies that array (rendering `[object Object]`); we flatten it into
    /// readable text instead.
    static func detail(from body: Data) -> String? {
        guard !body.isEmpty else { return nil }
        guard let object = try? JSONSerialization.jsonObject(with: body) else {
            let text = String(data: body, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (text?.isEmpty == false) ? text : nil
        }
        guard let dictionary = object as? [String: Any], let detail = dictionary["detail"] else {
            return nil
        }
        return stringify(detail)
    }

    private static func stringify(_ value: Any) -> String? {
        if let text = value as? String {
            return text.isEmpty ? nil : text
        }
        if let items = value as? [Any] {
            let messages = items.compactMap { item -> String? in
                guard let dictionary = item as? [String: Any] else { return stringify(item) }
                let location = (dictionary["loc"] as? [Any])?
                    .compactMap { $0 as? String }
                    .filter { $0 != "body" && $0 != "query" && $0 != "path" }
                    .joined(separator: ".")
                let message = dictionary["msg"] as? String ?? "Invalid value"
                if let location, !location.isEmpty {
                    return "\(location): \(message)"
                }
                return message
            }
            return messages.isEmpty ? nil : messages.joined(separator: "\n")
        }
        if let dictionary = value as? [String: Any] {
            return dictionary["msg"] as? String ?? dictionary["detail"] as? String
        }
        return nil
    }
}
