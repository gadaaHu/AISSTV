import SwiftUI

/// Administrator-only user management: list, create, edit, (de)activate.
///
/// Swift rewrite of `mobile/lib/screens/users_screen.dart`, with the two
/// dangerous shortcuts of that screen removed:
///
/// * the Flutter screen addressed every write by `username` too, but nothing
///   stopped a caller from reaching for `id` — users are **not** addressed by
///   `id` anywhere in this file.
/// * `PATCH /users/{username}` cannot change a password and, because the server
///   applies `exclude_none=True`, cannot clear a field either. The edit form
///   therefore offers full name, role and active only.
///
/// The tab is hidden for non-admins by `HomeShellView`, but that is a
/// convenience: the server independently enforces the admin role, so every
/// destructive control here is additionally gated on `auth.isAdmin`.
struct UsersView: View {

    @EnvironmentObject private var auth: AuthStore
    @StateObject private var model = UsersViewModel()

    @State private var showingCreate = false
    @State private var editingUser: AppUser?
    @State private var pendingDeactivation: AppUser?

    var body: some View {
        List {
            if let message = model.actionError {
                Section {
                    ErrorBanner(message: message) { model.clearActionError() }
                        .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                        .listRowBackground(Color.clear)
                }
            }

            if !model.isLoading, model.errorMessage == nil, model.actionError == nil, model.users.isEmpty {
                Section {
                    StatePlaceholder(
                        symbol: "person.2.slash",
                        title: "No users",
                        message: model.filter == .all
                            ? "No accounts are registered on this server."
                            : "No \(model.filter.title.lowercased()) accounts match this filter."
                    )
                    .listRowBackground(Color.clear)
                }
            }

            if !model.users.isEmpty {
                Section {
                    ForEach(model.users) { user in
                        Button {
                            editingUser = user
                        } label: {
                            UserRow(user: user)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if user.active {
                                Button(role: .destructive) {
                                    requestDeactivation(of: user)
                                } label: {
                                    Label("Deactivate", systemImage: "person.crop.circle.badge.minus")
                                }
                            }
                        }
                    }

                    if model.hasMore {
                        HStack {
                            Spacer()
                            if model.isLoadingMore {
                                ProgressView()
                            } else {
                                Button("Load more") {
                                    Task { await model.loadMore() }
                                }
                                .font(.footnote.weight(.medium))
                            }
                            Spacer()
                        }
                    }
                } footer: {
                    Text("Accounts are never deleted — deactivating sets `active` to false, which blocks sign-in but keeps the audit history.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .safeAreaInset(edge: .top, spacing: 0) {
            filterPicker
        }
        .overlay {
            if model.isLoading, model.users.isEmpty {
                LoadingPlaceholder(text: "Loading users…")
            }
        }
        .navigationTitle("Users")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    Task { await model.loadFirstPage() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(model.isLoading)
                .accessibilityLabel("Refresh")
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingCreate = true
                } label: {
                    Image(systemName: "plus")
                }
                .disabled(!auth.isAdmin)
                .accessibilityLabel("Add user")
            }
        }
        .task { await model.loadFirstPage() }
        .refreshable { await model.refresh() }
        .sheet(isPresented: $showingCreate) {
            CreateUserSheet(model: model)
        }
        .sheet(item: $editingUser) { user in
            EditUserSheet(model: model, user: user, currentUsername: auth.currentUser?.username)
        }
        // Deactivation is a two-step flow: the swipe opens this dialog, and the
        // server-side effect only happens once the admin confirms.
        .confirmationDialog(
            deactivationTitle,
            isPresented: deactivationDialogBinding,
            titleVisibility: .visible
        ) {
            Button("Deactivate", role: .destructive) {
                guard let user = pendingDeactivation else { return }
                pendingDeactivation = nil
                Task { await model.deactivate(username: user.username) }
            }
            Button("Cancel", role: .cancel) {
                pendingDeactivation = nil
            }
        } message: {
            Text(deactivationMessage)
        }
    }

    // MARK: - Filter

    private var filterPicker: some View {
        Picker("Status", selection: $model.filter) {
            ForEach(UserActiveFilter.allCases) { option in
                Text(option.title).tag(option)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, Theme.contentPadding)
        .padding(.vertical, 8)
        .background(.regularMaterial)
        .onChange(of: model.filter) { _, _ in
            Task { await model.loadFirstPage() }
        }
    }

    // MARK: - Deactivation safety

    /// Drives the confirmation dialog from the optional target rather than a
    /// separate boolean, so the two can never disagree.
    private var deactivationDialogBinding: Binding<Bool> {
        Binding(
            get: { pendingDeactivation != nil },
            set: { if !$0 { pendingDeactivation = nil } }
        )
    }

    private var deactivationTitle: String {
        guard let user = pendingDeactivation else { return "Deactivate user?" }
        return "Deactivate \(user.displayName)?"
    }

    /// Warns when the target is the only active administrator. The server has no
    /// guard here, so this is a warning, not a block — but it is only raised when
    /// the whole list has been paged in, so an administrator sitting on a later
    /// page cannot produce a false alarm.
    private var deactivationMessage: String {
        guard let user = pendingDeactivation else { return "" }

        var lines = [
            "This sets `active` to false for \(user.username). They keep their data but can no longer sign in.",
            "The only way back is to edit the account and switch Active on again.",
        ]

        if user.isAdmin, user.active, !model.hasMore,
           model.users.filter({ $0.isAdmin && $0.active }).count == 1 {
            lines.append("This is the last active administrator. Deactivating it can lock everyone out of administrator functions.")
        }

        return lines.joined(separator: "\n\n")
    }

    /// Starts the confirmation flow, refusing to let an admin lock themselves
    /// out. The server has no such guard, so this one is client-side only.
    private func requestDeactivation(of user: AppUser) {
        model.clearActionError()
        guard auth.isAdmin else {
            model.actionError = "Only an administrator can deactivate an account."
            return
        }
        guard let currentUsername = auth.currentUser?.username else {
            model.actionError = "Your session is unavailable. Sign in again and retry."
            return
        }
        guard user.username != currentUsername else {
            model.actionError = "You cannot deactivate your own account."
            return
        }
        pendingDeactivation = user
    }
}

// MARK: - Row

/// One account, rendered as a tappable list row.
private struct UserRow: View {
    let user: AppUser

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(initials: user.initials)

            VStack(alignment: .leading, spacing: 4) {
                Text(user.displayName)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(user.username)
                    .font(.caption)
                    .fontDesign(.monospaced)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    StatusChip(style: Theme.roleStyle(user.role), compact: true)
                    StatusChip(style: Theme.userStyle(active: user.active), compact: true)
                }
                .padding(.top, 1)

                Text("Last login \(Format.relative(user.lastLoginAt))")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .padding(.top, 1)
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
                .padding(.top, 2)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(user.displayName), username \(user.username), \(user.roleLabel), \(user.active ? "active" : "disabled")")
    }
}

// MARK: - Create

/// Roles the server actually understands. It stores `role` as a free string and
/// compares it with an exact, case-sensitive match, so a typo produces an
/// account that silently fails every role check — hence a fixed picker instead
/// of a text field.
enum UserRole: String, CaseIterable, Identifiable {
    case viewer
    case manager
    case admin

