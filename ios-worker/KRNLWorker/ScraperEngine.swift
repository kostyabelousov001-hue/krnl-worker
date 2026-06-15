import Foundation
import WebKit

class ScraperEngine: NSObject {
    private weak var wsManager: WebSocketManager?
    private var webView: WKWebView?
    private var workerScript: String?

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

    func extractDetails(_ items: [TaskItem]) {
        guard let webView = webView else { return }
        var results: [ScrapedPlace] = []
        let group = DispatchGroup()

        for item in items {
            group.enter()
            let cleanURL = item.url.components(separatedBy: "?").first ?? item.url
            guard let url = URL(string: cleanURL) else { group.leave(); continue }

            webView.load(URLRequest(url: url))

            DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
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
                    group.leave()
                }
            }
        }
        group.notify(queue: .main) { self.wsManager?.sendDetailsBatch(results) }
    }

    func crawlWebsites(_ leads: [LeadItem]) {
        guard let webView = webView else { return }
        var results: [ScrapedWebsite] = []
        let group = DispatchGroup()

        for lead in leads {
            let website = lead.website ?? "N/A"
            guard website != "N/A" else {
                results.append(ScrapedWebsite(name: lead.name, rating: lead.rating ?? "N/A",
                    reviews: lead.reviews ?? "0", phone: lead.phone ?? "N/A", website: "N/A",
                    url: lead.url ?? "", emails: "N/A", facebook: "N/A", instagram: "N/A", linkedin: "N/A"))
                continue
            }

            group.enter()
            var targetURL = website
            if !targetURL.hasPrefix("http") { targetURL = "http://" + targetURL }
            guard let url = URL(string: targetURL) else { group.leave(); continue }

            webView.load(URLRequest(url: url))

            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
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
                    group.leave()
                }
            }
        }
        group.notify(queue: .main) { self.wsManager?.sendWebBatch(results) }
    }
}

struct PlaceJS: Codable { let name: String; let phone: String; let website: String }
struct WebsiteJS_fast: Codable { let emails: String; let fb: String; let ig: String; let li: String }