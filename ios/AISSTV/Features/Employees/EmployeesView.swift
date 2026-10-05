import SwiftUI

// MARK: - Screen

/// Employee directory: a searchable, paginated list with an "active only"
/// filter, plus administrator-only create / edit / delete management.
///
/// The navigation stack comes from the shell (`HomeShellView`), so this view
/// deliberately declares no `NavigationStack` of its own.
///
/// All endpoints used here live in `APIEndpoints.swift`:
/// `employees(query:active:limit:offset:)`, `employee(code:)`,
/// `createEmployee(_:)`, `updateEmployee(code:_:)` and
/// `deleteEmployee(code:hard:)`.
struct EmployeesView: View {

    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = EmployeesViewModel()

    @State private var showCreateSheet = false
    @State private var employeeToEdit: Employee?

    var body: some View {
        LoadedContent(
            loader: viewModel.list,
            emptySymbol: "person.2",
            emptyTitle: "No employees found",
            emptyMessage: emptyMessage,
            loadingText: "Loading employees…",
            onRetry: { viewModel.loadFirstPage() }
        ) { page in
            employeeList(page)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Employees")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: queryBinding, prompt: "Search name, code or department")
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .onSubmit(of: .search) { viewModel.loadFirstPage() }
        .onChange(of: viewModel.query) { _, _ in viewModel.scheduleSearch() }
        .task {
            // Nothing else triggers a fetch until the user searches, filters or
            // refreshes, so without this the directory would sit on its empty
            // state forever.
            if !viewModel.list.hasValue {
                viewModel.loadFirstPage()
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    viewModel.loadFirstPage()
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .disabled(viewModel.list.isLoading)
            }
            if auth.isAdmin {
                // Hiding this button is a convenience only: the backend
                // independently enforces `require_role("admin")` on every
                // mutation, so a non-admin cannot escalate from the client.
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Label("Add employee", systemImage: "plus")
                    }
                }
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            filterBar
        }
        .sheet(isPresented: $showCreateSheet) {
            EmployeeCreateSheet(
                onCreated: { await viewModel.createEmployee($0) },
                actionError: viewModel.actionError
            )
            .environmentObject(auth)
        }
        .sheet(item: $employeeToEdit) { employee in
            EmployeeEditSheet(employee: employee) { update in
                await viewModel.save(update, for: employee)
            }
            .environmentObject(auth)
        }
    }

    // MARK: - Filter bar