    var id: String { rawValue }

    var title: String {
        switch self {
        case .viewer: return "Viewer"
        case .manager: return "Manager"
        case .admin: return "Administrator"
        }
    }

    var detail: String {
        switch self {
        case .viewer: return "Read-only access to dashboards and lists."
        case .manager: return "Can review leave and resolve incidents."
        case .admin: return "Full access, including cameras and user management."
        }
    }

    /// Falls back to `.viewer` so an unexpected role from the server cannot
    /// break the picker's selection.
    static func matching(_ raw: String) -> UserRole {
        UserRole(rawValue: raw) ?? .viewer
    }
}

private struct CreateUserSheet: View {

    @ObservedObject var model: UsersViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var username = ""
    @State private var password = ""
    @State private var fullName = ""
    @State private var role: UserRole = .viewer
    @State private var active = true
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var trimmedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSave: Bool {
        !isSaving && !trimmedUsername.isEmpty && !password.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage)
                    }
                }

                Section("Credentials") {
                    FormTextField(
                        label: "Username",
                        text: $username,
                        prompt: "e.g. a.kebede",
                        autocapitalization: .never
                    )
                    FormTextField(
                        label: "Password",
                        text: $password,
                        prompt: "Initial password",
                        isSecure: true
                    )
                }

                Section("Profile") {
                    FormTextField(
                        label: "Full name (optional)",
                        text: $fullName,
                        prompt: "e.g. Abebe Kebede"
                    )

                    Picker("Role", selection: $role) {
                        ForEach(UserRole.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }

                    Text(role.detail)
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Toggle("Active", isOn: $active)
                }

                Section {
                    Text("The password is set here and cannot be changed later from this screen. The account holder changes it from Profile ▸ Change password.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New user")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("Create")
                        }
                    }
                    .disabled(!canSave)
                }
            }
        }
    }

    private func save() async {
        guard !isSaving else { return }
        let trimmedName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        errorMessage = nil
        isSaving = true

        let body = UserCreate(
            username: trimmedUsername,
            password: password,
            fullName: trimmedName.isEmpty ? nil : trimmedName,
            role: role.rawValue,
            active: active
        )

        do {
            _ = try await model.createUser(body)
            isSaving = false
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            isSaving = false
        }
    }
}

