import SwiftUI

// MARK: - Screen

/// Event log with a rolling time window plus camera and type filters.
///
/// The screen lives inside the shell's `NavigationStack`, so it deliberately
/// does not create one of its own.
///
/// Three behaviours here are load-bearing:
/// * `since` is compared server-side against a `timestamptz` column, so it is
///   always sent, and always as a `Date`: `APIClient` serialises it with
///   `DateParsing.iso8601`, which carries an explicit trailing `Z`. Building a
///   date string by hand is what produces the timezone bugs.
/// * Omitting `since` makes the server fall back to the last 60 minutes, which
///   looks like missing history. The picker therefore always sends a window and
///   defaults to one hour, so the range on screen is the range requested.
/// * The backend has no push channel for events — its SSE route is not even
///   mounted — so the list polls on a timer and can be pulled to refresh.
struct EventsView: View {

    @StateObject private var viewModel = EventsViewModel()

    var body: some View {
        EventsContentView(viewModel: viewModel, loader: viewModel.loader)
            .navigationTitle("Events")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await viewModel.refreshAll() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Refresh events")
                }
            }
            .polling(every: AppConfig.pollInterval) {
                await viewModel.poll()
            }
    }
}

// MARK: - View model

@MainActor
final class EventsViewModel: ObservableObject {

    /// A rolling time window, mapped onto the `since` query parameter.
    struct Window: Identifiable, Hashable {
        let id: String
        let label: String
        let shortLabel: String
        let seconds: TimeInterval

        static let fifteenMinutes = Window(id: "15m", label: "Last 15 minutes", shortLabel: "15m", seconds: 15 * 60)
        static let oneHour = Window(id: "1h", label: "Last hour", shortLabel: "1h", seconds: 60 * 60)
        static let eightHours = Window(id: "8h", label: "Last 8 hours", shortLabel: "8h", seconds: 8 * 60 * 60)
        static let oneDay = Window(id: "24h", label: "Last 24 hours", shortLabel: "24h", seconds: 24 * 60 * 60)
        static let sevenDays = Window(id: "7d", label: "Last 7 days", shortLabel: "7d", seconds: 7 * 24 * 60 * 60)

        static let all: [Window] = [.fifteenMinutes, .oneHour, .eightHours, .oneDay, .sevenDays]
    }

    /// Every value the `type` query parameter accepts: the attendance types, the
    /// edge lifecycle types and the incident type.
    static let typeOptions: [String] =
        EventType.attendanceTypes + EventType.edgeTypes + EventType.incidentTypes

    // MARK: Filters

    @Published var window: Window = .oneHour
    /// `nil` means every camera; otherwise sent as `camera_id`.
    @Published var cameraId: String?
    /// `nil` means every type; otherwise sent as `type`.
    @Published var typeFilter: String?

    // MARK: Data

    /// Populated from `eventCameras()`, which returns the **thin**
    /// `CameraListItem` schema — not `Camera`.
    @Published private(set) var cameras: [CameraListItem] = []
    @Published private(set) var isLoadingMore = false
    /// Non-blocking failures: the camera list, or a "load more" that failed
    /// while an earlier page is still on screen.
    @Published var actionError: String?

    let loader: AsyncLoader<Page<Event>>

    private let client: APIClient
    private let pageSize: Int
    private var didLoadCameras = false
    /// Set when the server still claims more pages but hands back an empty one,
    /// so the list stops asking for them.
    private var reachedEnd = false
    /// Bumped on every page-one reload, so a stale "load more" response is
    /// dropped instead of clobbering the new filters.
    private var loadGeneration = 0

    init(client: APIClient = .shared, pageSize: Int = 100) {
        self.client = client
        self.pageSize = pageSize
        self.loader = AsyncLoader<Page<Event>>()
    }

    /// True while another page can still be requested.
    var canLoadMore: Bool { !reachedEnd && (loader.value?.hasMore ?? false) }

    // MARK: - Loading

    /// Pull-to-refresh, the toolbar button and the retry button.
    func refreshAll() async {
        await loadCameras()
        await refresh()
    }