    private var filterBar: some View {
        VStack(spacing: 8) {
            Toggle(isOn: activeOnlyBinding) {
                Label("Active only", systemImage: "checkmark.seal")
                    .font(.subheadline)
            }
            .toggleStyle(.switch)

            if let message = viewModel.actionError {
                ErrorBanner(message: message) { viewModel.actionError = nil }
            }

            if let total = viewModel.list.value?.total, total > 0 {
                HStack {
                    Text("\(viewModel.employees.count) of \(total)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
            }
        }
        .padding(.horizontal, Theme.contentPadding)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private var emptyMessage: String {
        if viewModel.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return viewModel.activeOnly
                ? "No active employees match this filter."
                : "The directory is empty."
        }
        return "Nothing matches “\(viewModel.query)”."
    }

    // MARK: - List

    @ViewBuilder
    private func employeeList(_ page: Page<Employee>) -> some View {
        if page.items.isEmpty {
            StatePlaceholder(
                symbol: "person.2",
                title: "No employees found",
                message: emptyMessage,
                actionTitle: nil,
                action: nil
            )
            .frame(maxHeight: .infinity)
        } else {
            List {
                ForEach(viewModel.employees) { employee in
                    NavigationLink {
                        EmployeeDetailView(employee: employee)
                    } label: {
                        EmployeeRow(employee: employee)
                    }
                    .onAppear {
                        // Paging: reaching the final row of a page pulls the next
                        // one, using `Page.hasMore` and the running offset.
                        if employee.id == viewModel.employees.last?.id {
                            viewModel.loadNextPageIfNeeded()
                        }
                    }
                }

                if page.hasMore {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                } else {
                    Text("\(viewModel.employees.count) employee\(viewModel.employees.count == 1 ? "" : "s")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await viewModel.refresh() }
            .scrollDismissesKeyboard(.immediately)
            .animation(.default, value: viewModel.employees)
        }
    }

    // MARK: - Bindings

    /// `.searchable` needs a plain `String` binding; writes land in the view
    /// model, whose `onChange` hook starts the debounce task.
    private var queryBinding: Binding<String> {
        Binding(
            get: { viewModel.query },
            set: { viewModel.query = $0 }
        )
    }

    private var activeOnlyBinding: Binding<Bool> {
        Binding(
            get: { viewModel.activeOnly },
            set: { newValue in
                viewModel.activeOnly = newValue
                viewModel.loadFirstPage()
            }
        )
    }
}

// MARK: - Row

/// One directory row: avatar, name, monospaced code and the active chip.
struct EmployeeRow: View {
    let employee: Employee

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(initials: employee.initials)

            VStack(alignment: .leading, spacing: 3) {
                Text(employee.name)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)

                Text(employee.code)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)

                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            StatusChip(style: Theme.userStyle(active: employee.active), compact: true)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String? {
        let parts = [employee.department, employee.title]
            .compactMap { value -> String? in
                guard let value, !value.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
                return value
            }
        return parts.isEmpty ? nil : parts.joined(separator: " • ")
    }
}

// MARK: - Detail

/// Every field of `Employee`, with the management actions and the link into
/// face enrollment.
///
/// The employee handed over by the list is shown immediately and then refreshed
/// from `GET /employees/{code}` so the detail always reflects the server.
struct EmployeeDetailView: View {

    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel: EmployeeDetailViewModel

    @State private var showEditSheet = false
    @State private var showDeleteSheet = false

    init(employee: Employee) {
        _viewModel = StateObject(wrappedValue: EmployeeDetailViewModel(employee: employee))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header

                if let message = viewModel.actionError {
                    ErrorBanner(message: message) { viewModel.actionError = nil }
                }

                identityCard
                shiftCard
                contactCard
                recordCard

                faceEnrollmentLink

                if auth.isAdmin {
                    adminCard
                }

                if viewModel.isLoading {
                    LoadingPlaceholder(text: "Refreshing…")
                }
            }
            .padding(Theme.contentPadding)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Employee")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if auth.isAdmin {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") { showEditSheet = true }
                }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
        .sheet(isPresented: $showEditSheet) {
            EmployeeEditSheet(employee: viewModel.employee) { update in
                await viewModel.save(update)
            }
            .environmentObject(auth)
        }
        .sheet(isPresented: $showDeleteSheet) {
            EmployeeDeleteSheet(
                employee: viewModel.employee,
                onDelete: { hard in await viewModel.delete(hard: hard) }
            )
            .environmentObject(auth)
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            AvatarView(initials: viewModel.employee.initials, size: 62)
            VStack(alignment: .leading, spacing: 4) {
                Text(viewModel.employee.name)
                    .font(.title3.weight(.semibold))
                Text(viewModel.employee.code)
                    .font(.subheadline.monospaced())
                    .foregroundStyle(.secondary)
                StatusChip(style: Theme.userStyle(active: viewModel.employee.active))
            }
            Spacer(minLength: 0)
        }
    }

    private var identityCard: some View {
        SectionCard(title: "Identity") {
            InfoRow(label: "Code", value: viewModel.employee.code, monospacedValue: true)
            InfoRow(label: "Name", value: viewModel.employee.name)
            InfoRow(label: "Department", value: Format.optional(viewModel.employee.department))
            InfoRow(label: "Title", value: Format.optional(viewModel.employee.title))
            InfoRow(
                label: "Status",
                value: viewModel.employee.active ? "Active" : "Inactive"
            )
        }
    }

    private var shiftCard: some View {
        SectionCard(title: "Shift") {
            InfoRow(label: "Start", value: Format.optional(Employee.shortTime(viewModel.employee.shiftStart)))
            InfoRow(label: "End", value: Format.optional(Employee.shortTime(viewModel.employee.shiftEnd)))
            InfoRow(label: "Shift", value: Format.optional(viewModel.employee.shiftDescription))
            InfoRow(label: "Timezone", value: Format.optional(viewModel.employee.timezone), monospacedValue: true)
        }
    }

    private var contactCard: some View {
        SectionCard(title: "Contact") {
            InfoRow(label: "Email", value: Format.optional(viewModel.employee.email))
        }
    }

    private var recordCard: some View {
        SectionCard(title: "Record") {
            InfoRow(label: "Created", value: Format.timestamp(viewModel.employee.createdAt))
            InfoRow(label: "Updated", value: Format.timestamp(viewModel.employee.updatedAt))
            InfoRow(label: "ID", value: viewModel.employee.id, monospacedValue: true)
        }
    }

    private var faceEnrollmentLink: some View {
        NavigationLink {
            FaceEnrollmentView(
                employeeCode: viewModel.employee.code,
                employeeName: viewModel.employee.name
            )
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "face.smiling")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Face enrollment")
                        .font(.body.weight(.semibold))
                    Text("Upload a photo for edge-camera recognition")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(
                Color(uiColor: .secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous)
            )
        }
        .buttonStyle(.plain)
    }

