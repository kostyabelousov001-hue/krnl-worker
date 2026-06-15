import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @Environment(\.dismiss) var dismiss
    @State private var hostURL: String = ""
    @State private var port: String = ""

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(oklch: (0.12, 0.05, 260)),
                    Color(oklch: (0.06, 0.1, 280))
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.system(size: 40))
                    .foregroundStyle(
                        LinearGradient(colors: [
                            Color(oklch: (0.7, 0.3, 260)),
                            Color(oklch: (0.6, 0.2, 300))
                        ], startPoint: .top, endPoint: .bottom)
                    )

                Text("Host Connection")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.white)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Server Address")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))

                    TextField("lol.krnlcamel.space", text: $hostURL)
                        .textFieldStyle(.plain)
                        .font(.system(size: 17))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(.ultraThinMaterial)
                        .cornerRadius(14)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(.white.opacity(0.08), lineWidth: 1)
                        )
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Port")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))

                    TextField("9090", text: $port)
                        .textFieldStyle(.plain)
                        .font(.system(size: 17))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(.ultraThinMaterial)
                        .cornerRadius(14)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(.white.opacity(0.08), lineWidth: 1)
                        )
                        .keyboardType(.numberPad)
                }

                Spacer()

                Button {
                    wsManager.hostURL = hostURL.isEmpty ? "lol.krnlcamel.space" : hostURL
                    wsManager.port = port.isEmpty ? "9090" : port
                    wsManager.connect()
                    dismiss()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 16))
                        Text("Connect")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 16)
                    .background(
                        LinearGradient(colors: [
                            Color(oklch: (0.6, 0.25, 260)),
                            Color(oklch: (0.55, 0.2, 280))
                        ], startPoint: .leading, endPoint: .trailing)
                    )
                    .cornerRadius(30)
                    .shadow(color: Color(oklch: (0.6, 0.3, 260)).opacity(0.3), radius: 15)
                }

                Button {
                    dismiss()
                } label: {
                    Text("Cancel")
                        .font(.system(size: 15))
                        .foregroundColor(.white.opacity(0.4))
                }
            }
            .padding(24)
        }
        .onAppear {
            hostURL = wsManager.hostURL
            port = wsManager.port
        }
    }
}