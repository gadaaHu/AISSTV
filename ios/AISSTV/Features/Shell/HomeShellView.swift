import SwiftUI

/// The signed-in tab shell.
///
/// Tabs are filtered by role exactly as the Flutter `HomeShell` does: Cameras
/// and Users are administrator-only. Hiding a tab is a convenience, not a
/// security boundary — the backend independently enforces `require_role`.
struct HomeShellView: View {

    @EnvironmentObject private var auth: AuthStore
    @State private var selection: Tab = .dashboard

    enum Tab: Hashable {
        case dashboard
        case cameras
        case employees
        case leaves
        case events
        case users
        case profile
    }

    var body: some View {
        TabView(selection: $selection) {
            NavigationStack {
                DashboardView()
            }
            .tabItem { Label("Home", systemImage: "square.grid.2x2") }
            .tag(Tab.dashboard)

            if auth.isAdmin {
                NavigationStack {
                    CamerasView()
                }
                .tabItem { Label("Cameras", systemImage: "video") }
                .tag(Tab.cameras)
            }

            NavigationStack {
                EmployeesView()
            }
            .tabItem { Label("Employees", systemImage: "person.2") }
            .tag(Tab.employees)

            NavigationStack {
                LeavesView()
            }
            .tabItem { Label("Leaves", systemImage: "beach.umbrella") }
            .tag(Tab.leaves)

            NavigationStack {
                EventsView()
            }
            .tabItem { Label("Events", systemImage: "list.bullet.rectangle") }
            .tag(Tab.events)

            if auth.isAdmin {
                NavigationStack {
                    UsersView()
                }
                .tabItem { Label("Users", systemImage: "person.badge.key") }
                .tag(Tab.users)
            }

            NavigationStack {
                ProfileView()
            }
            .tabItem { Label("Profile", systemImage: "person.crop.circle") }
            .tag(Tab.profile)
        }
        .onChange(of: auth.isAdmin) { _, isAdmin in
            // A tab that disappeared must not stay selected, or the shell would
            // render an empty page.
            if !isAdmin, selection == .cameras || selection == .users {
                selection = .dashboard
            }
        }
    }
}

#Preview {
    HomeShellView()
        .environmentObject(AuthStore())
}