    private var adminCard: some View {
        SectionCard(title: "Administration") {
            Button {
                showEditSheet = true
            } label: {
                Label("Edit details", systemImage: "square.and.pencil")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
            .disabled(viewModel.isSaving)

            Button {
                viewModel.toggleActive()
            } label: {
                Label(
                    viewModel.employee.active ? "Deactivate (soft delete)" : "Reactivate",
                    systemImage: viewModel.employee.active ? "person.crop.circle.badge.xmark" : "person.crop.circle.badge.checkmark"
                )
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
            .disabled(viewModel.isSaving)

            Button(role: .destructive) {
                showDeleteSheet = true
            } label: {
                Label("Delete…", systemImage: "trash")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
            .disabled(viewModel.isSaving)

            Text("Deactivating keeps the employee's attendance history; only an administrator can do either action, and the server enforces that independently of this screen.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Create sheet

/// `POST /employees` — `code` and `name` are required, everything else is
/// optional. Shift fields are entered as times and sent as `"HH:mm:ss"`.
struct EmployeeCreateSheet: View {

    let onCreated: (EmployeeCreate) async -> Bool
    let actionError: String?

    @Environment(\.dismiss) private var dismiss

    @State private var code = ""
    @State private var name = ""
    @State private var email = ""
    @State private var department = ""
    @State private var title = ""
    @State private var shiftStart = EmployeeTimePicker.defaultStart
    @State private var shiftEnd = EmployeeTimePicker.defaultEnd
    @State private var timezone = ""
    @State private var isSaving = false
    @State private var localError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Required") {
                    FormTextField(
                        label: "Employee code",
                        text: $code,
                        prompt: "e.g. emp-001",
                        autocapitalization: .never
                    )
                    FormTextField(label: "Full name", text: $name, prompt: "e.g. Abebe Kebede")
                }

                Section("Optional") {
                    FormTextField(
                        label: "Email",
                        text: $email,
                        prompt: "name@example.com",
                        keyboard: .emailAddress,
                        autocapitalization: .never
                    )
                    FormTextField(label: "Department", text: $department)
                    FormTextField(label: "Title", text: $title)
                    FormTextField(
                        label: "Timezone",
                        text: $timezone,
                        prompt: "e.g. Africa/Addis_Ababa",
                        autocapitalization: .never
                    )
                }

                Section("Shift") {
                    DatePicker("Start", selection: $shiftStart, displayedComponents: .hourAndMinute)
                    DatePicker("End", selection: $shiftEnd, displayedComponents: .hourAndMinute)
                    Text("Sent as 24-hour “HH:mm:ss” (currently \(EmployeeTimePicker.wire(shiftStart)) – \(EmployeeTimePicker.wire(shiftEnd))).")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                if let message = localError ?? actionError {
                    Section {
                        ErrorBanner(message: message)
                    }
                }
            }
            .navigationTitle("Add employee")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSaving {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Create")
                        }
                    }
                    .disabled(isSaving || trimmedCode.isEmpty || trimmedName.isEmpty)
                }
            }
        }
    }

    private var trimmedCode: String {
        code.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func submit() async {
        guard !trimmedCode.isEmpty, !trimmedName.isEmpty else {
            localError = "Employee code and name are both required."
            return
        }
        isSaving = true
        localError = nil

        let body = EmployeeCreate(
            code: trimmedCode,
            name: trimmedName,
            email: cleaned(email),
            department: cleaned(department),
            title: cleaned(title),
            shiftStart: EmployeeTimePicker.wire(shiftStart),
            shiftEnd: EmployeeTimePicker.wire(shiftEnd),
            timezone: cleaned(timezone)
        )

        let created = await onCreated(body)
        isSaving = false
        if created {
            dismiss()
        } else {
            localError = "The employee could not be created. A duplicate code is the usual cause."
        }
    }
}

// MARK: - Edit sheet

/// `PATCH /employees/{code}`.
///
/// `code` is immutable on the server, so it is shown read-only and never sent.
///
/// Note the backend applies `exclude_none=True` to this route: omitting a field
/// and sending `null` are equivalent, so **clearing a text field does not clear
/// the stored value**. Blank inputs are omitted rather than sent as empty, and
/// the UI says so instead of promising a removal.
struct EmployeeEditSheet: View {

    let employee: Employee
    let onSave: (EmployeeUpdate) async -> Bool

    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var email: String
    @State private var department: String
    @State private var title: String
    @State private var shiftStart: Date
    @State private var shiftEnd: Date
    @State private var timezone: String
    @State private var isActive: Bool
    @State private var isSaving = false
    @State private var localError: String?

    init(employee: Employee, onSave: @escaping (EmployeeUpdate) async -> Bool) {
        self.employee = employee
        self.onSave = onSave
        _name = State(initialValue: employee.name)
        _email = State(initialValue: employee.email ?? "")
        _department = State(initialValue: employee.department ?? "")
        _title = State(initialValue: employee.title ?? "")
        _shiftStart = State(initialValue: EmployeeTimePicker.date(fromWire: employee.shiftStart) ?? EmployeeTimePicker.defaultStart)
        _shiftEnd = State(initialValue: EmployeeTimePicker.date(fromWire: employee.shiftEnd) ?? EmployeeTimePicker.defaultEnd)
        _timezone = State(initialValue: employee.timezone ?? "")
        _isActive = State(initialValue: employee.active)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Employee") {
                    LabeledContent("Code", value: employee.code)
                        .fontDesign(.monospaced)
                    Text("The employee code cannot be changed.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Section("Details") {
                    FormTextField(label: "Full name", text: $name, prompt: employee.name)
                    FormTextField(
                        label: "Email",
                        text: $email,
                        prompt: employee.email ?? "name@example.com",
                        keyboard: .emailAddress,
                        autocapitalization: .never
                    )
                    FormTextField(label: "Department", text: $department, prompt: employee.department ?? "—")
                    FormTextField(label: "Title", text: $title, prompt: employee.title ?? "—")
                    FormTextField(
                        label: "Timezone",
                        text: $timezone,
                        prompt: employee.timezone ?? "e.g. Africa/Addis_Ababa",
                        autocapitalization: .never
                    )
                    FormToggle(
                        label: "Active",
                        isOn: $isActive,
                        caption: "Inactive employees stop being matched by the cameras."
                    )
                }

                Section("Shift") {
                    DatePicker("Start", selection: $shiftStart, displayedComponents: .hourAndMinute)
                    DatePicker("End", selection: $shiftEnd, displayedComponents: .hourAndMinute)
                    Text("Sent as 24-hour “HH:mm:ss”: \(EmployeeTimePicker.wire(shiftStart)) – \(EmployeeTimePicker.wire(shiftEnd)).")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Text("Leave a field blank to keep the stored value — the server ignores empty fields on this route, so this screen cannot erase one. Clear a value from the web console instead.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                if let message = localError {
                    Section {
                        ErrorBanner(message: message)
                    }
                }
            }
            .navigationTitle("Edit employee")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSaving {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Save")
                        }
                    }
                    .disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func submit() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            localError = "A name is required."
            return
        }

        isSaving = true
        localError = nil

        // Only non-empty values are sent; nil fields are omitted from the JSON
        // body entirely (`encodeIfPresent`), matching what the backend expects.
        let body = EmployeeUpdate(
            name: trimmedName,
            email: cleaned(email),
            department: cleaned(department),
            title: cleaned(title),
            shiftStart: EmployeeTimePicker.wire(shiftStart),
            shiftEnd: EmployeeTimePicker.wire(shiftEnd),
            timezone: cleaned(timezone),
            active: isActive
        )

        let saved = await onSave(body)
        isSaving = false
        if saved {
            dismiss()
        } else {
            localError = "The changes could not be saved."
        }
    }
}

