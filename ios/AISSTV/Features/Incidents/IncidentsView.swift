import SwiftUI

// MARK: - Status filter

/// The `status` query parameter of `GET /fraud`, `/safety` and `/panic`.
///
/// `nil` (All) omits the parameter entirely. The server persists whatever status
/// string it is handed, so the values offered here are the ones the app itself
/// writes plus the two the backend starts from.
enum IncidentStatusFilter: String, CaseIterable, Identifiable {
    case all
    case open
    case investigating
    case resolved
    case dismissed

    var id: String { rawValue }

    /// The value sent as `status`, or `nil` for All.
    var queryValue: String? {
        self == .all ? nil : rawValue
    }

    var title: String {
        switch self {
        case .all: return "All"
        case .open: return "Open"
        case .investigating: return "Investigating"
        case .resolved: return "Resolved"
        case .dismissed: return "Dismissed"
        }
    }
}

// MARK: - View model

/// One domain's incident list (`/fraud`, `/safety` or `/panic` — the three
/// routers are identical apart from the type filter).
@MainActor
final class IncidentsViewModel: ObservableObject {

    /// Rows per request, matching the Flutter screen's `limit: 50`.
    static let pageSize = 50

    @Published var domain: IncidentDomain = .fraud
    @Published var statusFilter: IncidentStatusFilter = .all

    @Published private(set) var incidents: [Incident] = []
    @Published private(set) var total = 0
    @Published private(set) var isLoading = false

    /// True once a response has arrived. Kept false after a failure so the error
    /// state is shown instead of "no incidents".
    @Published private(set) var hasLoadedOnce = false

    /// A failed load, shown as the list's error state or as a banner when rows
    /// are already on screen.
    @Published var errorMessage: String?

    /// A failed review action. The action itself lives in `IncidentDetailView`,
    /// which reports through this shared slot so the list shows the same message
    /// when the user comes back.
    @Published var actionError: String?

    private var hasStarted = false

    var filterSummary: String {
        if total > incidents.count {
            return "Showing \(incidents.count) of \(total)"
        }
        return total == 1 ? "1 incident" : "\(total) incidents"
    }

    /// Applies the domain the Dashboard pushed and loads once.
    ///
    /// `.polling` fires immediately, so a tick can arrive before this runs;
    /// `load()` ignores ticks until the initial domain is known. Without that
    /// guard the screen would briefly fetch `/fraud` after being opened on
    /// `/panic`.
    func start(initialDomain: IncidentDomain) async {
        if !hasStarted {
            hasStarted = true
            domain = initialDomain
        }
        await load()
    }

    func load() async {
        guard hasStarted else { return }
        if !hasLoadedOnce { isLoading = true }

        do {
            let page = try await APIClient.shared.incidents(
                domain: domain,
                status: statusFilter.queryValue,
                limit: Self.pageSize,
                offset: 0
            )
            // `resolved_at` is written server-side with a naive `datetime.now()`,
            // so its offset can be wrong and it must not be trusted for ordering.
            // `Incident.sortDate` prefers `updatedAt` (falling back to
            // `resolvedAt`, then `occurredAt`) for exactly that reason.
            incidents = page.items.sorted { $0.sortDate > $1.sortDate }
            total = page.total
            errorMessage = nil
            hasLoadedOnce = true
        } catch {
            if !isCancellation(error) {
                errorMessage = describe(error)
            }
        }

        isLoading = false
    }

    /// Domain or status changed: clear the rows so the previous filter's results
    /// are never shown under the new one.
    func reload() {
        incidents = []
        total = 0
        hasLoadedOnce = false
        errorMessage = nil
        actionError = nil
        // Set here as well as in `load()` so the filter change never renders as
        // "no incidents" for the one frame before the request starts.
        if hasStarted { isLoading = true }
        Task { await load() }
    }

