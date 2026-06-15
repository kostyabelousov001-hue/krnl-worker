import Foundation
import Network

class WebSocketManager: NSObject, ObservableObject, URLSessionWebSocketDelegate {
    @Published var isConnected = false
    @Published var isConnecting = false
    @Published var hostURL = "lol.krnlcamel.space"
    @Published var connectedWorkers = 0
    @Published var tasksCompleted = 0
    @Published var leadsProcessed = 0
    @Published var workerStatus = "Idle"
    @Published var uiConfig: UIConfig?
    @Published var workerScript: String?

    private var webSocket: URLSessionWebSocketTask?
    private let session: URLSession
    private var scraperEngine: ScraperEngine?

    override init() {
        session = URLSession(configuration: .default)
        super.init()

        if let saved = UserDefaults.standard.string(forKey: "host_url") {
            hostURL = saved
        }
    }

    func fetchConfigAndConnect() {
        guard !isConnected, !isConnecting else { return }
        isConnecting = true
        workerStatus = "Fetching config..."

        UserDefaults.standard.set(hostURL, forKey: "host_url")

        let baseURL = "https://\(hostURL)"
        let group = DispatchGroup()

        group.enter()
        fetchJSON(from: "\(baseURL)/config/ui.json") { [weak self] (config: UIConfig?) in
            DispatchQueue.main.async { self?.uiConfig = config }
            group.leave()
        }

        group.enter()
        fetchScript(from: "\(baseURL)/script/worker.js") { [weak self] script in
            DispatchQueue.main.async { self?.workerScript = script }
            group.leave()
        }

        group.notify(queue: .main) { [weak self] in
            self?.workerStatus = "Connecting..."
            self?.connectWebSocket()
        }
    }

    private func connectWebSocket() {
        let urlStr = "wss://\(hostURL)"
        guard let url = URL(string: urlStr) else {
            isConnecting = false
            workerStatus = "Invalid URL"
            return
        }

        webSocket = session.webSocketTask(with: url)
        webSocket?.delegate = self
        webSocket?.resume()
        receiveMessage()
    }

    private func fetchJSON<T: Decodable>(from urlString: String, completion: @escaping (T?) -> Void) {
        guard let url = URL(string: urlString) else { completion(nil); return }
        URLSession.shared.dataTask(with: url) { data, _, error in
            guard let data = data, error == nil,
                  let decoded = try? JSONDecoder().decode(T.self, from: data) else {
                completion(nil)
                return
            }
            completion(decoded)
        }.resume()
    }

    private func fetchScript(from urlString: String, completion: @escaping (String?) -> Void) {
        guard let url = URL(string: urlString) else { completion(nil); return }
        URLSession.shared.dataTask(with: url) { data, _, error in
            guard let data = data, let script = String(data: data, encoding: .utf8), error == nil else {
                completion(nil)
                return
            }
            completion(script)
        }.resume()
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