// MARK: - Delete sheet

/// `DELETE /employees/{code}` with `hard` chosen explicitly.
///
/// The soft delete is the default: it sets `active = false` and keeps history.
/// The hard delete is destructive and the server answers **409 Conflict** when
/// the employee already has attendance, leave or incident history.
struct EmployeeDeleteSheet: View {

    let employee: Employee
    let onDelete: (Bool) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var isWorking = false
    @State private var localError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Deactivate \(employee.name)", systemImage: "person.crop.circle.badge.xmark")
                        .font(.body.weight(.medium))
                    Text("Recommended. Sets the employee to inactive — \(employee.code) keeps its attendance history and can be reactivated later.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button {
                        Task { await run(hard: false) }
                    } label: {
                        Text("Deactivate")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isWorking)
                }

                Section {
                    Button(role: .destructive) {
                        Task { await run(hard: true) }
                    } label: {
                        HStack {
                            if isWorking {
                                ProgressView().controlSize(.small)
                            }
                            Text("Delete permanently")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isWorking)

                    Text("Destructive and cannot be undone. This fails with a conflict error when the employee has any recorded history (attendance, leave or incidents) — deactivate instead in that case.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Hard delete")
                } footer: {
                    if let message = localError {
                        ErrorBanner(message: message)
                    }
                }
            }
            .navigationTitle("Delete employee")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isWorking)
                }
            }
        }
    }

    private func run(hard: Bool) async {
        isWorking = true
        localError = nil
        let succeeded = await onDelete(hard)
        isWorking = false
        if succeeded {
            dismiss()
        } else {
            localError = hard
                ? "Could not delete \(employee.code). If the employee has recorded history the server refuses a hard delete — deactivate instead."
                : "Could not deactivate \(employee.code)."
        }
    }
}