// MARK: - Edit

/// Edits the three fields `PATCH /users/{username}` can actually write.
///
/// Password is deliberately absent (the endpoint ignores it — use
/// change-password for your own account), and every field is sent as a concrete
/// value because `exclude_none=True` on the server means `nil` is "leave alone",
/// not "clear".
private struct EditUserSheet: View {

    @ObservedObject var model: UsersViewModel
    let user: AppUser
    /// The signed-in admin, so their own account cannot be deactivated here.
    let currentUsername: String?

    @Environment(\.dismiss) private var dismiss

    @State private var fullName: String
    @State private var role: UserRole
    @State private var active: Bool
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(model: UsersViewModel, user: AppUser, currentUsername: String?) {
        self.model = model
        self.user = user
        self.currentUsername = currentUsername
        _fullName = State(initialValue: user.fullName ?? "")
        _role = State(initialValue: UserRole.matching(user.role))
        _active = State(initialValue: user.active)
    }

    private var isSelf: Bool { currentUsername == user.username }

    private var trimmedName: String {
        fullName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasChanges: Bool {
        trimmedName != (user.fullName ?? "") || role.rawValue != user.role || active != user.active
    }

    var body: some View {
        NavigationStack {
            Form {
                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage)
                    }
                }

                Section("Account") {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("Username")
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 8)
                        Text(user.username)
                            .fontDesign(.monospaced)
                    }
                    .font(.subheadline)

                    HStack(alignment: .center, spacing: 12) {
                        Text("Current role")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 8)
                        StatusChip(style: Theme.roleStyle(user.role), compact: true)
                    }
                }

                Section("Profile") {
                    FormTextField(
                        label: "Full name",
                        text: $fullName,
                        prompt: "e.g. Abebe Kebede"
                    )

                    Picker("Role", selection: $role) {
                        ForEach(UserRole.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }

                    Text(role.detail)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Toggle("Active", isOn: $active)
                        .disabled(isSelf)
                    if isSelf {
                        Text("This is your own account. Deactivating it is blocked here because the server has no such guard — pointing it at yourself would end your session.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Status")
                } footer: {
                    Text("The server applies this update with `exclude_none`, so a field cannot be cleared. Everything you see is sent as an explicit value.")
                }

                Section {
                    Text("Changing a password is not possible from this screen. The account holder does that from Profile ▸ Change password using their current password.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(user.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("Save")
                        }
                    }
                    .disabled(isSaving || !hasChanges)
                }
            }
        }
    }

    private func save() async {
        guard !isSaving else { return }

        if trimmedName.isEmpty, let existing = user.fullName, !existing.isEmpty {
            errorMessage = "A full name cannot be cleared: the update endpoint ignores empty values. Enter a replacement name instead."
            return
        }
        guard hasChanges else { return }

        errorMessage = nil
        isSaving = true

        let body = UserUpdate(
            fullName: trimmedName.isEmpty ? user.fullName : trimmedName,
            role: role.rawValue,
            active: isSelf ? true : active
        )

        do {
            _ = try await model.updateUser(username: user.username, body)
            isSaving = false
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            isSaving = false
        }
    }
}

// MARK: - View model

