import Foundation
import SwiftUI

// MARK: - Filter

/// The `status` query parameter of `GET /leaves`.
///
/// `nil` (All) omits the parameter entirely, which is what the server expects
/// for "no filter" — an empty string would be treated as a literal status.
enum LeaveStatusFilter: String, CaseIterable, Identifiable {
    case all
    case pending
    case approved
    case rejected

    var id: String { rawValue }

    /// The value sent as `status`, or `nil` for All.
    var queryValue: String? {
        self == .all ? nil : rawValue
    }

    var title: String {
        switch self {
        case .all: return "All"
        case .pending: return "Pending"
        case .approved: return "Approved"
        case .rejected: return "Rejected"
        }
    }
}

// MARK: - Accumulated pages

/// What the screen keeps after one or more pages have been loaded.
///
/// `AsyncLoader` holds a single value, so paging is modelled by keeping the
/// items already fetched and appending to them. `total` comes from `Page` and
/// drives `hasMore`, which the backend does not expose directly.
struct LeavesAccumulated: Equatable {
    var items: [LeaveRequest] = []
    var total = 0
    var offset = 0

    var hasMore: Bool { offset + items.count < total }
    var nextOffset: Int { offset + items.count }
}

/// Counts for the filter bar. `pending` is the number the reviewer actually
/// cares about, so it stays visible whichever filter is selected.
struct LeaveStatusCounts: Equatable {
    var pending = 0
}

// MARK: - View model

@MainActor
final class LeavesViewModel: ObservableObject {

    /// Rows per request. The backend caps `limit` at 1000.
    static let pageSize = 50

    @Published private(set) var loader = AsyncLoader<LeavesAccumulated>()
    @Published private(set) var counts = LeaveStatusCounts()
    @Published private(set) var hasLoadedOnce = false
    @Published private(set) var isLoadingMore = false

    /// Last successful load, used for the "updated at" footer.
    @Published private(set) var lastLoadedAt: Date?

    /// Errors from an action (create / review / cancel) as opposed to the list
    /// load, which `AsyncLoader` reports itself.
    @Published var actionError: String?

    /// The message to show instead of the list. `AsyncLoader.errorMessage` is
    /// `private(set)`, so a failed *count* refresh — which must never blank the
    /// rows — is recorded here and folded in by `listErrorMessage`.
    @Published private(set) var listError: String?

    /// The reason the pending count is stale, shown as small print only.
    @Published private(set) var countError: String?

    /// Incremented for every new first-page request so a slow response that
    /// arrives after a newer one cannot overwrite it.
    private var generation = 0

    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    // MARK: Derived state

    var accumulated: LeavesAccumulated? { loader.value }

    var isLoadingInitial: Bool { loader.isInitialLoad }

    /// A failed *count* refresh must never blank the rows, so it is kept
    /// separate from `AsyncLoader`'s own error and shown as a banner instead.
    var listErrorMessage: String? {
        loader.errorMessage ?? listError
    }

    /// True once the emptiness of the list is real: a response came back, or a
    /// request failed — in which case the error state is the right thing to
    /// show and not "no leave requests".
    var receivedResponse: Bool {
        hasLoadedOnce || loader.errorMessage != nil || listError != nil
    }

    static let countPageSize = 100

    // MARK: Loading

    /// Re-reads the first page and replaces what is on screen.
    func refresh() async {
        await loadFirstPage(discardingExisting: true)
    }

    /// Pull-to-refresh entry point.
    func refreshFromUser() async {
        await refresh()
    }

    /// A saved value is applied locally so the list does not flash.
    func applyCreated(_ leave: LeaveRequest) {
        var current = loader.value ?? LeavesAccumulated()
        current.items.insert(leave, at: 0)
        current.total += 1
        loader.setValue(current)
        hasLoadedOnce = true
        lastLoadedAt = Date()
        actionError = nil
        Task { await refreshCounts() }
    }