// MARK: - Shift time helpers

/// Shift times travel as `"09:00:00"` strings, but are *edited* as `Date`
/// values through a `DatePicker`. The two are converted here so no shift time
/// is ever decoded as a `Date` coming off the wire.
///
/// The formatters run in UTC so the same wall-clock hour is round-tripped on
/// every device, whatever the local timezone.
enum EmployeeTimePicker {

    private static let wireFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()

    /// 09:00:00 and 18:00:00 as `Date` values for a fresh `DatePicker`.
    static var defaultStart: Date { date(hour: 9, minute: 0) }
    static var defaultEnd: Date { date(hour: 18, minute: 0) }

    static func date(hour: Int, minute: Int) -> Date {
        var components = DateComponents()
        components.year = 2000
        components.month = 1
        components.day = 1
        components.hour = hour
        components.minute = minute
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
        return calendar.date(from: components) ?? Date()
    }

    /// `"09:00:00"` (or a stray `"09:00"`) → `Date`, or `nil` when unusable.
    static func date(fromWire raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let parts = raw.split(separator: ":")
        guard parts.count >= 2,
              let hour = Int(parts[0]),
              let minute = Int(parts[1]),
              (0...23).contains(hour),
              (0...59).contains(minute) else { return nil }
        return date(hour: hour, minute: minute)
    }

    /// `Date` → `"HH:mm:ss"`, the shape the backend stores.
    static func wire(_ date: Date) -> String {
        wireFormatter.string(from: date)
    }
}

// MARK: - View models

/// List state for the directory: one page of employees plus the paging cursor,
/// the debounced search query and the "active only" filter.
@MainActor
final class EmployeesViewModel: ObservableObject {

    private static let pageSize = 50
    /// Short debounce so typing does not fire a request per keystroke.
    private static let searchDebounce = Duration.milliseconds(350)

    let list = AsyncLoader<Page<Employee>>()

    @Published var query = ""
    @Published var activeOnly = false

    /// Errors from create / edit / delete, kept apart from the list loader's
    /// own error so a failed action never blanks the loaded list.
    @Published var actionError: String?

    /// Number of rows already fetched; the offset sent with the next request.
    private(set) var offset = 0
    private var searchTask: Task<Void, Never>?
    private var isPaging = false

    var employees: [Employee] { list.value?.items ?? [] }

    // MARK: - Loading

    func loadFirstPage() {
        searchTask?.cancel()
        offset = 0
        isPaging = false
        list.load { [query, activeOnly] in
            try await APIClient.shared.employees(
                query: query.trimmingCharacters(in: .whitespacesAndNewlines),
                active: activeOnly ? true : nil,
                limit: Self.pageSize,
                offset: 0
            )
        }
    }

