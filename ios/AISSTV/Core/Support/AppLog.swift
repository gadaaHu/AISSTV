import Foundation
import os

/// Lightweight logging façade so subsystems are consistent and greppable in
/// Console.app. Filter on subsystem `com.aisstv.attendance`.
enum AppLog {
    private static let subsystem = "com.aisstv.attendance"

    static let network = Logger(subsystem: subsystem, category: "network")
    static let auth = Logger(subsystem: subsystem, category: "auth")
    static let ui = Logger(subsystem: subsystem, category: "ui")
}