    func applyDeleted(id: String) {
        guard var current = loader.value else { return }
        let before = current.items.count
        current.items.removeAll { $0.id == id }
        if current.items.count != before {
            current.total = max(0, current.total - 1)
        }
        loader.setValue(current)
        Task { await refreshCounts() }
    }

    /// Replaces one row after a review, so the chip flips without a re-fetch.
    func applyUpdated(_ leave: LeaveRequest) {
        guard var current = loader.value else { return }
        if let index = current.items.firstIndex(where: { $0.id == leave.id }) {
            current.items[index] = leave
        }
        loader.setValue(current)
        Task { await refreshCounts() }
    }

    /// Filter changed, or an explicit "try again".
    func reload(clearItems: Bool) {
        Task { await loadFirstPage(discardingExisting: clearItems) }
    }

    func clearListError() {
        listError = nil
        loader.clearError()
    }

    /// Starts a first-page load in the background.
    func startLoadInitial() {
        Task { await loadFirstPage(discardingExisting: true) }
    }

    /// Background poll: quietly re-reads the newest page.
    func poll() async {
        guard !loader.isLoading else { return }
        await refresh()
    }

    func loadMore() async {
        guard let current = loader.value, current.hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        actionError = nil
        let requestGeneration = generation
        defer { isLoadingMore = false }
        do {
            let page = try await client.leaves(
                employeeCode: nil,
                status: statusFilter.queryValue,
                limit: Self.pageSize,
                offset: current.nextOffset
            )
            guard requestGeneration == generation else { return }
            var updated = current
            // The server pages by `start_date desc`; guard against a row
            // shifting between requests and appearing twice.
            let known = Set(updated.items.map(\.id))
            updated.items.append(contentsOf: page.items.filter { !known.contains($0.id) })
            updated.total = page.total
            updated.offset = page.offset
            loader.setValue(updated)
            hasLoadedOnce = true
            lastLoadedAt = Date()
        } catch {
            if !isCancellation(error) {
                actionError = describe(error)
            }
        }
    }

    // MARK: Filters

    @Published var statusFilter: LeaveStatusFilter = .all

    /// True while a new value is being typed in the employee search field.
    var filterSummary: String {
        let count = loader.value?.items.count ?? 0
        let total = loader.value?.total ?? 0
        return total > count ? "Showing \(count) of \(total)" : "\(total) request\(total == 1 ? "" : "s")"
    }

    // MARK: Private

    private func loadFirstPage(discardingExisting: Bool) async {
        generation += 1
        let requestGeneration = generation

        actionError = nil
        listError = nil
        if discardingExisting {
            loader.setValue(LeavesAccumulated())
        }

        do {
            let page = try await client.leaves(
                employeeCode: nil,
                status: statusFilter.queryValue,
                limit: Self.pageSize,
                offset: 0
            )
            guard requestGeneration == generation else { return }
            loader.setValue(
                LeavesAccumulated(items: page.items, total: page.total, offset: page.offset)
            )
            hasLoadedOnce = true
            lastLoadedAt = Date()
        } catch {
            guard requestGeneration == generation else { return }
            if !isCancellation(error) {
                listError = describe(error)
            }
        }

        await refreshCounts()
    }

    /// The list response only counts the rows in the selected filter, so the
    /// pending total is fetched separately. A failure here is recorded but
    /// never replaces the rows on screen.
    private func refreshCounts() async {
        do {
            let page = try await client.leaves(
                employeeCode: nil,
                status: "pending",
                limit: Self.countPageSize,
                offset: 0
            )
            counts.pending = page.total
            countError = nil
        } catch {
            if !isCancellation(error) {
                countError = describe(error)
            }
        }
    }

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

/// Leave requests, read-mostly.
///
/// Deliberately not the Flutter screen's structure: that view has no loading
/// flag, so it renders "No pending leave requests." before the first response
/// has arrived. Here the empty state is produced by `LoadedContent` only once
/// a load has actually finished, and the extra `receivedResponse` guard covers
/// the same mistake inside an explicit empty state.
struct LeavesView: View {

    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = LeavesViewModel()