    /// Awaits a fresh first page — used by `.refreshable`.
    func refresh() async {
        searchTask?.cancel()
        offset = 0
        isPaging = false
        await list.refresh { [query, activeOnly] in
            try await APIClient.shared.employees(
                query: query.trimmingCharacters(in: .whitespacesAndNewlines),
                active: activeOnly ? true : nil,
                limit: Self.pageSize,
                offset: 0
            )
        }
    }

    /// Restarts the debounce timer. Called from the view's `onChange(of: query)`.
    ///
    /// The task is created inside a `@MainActor` method, so it inherits that
    /// isolation and may touch `self` directly after the sleep.
    func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: Self.searchDebounce)
            guard !Task.isCancelled else { return }
            self?.loadFirstPage()
        }
    }

    /// Appends the next page when the last row scrolls into view.
    func loadNextPageIfNeeded() {
        guard !isPaging, let page = list.value, page.hasMore else { return }
        isPaging = true
        let nextOffset = offset + Self.pageSize
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let activeOnly = activeOnly
        let current = page.items

        Task { [weak self] in
            guard let self else { return }
            do {
                let next = try await APIClient.shared.employees(
                    query: query,
                    active: activeOnly ? true : nil,
                    limit: Self.pageSize,
                    offset: nextOffset
                )
                self.offset = nextOffset
                // Rebuild from the value we already hold instead of re-reading
                // `self.list.value` inside a concurrent closure.
                //
                // De-duplicate by id: an employee created between requests
                // shifts the offset window, so without this the same row can
                // appear twice and `ForEach` would render duplicate ids.
                let known = Set(current.map(\.id))
                let appended = next.items.filter { !known.contains($0.id) }
                self.list.setValue(Page(
                    items: current + appended,
                    total: next.total,
                    limit: next.limit,
                    offset: next.offset
                ))
            } catch {
                let message = (error as? APIError)?.localizedDescription ?? error.localizedDescription
                if (error as? APIError) != .cancelled {
                    self.actionError = message
                }
            }
            self.isPaging = false
        }
    }

    // MARK: - Mutations (admin only — the server enforces this too)

    func createEmployee(_ body: EmployeeCreate) async -> Bool {
        actionError = nil
        do {
            _ = try await APIClient.shared.createEmployee(body)
            await refresh()
            return true
        } catch {
            actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            return false
        }
    }

    func save(_ body: EmployeeUpdate, for employee: Employee) async -> Bool {
        actionError = nil
        do {
            // The path uses the employee's non-optional `code`.
            _ = try await APIClient.shared.updateEmployee(code: employee.code, body)
            await refresh()
            return true
        } catch {
            actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            return false
        }
    }

}

// `Page` is constructed directly here because `items`, `total`, `limit` and
// `offset` are all `let` with no custom initializer, so its memberwise
// initializer is available inside the app module — no endpoint change needed.

/// Detail state for a single employee, seeded from the list row and refreshed
/// from `GET /employees/{code}`.
@MainActor
final class EmployeeDetailViewModel: ObservableObject {

    @Published private(set) var employee: Employee
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published var actionError: String?

    init(employee: Employee) {
        self.employee = employee
    }

    func load() async {
        isLoading = true
        do {
            employee = try await APIClient.shared.employee(code: employee.code)
        } catch {
            let message = (error as? APIError)?.localizedDescription ?? error.localizedDescription
            if (error as? APIError) != .cancelled {
                actionError = message
            }
        }
        isLoading = false
    }

    func save(_ body: EmployeeUpdate) async -> Bool {
        isSaving = true
        actionError = nil
        var succeeded = false
        do {
            employee = try await APIClient.shared.updateEmployee(code: employee.code, body)
            succeeded = true
        } catch {
            actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
        isSaving = false
        return succeeded
    }

    /// Soft enable/disable via the same `PATCH`, which is what a soft delete
    /// ultimately does (`active = false`).
    func toggleActive() {
        let target = !employee.active
        Task { _ = await save(EmployeeUpdate(active: target)) }
    }

    /// Soft delete by default; hard delete removes the row and fails with a
    /// conflict (409) when history exists.
    func delete(hard: Bool) async -> Bool {
        isSaving = true
        actionError = nil
        var succeeded = false
        do {
            try await APIClient.shared.deleteEmployee(code: employee.code, hard: hard)
            succeeded = true
        } catch {
            actionError = (error as? APIError)?.localizedDescription ?? error.localizedDescription
        }
        isSaving = false
        return succeeded
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        EmployeesView()
    }
    .environmentObject(AuthStore.preview())
}
