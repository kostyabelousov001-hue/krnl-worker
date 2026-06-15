import Foundation
import Network

class WebSocketManager: NSObject, ObservableObject, URLSessionWebSocketDelegate {
    @Published var isConnected = false
    @Published var isConnecting = false
    @Published var hostURL = "lol.krnlcamel.space"
    @Published var port = "9090"
    @Published var connectedWorkers = 0
    @Published var tasksCompleted = 0
    @Published var leadsProcessed = 0
    @Published var workerStatus = "Idle"

    private var webSocket: URLSessionWebSocketTask?
    private let session: URLSession
    private var scraperEngine: ScraperEngine?

    override init() {
        session = URLSession(configuration: .default)
        super.init()

        if let saved = UserDefaults.standard.string(forKey: "host_url") {
            hostURL = saved
        }
        if let saved = UserDefaults.standard.string(forKey: "host_port") {
            port = saved
        }
    }

    func connect() {
        guard !isConnected, !isConnecting else { return }
        isConnecting = true
        workerStatus = "Connecting..."

        UserDefaults.standard.set(hostURL, forKey: "host_url")
        UserDefaults.standard.set(port, forKey: "host_port")

        let urlStr = "ws://\(hostURL):\(port)"
        guard let url = URL(string: urlStr) else {
            DispatchQueue.main.async {
                self.isConnecting = false
                self.workerStatus = "Invalid URL"
            }
            return
        }

        webSocket = session.webSocketTask(with: url)
        webSocket?.delegate = self
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
            self.scraperEngine = ScraperEngine(wsManager: self)
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
                    DispatchQueue.main.async {
                        self.workerStatus = "Waiting for tasks..."
                    }
                }
            }
            return
        }

        switch task.type {
        case "TASK_DETAILS":
            if let items = task.items {
                DispatchQueue.main.async {
                    self.workerStatus = "Extracting \(items.count) places..."
                }
                scraperEngine?.extractDetails(items)
            }

        case "TASK_WEB":
            if let leads = task.leads {
                DispatchQueue.main.async {
                    self.workerStatus = "Crawling \(leads.count) websites..."
                }
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