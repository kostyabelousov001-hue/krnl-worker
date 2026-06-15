import SwiftUI

struct ContentView: View {
    @EnvironmentObject var wsManager: WebSocketManager
    @State private var showSettings = false

    var body: some View {
        ZStack {
            BackgroundView()

            VStack(spacing: 0) {
                HeaderView()
                    .padding(.top, 50)

                Spacer()

                ConnectionStatusCard()

                Spacer()

                if wsManager.isConnected {
                    DashboardView()
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else {
                    ConnectButton(showSettings: $showSettings)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                Spacer()

                BottomBar()
                    .padding(.bottom, 40)
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .animation(.spring(response: 0.6, dampingFraction: 0.8), value: wsManager.isConnected)
    }
}

struct BackgroundView: View {
    @State private var animate = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(oklch: (0.15, 0.05, 260)),
                    Color(oklch: (0.08, 0.1, 280)),
                    Color(oklch: (0.05, 0.15, 300))
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            GooeyBlob(x: 0.8, y: 0.2, color: Color(oklch: (0.6, 0.25, 260)), animate: $animate)
            GooeyBlob(x: 0.2, y: 0.8, color: Color(oklch: (0.6, 0.2, 300)), animate: $animate)
        }
    }
}

struct GooeyBlob: View {
    let x: CGFloat
    let y: CGFloat
    let color: Color
    @Binding var animate: Bool

    var body: some View {
        GeometryReader { geo in
            Circle()
                .fill(color)
                .frame(width: 200, height: 200)
                .blur(radius: 40)
                .position(
                    x: geo.size.width * (animate ? 1 - x : x),
                    y: geo.size.height * (animate ? 1 - y : y)
                )
                .onAppear {
                    withAnimation(.easeInOut(duration: 7).repeatForever(autoreverses: true)) {
                        animate = true
                    }
                }
        }
    }
}

struct HeaderView: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 36))
                .foregroundStyle(
                    LinearGradient(colors: [
                        Color(oklch: (0.7, 0.3, 260)),
                        Color(oklch: (0.6, 0.2, 300))
                    ], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .shadow(color: Color(oklch: (0.6, 0.3, 260)).opacity(0.5), radius: 20)

            Text("KRNL Worker")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.white)

            Text("Distributed Scraper Node")
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(.white.opacity(0.5))
        }
    }
}

struct ConnectionStatusCard: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var statusColor: Color {
        if wsManager.isConnected {
            return Color(oklch: (0.7, 0.25, 142))
        }
        if wsManager.isConnecting {
            return Color(oklch: (0.7, 0.2, 86))
        }
        return Color(oklch: (0.65, 0.2, 25))
    }

    var statusText: String {
        if wsManager.isConnected { return "Connected" }
        if wsManager.isConnecting { return "Connecting..." }
        return "Disconnected"
    }

    var body: some View {
        HStack(spacing: 16) {
            Circle()
                .fill(statusColor)
                .frame(width: 12, height: 12)
                .overlay(
                    Circle()
                        .stroke(statusColor.opacity(0.3), lineWidth: 6)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(statusText)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)

                if wsManager.isConnected {
                    Text(wsManager.hostURL)
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.4))
                }
            }

            Spacer()

            if wsManager.isConnected {
                HStack(spacing: 4) {
                    Circle()
                        .fill(Color(oklch: (0.7, 0.25, 142)))
                        .frame(width: 6, height: 6)
                    Text("Workers: \(wsManager.connectedWorkers)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(.ultraThinMaterial)
                .cornerRadius(20)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(.ultraThinMaterial)
        .cornerRadius(20)
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(.white.opacity(0.08), lineWidth: 1)
        )
        .padding(.horizontal, 20)
    }
}

struct ConnectButton: View {
    @Binding var showSettings: Bool

    var body: some View {
        Button {
            showSettings = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.system(size: 16))
                Text("Connect to Host")
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 28)
            .padding(.vertical, 16)
            .background(
                LinearGradient(colors: [
                    Color(oklch: (0.6, 0.25, 260)),
                    Color(oklch: (0.55, 0.2, 280))
                ], startPoint: .leading, endPoint: .trailing)
            )
            .cornerRadius(30)
            .shadow(color: Color(oklch: (0.6, 0.3, 260)).opacity(0.4), radius: 20)
        }
    }
}

struct DashboardView: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        VStack(spacing: 16) {
            StatCard(
                icon: "list.bullet.rectangle",
                title: "Tasks",
                value: "\(wsManager.tasksCompleted)"
            )

            StatCard(
                icon: "person.3.fill",
                title: "Leads",
                value: "\(wsManager.leadsProcessed)"
            )

            StatCard(
                icon: "bolt.shield.fill",
                title: "Status",
                value: wsManager.workerStatus
            )
        }
        .padding(.horizontal, 20)
    }
}

struct StatCard: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(
                    LinearGradient(colors: [
                        Color(oklch: (0.7, 0.3, 260)),
                        Color(oklch: (0.6, 0.2, 300))
                    ], startPoint: .top, endPoint: .bottom)
                )
                .frame(width: 40, height: 40)
                .background(.ultraThinMaterial)
                .cornerRadius(12)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.5))
                Text(value)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white)
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(.ultraThinMaterial)
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(.white.opacity(0.06), lineWidth: 1)
        )
    }
}

struct BottomBar: View {
    @EnvironmentObject var wsManager: WebSocketManager

    var body: some View {
        HStack(spacing: 24) {
            Button { UIImpactFeedbackGenerator(style: .light).impactOccurred() } label: {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 16))
                    .foregroundColor(.white.opacity(0.5))
            }

            Text("v1.0")
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.2))

            Button { wsManager.disconnect() } label: {
                Image(systemName: "power")
                    .font(.system(size: 16))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }
}

extension Color {
    init(oklch: (CGFloat, CGFloat, CGFloat)) {
        let (l, c, h) = oklch
        let hRad = h * .pi / 180
        let a = c * cos(hRad)
        let b = c * sin(hRad)

        let l_ = l + 0.3963377774 * a + 0.2158037573 * b
        let m_ = l - 0.1055613458 * a - 0.0638541728 * b
        let s_ = l - 0.0894841775 * a - 1.2914855480 * b

        let l3 = l_ * l_ * l_
        let m3 = m_ * m_ * m_
        let s3 = s_ * s_ * s_

        let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
        let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
        let b_ = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3

        self.init(
            red: min(max(r, 0), 1),
            green: min(max(g, 0), 1),
            blue: min(max(b_, 0), 1)
        )
    }
}