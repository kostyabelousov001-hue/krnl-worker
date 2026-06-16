import SwiftUI
import WebKit

struct ContentView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            if wsManager.isConnected {
                let rawHost = wsManager.hostURL
                let finalHost = rawHost.hasPrefix("http") ? rawHost : "http://\(rawHost)"
                if let url = URL(string: finalHost) {
                    SwiftUIWebView(url: url)
                        .edgesIgnoringSafeArea(.bottom)
                        .navigationTitle("Scraper Console")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { toolbarContent }
                } else {
                    Text("Invalid Host URL").foregroundStyle(.red)
                }
            } else {
                PlaceholderView()
                    .navigationTitle("Worker")
                    .toolbar { toolbarContent }
            }
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
    }

    @ToolbarContentBuilder
    var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .navigationBarLeading) {
            Button(action: { showSettings = true }) {
                Image(systemName: "gearshape")
            }
        }
        ToolbarItem(placement: .navigationBarTrailing) {
            HStack(spacing: 6) {
                Circle()
                    .fill(wsManager.isConnected ? Color.green : Color.secondary)
                    .frame(width: 8, height: 8)
                Text(wsManager.hostURL)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct PlaceholderView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            if wsManager.workerStatus == "Connection failed" {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 48))
                    .foregroundStyle(.secondary)
                Text("Could not connect")
                    .font(.title3).fontWeight(.semibold)
                Text("Check the address and try again")
                    .font(.subheadline).foregroundStyle(.secondary)
                Button("Settings") { showSettings = true }.buttonStyle(.bordered).padding(.top, 8)
            } else if wsManager.workerStatus == "Connected" || wsManager.workerStatus == "Ready" {
                Image(systemName: "checkmark.circle")
                    .font(.system(size: 48)).foregroundStyle(.green)
                Text("Connected").foregroundStyle(.secondary)
                if !wsManager.logEntries.isEmpty { LogPreviewView() }
            } else {
                ProgressView().controlSize(.large)
                Text(wsManager.workerStatus).foregroundStyle(.secondary)
                Button("Settings") { showSettings = true }.buttonStyle(.bordered).padding(.top, 8)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .sheet(isPresented: $showSettings) { SettingsView() }
    }
}

struct LogPreviewView: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        NavigationLink(destination: LogView()) {
            HStack {
                Image(systemName: "list.bullet.rectangle")
                Text("View Activity Log")
                Spacer()
                Text("\(wsManager.logEntries.count) entries")
                    .foregroundStyle(.secondary).font(.caption)
            }
            .padding(12)
            .background(.ultraThinMaterial)
            .cornerRadius(10)
        }
        .padding(.horizontal)
    }
}

struct LogView: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        List {
            ForEach(Array(wsManager.logEntries.reversed()), id: \.self) { entry in
                Text(entry)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 2)
            }
        }
        .navigationTitle("Activity Log")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Clear") { wsManager.logEntries.removeAll() }
                    .font(.caption)
            }
        }
    }
}

// MARK: - SwiftUI Web View Wrapper

struct SwiftUIWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: config)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        let request = URLRequest(url: url)
        uiView.load(request)
    }
}

// MARK: - JSON Models (Keep for structural reference / decoding if needed)

struct UIConfig: Codable {
    let version: Int
    let app: AppConfig
    let sections: [SectionConfig]
    let colors: ColorsConfig?
}

struct AppConfig: Codable {
    let title: String
    let icon: String?
    let accentColor: String?
    let navigationStyle: String?
}

struct SectionConfig: Codable, Identifiable {
    let id: String
    let header: String
    let headerIcon: String
    let type: String
    let fields: StatusFields?
    let items: [ItemConfig]?
    let label: String?
    let icon: String?
    let action: String?
}

struct StatusFields: Codable {
    let connected: StatusIcon?
    let disconnected: StatusIcon?
}

struct StatusIcon: Codable {
    let icon: String
    let color: String
}

struct ItemConfig: Codable, Identifiable {
    var id: String { key ?? label }
    let key: String?
    let label: String
    let icon: String
    let value: String?
    let bind: String?

    enum CodingKeys: CodingKey { case key, label, icon, value, bind }
}

struct ColorsConfig: Codable {
    let background: String?
    let groupBackground: String?
    let text: String?
    let secondaryText: String?
    let separator: String?
}