import SwiftUI
import UIKit

// MARK: - Status chip

/// Renders a `Theme.ChipStyle` as a coloured capsule.
struct StatusChip: View {
    let style: Theme.ChipStyle
    var compact = false

    var body: some View {
        HStack(spacing: 4) {
            if let symbolName = style.symbolName {
                Image(systemName: symbolName)
            }
            Text(style.label)
        }
        .font(compact ? .caption2.weight(.semibold) : .caption.weight(.semibold))
        .foregroundStyle(style.color)
        .padding(.horizontal, compact ? 6 : 9)
        .padding(.vertical, compact ? 3 : 5)
        .background(style.color.opacity(0.14), in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Avatars

/// Circular initials placeholder, used where the backend has no image.
struct AvatarView: View {
    let initials: String
    var size: CGFloat = 40

    var body: some View {
        Text(initials)
            .font(.system(size: max(11, size * 0.36), weight: .semibold))
            .foregroundStyle(Color.accentColor)
            .frame(width: size, height: size)
            .background(Color.accentColor.opacity(0.15), in: Circle())
            .accessibilityHidden(true)
    }
}

// MARK: - Cards and rows

/// A grouped, rounded container used for detail sections.
struct SectionCard<Content: View>: View {
    private let title: String?
    private let content: Content

    init(title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous)
        )
    }
}

/// A `label: value` row that keeps the label legible when the value is long.
struct InfoRow: View {
    let label: String
    let value: String
    var monospacedValue = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer(minLength: 8)
            Text(value)
                .multilineTextAlignment(.trailing)
                .fontDesign(monospacedValue ? .monospaced : .default)
                .textSelection(.enabled)
        }
        .font(.subheadline)
    }
}

/// A metric tile for the dashboard.
struct MetricTile: View {
    let title: String
    let value: String
    let symbolName: String
    var tint: Color = .accentColor
    var caption: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: symbolName)
                    .font(.caption)
                Text(title)
                    .font(.caption.weight(.medium))
            }
            .foregroundStyle(tint)

            Text(value)
                .font(.title2.weight(.semibold))
                .contentTransition(.numericText())

            if let caption {
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous)
        )
    }
}

// MARK: - Placeholders

/// Full-width spinner with a caption.
struct LoadingPlaceholder: View {
    var text = "Loading…"

    var body: some View {
        VStack(spacing: 10) {
            ProgressView()
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(28)
    }
}

/// Empty or error state with an optional retry button.
struct StatePlaceholder: View {
    let symbol: String
    let title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 38))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(28)
    }

    /// Standard error presentation with a retry action.
    static func error(_ message: String, retry: @escaping () -> Void) -> StatePlaceholder {
        StatePlaceholder(
            symbol: "exclamationmark.triangle",
            title: "Something went wrong",
            message: message,
            actionTitle: "Try again",
            action: retry
        )
    }
}

/// Inline banner for a non-blocking error, e.g. a failed background refresh
/// while previously loaded data is still on screen.
struct ErrorBanner: View {
    let message: String
    var onDismiss: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text(message)
                .font(.footnote)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let onDismiss {
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss")
            }
        }
        .padding(10)
        .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// Renders whichever of loading / error / empty / content applies.
///
/// Keeps every list screen consistent and stops a screen from showing
/// "no results" before the first response has arrived.
struct LoadedContent<Value, Content: View>: View {
    // `@ObservedObject`, not a plain reference: the loader is an
    // `ObservableObject`, and reading its `@Published` members without
    // subscribing would never invalidate this view when a request completes.
    @ObservedObject private var loader: AsyncLoader<Value>
    private let emptySymbol: String
    private let emptyTitle: String
    private let emptyMessage: String?
    private let loadingText: String
    private let onRetry: () -> Void
    private let content: (Value) -> Content

    init(
        loader: AsyncLoader<Value>,
        emptySymbol: String = "tray",
        emptyTitle: String = "Nothing to show",
        emptyMessage: String? = nil,
        loadingText: String = "Loading…",
        onRetry: @escaping () -> Void,
        @ViewBuilder content: @escaping (Value) -> Content
    ) {
        self._loader = ObservedObject(wrappedValue: loader)
        self.emptySymbol = emptySymbol
        self.emptyTitle = emptyTitle
        self.emptyMessage = emptyMessage
        self.loadingText = loadingText
        self.onRetry = onRetry
        self.content = content
    }

