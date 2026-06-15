import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @Environment(\.dismiss) var dismiss
    @State private var hostURL: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Image(systemName: "network")
                            .foregroundStyle(.tint)
                        TextField("lol.krnlcamel.space", text: $hostURL)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                            .font(.body)
                    }
                } header: {
                    Text("Host Address")
                } footer: {
                    Text("Uses wss:// and https:// through Cloudflare.")
                }

                Section {
                    Button("Connect") {
                        wsManager.hostURL = hostURL.isEmpty ? "lol.krnlcamel.space" : hostURL
                        wsManager.fetchConfigAndConnect()
                        dismiss()
                    }
                    .frame(maxWidth: .infinity)
                    .font(.body.weight(.semibold))

                    Button("Cancel", role: .cancel) { dismiss() }
                        .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Connection")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear { hostURL = wsManager.hostURL }
    }
}