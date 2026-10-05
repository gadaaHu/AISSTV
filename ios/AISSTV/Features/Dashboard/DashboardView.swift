import SwiftUI

// MARK: - View model

/// Everything the dashboard shows, in one place.
///
/// The screen is a read-only roll-up, so a single `load()` fetches every section
/// and `.polling` simply re-runs that function on the app's shared cadence. The
/// Flutter screen reads the same five endpoints through Riverpod providers
/// (`mobile/lib/screens/dashboard_screen.dart`).
@MainActor
final class DashboardViewModel: ObservableObject {

    /// `yyyy-MM-dd`. The server interprets it as a UTC calendar day.
    @Published var day: String = Format.todayISO()

    @Published private(set) var summary: AttendanceSummary?
    @Published private(set) var recentEvents: [Event] = []

    /// A missing entry means "unknown" (that domain's request failed) rather
    /// than zero, so the badge can stay silent instead of claiming 0.
    @Published private(set) var openIncidentCounts: [IncidentDomain: Int] = [:]

    @Published private(set) var isLoading = false
    @Published private(set) var hasLoadedOnce = false
    @Published var errorMessage: String?

    /// A preview, not a feed — the Events tab owns the full stream.
    private let recentEventLimit = 6

    /// Bumped whenever the selected day changes. A response carrying a stale
    /// generation is discarded, so a slow request for the previous day cannot
    /// overwrite the totals for the day now on screen (the poller may already
    /// be in flight when the user switches day).
    private var loadGeneration = 0

    var isToday: Bool { day == Format.todayISO() }

    /// Switching the day discards the previous totals immediately: showing
    /// yesterday's numbers under today's heading for a poll interval would be
    /// worse than showing the spinner.
    func setDay(_ isoDay: String) {
        guard isoDay != day else { return }
        day = isoDay
        loadGeneration += 1
        summary = nil
        // The next `load()` only raises `isLoading` for a first load, so it is
        // raised here; otherwise the empty summary would render as the "no data"
        // state for one round trip.
        isLoading = true
        Task { await load() }
    }

    func load() async {
        if !hasLoadedOnce { isLoading = true }

        var failure: String?
        let requestedDay = day
        let generation = loadGeneration

        do {
            let value = try await APIClient.shared.attendanceSummary(day: requestedDay)
            // Only the totals are day-scoped; the events preview and incident
            // counts below are the same regardless of the selected day.
            if generation == loadGeneration {
                summary = value
            }
        } catch {
            failure = failure ?? loadMessage(for: error)
        }

        do {
            let page = try await APIClient.shared.events(limit: recentEventLimit)
            recentEvents = page.items
        } catch {
            failure = failure ?? loadMessage(for: error)
        }

        // One request per domain. `limit: 1` keeps the body small while `total`
        // still counts every open incident.
        //
        // There is no HTTP endpoint that creates an incident — they only arrive
        // over MQTT — so this screen can only link to the review list.
        var counts = openIncidentCounts
        for domain in IncidentDomain.allCases {
            do {
                let page = try await APIClient.shared.incidents(
                    domain: domain,
                    status: "open",
                    limit: 1
                )
                counts[domain] = page.total
            } catch {
                failure = failure ?? loadMessage(for: error)
            }
        }
        openIncidentCounts = counts

        errorMessage = failure
        hasLoadedOnce = true
        isLoading = false
    }

    /// Cancellation is not a user-visible failure; everything else is reported
    /// with the same message the rest of the app shows.
    private func loadMessage(for error: Error) -> String? {
        if error is CancellationError { return nil }
        if let apiError = error as? APIError, apiError == .cancelled { return nil }
        return (error as? APIError)?.localizedDescription ?? error.localizedDescription
    }
}

// MARK: - Screen