    /// Polled by `.polling(every:)`; the camera list changes rarely, so it is
    /// fetched once per screen visit rather than on every tick.
    func poll() async {
        guard !isLoadingMore else { return }
        if !didLoadCameras {
            await loadCameras()
        }
        await refresh()
    }

    /// Re-reads page one for the current filters.
    func refresh() async {
        loadGeneration += 1
        reachedEnd = false

        // Read the main-actor state up front so the request closure captures
        // only immutable locals.
        let client = self.client
        let since = Date().addingTimeInterval(-window.seconds)
        let cameraId = self.cameraId
        let typeFilter = self.typeFilter
        let limit = pageSize

        await loader.refresh {
            try await client.events(
                since: since,
                cameraId: cameraId,
                type: typeFilter,
                limit: limit,
                offset: 0
            )
        }
    }

    /// `GET /events/cameras/list` — a bare array of the thin camera schema.
    func loadCameras() async {
        let client = self.client
        do {
            let list = try await client.eventCameras()
            cameras = list
            didLoadCameras = true
            // A camera that vanished from the list must not stay selected.
            if let selected = cameraId, !list.contains(where: { $0.id == selected }) {
                cameraId = nil
            }
        } catch {
            actionError = Self.message(for: error)
        }
    }

    /// Requests the next page once the last row comes on screen.
    func loadMoreIfNeeded(current event: Event) {
        guard !isLoadingMore, !reachedEnd else { return }
        guard let page = loader.value, page.hasMore else { return }
        guard page.items.last?.id == event.id else { return }
        Task { await self.loadMore() }
    }

    private func loadMore() async {
        guard !isLoadingMore, !reachedEnd else { return }
        guard let page = loader.value, page.hasMore else { return }

        isLoadingMore = true
        defer { isLoadingMore = false }

        let generation = loadGeneration
        let client = self.client
        let since = Date().addingTimeInterval(-window.seconds)
        let cameraId = self.cameraId
        let typeFilter = self.typeFilter
        let limit = pageSize
        let offset = page.offset + page.items.count

        do {
            let next = try await client.events(
                since: since,
                cameraId: cameraId,
                type: typeFilter,
                limit: limit,
                offset: offset
            )

            // The filters changed while this page was in flight.
            guard !Task.isCancelled, generation == loadGeneration else { return }

            if next.items.isEmpty {
                // `Page.hasMore` is derived from `total`, which may have shrunk
                // between requests; one empty page means "stop asking".
                reachedEnd = true
                return
            }

            loader.setValue(
                Page(
                    items: page.items + next.items,
                    total: next.total,
                    limit: next.limit,
                    offset: page.offset
                )
            )
        } catch {
            actionError = Self.message(for: error)
        }
    }

    private static func message(for error: Error) -> String {
        (error as? APIError)?.localizedDescription ?? error.localizedDescription
    }
}

// MARK: - Content

/// Split out from `EventsView` so the `AsyncLoader` inside the view model can be
/// observed directly: SwiftUI does not forward a nested `ObservableObject`'s
/// changes through its owner.
private struct EventsContentView: View {

    @ObservedObject var viewModel: EventsViewModel
    @ObservedObject var loader: AsyncLoader<Page<Event>>

    var body: some View {
        VStack(spacing: 0) {
            filterBar

            if let message = viewModel.actionError {
                ErrorBanner(message: message, onDismiss: { viewModel.actionError = nil })
                    .padding(.horizontal, Theme.contentPadding)
                    .padding(.top, 8)
            }

            LoadedContent(
                loader: loader,
                emptySymbol: "bell.slash",
                emptyTitle: "No events yet",
                emptyMessage: "Nothing has been recorded for these filters.",
                onRetry: { reload() }
            ) { (page: Page<Event>) in
                eventList(page)
            }
        }
        .background(Color(uiColor: .systemGroupedBackground))
        // Every filter is a server-side query parameter, so changing one
        // re-reads page one with the new filters.
        .onChange(of: viewModel.window) { _, _ in reload() }
        .onChange(of: viewModel.cameraId) { _, _ in reload() }
        .onChange(of: viewModel.typeFilter) { _, _ in reload() }
    }

