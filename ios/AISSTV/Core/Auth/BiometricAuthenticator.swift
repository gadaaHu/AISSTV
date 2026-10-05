import Foundation
import LocalAuthentication

/// Face ID / Touch ID / passcode gating for the saved session.
///
/// The Flutter client skips the biometric prompt entirely when the device
/// cannot evaluate a policy, so an app running on a simulator or a device
/// without a passcode still reaches the dashboard. This mirrors that behaviour.
enum BiometricAuthenticator {

    enum BiometryKind {
        case faceID
        case touchID
        case none

        var label: String {
            switch self {
            case .faceID: return "Face ID"
            case .touchID: return "Touch ID"
            case .none: return "Passcode"
            }
        }

        var symbolName: String {
            switch self {
            case .faceID: return "faceid"
            case .touchID: return "touchid"
            case .none: return "lock.fill"
            }
        }
    }

    /// Uses `deviceOwnerAuthentication` so a user whose face is not recognised
    /// can still fall back to the device passcode instead of being locked out.
    private static let policy = LAPolicy.deviceOwnerAuthentication

    /// Whether the device can authenticate at all right now.
    static var isAvailable: Bool {
        let context = LAContext()
        var error: NSError?
        return context.canEvaluatePolicy(policy, error: &error)
    }

    /// The biometry hardware actually present, for labelling UI.
    static var kind: BiometryKind {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(policy, error: &error) else { return .none }
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        default: return .none
        }
    }

    /// Prompts the user. Returns `true` on success and `false` when the user
    /// cancelled or failed; throws only for unexpected evaluation errors.
    static func authenticate(reason: String) async throws -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Use Password"

        var error: NSError?
        guard context.canEvaluatePolicy(policy, error: &error) else {
            return false
        }

        do {
            return try await context.evaluatePolicy(policy, localizedReason: reason)
        } catch let laError as LAError {
            switch laError.code {
            case .userCancel, .userFallback, .systemCancel, .appCancel:
                return false
            case .authenticationFailed:
                return false
            default:
                throw laError
            }
        }
    }
}
