// KRNL Worker Script v1
// Hot-swappable scraping logic — the iOS app downloads this
// and runs it inside WKWebView. Update this file on the server
// and all connected iOS workers get the new logic on next task.

(function() {
    var KRNL = {};

    KRNL.extractPlaceDetails = function() {
        var h1 = document.querySelector('h1.DUwDvf, h1');
        var name = h1 ? h1.textContent.trim() : 'N/A';

        var phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"] div.fontBodyMedium');
        var phone = phoneBtn ? phoneBtn.textContent.trim() : 'N/A';

        var siteEl = document.querySelector('a[data-item-id="authority"] div.fontBodyMedium');
        var website = siteEl ? siteEl.textContent.trim() : 'N/A';

        return JSON.stringify({ name: name, phone: phone, website: website });
    };

    KRNL.extractWebsiteContacts = function() {
        var body = document.body ? document.body.innerText : '';
        var emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        var emails = [];
        var match;
        while ((match = emailRegex.exec(body)) !== null) {
            var ext = match[0].split('.').pop().toLowerCase();
            if (!['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js'].includes(ext)) {
                emails.push(match[0]);
            }
        }
        emails = [...new Set(emails)];

        var links = Array.from(document.querySelectorAll('a[href]')).map(function(a) { return a.href; });
        var fb = links.find(function(l) { return l.includes('facebook.com'); }) || 'N/A';
        var ig = links.find(function(l) { return l.includes('instagram.com'); }) || 'N/A';
        var li = links.find(function(l) { return l.includes('linkedin.com'); }) || 'N/A';

        return JSON.stringify({
            emails: emails.join(', ') || 'N/A',
            fb: fb,
            ig: ig,
            li: li
        });
    };

    KRNL.extractLeadsFromList = function() {
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
                        rating = t;
                        break;
                    }
                }
                var fullText = container.textContent;
                var rvM = fullText.match(/\((\d[\d\s,.]*)\)/);
                if (rvM) reviews = rvM[1].replace(/\D/g, '');
            }
            results.push({ href: href, rating: rating, reviews: reviews });
        });
        return JSON.stringify(results);
    };

    return KRNL;
})();