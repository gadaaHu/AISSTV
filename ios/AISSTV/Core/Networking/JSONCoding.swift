import Foundation

/// Shared JSON coders.
///
/// The backend emits timestamps in several shapes — `...Z`, `...+00:00`, with
/// or without fractional seconds — and the fraud/safety/panic `resolve`
/// endpoints write **naive** datetimes with no offset at all. A single ISO-8601
/// strategy cannot parse all of those, so we try each in turn.
///
/// Date-only fields (`2026-09-28`) are decoded as `String` by the models rather
/// than `Date`, because turning a calendar day into an absolute instant is how
/// attendance data silently shifts by a day.
enum JSONCoding {

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = DateParsing.date(from: raw) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Unrecognised date format: \(raw)"
                )
            }
            return date
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(DateParsing.iso8601WithFractionalSeconds.string(from: date))
        }
        return encoder
    }()
}

/// Date parsing helpers tolerant of every format the backend produces.
enum DateParsing {

    static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// `2026-09-28T15:55:09` — no timezone. The backend only produces these from
    /// naive `datetime.now()` calls; we treat them as UTC.
    static let naiveDateTime: DateFormatter = makeFormatter("yyyy-MM-dd'T'HH:mm:ss")

    /// `2026-09-28` — a calendar day, such as an attendance day or leave bound.
    static let dateOnly: DateFormatter = makeFormatter("yyyy-MM-dd")

    private static func makeFormatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = format
        return formatter
    }

    /// Parses any timestamp shape the backend emits.
    static func date(from raw: String) -> Date? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }

        if let date = iso8601WithFractionalSeconds.date(from: value) { return date }
        if let date = iso8601.date(from: value) { return date }
        if let date = parseNaive(value) { return date }
        if value.count == 10, let date = dateOnly.date(from: value) { return date }
        return nil
    }

    /// Parses `2026-09-28T15:55:09[.ffffff]` (no timezone designator) as UTC by
    /// stripping any fractional-seconds component first.
    private static func parseNaive(_ value: String) -> Date? {
        guard let separator = value.firstIndex(of: "T") else { return nil }
        let datePart = String(value[value.startIndex..<separator])
        var timePart = String(value[value.index(after: separator)...])
        if let dot = timePart.firstIndex(of: ".") {
            timePart = String(timePart[timePart.startIndex..<dot])
        }
        // A trailing timezone designator means this is not a naive value.
        guard !timePart.contains("+"), !timePart.contains("-"), !timePart.contains("Z") else {
            return nil
        }
        return naiveDateTime.date(from: "\(datePart)T\(timePart)")
    }
}

/// Formats absolute timestamps for display, in the device's own timezone.
enum DateDisplay {

    static let shortDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter
    }()

    static let timeOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter
    }()

    /// Renders `2026-09-28` in a friendlier style, without shifting the day.
    static let isoDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func prettyDay(_ isoDayString: String) -> String {
        guard let date = isoDay.date(from: isoDayString) else { return isoDayString }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }
}