    @State private var isPresentingRequest = false

    var body: some View {
        LoadedContent(
            loader: viewModel.loader,
            emptySymbol: "beach.umbrella",
            emptyTitle: emptyTitle,
            emptyMessage: emptyMessage,
            onRetry: { viewModel.reload(clearItems: true) }
        ) { _ in
            list
        }
        // A failure to refresh the pending count must not hide the rows, so it
        // is surfaced as a banner above them instead of replacing them.
        .overlay(alignment: .top) {
            if let message = viewModel.listError {
                ErrorBanner(message: message) { viewModel.clearListError() }
                    .padding(.horizontal, Theme.contentPadding)
                    .padding(.top, 4)
            }
        }
        .navigationTitle("Leaves")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .sheet(isPresented: $isPresentingRequest) {
            LeaveRequestFormView { created in
                viewModel.applyCreated(created)
            }
            .environmentObject(auth)
        }
        .onAppear { viewModel.startLoadInitial() }
        .onChange(of: viewModel.statusFilter) { _, _ in
            viewModel.reload(clearItems: true)
        }
        .polling(every: AppConfig.pollInterval) { [weak viewModel] in
            await viewModel?.poll()
        }
    }

    // MARK: List

    private var list: some View {
        List {
            if let message = viewModel.actionError {
                Section {
                    ErrorBanner(message: message) { viewModel.actionError = nil }
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .listRowBackground(Color.clear)
                }
            }

            Section {
                filterPicker
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            } header: {
                pendingSummary
            }

            Section {
                // `receivedResponse` is belt and braces: `LoadedContent` cannot
                // render the list before a load has produced a value, but the
                // check makes "empty" mean "the server said it is empty"
                // explicitly rather than by construction.
                if viewModel.receivedResponse,
                   let loaded = viewModel.accumulated,
                   loaded.items.isEmpty {
                    emptyRow
                }

                ForEach(viewModel.accumulated?.items ?? []) { leave in
                    NavigationLink {
                        LeaveDetailView(leave: leave, viewModel: viewModel)
                    } label: {
                        LeaveRow(leave: leave)
                    }
                }

                if let summary = footerText {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .listRowBackground(Color.clear)
                }

                if viewModel.accumulated?.hasMore == true {
                    Button {
                        Task { await viewModel.loadMore() }
                    } label: {
                        HStack(spacing: 8) {
                            if viewModel.isLoadingMore {
                                ProgressView().controlSize(.small)
                            }
                            Text(viewModel.isLoadingMore ? "Loading…" : "Load older requests")
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                    }
                    .disabled(viewModel.isLoadingMore)
                }

                if let error = viewModel.countError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await viewModel.refreshFromUser() }
    }

    private var filterPicker: some View {
        Picker("Status", selection: $viewModel.statusFilter) {
            ForEach(LeaveStatusFilter.allCases) { filter in
                Text(filter.title).tag(filter)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
    }

    /// The pending count is the reviewer's primary number, so it appears here
    /// whichever filter is selected.
    private var pendingSummary: some View {
        HStack(spacing: 6) {
            if viewModel.hasLoadedOnce {
                Text(pendingLabel)
            } else {
                Text("Leave requests")
            }
            if viewModel.counts.pending > 0, viewModel.statusFilter != .pending {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(.orange)
            }
        }
    }

    private var pendingLabel: String {
        let count = viewModel.counts.pending
        return count == 1 ? "1 request awaiting review" : "\(count) requests awaiting review"
    }

    private var emptyRow: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray")
                .font(.system(size: 30))
                .foregroundStyle(.secondary)
            Text(emptyTitle)
                .font(.headline)
            Text(emptyMessage)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .listRowBackground(Color.clear)
    }

    private var emptyTitle: String {
        switch viewModel.statusFilter {
        case .all: return "No leave requests"
        case .pending: return "Nothing awaiting review"
        case .approved: return "No approved leave"
        case .rejected: return "No rejected leave"
        }
    }

    private var emptyMessage: String {
        switch viewModel.statusFilter {
        case .all:
            return "Leave requests created here will appear in this list."
        case .pending:
            return "Every pending request has been reviewed."
        case .approved:
            return "No request has been approved yet."
        case .rejected:
            return "No request has been rejected yet."
        }
    }

    private var footerText: String? {
        guard let loadedAt = viewModel.lastLoadedAt else { return nil }
        return "Updated \(Format.time(loadedAt)) · \(viewModel.filterSummary)"
    }

    // MARK: Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                Task { await viewModel.refresh() }
            } label: {
                if viewModel.isLoadingInitial {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "arrow.clockwise")
                }
            }
            .disabled(viewModel.isLoadingInitial)
            .accessibilityLabel("Refresh")
        }