    /// Replaces one row after a review, so the chips flip without a re-fetch.
    func apply(_ updated: Incident) {
        guard let index = incidents.firstIndex(where: { $0.id == updated.id }) else { return }

        if statusFilter != .all, statusFilter.queryValue != updated.status {
            // The row no longer matches the active filter, so it leaves the list
            // the same way a reload would remove it.
            incidents.remove(at: index)
            total = max(0, total - 1)
            return
        }

        incidents[index] = updated
    }

    // MARK: Private

    private func describe(_ error: Error) -> String {
        (error as? APIError)?.localizedDescription ?? error.localizedDescription
    }

    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let apiError = error as? APIError, apiError == .cancelled { return true }
        return false
    }
}

// MARK: - Screen

/// Incident review for the fraud / safety / panic domains.
///
/// Not a tab: the Dashboard pushes it, per domain, because the Flutter app's
/// incident screen was reachable from the dashboard's alert tile. Reading is
/// open to every signed-in role; resolving needs `auth.canReview`.
struct IncidentsView: View {

    /// The domain the Dashboard pushed. The segmented picker can change it.
    var initialDomain: IncidentDomain = .fraud

    // `AuthStore` is not read here — only `IncidentDetailView`, which decides
    // whether the review actions may be shown.
    @StateObject private var viewModel = IncidentsViewModel()