/// Which accounts the list endpoint should return. Mirrors the `active` query
/// parameter: `nil` means "no filter", which is what the server treats as
/// "every account".
enum UserActiveFilter: CaseIterable, Identifiable, Hashable {
    case all
    case active
    case disabled

    var id: Self { self }

    var title: String {
        switch self {
        case .all: return "All"
        case .active: return "Active"
        case .disabled: return "Disabled"
        }
    }

    var queryValue: Bool? {
        switch self {
        case .all: return nil
        case .active: return true
        case .disabled: return false
        }
    }
}

@MainActor
final class UsersViewModel: ObservableObject {

    private static let pageSize = 50

    @Published private(set) var users: [AppUser] = []
    @Published private(set) var total = 0
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingMore = false
    /// Failure of the list request itself.
    @Published private(set) var errorMessage: String?
    /// Failure of a create / edit / deactivate action.
    @Published var actionError: String?
    /// Bound by the segmented control; changing it triggers a fresh first page.
    @Published var filter: UserActiveFilter = .all

    /// `offset + users.count < total`, derived from `Page` rather than a
    /// `has_more` flag, which the backend does not expose.
    var hasMore: Bool { users.count < total }

    /// Offset of the next page, taken from the server's own echo rather than
    /// `users.count`: de-duplication can drop rows, and a shifting sort key would
    /// otherwise re-request rows that were already shown.
    private var nextOffset = 0
    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    // MARK: - Reads

    /// Replaces the list with page 0.
    ///
    /// Deliberately not task-cancelling: cancellation would flip `Task.isCancelled`
    /// inside the superseded load and skip its `isLoading = false`, latching the
    /// spinner on. Since every call starts at `offset: 0`, the last response to
    /// land is the correct one for the current filter.
    func loadFirstPage() async {
        await fetchFirstPage()
    }

    func refresh() async {
        await loadFirstPage()
    }

    func loadMore() async {
        guard hasMore, !isLoading, !isLoadingMore else { return }
        isLoadingMore = true
        do {
            let page = try await fetchPage(offset: nextOffset)
            append(page)
            errorMessage = nil
        } catch let error as APIError {
            if error != .cancelled {
                errorMessage = error.localizedDescription
            }
        } catch {
            errorMessage = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
        isLoadingMore = false
    }

    // MARK: - Writes

    @discardableResult
    func createUser(_ body: UserCreate) async throws -> AppUser {
        let user = try await client.createUser(body)
        await loadFirstPage()
        return user
    }

    @discardableResult
    func updateUser(username: String, _ body: UserUpdate) async throws -> AppUser {
        let user = try await client.updateUser(username: username, body)
        await loadFirstPage()
        return user
    }

    /// `DELETE /users/{username}` — deactivates the account and answers 204.
    func deactivate(username: String) async {
        actionError = nil
        do {
            try await client.deleteUser(username: username)
            await loadFirstPage()
        } catch {
            actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
    }

    func clearActionError() {
        actionError = nil
    }

    // MARK: - Private

    private func fetchFirstPage() async {
        isLoading = true
        do {
            let page = try await fetchPage(offset: 0)
            users = page.items
            total = page.total
            nextOffset = page.offset + page.items.count
            errorMessage = nil
        } catch let error as APIError {
            if error != .cancelled, !Task.isCancelled {
                errorMessage = error.localizedDescription
            }
        } catch {
            if !Task.isCancelled {
                errorMessage = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            }
        }
        isLoading = false
    }

    private func fetchPage(offset: Int) async throws -> Page<AppUser> {
        try await client.users(active: filter.queryValue, limit: Self.pageSize, offset: offset)
    }

    /// Appends a page, dropping any account already present. Without this, a
    /// row created or deactivated between pages would duplicate an identifier
    /// and SwiftUI's `ForEach` would trap on the collision.
    private func append(_ page: Page<AppUser>) {
        var seen = Set(users.map(\.id))
        for item in page.items where seen.insert(item.id).inserted {
            users.append(item)
        }
        total = page.total
        nextOffset = page.offset + page.items.count
    }
}

/// `AuthStore.preview()` only exists in DEBUG, so the preview is gated to match.
#if DEBUG
#Preview {
    NavigationStack {
        UsersView()
    }
    .environmentObject(AuthStore.preview())
}
#endif