        ToolbarItem(placement: .topBarTrailing) {
            Button {
                isPresentingRequest = true
            } label: {
                Image(systemName: "plus")
            }
            .accessibilityLabel("New leave request")
        }
    }
}

// MARK: - Row

/// One leave request. Shared by the list and (in spirit) the detail header.
struct LeaveRow: View {

    let leave: LeaveRequest

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(initials: initials, size: 40)

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(leave.employeeCode)
                        .font(.subheadline.weight(.semibold))
                    Spacer(minLength: 8)
                    StatusChip(style: Theme.leaveStyle(leave.status), compact: true)
                }

                Text(LeaveType.label(leave.leaveType))
                    .font(.subheadline)

                Text("\(Format.day(leave.startDate)) → \(Format.day(leave.endDate))")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let reviewedBy = leave.reviewedBy, !reviewedBy.isEmpty {
                    Label(reviewedBy, systemImage: "person.badge.shield.checkmark")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    /// The backend exposes no employee name on a leave row, only the code, so
    /// the avatar shows the first two characters of the code.
    private var initials: String {
        let trimmed = leave.employeeCode.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return "?" }
        let parts = trimmed.split(separator: "-").prefix(2).compactMap { $0.first }
        if parts.count >= 2 {
            return String(parts).uppercased()
        }
        return String(trimmed.prefix(2)).uppercased()
    }
}

// MARK: - Detail

/// The two review decisions the server accepts. The raw value is sent verbatim
/// as `LeaveReview.status`, so it must stay exactly `approved` / `rejected`.
enum LeaveReviewAction: String, Identifiable, CaseIterable {
    case approved
    case rejected

    var id: String { rawValue }

    var title: String { self == .approved ? "Approve" : "Reject" }

    var explanation: String {
        self == .approved
            ? "The employee will be marked as on leave for these dates."
            : "The employee keeps their attendance for these dates."
    }
}

struct LeaveDetailView: View {

    let leave: LeaveRequest
    @ObservedObject var viewModel: LeavesViewModel

    @EnvironmentObject private var auth: AuthStore

    @State private var reviewAction: LeaveReviewAction?
    @State private var isConfirmingCancel = false
    @State private var isWorking = false
    @State private var localError: String?

    /// The row as it is now, so a review made in this screen is reflected
    /// immediately rather than showing the stale copy passed in.
    private var current: LeaveRequest {
        viewModel.accumulated?.items.first { $0.id == leave.id } ?? leave
    }

