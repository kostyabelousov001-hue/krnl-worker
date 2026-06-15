import Foundation
import WebKit

class ScraperEngine: NSObject {
    private weak var wsManager: WebSocketManager?
    private var webView: WKWebView?

    init(wsManager: WebSocketManager) {
        self.wsManager = wsManager
        super.init()

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: .zero, configuration: config)
    }

    func extractDetails(_ items: [TaskItem]) {
        guard let webView = webView else { return }

        var results: [ScrapedPlace] = []

        let group = DispatchGroup()

        for item in items {
            group.enter()
            let cleanURL = item.url.components(separatedBy: "?").first ?? item.url
            guard let url = URL(string: cleanURL) else {
                group.leave()
                continue
            }

            webView.load(URLRequest(url: url))

            DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                webView.evaluateJavaScript("""
                    (function() {
                        const h1 = document.querySelector('h1.DUwDvf, h1');
                        const name = h1 ? h1.textContent.trim() : 'N/A';

                        const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"] div.fontBodyMedium');
                        const phone = phoneBtn ? phoneBtn.textContent.trim() : 'N/A';

                        const siteEl = document.querySelector('a[data-item-id="authority"] div.fontBodyMedium');
                        const website = siteEl ? siteEl.textContent.trim() : 'N/A';

                        return JSON.stringify({ name, phone, website });
                    })()
                """) { result, error in
                    if let json = result as? String,
                       let data = json.data(using: .utf8),
                       let parsed = try? JSONDecoder().decode(PlaceJS.self, from: data) {
                        results.append(ScrapedPlace(
                            name: parsed.name,
                            rating: item.rating ?? "N/A",
                            reviews: item.reviews ?? "0",
                            phone: parsed.phone,
                            website: parsed.website,
                            url: item.url
                        ))
                    }
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) {
            self.wsManager?.sendDetailsBatch(results)
        }
    }

    func crawlWebsites(_ leads: [LeadItem]) {
        guard let webView = webView else { return }

        var results: [ScrapedWebsite] = []
        let group = DispatchGroup()

        for lead in leads {
            let website = lead.website ?? "N/A"
            guard website != "N/A" else {
                results.append(ScrapedWebsite(
                    name: lead.name, rating: lead.rating ?? "N/A",
                    reviews: lead.reviews ?? "0", phone: lead.phone ?? "N/A",
                    website: "N/A", url: lead.url ?? "",
                    emails: "N/A", facebook: "N/A", instagram: "N/A", linkedin: "N/A"
                ))
                continue
            }

            group.enter()
            var targetURL = website
            if !targetURL.hasPrefix("http") { targetURL = "http://" + targetURL }
            guard let url = URL(string: targetURL) else { group.leave(); continue }

            webView.load(URLRequest(url: url))

            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                webView.evaluateJavaScript("""
                    (function() {
                        const body = document.body ? document.body.innerText : '';
                        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
                        const emails = [...new Set((body.match(emailRegex) || []).filter(e => {
                            const ext = e.split('.').pop().toLowerCase();
                            return !['png','jpg','jpeg','gif','svg','webp','css','js'].includes(ext);
                        }))];

                        const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
                        const fb = links.find(l => l.includes('facebook.com')) || 'N/A';
                        const ig = links.find(l => l.includes('instagram.com')) || 'N/A';
                        const li = links.find(l => l.includes('linkedin.com')) || 'N/A';

                        return JSON.stringify({ emails: emails.join(', '), facebook: fb, instagram: ig, linkedin: li });
                    })()
                """) { result, error in
                    var emails = "N/A", fb = "N/A", ig = "N/A", li = "N/A"
                    if let json = result as? String,
                       let data = json.data(using: .utf8),
                       let parsed = try? JSONDecoder().decode(WebsiteJS.self, from: data) {
                        emails = parsed.emails.isEmpty ? "N/A" : parsed.emails
                        fb = parsed.facebook
                        ig = parsed.instagram
                        li = parsed.linkedin
                    }

                    results.append(ScrapedWebsite(
                        name: lead.name, rating: lead.rating ?? "N/A",
                        reviews: lead.reviews ?? "0", phone: lead.phone ?? "N/A",
                        website: website, url: lead.url ?? "",
                        emails: emails, facebook: fb, instagram: ig, linkedin: li
                    ))
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) {
            self.wsManager?.sendWebBatch(results)
        }
    }
}

struct PlaceJS: Codable {
    let name: String
    let phone: String
    let website: String
}

struct WebsiteJS: Codable {
    let emails: String
    let facebook: String
    let instagram: String
    let linkedin: String
}