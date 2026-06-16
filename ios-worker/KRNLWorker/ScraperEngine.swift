import Foundation
import WebKit
import AVFoundation

class ScraperEngine: NSObject {
    private weak var wsManager: WebSocketManager?
    private var webView: WKWebView?
    private var workerScript: String?
    private var audioPlayer: AVAudioPlayer?

    init(wsManager: WebSocketManager, script: String?) {
        self.wsManager = wsManager
        self.workerScript = script
        super.init()

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: .zero, configuration: config)
    }

    private func evaluateJS(_ script: String, completion: @escaping (String?) -> Void) {
        webView?.evaluateJavaScript(script) { result, _ in completion(result as? String) }
    }

    func discover(query: String, pass: Int) {
        guard let webView = webView else { return }
        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let url = URL(string: "https://www.google.com/maps/search/\(encodedQuery)") else { return }

        webView.load(URLRequest(url: url))

        DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) {
            let js: String
            if let s = self.workerScript {
                js = "\(s); KRNL.extractLeadsFromList()"
            } else {
                js = """
                    (function() {
                        var results = [];
                        var cards = document.querySelectorAll('a[href*="/maps/place/"]');
                        cards.forEach(function(card) {
                            var href = card.href;
                            if (!href) return;
                            var container = card.closest('div[role="article"]') || card.closest('.Nv2PK') || card.parentElement;
                            var rating = 'N/A', reviews = '0';
                            if (container) {
                                var spans = container.querySelectorAll('span');
                                for (var i = 0; i < spans.length; i++) {
                                    var t = spans[i].textContent.trim().replace(',', '.');
                                    var n = parseFloat(t);
                                    if (!isNaN(n) && n >= 1.0 && n <= 5.0 && t.length <= 4 && !spans[i].querySelector('span')) {
                                        rating = t; break;
                                    }
                                }
                                var m = container.textContent.match(/\\((\\d[\\d\\s,.]*)\\)/);
                                if (m) reviews = m[1].replace(/\\D/g, '');
                            }
                            results.push({ href: href, rating: rating, reviews: reviews });
                        });
                        return JSON.stringify(results);
                    })()
                """
            }
            self.evaluateJS(js) { json in
                guard let data = json?.data(using: .utf8),
                      let urls = try? JSONDecoder().decode([DiscoveredURL].self, from: data) else {
                    self.wsManager?.workerStatus = "Discover failed"
                    return
                }
                let batch = DiscoveryBatch(type: "DISCOVERY_BATCH", urls: urls.map { DiscoveryURL(href: $0.href, rating: $0.rating, reviews: $0.reviews) })
                if let batchData = try? JSONEncoder().encode(batch) {
                    self.wsManager?.sendRaw(batchData)
                }
            }
        }
    }

    func extractDetails(_ items: [TaskItem]) {
        guard let webView = webView else { return }
        var results: [ScrapedPlace] = []
        
        func processNext(index: Int) {
            guard index < items.count else {
                self.wsManager?.sendDetailsBatch(results)
                return
            }
            
            let item = items[index]
            let cleanURL = item.url.components(separatedBy: "?").first ?? item.url
            guard let url = URL(string: cleanURL) else {
                processNext(index: index + 1)
                return
            }
            
            DispatchQueue.main.async {
                webView.load(URLRequest(url: url))
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
                    guard let self = self else { return }
                    let js: String
                    if let s = self.workerScript {
                        js = "\(s); KRNL.extractPlaceDetails()"
                    } else {
                        js = """
                            (function(){
                                const h1=document.querySelector('h1.DUwDvf,h1');
                                const n=h1?h1.textContent.trim():'N/A';
                                const p=document.querySelector('button[data-item-id^="phone:tel:"] div.fontBodyMedium');
                                const ph=p?p.textContent.trim():'N/A';
                                const w=document.querySelector('a[data-item-id="authority"] div.fontBodyMedium');
                                const ws=w?w.textContent.trim():'N/A';
                                return JSON.stringify({name:n,phone:ph,website:ws});
                            })()
                        """
                    }
                    self.evaluateJS(js) { json in
                        if let d = json?.data(using: .utf8), let p = try? JSONDecoder().decode(PlaceJS.self, from: d) {
                            results.append(ScrapedPlace(name: p.name, rating: item.rating ?? "N/A",
                                reviews: item.reviews ?? "0", phone: p.phone, website: p.website, url: item.url))
                        }
                        processNext(index: index + 1)
                    }
                }
            }
        }
        
        processNext(index: 0)
    }

    func crawlWebsites(_ leads: [LeadItem]) {
        guard let webView = webView else { return }
        var results: [ScrapedWebsite] = []
        
        let searchEnabled = wsManager?.searchWebsites ?? true
        let percentage = wsManager?.crawlPercentage ?? 1.0
        let useWebKitEnabled = wsManager?.useWebKit ?? true
        
        // Calculate how many items we should actually crawl
        let crawlLimit = Int(Double(leads.count) * percentage)
        
        func processNext(index: Int) {
            guard index < leads.count else {
                self.wsManager?.sendWebBatch(results)
                return
            }
            
            let lead = leads[index]
            let website = lead.website ?? "N/A"
            
            // Skip crawling completely if website is N/A, search is disabled, or we are past the crawl percentage limit
            if website == "N/A" || !searchEnabled || index >= crawlLimit {
                results.append(ScrapedWebsite(name: lead.name, rating: lead.rating ?? "N/A",
                    reviews: lead.reviews ?? "0", phone: lead.phone ?? "N/A", website: website,
                    url: lead.url ?? "", emails: "N/A", facebook: "N/A", instagram: "N/A", linkedin: "N/A"))
                processNext(index: index + 1)
                return
            }
            
            var targetURL = website
            if !targetURL.hasPrefix("http") { targetURL = "http://" + targetURL }
            
            // Case 1: Lightweight HTTP crawl using URLSession (No WebKit rendering)
            if !useWebKitEnabled {
                guard let url = URL(string: targetURL) else {
                    results.append(ScrapedWebsite(name: lead.name, rating: lead.rating ?? "N/A",
                        reviews: lead.reviews ?? "0", phone: lead.phone ?? "N/A", website: website,
                        url: lead.url ?? "", emails: "N/A", facebook: "N/A", instagram: "N/A", linkedin: "N/A"))
                    processNext(index: index + 1)
                    return
                }
                
                let sessionConfig = URLSessionConfiguration.default
                sessionConfig.timeoutIntervalForRequest = 4.0
                sessionConfig.timeoutIntervalForResource = 4.0
                let session = URLSession(configuration: sessionConfig)
                
                session.dataTask(with: url) { [weak self] data, _, _ in
                    guard let self = self else { return }
                    var em = "N/A"
                    var fb = "N/A"
                    var ig = "N/A"
                    var li = "N/A"
                    
                    if let data = data, let html = String(data: data, encoding: .utf8) {
                        // Regex extract emails
                        let emailRegex = try? NSRegularExpression(pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", options: [])
                        let matches = emailRegex?.matches(in: html, options: [], range: NSRange(location: 0, length: html.utf16.count)) ?? []
                        var emailsSet = Set<String>()
                        for m in matches {
                            if let range = Range(m.range, in: html) {
                                let email = String(html[range])
                                let ext = email.components(separatedBy: ".").last?.lowercased() ?? ""
                                if !["png", "jpg", "jpeg", "gif", "svg", "webp", "css", "js"].contains(ext) {
                                    emailsSet.insert(email)
                                }
                            }
                        }
                        if !emailsSet.isEmpty {
                            em = emailsSet.joined(separator: ", ")
                        }
                        
                        // Regex extract socials
                        let patterns = [
                            "facebook.com": #"https?://(?:www\.)?facebook\.com/[a-zA-Z0-9._-]+"#,
                            "instagram.com": #"https?://(?:www\.)?instagram\.com/[a-zA-Z0-9._-]+"#,
                            "linkedin.com": #"https?://(?:www\.)?linkedin\.com/company/[a-zA-Z0-9._-]+"#
                        ]
                        for (key, pattern) in patterns {
                            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
                               let firstMatch = regex.firstMatch(in: html, options: [], range: NSRange(location: 0, length: html.utf16.count)),
                               let range = Range(firstMatch.range, in: html) {
                                let link = String(html[range])
                                if key == "facebook.com" { fb = link }
                                else if key == "instagram.com" { ig = link }
                                else if key == "linkedin.com" { li = link }
                            }
                        }
                    }
                    
                    results.append(ScrapedWebsite(name: lead.name, rating: lead.rating ?? "N/A",
                        reviews: lead.reviews ?? "0", phone: lead.phone ?? "N/A", website: website,
                        url: lead.url ?? "", emails: em, facebook: fb, instagram: ig, linkedin: li))
                    
                    processNext(index: index + 1)
                }.resume()
                return
            }
            
            // Case 2: Full browser rendering in WebKit
            guard let url = URL(string: targetURL) else {
                processNext(index: index + 1)
                return
            }
            
            DispatchQueue.main.async {
                webView.load(URLRequest(url: url))
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
                    guard let self = self else { return }
                    let js: String
                    if let s = self.workerScript {
                        js = "\(s); KRNL.extractWebsiteContacts()"
                    } else {
                        js = """
                            (function(){
                                const b=document.body?document.body.innerText:'';
                                const r=RegExp('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}','g');
                                const e=[...new Set((b.match(r)||[]).filter(x=>!['png','jpg','gif','svg','css','js'].includes(x.split('.').pop().toLowerCase())))];
                                const a=Array.from(document.querySelectorAll('a[href]')).map(x=>x.href);
                                return JSON.stringify({emails:e.join(', ')||'N/A',fb:a.find(x=>x.includes('facebook.com'))||'N/A',ig:a.find(x=>x.includes('instagram.com'))||'N/A',li:a.find(x=>x.includes('linkedin.com'))||'N/A'});
                            })()
                        """
                    }
                    self.evaluateJS(js) { json in
                        var em="N/A",fb="N/A",ig="N/A",li="N/A"
                        if let d=json?.data(using:.utf8), let p=try?JSONDecoder().decode(WebsiteJS_fast.self, from:d) {
                            em=p.emails.isEmpty ? "N/A" : p.emails; fb=p.fb; ig=p.ig; li=p.li
                        }
                        results.append(ScrapedWebsite(name:lead.name, rating:lead.rating ?? "N/A",
                            reviews:lead.reviews ?? "0", phone:lead.phone ?? "N/A", website:website,
                            url:lead.url ?? "", emails:em, facebook:fb, instagram:ig, linkedin:li))
                        processNext(index: index + 1)
                    }
                }
            }
        }
        
        processNext(index: 0)
    }
}

struct PlaceJS: Codable { let name: String; let phone: String; let website: String }
struct WebsiteJS_fast: Codable { let emails: String; let fb: String; let ig: String; let li: String }
struct DiscoveredURL: Codable { let href: String; let rating: String; let reviews: String }