    var body: some View {
        List {
            if let message = localError ?? viewModel.actionError {
                Section {
                    ErrorBanner(message: message) {
                        localError = nil
                        viewModel.actionError = nil
                    }
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    .listRowBackground(Color.clear)
                }
            }

            Section {
                SectionCard(title: "Request") {
                    InfoRow(label: "Employee", value: current.employeeCode)
                    InfoRow(label: "Type", value: LeaveType.label(current.leaveType))
                    InfoRow(label: "From", value: Format.day(current.startDate))
                    InfoRow(label: "To", value: Format.day(current.endDate))
                    InfoRow(label: "Status", value: Theme.leaveStyle(current.status).label)
                    if let reviewedBy = current.reviewedBy, !reviewedBy.isEmpty {
                        InfoRow(label: "Reviewed by", value: reviewedBy)
                    }
                    if let reviewedAt = current.reviewedAt {
                        InfoRow(label: "Reviewed at", value: Format.shortDateTime(reviewedAt))
                    }
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                .listRowBackground(Color.clear)
            }

            Section("Reason") {
                if let reason = current.reason, !reason.isEmpty {
                    Text(reason)
                        .font(.subheadline)
                } else {
                    Text("No reason given.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            if auth.canReview {
                reviewSection
            }

            cancelSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Leave request")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $reviewAction) { action in
            LeaveReviewSheet(action: action) { note in
                await review(status: action.rawValue, note: note)
            }
        }
        .alert("Cancel this request?", isPresented: $isConfirmingCancel) {
            Button("Cancel request", role: .destructive) { cancel() }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("The request is deleted permanently. This cannot be undone.")
        }
    }

    // MARK: Sections

    @ViewBuilder
    private var reviewSection: some View {
        Section("Review") {
            if current.isPending {
                // The note is optional. The server APPENDS it to `reason` as
                // "\n[Review note] <note>", so the original text is never lost.
                Button {
                    reviewAction = .approved
                } label: {
                    Label("Approve", systemImage: "checkmark.circle")
                }
                .disabled(isWorking)

                Button(role: .destructive) {
                    reviewAction = .rejected
                } label: {
                    Label("Reject", systemImage: "xmark.circle")
                }
                .disabled(isWorking)
            } else {
                Text("Only pending requests can be reviewed. This one is already '\(current.status)' — the server answers 409 \"Leave request is already '\(current.status)'\".")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var cancelSection: some View {
        Section {
            if current.isApproved {
                // DELETE /leaves/{id} answers 409 for an approved row, so the
                // action is disabled rather than offered and then refused.
                Text("An approved request cannot be cancelled. Ask a reviewer to reject it instead.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Button(role: .destructive) {
                    isConfirmingCancel = true
                } label: {
                    Label("Cancel request", systemImage: "trash")
                }
                .disabled(isWorking)
            }
        }
    }

    // MARK: Actions

    private func review(status: String, note: String?) async {
        guard auth.canReview, current.isPending, !isWorking else { return }
        isWorking = true
        localError = nil
        viewModel.actionError = nil

        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = LeaveReview(
            status: status,
            note: (trimmed?.isEmpty == false) ? trimmed : nil
        )

        do {
            let updated = try await APIClient.shared.reviewLeave(id: current.id, body)
            viewModel.applyUpdated(updated)
        } catch {
            localError = describeReview(error)
        }
        isWorking = false
    }

    private func cancel() {
        guard !isWorking else { return }
        isWorking = true
        localError = nil
        viewModel.actionError = nil

        let id = current.id
        Task {
            do {
                try await APIClient.shared.deleteLeave(id: id)
                viewModel.applyDeleted(id: id)
            } catch {
                localError = describe(error)
            }
            isWorking = false
        }
    }

    /// 409 from `PATCH /leaves/{id}/review` means the request moved on while
    /// this screen was open.
    private func describeReview(_ error: Error) -> String {
        if let apiError = error as? APIError, case .conflict(let detail) = apiError {
            if detail.localizedCaseInsensitiveContains("already") {
                return "This request was already reviewed by someone else. Pull to refresh to see its current state."
            }
            return detail
        }
        return describe(error)
    }

    private func describe(_ error: Error) -> String {
        (error as? APIError)?.localizedDescription ?? error.localizedDescription
    }
}

// MARK: - Review sheet

/// Collects the optional note for an approve/reject, then hands it back.
///
/// The note matters because the server does not store it separately: it appends
/// `"\n[Review note] <note>"` to the request's `reason`.
struct LeaveReviewSheet: View {

    let action: LeaveReviewAction
    let onSubmit: (String?) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(action.title + " this request?")
                            .font(.headline)
                        Text(action.explanation)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }

                Section {
                    TextEditor(text: $note)
                        .frame(minHeight: 100)
                        .disabled(isSubmitting)
                } header: {
                    Text("Note (optional)")
                } footer: {
                    Text("Leave this empty to review without a note. A note is added to the request's reason as \"[Review note] …\".")
                }
            }
            .navigationTitle(action.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        submit()
                    } label: {
                        if isSubmitting {
                            ProgressView().controlSize(.small)
                        } else {
                            Text(action.title)
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
        }
    }

    private func submit() {
        guard !isSubmitting else { return }
        isSubmitting = true
        let value = note
        Task {
            await onSubmit(value)
            isSubmitting = false
            dismiss()
        }
    }
}

// MARK: - Create form

/// `POST /leaves` in a sheet.
///
/// `employee_code` is a foreign key on the server: a code that does not exist
/// surfaces as 409 "Data conflict", so the field is a picker over real
/// employee records rather than free text.
struct LeaveRequestFormView: View {

    /// Called with the created request so the list can insert it without a
    /// full reload.
    let onCreated: (LeaveRequest) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var employees: [Employee] = []
    @State private var isLoadingEmployees = false
    @State private var employeesError: String?
    @State private var searchText = ""

    @State private var employeeCode: String?
    @State private var leaveType = LeaveType.all.first ?? "annual"
    @State private var startDate = Date()
    @State private var endDate = Date()
    @State private var reason = ""

    @State private var isSubmitting = false
    @State private var localError: String?

    private let client = APIClient.shared
    private let pageSize = 100

    /// Only one extra page is requested; the search field covers the rest.
    private var filteredEmployees: [Employee] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return employees }
        return employees.filter {
            $0.code.localizedCaseInsensitiveContains(query)
                || $0.name.localizedCaseInsensitiveContains(query)
        }
    }

    // Leave dates are calendar days the user picks in their own timezone, so
    // they are formatted in the *device* timezone. Formatting them in UTC would
    // file a request a day early for anyone east of Greenwich late in the
    // evening (and a day late west of it).
    private var startISODay: String { Format.localISODay(startDate) }
    private var endISODay: String { Format.localISODay(endDate) }

    /// Compared as `yyyy-MM-dd` rather than as `Date`s, because that is exactly
    /// what is sent and what the server validates ("end_date must be >= start_date").
    private var isDateRangeValid: Bool { endISODay >= startISODay }

    private var canSubmit: Bool {
        employeeCode != nil && isDateRangeValid && !isSubmitting
    }

    var body: some View {
        NavigationStack {
            List {
                if let message = localError ?? employeesError {
                    Section {
                        ErrorBanner(message: message) { localError = nil }
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                            .listRowBackground(Color.clear)
                    }
                }

                employeeSection
                detailsSection
                reasonSection
            }
            .listStyle(.insetGrouped)
            .navigationTitle("New leave request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    submitButton
                }
            }
        }
        .task { await loadEmployees() }
    }

    // MARK: Sections

    @ViewBuilder
    private var employeeSection: some View {
        Section {
            if isLoadingEmployees, employees.isEmpty {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Loading employees…")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } else if employees.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("No active employees could be loaded.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("Try again") {
                        Task { await loadEmployees() }
                    }
                    .font(.footnote)
                }
            } else {
                Picker("Employee", selection: $employeeCode) {
                    Text("Select an employee").tag(String?.none)
                    ForEach(filteredEmployees) { employee in
                        Text("\(employee.name) · \(employee.code)")
                            .tag(String?.some(employee.code))
                    }
                }
                .pickerStyle(.navigationLink)

                TextField("Search name or code", text: $searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        } header: {
            Text("Employee")
        } footer: {
            Text("A leave request needs a real employee code; the server rejects unknown ones with a conflict.")
        }
    }

    @ViewBuilder
    private var detailsSection: some View {
        Section("Leave") {
            Picker("Type", selection: $leaveType) {
                ForEach(LeaveType.all, id: \.self) { type in
                    Text(LeaveType.label(type)).tag(type)
                }
            }

            DatePicker(
                "Start",
                selection: $startDate,
                displayedComponents: [.date]
            )

            DatePicker(
                "End",
                selection: $endDate,
                in: startDate...,
                displayedComponents: [.date]
            )

            if !isDateRangeValid {
                Text("The end date must be on or after the start date.")
                    .font(.caption)
                    .foregroundStyle(.red)
            } else {
                Text("\(Format.day(startISODay)) → \(Format.day(endISODay))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var reasonSection: some View {
        Section {
            TextEditor(text: $reason)
                .frame(minHeight: 100)
                .disabled(isSubmitting)
        } header: {
            Text("Reason (optional)")
        }
    }

    private var submitButton: some View {
        Button {
            submit()
        } label: {
            if isSubmitting {
                ProgressView().controlSize(.small)
            } else {
                Text("Submit")
            }
        }
        .disabled(!canSubmit)
    }

    // MARK: Data

    private func loadEmployees() async {
        guard !isLoadingEmployees else { return }
        isLoadingEmployees = true
        employeesError = nil
        do {
            let page = try await client.employees(
                query: nil,
                active: true,
                limit: pageSize,
                offset: 0
            )
            employees = page.items
        } catch {
            employeesError = describe(error)
        }
        isLoadingEmployees = false
    }

    // MARK: Submit

    private func submit() {
        guard canSubmit, let code = employeeCode else { return }
        guard isDateRangeValid else {
            localError = "The end date must be on or after the start date."
            return
        }

        isSubmitting = true
        localError = nil

        let trimmedReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = LeaveCreate(
            employeeCode: code,
            leaveType: leaveType,
            startDate: startISODay,
            endDate: endISODay,
            reason: trimmedReason.isEmpty ? nil : trimmedReason
        )

        Task {
            do {
                let created = try await client.createLeave(body)
                onCreated(created)
                isSubmitting = false
                dismiss()
            } catch {
                localError = describeCreate(error)
                isSubmitting = false
            }
        }
    }

    /// `POST /leaves` overloads 409 for two different problems, and the only
    /// way to tell them apart is the `detail` text the server sends.
    private func describeCreate(_ error: Error) -> String {
        if let apiError = error as? APIError, case .conflict(let detail) = apiError {
            if detail.localizedCaseInsensitiveContains("overlap") {
                return "\(detail). This employee already has a pending or approved request that covers one of these days."
            }
            return "The employee code was rejected by the server (\(detail)). Pick an employee from the list and try again."
        }
        return describe(error)
    }

    private func describe(_ error: Error) -> String {
        (error as? APIError)?.localizedDescription ?? error.localizedDescription
    }
}

// MARK: - Preview

#Preview("Leaves") {
    NavigationStack {
        LeavesView()
    }
    .environmentObject(AuthStore.preview())
}

#Preview("Row") {
    List {
        LeaveRow(leave: .preview)
        LeaveRow(
            leave: LeaveRequest(
                id: "00000000-0000-0000-0000-000000000031",
                employeeCode: "emp-002",
                leaveType: "sick",
                startDate: "2026-10-05",
                endDate: "2026-10-06",
                reason: "Flu\n[Review note] Get well soon",
                status: "approved",
                reviewedBy: "admin",
                reviewedAt: Date(),
                createdAt: Date(),
                updatedAt: Date()
            )
        )
    }
    .environmentObject(AuthStore.preview())
}

#Preview("Request form") {
    LeaveRequestFormView { _ in }
        .environmentObject(AuthStore.preview())
}