    var body: some View {
        if let value = loader.value {
            if let message = loader.errorMessage {
                VStack(spacing: 0) {
                    ErrorBanner(message: message) { loader.clearError() }
                        .padding(.horizontal, Theme.contentPadding)
                        .padding(.top, 8)
                    content(value)
                }
            } else {
                content(value)
            }
        } else if loader.isLoading {
            LoadingPlaceholder(text: loadingText)
                .frame(maxHeight: .infinity)
        } else if let message = loader.errorMessage {
            StatePlaceholder.error(message, retry: onRetry)
                .frame(maxHeight: .infinity)
        } else {
            StatePlaceholder(
                symbol: emptySymbol,
                title: emptyTitle,
                message: emptyMessage,
                actionTitle: nil,
                action: nil
            )
            .frame(maxHeight: .infinity)
        }
    }
}

// MARK: - Forms

/// A labelled text field used across the create/edit forms.
struct FormTextField: View {
    let label: String
    @Binding var text: String
    var prompt: String?
    var keyboard: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences
    var isSecure = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
            Group {
                if isSecure {
                    SecureField(prompt ?? label, text: $text)
                } else {
                    TextField(prompt ?? label, text: $text)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(autocapitalization)
                }
            }
            .textFieldStyle(.roundedBorder)
            .autocorrectionDisabled()
        }
    }
}

/// Row with a `Toggle`, used in the camera and user forms.
struct FormToggle: View {
    let label: String
    @Binding var isOn: Bool
    var caption: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Toggle(label, isOn: $isOn)
            if let caption {
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Formatting helpers

enum Format {
    /// Absolute timestamp in the device's timezone.
    static func timestamp(_ date: Date?) -> String {
        guard let date else { return "—" }
        return DateDisplay.shortDateTime.string(from: date)
    }

    static func time(_ date: Date?) -> String {
        guard let date else { return "—" }
        return DateDisplay.timeOnly.string(from: date)
    }

    /// Relative description for recent timestamps, falling back to an absolute
    /// one beyond a day.
    static func relative(_ date: Date?) -> String {
        guard let date else { return "—" }
        let interval = Date().timeIntervalSince(date)
        if abs(interval) > 86_400 {
            return shortDateTime(date)
        }
        return relativeFormatter.localizedString(for: date, relativeTo: Date())
    }

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()

    static func shortDateTime(_ date: Date) -> String {
        DateDisplay.shortDateTime.string(from: date)
    }

    /// `2026-09-28` → `28 Sep 2026`, without shifting the day.
    static func day(_ isoDay: String) -> String {
        DateDisplay.prettyDay(isoDay)
    }

    /// Today as `yyyy-MM-dd` in UTC, matching how the backend compares days.
    static func todayISO() -> String {
        DateParsing.dateOnly.string(from: Date())
    }

    /// Formats a date as `yyyy-MM-dd` in **UTC** — the day semantics the backend
    /// uses for attendance rows.
    static func isoDay(_ date: Date) -> String {
        DateParsing.dateOnly.string(from: date)
    }

    /// Today as `yyyy-MM-dd` in the **device** timezone.
    static func todayLocalISO() -> String {
        localISODayFormatter.string(from: Date())
    }

    /// Formats a `DatePicker` value as `yyyy-MM-dd` in the **device** timezone.
    ///
    /// A `DatePicker` edits days in the user's own calendar, so a leave request
    /// must be sent as the day the user actually saw. Formatting it in UTC
    /// shifts the date for anyone east or west of Greenwich during part of the
    /// day (in the app's own `Africa/Addis_Ababa` zone, between 00:00 and 03:00).
    static func localISODay(_ date: Date) -> String {
        localISODayFormatter.string(from: date)
    }

    private static let localISODayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func optional(_ value: String?) -> String {
        guard let value, !value.trimmingCharacters(in: .whitespaces).isEmpty else { return "—" }
        return value
    }
}