/// The signed-in landing screen: the day's attendance KPIs, the open incident
/// counts per domain, and a short preview of the newest events.
///
/// It is also the only entry point into `IncidentsView`, which is deliberately
/// not a tab in `HomeShellView`. Every role sees this screen; the review
/// affordance is the only part that depends on the role.
struct DashboardView: View {

    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = DashboardViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let message = viewModel.errorMessage {
                    ErrorBanner(message: message, onDismiss: { viewModel.errorMessage = nil })
                }

                dayCard
                attendanceSection
                incidentsSection
                recentEventsSection
            }
            .padding(Theme.contentPadding)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Dashboard")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await viewModel.load() }
                } label: {
                    if viewModel.isLoading {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(viewModel.isLoading)
                .accessibilityLabel("Refresh")
            }
        }
        .refreshable { await viewModel.load() }
        .polling { await viewModel.load() }
    }

    // MARK: Day

    private var dayCard: some View {
        SectionCard(title: "Attendance day") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    DatePicker("Day", selection: dayBinding, displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .labelsHidden()
                        // An attendance day is a *UTC* calendar day, because the
                        // server files rows by `ev.ts.date()` on a UTC
                        // timestamp, and `dayBinding` round-trips through UTC.
                        // Pinning the picker to UTC keeps what it shows and what
                        // it writes on the same day instead of shifting it into
                        // the device's timezone.
                        .environment(\.timeZone, TimeZone.gmt)

                    Spacer(minLength: 8)

                    Button {
                        viewModel.setDay(Format.todayISO())
                    } label: {
                        Text("Today")
                    }
                    .buttonStyle(.bordered)
                    .disabled(viewModel.isToday)
                }

                // `AttendanceSummary.absent` is derived from *today's* active
                // headcount, so a past day's absent figure is not authoritative.
                Text("Absent is counted against today's active headcount, so figures for a past day are not authoritative.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Text("Days follow UTC — the same clock the server files attendance by.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private var dayBinding: Binding<Date> {
        Binding(
            get: { DateParsing.dateOnly.date(from: viewModel.day) ?? Date() },
            set: { newValue in viewModel.setDay(Format.isoDay(newValue)) }
        )
    }

    // MARK: Attendance

    private var attendanceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle(viewModel.isToday ? "Today's attendance" : "Attendance for \(Format.day(viewModel.day))")

            if let summary = viewModel.summary {
                LazyVGrid(columns: metricColumns, spacing: 12) {
                    MetricTile(
                        title: "Present",
                        value: "\(summary.present)",
                        symbolName: "checkmark.circle.fill",
                        tint: .green
                    )
                    MetricTile(
                        title: "Late",
                        value: "\(summary.late)",
                        symbolName: "clock.fill",
                        tint: .orange
                    )
                    MetricTile(
                        title: "Absent",
                        value: "\(summary.absent)",
                        symbolName: "xmark.circle.fill",
                        tint: .red,
                        caption: viewModel.isToday ? "of today's headcount" : "not authoritative"
                    )
                    MetricTile(
                        title: "On leave",
                        value: "\(summary.onLeave)",
                        symbolName: "beach.umbrella.fill",
                        tint: .blue
                    )
                    MetricTile(
                        title: "Still in",
                        value: "\(summary.stillIn)",
                        symbolName: "figure.walk",
                        tint: .teal,
                        caption: "checked in, not out"
                    )
                    MetricTile(
                        title: "Checked out",
                        value: "\(summary.checkedOut)",
                        symbolName: "arrow.right.square",
                        tint: .indigo
                    )
                    MetricTile(
                        title: "Total employees",
                        value: "\(summary.totalEmployees)",
                        symbolName: "person.3.fill",
                        tint: .purple,
                        caption: "active on the server"
                    )
                }
            } else if viewModel.isLoading {
                LoadingPlaceholder(text: "Loading attendance…")
            } else {
                StatePlaceholder(
                    symbol: "chart.bar",
                    title: "No summary available",
                    message: viewModel.errorMessage,
                    actionTitle: "Try again",
                    action: { Task { await viewModel.load() } }
                )
            }
        }
    }

    /// Two tiles per row on a phone, more on a wider screen.
    private var metricColumns: [GridItem] {
        [GridItem(.adaptive(minimum: 150), spacing: 12)]
    }

    // MARK: Incidents

    private var incidentsSection: some View {
        SectionCard(title: "Incidents") {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(IncidentDomain.allCases) { domain in
                    NavigationLink {
                        IncidentsView(initialDomain: domain)
                    } label: {
                        incidentLinkRow(domain)
                    }
                    .buttonStyle(.plain)
                }

                Text(
                    auth.canReview
                        ? "Open one to review it: you can resolve or dismiss incidents."
                        : "Only administrators and managers can resolve incidents."
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
        }
    }

    private func incidentLinkRow(_ domain: IncidentDomain) -> some View {
        HStack(spacing: 12) {
            Image(systemName: domain.symbolName)
                .font(.body)
                .foregroundStyle(.secondary)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(domain.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                Text(openCountCaption(for: domain))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            IncidentCountBadge(count: viewModel.openIncidentCounts[domain])

            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }

    private func openCountCaption(for domain: IncidentDomain) -> String {
        guard let count = viewModel.openIncidentCounts[domain] else {
            return viewModel.hasLoadedOnce ? "Count unavailable" : "Loading…"
        }
        if count == 0 { return "No open incidents" }
        return count == 1 ? "1 open incident" : "\(count) open incidents"
    }

    // MARK: Recent events

    /// Self-contained on purpose: `EventsView` belongs to the Events tab, so this
    /// preview neither owns nor links to that screen — it just shows the newest
    /// rows and says where the full stream lives.
    private var recentEventsSection: some View {
        SectionCard(title: "Recent events") {
            VStack(alignment: .leading, spacing: 12) {
                if viewModel.recentEvents.isEmpty {
                    if viewModel.isLoading && !viewModel.hasLoadedOnce {
                        LoadingPlaceholder(text: "Loading recent events…")
                    } else {
                        Text("No recent activity.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 8)
                    }
                } else {
                    ForEach(viewModel.recentEvents) { event in
                        DashboardEventRow(event: event)
                    }
                }

                Text("The Events tab holds the complete stream.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    // MARK: Helpers

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.headline)
    }
}

// MARK: - Components

/// Open-incident count. `nil` means the count could not be loaded, which must
/// not be rendered as `0`.
private struct IncidentCountBadge: View {

    let count: Int?

    var body: some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .foregroundStyle(tint)
            .frame(minWidth: 26)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(tint.opacity(0.14), in: Capsule())
            .accessibilityLabel(accessibilityLabel)
    }

    private var label: String {
        guard let count = count else { return "—" }
        return "\(count)"
    }

    private var tint: Color {
        guard let count = count else { return .secondary }
        return count > 0 ? .red : .secondary
    }

    private var accessibilityLabel: String {
        guard let count = count else { return "Open incidents unknown" }
        return count == 1 ? "1 open incident" : "\(count) open incidents"
    }
}

/// One row of the recent-events preview.
private struct DashboardEventRow: View {

    let event: Event

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            StatusChip(style: Theme.eventStyle(event.type), compact: true)

            VStack(alignment: .leading, spacing: 2) {
                Text(event.employeeCode ?? "No employee")
                    .font(.subheadline.weight(.medium))
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            // `effectiveTimestamp` prefers the camera-side wall clock when the
            // edge sent one, which is the honest time to show.
            Text(Format.relative(event.effectiveTimestamp))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private var detail: String {
        guard let zone = event.zone, !zone.isEmpty else { return event.cameraId }
        return "\(event.cameraId) · \(zone)"
    }
}

// MARK: - Preview

#Preview("Dashboard") {
    NavigationStack {
        DashboardView()
    }
    .environmentObject(AuthStore.preview())
}
