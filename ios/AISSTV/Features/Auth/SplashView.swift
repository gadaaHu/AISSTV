import SwiftUI

/// Shown while a stored session is being restored and unlocked.
struct SplashView: View {

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "video.fill")
                .font(.system(size: 56))
                .foregroundStyle(Color.accentColor)

            VStack(spacing: 4) {
                Text("AISSTV")
                    .font(.largeTitle.weight(.bold))
                Text("Attendance & Safety")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            ProgressView()
                .padding(.top, 6)

            Text("Restoring your session…")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(uiColor: .systemGroupedBackground))
    }
}

#Preview {
    SplashView()
}
