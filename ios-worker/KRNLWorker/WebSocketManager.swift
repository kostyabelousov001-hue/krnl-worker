import Foundation
import Network

class WebSocketManager: NSObject, ObservableObject, URLSessionWebSocketDelegate {
    @Published var isConnected = false
    @Published var isConnecting = false
    @Published var hostURL = "host:9090"
    @Published var connectedWorkers = 0
    @Published var tasksCompleted = 0
    @Published var leadsProcessed = 0
    @Published var workerStatus = "Idle"
    @Published var uiConfig: UIConfig?
    @Published var workerScript: String?

    private var webSocket: URLSessionWebSocketTask?
    private var scraperEngine: ScraperEngine?

    override init() {
        super.init()
        if let saved = UserDefaults.standard.string(forKey: "host_url") {
            hostURL = saved
        }
    }

    func fetchConfigAndConnect() {
        guard !isConnected, !isConnecting else { return }
        isConnecting = true
        workerStatus = "Connecting..."

        UserDefaults.standard.set(hostURL, forKey: "host_url")

        let baseURL = "http://\(hostURL)"
        let configTask = URLSession.shared.dataTask(with: URL(string: "\(baseURL)/config/ui.json")!) { [weak self] data, _, error in
            DispatchQueue.main.async {
                if let data = data, let config = try? JSONDecoder().decode(UIConfig.self, from: data) {
                    self?.uiConfig = config
                }
                self?.workerStatus = "Connected"
                self?.connectWebSocket()
            }
        }
        configTask.resume()

        // Also fetch script in background
        URLSession.shared.dataTask(with: URL(string: "\(baseURL)/script/worker.js")!) { [weak self] data, _, _ in
            if let data = data { self?.workerScript = String(data: data, encoding: .utf8) }
        }.resume()

        // Timeout: reset after 8 seconds if no connection
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            if self?.isConnecting == true {
                self?.isConnecting = false
                self?.workerStatus = "Connection failed"
            }
        }
    }

    private func connectWebSocket() {
        let urlStr = "ws://\(hostURL)"
        guard let url = URL(string: urlStr) else {
            isConnecting = false
            workerStatus = "Invalid address"
            return
        }

        let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        webSocket = session.webSocketTask(with: url)
        webSocket?.resume()
        receiveMessage()
    }

    func disconnect() {
        webSocket?.cancel(with: .normalClosure, reason: nil)
        webSocket = nil
        DispatchQueue.main.async {
            self.isConnected = false
            self.isConnecting = false
            self.workerStatus = "Disconnected"
        }
    }

    func sendStatus(_ status: String) {
        guard let ws = webSocket, isConnected else { return }
        let msg = StatusMessage(type: "STATUS", status: status)
        if let data = try? JSONEncoder().encode(msg) {
            ws.send(.data(data)) { _ in }
        }
    }

    // MARK: - WebSocketDelegate

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        DispatchQueue.main.async {
            self.isConnected = true
            self.isConnecting = false
            self.workerStatus = "Ready"
            self.scraperEngine = ScraperEngine(wsManager: self, script: self.workerScript)
        }
        sendStatus("Ready")
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        DispatchQueue.main.async {
            self.isConnected = false
            self.isConnecting = false
            self.workerStatus = "Disconnected"
            self.scraperEngine = nil
        }
    }

    // MARK: - Message Receive

    private func receiveMessage() {
        webSocket?.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let message):
                switch message {
                case .data(let data):
                    self.handleMessage(data)
                case .string(let text):
                    if let data = text.data(using: .utf8) {
                        self.handleMessage(data)
                    }
                @unknown default:
                    break
                }
                self.receiveMessage()
            case .failure:
                DispatchQueue.main.async {
                    self.disconnect()
                }
            }
        }
    }

    private func handleMessage(_ data: Data) {
        guard let task = try? JSONDecoder().decode(WorkerTask.self, from: data) else {
            if let statusMsg = try? JSONDecoder().decode(StatusMessage.self, from: data) {
                if statusMsg.type == "NO_MORE_TASKS" {
                    DispatchQueue.main.async { self.workerStatus = "Waiting for tasks..." }
                }
            }
            return
        }

        switch task.type {
        case "TASK_DETAILS":
            if let items = task.items {
                DispatchQueue.main.async { self.workerStatus = "Extracting \(items.count) places..." }
                scraperEngine?.extractDetails(items)
            }

        case "TASK_WEB":
            if let leads = task.leads {
                DispatchQueue.main.async { self.workerStatus = "Crawling \(leads.count) websites..." }
                scraperEngine?.crawlWebsites(leads)
            }

        default:
            break
        }
    }

    // MARK: - Send Results

    func sendDetailsBatch(_ results: [ScrapedPlace]) {
        let batch = DetailsBatch(type: "DETAILS_BATCH", results: results)
        if let data = try? JSONEncoder().encode(batch) {
            webSocket?.send(.data(data)) { _ in }
        }
        DispatchQueue.main.async {
            self.tasksCompleted += 1
            self.leadsProcessed += results.count
            self.workerStatus = "Idle"
        }
    }

    func sendWebBatch(_ results: [ScrapedWebsite]) {
        let batch = WebBatch(type: "WEB_BATCH", results: results)
        if let data = try? JSONEncoder().encode(batch) {
            webSocket?.send(.data(data)) { _ in }
        }
        DispatchQueue.main.async {
            self.tasksCompleted += 1
            self.leadsProcessed += results.count
            self.workerStatus = "Idle"
        }
    }
}