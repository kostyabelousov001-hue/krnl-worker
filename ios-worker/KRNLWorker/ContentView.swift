import SwiftUI

struct ContentView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            if let ui = wsManager.uiConfig {
                ServerDrivenList(ui: ui, showSettings: $showSettings)
                    .navigationTitle(ui.app.title)
                    .navigationBarTitleDisplayMode(.large)
                    .toolbar { toolbarContent }
            } else {
                PlaceholderView()
                    .navigationTitle("KRNL Worker")
                    .toolbar { toolbarContent }
            }
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
    }

    @ToolbarContentBuilder
    var toolbarContent: some ToolbarContent {
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

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
            Text("Loading...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Server-Driven List

struct ServerDrivenList: View {
    let ui: UIConfig
    @EnvironmentObject var wsManager: WebSocketManager
    @Binding var showSettings: Bool

    var body: some View {
        List {
            ForEach(ui.sections, id: \.id) { section in
                Section {
                    switch section.type {
                    case "statusCard":
                        StatusCardView(section: section)
                    case "statsRow":
                        StatsRowView(section: section)
                    case "button":
                        ButtonRowView(section: section, showSettings: $showSettings)
                    case "info":
                        InfoRowView(section: section)
                    default:
                        Text("Unknown: \(section.type)")
                    }
                } header: {
                    Label(section.header, systemImage: section.headerIcon)
                }
            }
        }
    }
}

// MARK: - Status Card

struct StatusCardView: View {
    let section: SectionConfig
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        HStack {
            Image(systemName: wsManager.isConnected
                  ? (section.fields?.connected?.icon ?? "checkmark.circle.fill")
                  : (section.fields?.disconnected?.icon ?? "circle.slash"))
                .font(.title2)
                .foregroundStyle(Color(hex: wsManager.isConnected
                    ? (section.fields?.connected?.color ?? "#34C759")
                    : (section.fields?.disconnected?.color ?? "#8E8E93")))

            VStack(alignment: .leading, spacing: 2) {
                Text(wsManager.isConnected ? "Connected" : "Disconnected")
                    .font(.body)
                Text(wsManager.workerStatus)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Stats Row

struct StatsRowView: View {
    let section: SectionConfig
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        HStack {
            ForEach(section.items ?? []) { item in
                StatItemView(item: item)
                if item.id != section.items?.last?.id {
                    Divider()
                }
            }
        }
        .padding(.vertical, 8)
    }
}

struct StatItemView: View {
    let item: ItemConfig
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: item.icon)
                .font(.title3)
                .foregroundStyle(.tint)
            Text(boundValue)
                .font(.headline)
                .fontWeight(.semibold)
            Text(item.label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    var boundValue: String {
        switch item.bind {
        case "tasksCompleted": return "\(wsManager.tasksCompleted)"
        case "leadsProcessed": return "\(wsManager.leadsProcessed)"
        case "workerStatus": return wsManager.workerStatus
        case "hostURL": return wsManager.hostURL
        default: return item.bind ?? item.value ?? ""
        }
    }
}

// MARK: - Button Row

struct ButtonRowView: View {
    let section: SectionConfig
    @Binding var showSettings: Bool

    var body: some View {
        Button { showSettings = true } label: {
            Label(section.label ?? "Connect", systemImage: section.icon ?? "network")
        }
    }
}

// MARK: - Info Row

struct InfoRowView: View {
    let section: SectionConfig
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        ForEach(section.items ?? []) { item in
            HStack {
                Text(item.label)
                    .foregroundStyle(.primary)
                Spacer()
                Text(boundValue(for: item))
                    .foregroundStyle(.secondary)
            }
        }
    }

    func boundValue(for item: ItemConfig) -> String {
        switch item.bind {
        case "hostURL": return wsManager.hostURL
        default: return item.value ?? item.bind ?? ""
        }
    }
}

// MARK: - Color Helper

extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        if let n = Int(s, radix: 16) {
            let r = Double((n >> 16) & 0xFF) / 255
            let g = Double((n >> 8) & 0xFF) / 255
            let b = Double(n & 0xFF) / 255
            self.init(red: r, green: g, blue: b)
        } else {
            self.init(.gray)
        }
    }
}

// MARK: - JSON Models

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

    enum CodingKeys: CodingKey {
        case key, label, icon, value, bind
    }
}

struct ColorsConfig: Codable {
    let background: String?
    let groupBackground: String?
    let text: String?
    let secondaryText: String?
    let separator: String?
}