    // MARK: Filters

    private var filterBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Time window", selection: $viewModel.window) {
                ForEach(EventsViewModel.Window.all) { window in
                    Text(window.shortLabel).tag(window)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityLabel("Time window")

            Text("Server window: \(viewModel.window.label) — sent as an explicit UTC `since`.")
                .font(.caption2)
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Picker("Camera", selection: $viewModel.cameraId) {
                    Text("All cameras").tag(String?.none)
                    ForEach(viewModel.cameras) { camera in
                        Text(EventDisplay.cameraLabel(camera)).tag(Optional(camera.id))
                    }
                }
                .pickerStyle(.menu)

                Picker("Type", selection: $viewModel.typeFilter) {
                    Text("All types").tag(String?.none)
                    ForEach(EventsViewModel.typeOptions, id: \.self) { type in
                        Text(EventType.label(type)).tag(Optional(type))
                    }
                }
                .pickerStyle(.menu)
            }
        }
        .padding(.horizontal, Theme.contentPadding)
        .padding(.vertical, 10)
        .background(Color(uiColor: .systemGroupedBackground))
    }

    // MARK: List

    @ViewBuilder
    private func eventList(_ page: Page<Event>) -> some View {
        if page.items.isEmpty {
            ScrollView {
                StatePlaceholder(
                    symbol: "bell.slash",
                    title: "No events in this window",
                    message: "Nothing matched. Try a longer time window, or clear the camera and type filters.",
                    actionTitle: "Search the last 24 hours",
                    action: { viewModel.window = .oneDay }
                )
                .padding(.top, 40)
            }
            .refreshable { await viewModel.refreshAll() }
        } else {
            List {
                Section {
                    ForEach(page.items) { event in
                        NavigationLink {
                            EventDetailView(event: event)
                        } label: {
                            EventRow(event: event)
                        }
                        .onAppear { viewModel.loadMoreIfNeeded(current: event) }
                    }

                    if viewModel.isLoadingMore {
                        HStack(spacing: 8) {
                            ProgressView()
                                .controlSize(.small)
                            Text("Loading more…")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text(EventDisplay.countLabel(total: page.total, shown: page.items.count))
                } footer: {
                    if !viewModel.canLoadMore {
                        Text("End of results.")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await viewModel.refreshAll() }
        }
    }

    private func reload() {
        let viewModel = self.viewModel
        Task { await viewModel.refresh() }
    }
}

// MARK: - Row

private struct EventRow: View {

    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                StatusChip(style: Theme.eventStyle(event.type), compact: true)
                Spacer(minLength: 8)
                Text(Format.relative(event.effectiveTimestamp))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 14) {
                EventFact(symbol: "person", text: Format.optional(event.employeeCode))
                EventFact(symbol: "video", text: event.cameraId)
            }

            HStack(spacing: 14) {
                if let zone = event.zone, !zone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    EventFact(symbol: "mappin.and.ellipse", text: zone)
                }
                EventFact(symbol: "clock", text: Format.timestamp(event.effectiveTimestamp))
            }

            if event.confidence != nil || event.trackId != nil {
                HStack(spacing: 14) {
                    if let confidence = EventDisplay.confidence(event.confidence) {
                        EventFact(symbol: "percent", text: confidence)
                    }
                    if let track = EventDisplay.track(event.trackId) {
                        EventFact(symbol: "number", text: track)
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

private struct EventFact: View {

    let symbol: String
    let text: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol)
                .font(.caption2)
            Text(text)
                .font(.caption)
                .lineLimit(1)
        }
        .foregroundStyle(.secondary)
    }
}

// MARK: - Detail

/// Every field `/events` returns for a single event.
///
/// `snapshot_path` exists on the server model but is **not** serialized by the
/// backend, so no snapshot is available here — there is deliberately no image
/// request and nothing to fetch.
struct EventDetailView: View {

    let event: Event

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                summaryCard
                timingCard
                metadataCard
                snapshotNote
            }
            .padding(Theme.contentPadding)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Event")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            StatusChip(style: Theme.eventStyle(event.type))
            Text(EventType.label(event.type))
                .font(.title3.weight(.semibold))
            Text("\(Format.relative(event.effectiveTimestamp)) · \(Format.timestamp(event.effectiveTimestamp))")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var summaryCard: some View {
        SectionCard(title: "Event") {
            InfoRow(label: "Type", value: event.type)
            InfoRow(label: "Camera", value: event.cameraId)
            InfoRow(label: "Zone", value: Format.optional(event.zone))
            InfoRow(label: "Employee", value: Format.optional(event.employeeCode))
            InfoRow(label: "Confidence", value: EventDisplay.confidence(event.confidence) ?? "—")
            InfoRow(label: "Track ID", value: EventDisplay.track(event.trackId) ?? "—")
            InfoRow(label: "Event ID", value: event.id, monospacedValue: true)
        }
    }

    private var timingCard: some View {
        SectionCard(title: "Timing") {
            InfoRow(label: "ts (UTC)", value: Format.timestamp(event.ts))
            InfoRow(label: "ts (ISO 8601)", value: DateParsing.iso8601.string(from: event.ts), monospacedValue: true)
            InfoRow(label: "local_ts", value: Format.timestamp(event.localTs))
            InfoRow(label: "local_ts (ISO 8601)", value: localISO, monospacedValue: true)

            Text("Attendance is filed by the UTC day. `local_ts` is the camera-side wall clock when the edge supplied one, and `ts` is the UTC instant.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private var metadataCard: some View {
        SectionCard(title: "Metadata") {
            if metaRows.isEmpty {
                Text("This event carries no metadata.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(metaRows) { row in
                    InfoRow(label: row.label, value: row.value, monospacedValue: true)
                }
            }
        }
    }

    private var snapshotNote: some View {
        Text("Snapshots are not exposed by the events API, so no image is shown for this event.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Derived

    /// `local_ts` is optional on the wire, so it is rendered as `—` when absent.
    private var localISO: String {
        guard let localTs = event.localTs else { return "—" }
        return DateParsing.iso8601.string(from: localTs)
    }

    private var metaRows: [EventMetaRow] {
        event.metaEntries.map { EventMetaRow(label: $0.key, value: $0.value) }
    }
}

/// `metaEntries` is a sorted array of tuples, which `ForEach` cannot identify
/// directly, so it is mapped onto this small `Identifiable` row model.
private struct EventMetaRow: Identifiable {
    let label: String
    let value: String

    var id: String { label }
}

// MARK: - Presentation helpers

private enum EventDisplay {

    /// `0.92` → `92%`. The edge publishes a 0…1 fraction, but a value that
    /// already arrived as a percentage is passed through rather than scaled
    /// again.
    static func confidence(_ value: Double?) -> String? {
        guard let value else { return nil }
        let percent = value <= 1 ? value * 100 : value
        return "\(Int(percent.rounded()))%"
    }

    static func track(_ value: Int?) -> String? {
        guard let value else { return nil }
        return "track \(value)"
    }

    /// The thin camera schema has no `name`, so the zone is the best label.
    static func cameraLabel(_ camera: CameraListItem) -> String {
        let zone = camera.zone.trimmingCharacters(in: .whitespacesAndNewlines)
        return zone.isEmpty ? camera.id : "\(camera.id) · \(zone)"
    }

    static func countLabel(total: Int, shown: Int) -> String {
        let noun = total == 1 ? "event" : "events"
        return shown < total ? "\(total) \(noun) (showing \(shown))" : "\(total) \(noun)"
    }
}

// MARK: - Previews

#if DEBUG
#Preview {
    NavigationStack {
        EventsView()
    }
    .environmentObject(AuthStore.preview())
}

#Preview("Event detail") {
    NavigationStack {
        EventDetailView(event: .preview)
    }
    .environmentObject(AuthStore.preview())
}
#endif
