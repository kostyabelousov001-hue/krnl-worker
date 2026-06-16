import Foundation
import WebKit

class ScraperEngine: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private weak var wsManager: WebSocketManager?
    private var controllerWebView: WKWebView?
    private var workerWebView: WKWebView?
    private var workerScript: String?
    
    // Callback state
    private var loadURLCallback: String?
    
    init(wsManager: WebSocketManager, script: String?) {
        self.wsManager = wsManager
        self.workerScript = script
        super.init()
        
        let controllerConfig = WKWebViewConfiguration()
        controllerConfig.websiteDataStore = .nonPersistent()
        
        // Add script message handler
        let contentController = WKUserContentController()
        contentController.add(self, name: "krnlBridge")
        controllerConfig.userContentController = contentController
        
        controllerWebView = WKWebView(frame: .zero, configuration: controllerConfig)
        
        let workerConfig = WKWebViewConfiguration()
        workerConfig.websiteDataStore = .nonPersistent()
        workerWebView = WKWebView(frame: .zero, configuration: workerConfig)
        workerWebView?.navigationDelegate = self
        
        // Load blank page in controller to establish JS context, then inject the script
        controllerWebView?.loadHTMLString("<html><body><script>var KRNL = {};</script></body></html>", baseURL: nil)
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.injectScript()
        }
    }
    
    private func injectScript() {
        guard let script = workerScript else { return }
        controllerWebView?.evaluateJavaScript(script, completionHandler: nil)
        
        // Expose settings to the JS environment
        let settingsJSON = """
        KRNL.settings = {
            searchWebsites: \(wsManager?.searchWebsites ?? true),
            useWebKit: \(wsManager?.useWebKit ?? true),
            crawlPercentage: \(wsManager?.crawlPercentage ?? 1.0)
        };
        """
        controllerWebView?.evaluateJavaScript(settingsJSON, completionHandler: nil)
    }
    
    // MARK: - WKScriptMessageHandler
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let dict = message.body as? [String: Any],
              let action = dict["action"] as? String else { return }
              
        switch action {
        case "loadURL":
            if let urlStr = dict["url"] as? String, let callback = dict["callback"] as? String {
                self.loadURLCallback = callback
                let finalURL = urlStr.hasPrefix("http") ? urlStr : "http://" + urlStr
                guard let url = URL(string: finalURL) else {
                    triggerCallback(callback, arg: "false")
                    return
                }
                DispatchQueue.main.async {
                    self.workerWebView?.load(URLRequest(url: url))
                }
            }
            
        case "evaluateInPage":
            if let js = dict["js"] as? String, let callback = dict["callback"] as? String {
                DispatchQueue.main.async {
                    self.workerWebView?.evaluateJavaScript(js) { [weak self] result, _ in
                        let resStr = (result as? String) ?? "N/A"
                        self?.triggerCallback(callback, arg: resStr)
                    }
                }
            }
            
        case "fetchHTML":
            if let urlStr = dict["url"] as? String, let callback = dict["callback"] as? String {
                let finalURL = urlStr.hasPrefix("http") ? urlStr : "http://" + urlStr
                guard let url = URL(string: finalURL) else {
                    triggerCallback(callback, arg: "N/A")
                    return
                }
                let sessionConfig = URLSessionConfiguration.default
                sessionConfig.timeoutIntervalForRequest = 4.0
                let session = URLSession(configuration: sessionConfig)
                session.dataTask(with: url) { [weak self] data, _, _ in
                    let html = (data != nil) ? (String(data: data!, encoding: .utf8) ?? "N/A") : "N/A"
                    self?.triggerCallback(callback, arg: html)
                }.resume()
            }
            
        case "sendDetailsBatch":
            if let results = dict["results"] as? [[String: Any]] {
                var scrapedPlaces: [ScrapedPlace] = []
                for r in results {
                    if let name = r["name"] as? String {
                        scrapedPlaces.append(ScrapedPlace(
                            name: name,
                            rating: (r["rating"] as? String) ?? "N/A",
                            reviews: (r["reviews"] as? String) ?? "0",
                            phone: (r["phone"] as? String) ?? "N/A",
                            website: (r["website"] as? String) ?? "N/A",
                            url: (r["url"] as? String) ?? ""
                        ))
                    }
                }
                wsManager?.sendDetailsBatch(scrapedPlaces)
            }
            
        case "sendWebBatch":
            if let results = dict["results"] as? [[String: Any]] {
                var scrapedWebsites: [ScrapedWebsite] = []
                for r in results {
                    if let name = r["name"] as? String {
                        scrapedWebsites.append(ScrapedWebsite(
                            name: name,
                            rating: (r["rating"] as? String) ?? "N/A",
                            reviews: (r["reviews"] as? String) ?? "0",
                            phone: (r["phone"] as? String) ?? "N/A",
                            website: (r["website"] as? String) ?? "N/A",
                            url: (r["url"] as? String) ?? "",
                            emails: (r["emails"] as? String) ?? "N/A",
                            facebook: (r["facebook"] as? String) ?? "N/A",
                            instagram: (r["instagram"] as? String) ?? "N/A",
                            linkedin: (r["linkedin"] as? String) ?? "N/A"
                        ))
                    }
                }
                wsManager?.sendWebBatch(scrapedWebsites)
            }
            
        case "log":
            if let msg = dict["message"] as? String {
                wsManager?.logEntries.append(msg)
            }
            
        case "sendRaw":
            if let rawData = dict["data"] as? String {
                if let data = rawData.data(using: .utf8) {
                    wsManager?.sendRaw(data)
                }
            }
            
        default:
            break
        }
    }
    
    private func triggerCallback(_ callback: String, arg: String) {
        DispatchQueue.main.async {
            // Escape argument to prevent JS syntax injection errors
            let escapedArg = arg.replacingOccurrences(of: "\\", with: "\\\\")
                               .replacingOccurrences(of: "\"", with: "\\\"")
                               .replacingOccurrences(of: "\n", with: "\\n")
                               .replacingOccurrences(of: "\r", with: "\\r")
                               .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
                               .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
            
            let js = "KRNL.onCallback(\"\(callback)\", \"\(escapedArg)\")"
            self.controllerWebView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
    
    // MARK: - WKNavigationDelegate
    
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let callback = loadURLCallback {
            loadURLCallback = nil
            triggerCallback(callback, arg: "true")
        }
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if let callback = loadURLCallback {
            loadURLCallback = nil
            triggerCallback(callback, arg: "false")
        }
    }
    
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if let callback = loadURLCallback {
            loadURLCallback = nil
            triggerCallback(callback, arg: "false")
        }
    }
    
    // MARK: - API entries called from WebSocketManager
    
    func discover(query: String, pass: Int) {
        let js = "if (KRNL.discover) KRNL.discover(\"\(query)\", \(pass));"
        controllerWebView?.evaluateJavaScript(js, completionHandler: nil)
    }
    
    func extractDetails(_ items: [TaskItem]) {
        if let data = try? JSONEncoder().encode(items), let jsonStr = String(data: data, encoding: .utf8) {
            let js = "if (KRNL.extractDetails) KRNL.extractDetails(\(jsonStr));"
            controllerWebView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
    
    func crawlWebsites(_ leads: [LeadItem]) {
        if let data = try? JSONEncoder().encode(leads), let jsonStr = String(data: data, encoding: .utf8) {
            let js = "if (KRNL.crawlWebsites) KRNL.crawlWebsites(\(jsonStr));"
            controllerWebView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}

struct PlaceJS: Codable { let name: String; let phone: String; let website: String }
struct WebsiteJS_fast: Codable { let emails: String; let fb: String; let ig: String; let li: String }