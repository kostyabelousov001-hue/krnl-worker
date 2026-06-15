import SwiftUI

struct ContentView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            List {
                StatusSection()
                DashboardSection()
                ActionsSection(showSettings: $showSettings)
            }
            .navigationTitle("KRNL Worker")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    ConnectionIndicator()
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
        }
    }
}

struct StatusSection: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        Section {
            HStack {
                Image(systemName: wsManager.isConnected ? "checkmark.circle.fill" : "circle.slash")
                    .font(.title2)
                    .foregroundStyle(wsManager.isConnected ? .green : .secondary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(wsManager.isConnected ? "Connected" : "Disconnected")
                        .font(.body)
                    Text(wsManager.workerStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
        } header: {
            Label("Status", systemImage: "antenna.radiowaves.left.and.right")
        }
    }
}

struct DashboardSection: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        Section {
            HStack {
                StatBadge(icon: "list.clipboard", value: "\(wsManager.tasksCompleted)", label: "Tasks")
                Divider()
                StatBadge(icon: "person.3", value: "\(wsManager.leadsProcessed)", label: "Leads")
                Divider()
                StatBadge(icon: "bolt", value: wsManager.isConnected ? "Active" : "Idle", label: "Status")
            }
            .padding(.vertical, 8)
        } header: {
            Label("Dashboard", systemImage: "chart.bar.fill")
        }
    }
}

struct StatBadge: View {
    let icon: String
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.tint)
            Text(value)
                .font(.headline)
                .fontWeight(.semibold)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

struct ActionsSection: View {
    @Binding var showSettings: Bool

    var body: some View {
        Section {
            Button {
                showSettings = true
            } label: {
                Label("Connect to Host", systemImage: "network")
            }
        } header: {
            Label("Connection", systemImage: "globe")
        }
    }
}

struct ConnectionIndicator: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
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