    var body: some View {
        VStack(spacing: 0) {
            filters
            content
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Incidents")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.start(initialDomain: initialDomain) }
        .polling { await viewModel.load() }
    }

    // MARK: Filters

    private var filters: some View {
        VStack(spacing: 10) {
            Picker("Domain", selection: domainBinding) {
                ForEach(IncidentDomain.allCases) { domain in
                    Label(domain.title, systemImage: domain.symbolName)
                        .tag(domain)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            HStack(spacing: 12) {
                Text("Status")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Spacer(minLength: 8)

                Picker("Status", selection: statusBinding) {
                    ForEach(IncidentStatusFilter.allCases) { filter in
                        Text(filter.title).tag(filter)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }

            if viewModel.hasLoadedOnce {
                Text(viewModel.filterSummary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, Theme.contentPadding)
        .padding(.top, 8)
        .padding(.bottom, 6)
    }

    /// The pickers write through the view model rather than binding straight to
    /// `@Published` properties, so the domain that `start(initialDomain:)` sets
    /// does not look like a user change and trigger a second fetch.
    private var domainBinding: Binding<IncidentDomain> {
        Binding(
            get: { viewModel.domain },
            set: { newValue in
                guard newValue != viewModel.domain else { return }
                viewModel.domain = newValue
                viewModel.reload()
            }
        )
    }

    private var statusBinding: Binding<IncidentStatusFilter> {
        Binding(
            get: { viewModel.statusFilter },
            set: { newValue in
                guard newValue != viewModel.statusFilter else { return }
                viewModel.statusFilter = newValue
                viewModel.reload()
            }
        )
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        if viewModel.incidents.isEmpty {
            emptyContent
        } else {
            list
        }
    }

    @ViewBuilder
    private var emptyContent: some View {
        if viewModel.isLoading && !viewModel.hasLoadedOnce {
            LoadingPlaceholder(text: "Loading incidents…")
                .frame(maxHeight: .infinity)
        } else if let message = viewModel.errorMessage {
            StatePlaceholder.error(message, retry: { viewModel.reload() })
                .frame(maxHeight: .infinity)
        } else {
            StatePlaceholder(
                symbol: viewModel.domain.symbolName,
                title: emptyTitle,
                message: emptyMessage
            )
            .frame(maxHeight: .infinity)
        }
    }

    private var list: some View {
        List {
            if let message = viewModel.errorMessage {
                ErrorBanner(message: message, onDismiss: { viewModel.errorMessage = nil })
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    .listRowBackground(Color.clear)
            }

            ForEach(viewModel.incidents) { incident in
                NavigationLink {
                    IncidentDetailView(
                        domain: viewModel.domain,
                        incident: incident,
                        viewModel: viewModel
                    )
                } label: {
                    IncidentListRow(incident: incident)
                }
            }

            Text(viewModel.filterSummary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
                .listRowBackground(Color.clear)
        }
        .listStyle(.insetGrouped)
        .refreshable { await viewModel.load() }
    }

    private var emptyTitle: String {
        viewModel.statusFilter == .all
            ? "No incidents"
            : "No \(viewModel.statusFilter.title.lowercased()) incidents"
    }

    private var emptyMessage: String {
        viewModel.statusFilter == .all
            ? viewModel.domain.emptyMessage
            : "Nothing in \(viewModel.domain.title) matches this status filter."
    }
}

// MARK: - Row

/// One incident. `description` is the only free-text field on the list schema,
/// so it is clamped to three lines.
private struct IncidentListRow: View {

    let incident: Incident

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                StatusChip(style: Theme.severityStyle(incident.severity), compact: true)
                StatusChip(style: Theme.incidentStyle(incident.status), compact: true)

                Spacer(minLength: 4)

                Text(incident.type)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Text(incident.description ?? "No description")
                .font(.subheadline)
                .foregroundStyle(incident.description == nil ? Color.secondary : Color.primary)
                .lineLimit(3)

            HStack(spacing: 10) {
                Label(Format.timestamp(incident.occurredAt), systemImage: "clock")
                Label(Format.optional(incident.cameraId), systemImage: "video")
                if let zone = incident.zone, !zone.isEmpty {
                    Label(zone, systemImage: "mappin.and.ellipse")
                }
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Detail

/// Everything one incident carries, plus the resolve / dismiss actions.
///
/// There is deliberately **no** "create incident" action anywhere in this file:
/// incidents only ever arrive from the edge over MQTT, and the API exposes no
/// HTTP endpoint (and no request model) for creating one.
struct IncidentDetailView: View {

    let domain: IncidentDomain
    let incident: Incident
    @ObservedObject var viewModel: IncidentsViewModel

    @EnvironmentObject private var auth: AuthStore

    /// The freshly fetched copy, if the single-incident request has answered.
    @State private var detail: Incident?
    @State private var isLoadingDetail = false
    @State private var loadError: String?

    @State private var resolutionNote = ""
    @State private var isSubmitting = false

    /// The row as it stands now: this screen's fetch first, then the list's copy
    /// (which a review updates in place), then the value passed in.
    private var current: Incident {
        detail
            ?? viewModel.incidents.first(where: { $0.id == incident.id })
            ?? incident
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let message = loadError {
                    ErrorBanner(message: message, onDismiss: { loadError = nil })
                }
                if let message = viewModel.actionError {
                    ErrorBanner(message: message, onDismiss: { viewModel.actionError = nil })
                }

                header
                detailsCard
                evidenceCard
                reviewCard

                Text("Incidents are raised by the edge over MQTT. There is no HTTP endpoint that creates one, so this app can only review them.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(Theme.contentPadding)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Incident")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loadDetail() }
        .task { await loadDetail() }
    }

    // MARK: Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                StatusChip(style: Theme.severityStyle(current.severity))
                StatusChip(style: Theme.incidentStyle(current.status))

                Spacer(minLength: 8)

                if isLoadingDetail {
                    ProgressView().controlSize(.small)
                }
            }

            Text(current.type)
                .font(.headline)

            // `description` is the field a reviewer reads first, so it is shown
            // here rather than as a right-aligned `InfoRow`.
            Text(current.description ?? "No description was recorded.")
                .font(.subheadline)
                .foregroundStyle(current.description == nil ? Color.secondary : Color.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var detailsCard: some View {
        SectionCard(title: "Details") {
            VStack(spacing: 8) {
                InfoRow(label: "Domain", value: domain.title)
                InfoRow(label: "Type", value: current.type)
                InfoRow(label: "Severity", value: Theme.severityStyle(current.severity).label)
                InfoRow(label: "Status", value: Theme.incidentStyle(current.status).label)
                InfoRow(label: "Camera", value: Format.optional(current.cameraId))
                InfoRow(label: "Employee", value: Format.optional(current.employeeCode))
                InfoRow(label: "Zone", value: Format.optional(current.zone))
                InfoRow(label: "Occurred", value: Format.timestamp(current.occurredAt))
                InfoRow(label: "Created", value: Format.timestamp(current.createdAt))
                // Gotcha: `resolved_at` is written server-side with a naive
                // `datetime.now()`, so its offset can be wrong and the instant it
                // renders as may be hours out. Prefer `updated_at` wherever there
                // is a choice — `Incident.sortDate` orders by it too.
                InfoRow(label: "Last updated", value: Format.timestamp(current.updatedAt))
                InfoRow(label: "Resolved at", value: Format.timestamp(current.resolvedAt))
                InfoRow(label: "Resolved by", value: Format.optional(current.resolvedBy))
                InfoRow(label: "Resolution note", value: Format.optional(current.resolutionNote))
                InfoRow(label: "Incident ID", value: current.id, monospacedValue: true)
            }
        }
    }

    private var evidenceCard: some View {
        SectionCard(title: "Evidence") {
            if evidenceEntries.isEmpty {
                Text("No evidence was recorded for this incident.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 8) {
                    // `evidenceEntries` is an array of tuples, and key paths
                    // cannot address tuple elements, so the rows are indexed.
                    ForEach(evidenceEntries.indices, id: \.self) { index in
                        InfoRow(
                            label: evidenceEntries[index].key,
                            value: evidenceEntries[index].value
                        )
                    }
                }
            }
        }
    }

    private var evidenceEntries: [(key: String, value: String)] {
        current.evidenceEntries
    }

    @ViewBuilder
    private var reviewCard: some View {
        SectionCard(title: "Review") {
            VStack(alignment: .leading, spacing: 12) {
                if !auth.canReview {
                    Text("Only administrators and managers can resolve or dismiss incidents.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else if current.isResolved {
                    Text("This incident is already \(Theme.incidentStyle(current.status).label.lowercased()), so the review actions are disabled.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                FormTextField(
                    label: "Resolution note (optional)",
                    text: $resolutionNote,
                    prompt: "What did you find?"
                )
                .disabled(!canReview)

                HStack(spacing: 12) {
                    Button {
                        submit("resolved")
                    } label: {
                        Label("Resolve", systemImage: "checkmark.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canReview)

                    Button(role: .destructive) {
                        submit("dismissed")
                    } label: {
                        Label("Dismiss", systemImage: "xmark.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(!canReview)
                }

                if isSubmitting {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Saving…")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Text("The server persists the status verbatim and does not validate it, so only “resolved” and “dismissed” are ever sent.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private var canReview: Bool {
        auth.canReview && !current.isResolved && !isSubmitting
    }

    // MARK: Actions

    private func loadDetail() async {
        isLoadingDetail = true
        loadError = nil
        do {
            let fresh = try await APIClient.shared.incident(domain: domain, id: incident.id)
            detail = fresh
            viewModel.apply(fresh)
        } catch {
            if !isCancellation(error) {
                loadError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            }
        }
        isLoadingDetail = false
    }

    /// `status` is stored verbatim by `PATCH /{domain}/{id}/resolve`, so the two
    /// values below are the only ones that may be sent.
    private func submit(_ status: String) {
        guard canReview else { return }
        isSubmitting = true
        viewModel.actionError = nil
        Task { await performSubmit(status) }
    }

    private func performSubmit(_ status: String) async {
        let trimmed = resolutionNote.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = IncidentResolve(
            status: status,
            resolutionNote: trimmed.isEmpty ? nil : trimmed
        )

        do {
            let updated = try await APIClient.shared.resolveIncident(
                domain: domain,
                id: current.id,
                body
            )
            detail = updated
            viewModel.apply(updated)
        } catch {
            viewModel.actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }

        isSubmitting = false
    }

    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let apiError = error as? APIError, apiError == .cancelled { return true }
        return false
    }
}

// MARK: - Preview

#Preview("Incidents") {
    NavigationStack {
        IncidentsView(initialDomain: .safety)
    }
    .environmentObject(AuthStore.preview())
}
