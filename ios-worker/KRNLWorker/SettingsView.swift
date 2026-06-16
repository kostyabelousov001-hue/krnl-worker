import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @Environment(\.dismiss) var dismiss
    @State private var hostURL: String = ""
    @State private var searchWebsites = true
    @State private var useWebKit = true
    @State private var crawlPercentage: Double = 1.0
    @State private var configServerURL: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Image(systemName: "network")
                            .foregroundStyle(.tint)
                        TextField("host:9090", text: $hostURL)
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
                    Toggle("Search Company Sites", isOn: $searchWebsites)
                    
                    Toggle("Use WebKit Browser", isOn: $useWebKit)
                    
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Crawl Limit")
                            Spacer()
                            Text("\(Int(crawlPercentage * 100))%")
                                .foregroundColor(.secondary)
                        }
                        Slider(value: $crawlPercentage, in: 0.1...1.0, step: 0.1)
                    }
                    
                    HStack {
                        Image(systemName: "server.rack")
                            .foregroundStyle(.tint)
                        TextField("Config Server URL (Optional)", text: $configServerURL)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                            .font(.body)
                    }
                } header: {
                    Text("Worker Configuration")
                } footer: {
                    Text("Control performance, traffic, and web crawler behavior.")
                }

                Section {
                    Button("Save & Apply") {
                        saveToManager()
                        dismiss()
                    }
                    .frame(maxWidth: .infinity)
                    .font(.body.weight(.semibold))

                    Button("Connect Host") {
                        saveToManager()
                        wsManager.fetchConfigAndConnect()
                        dismiss()
                    }
                    .frame(maxWidth: .infinity)

                    Button("Cancel", role: .cancel) { dismiss() }
                        .frame(maxWidth: .infinity)
                }

                if wsManager.isConnected {
                    Section {
                        Button("Disconnect", role: .destructive) {
                            wsManager.disconnect()
                            dismiss()
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle("Connection")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear {
            hostURL = wsManager.hostURL
            searchWebsites = wsManager.searchWebsites
            useWebKit = wsManager.useWebKit
            crawlPercentage = wsManager.crawlPercentage
            configServerURL = wsManager.configServerURL
        }
    }

    private func saveToManager() {
        wsManager.hostURL = hostURL.isEmpty ? "host:9090" : hostURL
        wsManager.searchWebsites = searchWebsites
        wsManager.useWebKit = useWebKit
        wsManager.crawlPercentage = crawlPercentage
        wsManager.configServerURL = configServerURL
        wsManager.saveSettings()
        
        if wsManager.isConnected {
            wsManager.sendStatus(wsManager.workerStatus) // Send updated settings to Host
        }
    }
}