import Foundation
import SwiftUI

/// Small state container for one screen's remote data.
///
/// Every screen needs the same four things — a value, a loading flag, an error
/// message and a way to reload — so this removes that boilerplate while staying
/// deliberately simple: on a failed refresh the previously loaded value is kept
/// so the UI does not blank out.
@MainActor
final class AsyncLoader<Value>: ObservableObject {

    @Published private(set) var value: Value?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private var currentTask: Task<Void, Never>?

    var hasValue: Bool { value != nil }

    /// True while the very first load is in flight (no value to show yet).
    var isInitialLoad: Bool { isLoading && value == nil }

    /// Starts a load in the background, cancelling any in-flight one.
    func load(_ operation: @escaping () async throws -> Value) {
        currentTask?.cancel()
        currentTask = Task { [weak self] in
            await self?.perform(operation)
        }
    }

    /// Awaits a load — use this from `.refreshable`.
    func refresh(_ operation: @escaping () async throws -> Value) async {
        currentTask?.cancel()
        await perform(operation)
    }

    /// Lets a screen apply a local change (for example after a successful
    /// create or delete) without re-fetching everything.
    func setValue(_ newValue: Value) {
        value = newValue
        errorMessage = nil
    }

    func clearError() {
        errorMessage = nil
    }

    private func perform(_ operation: @escaping () async throws -> Value) async {
        isLoading = true
        if value == nil {
            errorMessage = nil
        }
        do {
            let result = try await operation()
            guard !Task.isCancelled else { return }
            value = result
            errorMessage = nil
        } catch is CancellationError {
            // Superseded by a newer load, or the view disappeared.
        } catch let error as APIError {
            if error != .cancelled, !Task.isCancelled {
                errorMessage = error.localizedDescription
            }
        } catch {
            if !Task.isCancelled {
                errorMessage = error.localizedDescription
            }
        }
        if !Task.isCancelled {
            isLoading = false
        }
    }
}

extension View {
    /// Runs `action` immediately and then every `interval` seconds for as long
    /// as the view is on screen.
    ///
    /// The backend has no push channel for list data (the SSE route is not even
    /// mounted), so screens poll, matching the Flutter client's cadence.
    func polling(
        every interval: TimeInterval = AppConfig.pollInterval,
        perform action: @escaping () async -> Void
    ) -> some View {
        task {
            while !Task.isCancelled {
                await action()
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
        }
    }
}
